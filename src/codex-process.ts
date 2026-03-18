import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  CodexSession,
  CodexSessionFactory,
  PermissionMode,
} from "./bridge-server.js";

export interface CodexSpawnCommand {
  command: string;
  args: string[];
}

interface JsonRpcRequest {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    message?: string;
  };
}

interface PendingApproval {
  requestId: number | string;
  toolUseId: string;
  toolName: string;
}

interface PendingUserInput {
  requestId: number | string;
  toolUseId: string;
  questions: Array<{ id: string }>;
}

const DEFAULT_MODEL = "gpt-5.4-mini";

export function getCodexSpawnCommand(unrestricted = true): CodexSpawnCommand {
  if (!unrestricted) {
    return {
      command: "codex",
      args: ["app-server", "--listen", "stdio://"],
    };
  }

  return {
    command: "codex",
    args: [
      "--dangerously-bypass-approvals-and-sandbox",
      "app-server",
      "--listen",
      "stdio://",
    ],
  };
}

export function createCodexSessionFactory(): CodexSessionFactory {
  return {
    async startSession(options) {
      return AppServerCodexSession.start(options);
    },
  };
}

class AppServerCodexSession implements CodexSession {
  private child: ChildProcessWithoutNullStreams;
  private stdoutBuffer = "";
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly pendingInputs: string[] = [];
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly pendingUserInputs = new Map<string, PendingUserInput>();
  private messageListener: (message: Record<string, unknown>) => void = () => {};
  private threadId: string | null = null;
  private activeTurnId: string | null = null;
  private turnInFlight = false;
  private stopped = false;
  private startModel = "";
  private startModelReasoningEffort = "";
  private collaborationMode: PermissionMode = "default";
  private lastPlanText = "";
  private pendingPlanApproval: { toolUseId: string; plan: string } | null = null;

  private constructor(
    child: ChildProcessWithoutNullStreams,
  ) {
    this.child = child;
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.handleStdout(chunk);
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", () => {
      // Stderr is intentionally ignored in this bridge.
    });
    this.child.on("exit", () => {
      this.rejectAllPending(new Error("codex app-server exited"));
      this.turnInFlight = false;
      this.activeTurnId = null;
    });
  }

  static async start(options: {
    projectPath: string;
    unrestricted: boolean;
    threadId?: string;
    model?: string;
    modelReasoningEffort?: string;
    permissionMode?: PermissionMode;
  }): Promise<AppServerCodexSession> {
    const spawnCommand = getCodexSpawnCommand(options.unrestricted);
    const child = spawn(spawnCommand.command, spawnCommand.args, {
      cwd: options.projectPath,
      stdio: "pipe",
      env: process.env,
    });

    const session = new AppServerCodexSession(child);
    session.startModel = options.model?.trim() ?? "";
    session.startModelReasoningEffort = normalizeModelReasoningEffort(options.modelReasoningEffort);
    session.collaborationMode = options.permissionMode ?? "default";
    await session.bootstrap(options.projectPath, options.threadId);
    return session;
  }

  onMessage(listener: (message: Record<string, unknown>) => void): void {
    this.messageListener = listener;
  }

  getSessionId(): string | null {
    return this.threadId;
  }

  sendInput(text: string): void {
    this.pendingInputs.push(text);
    void this.flushInputQueue();
  }

  interrupt(): void {
    if (this.pendingPlanApproval) {
      this.pendingPlanApproval = null;
      this.lastPlanText = "";
      this.emitMessage({ type: "status", status: "idle" });
      void this.flushInputQueue();
      return;
    }

    if ((this.pendingApprovals.size > 0 || this.pendingUserInputs.size > 0) && !this.activeTurnId) {
      this.pendingApprovals.clear();
      this.pendingUserInputs.clear();
      this.emitMessage({ type: "status", status: "idle" });
      void this.flushInputQueue();
      return;
    }

    if (!this.threadId || !this.activeTurnId) {
      return;
    }

    void this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId: this.activeTurnId,
    }).catch(() => {
      // Ignore interrupt failures in the browser bridge.
    });
  }

  approve(toolUseId?: string, updatedInput?: Record<string, unknown>): void {
    if (this.pendingPlanApproval && (!toolUseId || toolUseId === this.pendingPlanApproval.toolUseId)) {
      const plan = typeof updatedInput?.plan === "string" && updatedInput.plan.trim()
        ? updatedInput.plan.trim()
        : this.pendingPlanApproval.plan;
      const resolvedToolUseId = this.pendingPlanApproval.toolUseId;
      this.pendingPlanApproval = null;
      this.collaborationMode = "default";
      this.emitMessage({
        type: "tool_result",
        toolUseId: resolvedToolUseId,
        toolName: "ExitPlanMode",
        content: "Plan approved",
      });
      this.pendingInputs.unshift(`Execute the following plan:\n\n${plan}`);
      this.emitMessage({ type: "status", status: "running" });
      void this.flushInputQueue();
      return;
    }

    const pending = this.resolvePendingApproval(toolUseId);
    if (!pending) {
      return;
    }

    this.pendingApprovals.delete(pending.toolUseId);
    this.respondToServerRequest(pending.requestId, { decision: "accept" });
    this.emitMessage({
      type: "tool_result",
      toolUseId: pending.toolUseId,
      toolName: pending.toolName,
      content: "Approved",
    });
    this.emitMessage({ type: "status", status: "running" });
  }

  reject(toolUseId?: string, message?: string): void {
    if (this.pendingPlanApproval && (!toolUseId || toolUseId === this.pendingPlanApproval.toolUseId)) {
      const resolvedToolUseId = this.pendingPlanApproval.toolUseId;
      this.pendingPlanApproval = null;
      this.emitMessage({
        type: "tool_result",
        toolUseId: resolvedToolUseId,
        toolName: "ExitPlanMode",
        content: "Plan rejected",
      });
      if (message?.trim()) {
        this.pendingInputs.unshift(message.trim());
        void this.flushInputQueue();
        return;
      }
      this.emitMessage({ type: "status", status: "idle" });
      return;
    }

    const pending = this.resolvePendingApproval(toolUseId);
    if (!pending) {
      return;
    }

    this.pendingApprovals.delete(pending.toolUseId);
    this.respondToServerRequest(pending.requestId, { decision: "decline" });
    this.emitMessage({
      type: "tool_result",
      toolUseId: pending.toolUseId,
      toolName: pending.toolName,
      content: "Rejected",
    });
    this.emitMessage({ type: "status", status: "running" });
  }

  answer(toolUseId: string, result: string): void {
    const pending = this.pendingUserInputs.get(toolUseId);
    if (!pending) {
      return;
    }

    this.pendingUserInputs.delete(toolUseId);
    this.respondToServerRequest(pending.requestId, {
      answers: pending.questions.map((question) => ({
        question_id: question.id,
        answer: result,
      })),
    });
    this.emitMessage({
      type: "tool_result",
      toolUseId: pending.toolUseId,
      toolName: "AskUserQuestion",
      content: "Answered",
    });
    this.emitMessage({ type: "status", status: "running" });
  }

  stop(): void {
    this.stopped = true;
    this.rejectAllPending(new Error("stopped"));
    this.child.kill("SIGTERM");
  }

  private async bootstrap(projectPath: string, threadId?: string): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "codex_browser_bridge",
        version: "1.0.0",
        title: "codex-browser-bridge",
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    this.notify("initialized", {});

    const threadMethod = threadId ? "thread/resume" : "thread/start";
    const threadStart = await this.request(threadMethod, {
      cwd: projectPath,
      ...(threadId ? { threadId } : {}),
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    }) as { thread?: { id?: string } };

    const resolvedThreadId = threadStart.thread?.id ?? threadId;
    if (!resolvedThreadId) {
      throw new Error(`${threadMethod} returned no thread id`);
    }

    this.threadId = resolvedThreadId;
    this.emitMessage({ type: "status", status: "idle" });
  }

  private async flushInputQueue(): Promise<void> {
    if (
      this.turnInFlight
      || !this.threadId
      || this.pendingInputs.length === 0
      || this.pendingApprovals.size > 0
      || this.pendingUserInputs.size > 0
      || this.pendingPlanApproval
    ) {
      return;
    }

    const text = this.pendingInputs.shift();
    if (!text?.trim()) {
      return;
    }

    this.turnInFlight = true;
    this.emitMessage({ type: "status", status: "running" });

    try {
      const params: Record<string, unknown> = {
        threadId: this.threadId,
        input: [{ type: "text", text, text_elements: [] }],
        approvalPolicy: "never",
        collaborationMode: {
          mode: this.collaborationMode,
          settings: {
            model: this.startModel || DEFAULT_MODEL,
          },
        },
      };

      if (this.startModel) {
        params.model = this.startModel;
      }
      if (this.startModelReasoningEffort) {
        params.effort = this.startModelReasoningEffort;
      }

      const turnStart = await this.request("turn/start", params) as { turn?: { id?: string } };
      const turnId = turnStart.turn?.id;
      if (turnId) {
        this.activeTurnId = turnId;
      }
    } catch (error) {
      this.turnInFlight = false;
      this.activeTurnId = null;
      this.emitMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      this.emitMessage({ type: "status", status: "idle" });
      void this.flushInputQueue();
    }
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      const payload = JSON.parse(line) as JsonRpcRequest;
      if (payload.id !== undefined && payload.method && payload.result === undefined && !payload.error) {
        this.handleServerRequest(payload.id, payload.method, payload.params ?? {});
        continue;
      }
      if (payload.id !== undefined && (payload.result !== undefined || payload.error)) {
        this.handleResponse(payload);
        continue;
      }
      if (payload.method) {
        this.handleNotification(payload.method, payload.params ?? {});
      }
    }
  }

  private handleResponse(response: JsonRpcRequest): void {
    if (typeof response.id !== "number") {
      return;
    }
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message ?? "JSON-RPC request failed"));
      return;
    }

    pending.resolve(response.result);
  }

  private handleServerRequest(
    requestId: number | string,
    method: string,
    params: Record<string, unknown>,
  ): void {
    if (method === "item/tool/requestUserInput") {
      const toolUseId = typeof params.itemId === "string" ? params.itemId : `ask_${randomUUID()}`;
      const questions = Array.isArray(params.questions)
        ? params.questions.flatMap((question) => {
          if (
            !isRecord(question)
            || typeof question.id !== "string"
            || typeof question.question !== "string"
          ) {
            return [];
          }
          return [{
            id: question.id,
            question: question.question,
            ...(typeof question.header === "string" ? { header: question.header } : {}),
            ...(Array.isArray(question.options) ? { options: question.options } : {}),
          }];
        })
        : [];

      this.pendingUserInputs.set(toolUseId, {
        requestId,
        toolUseId,
        questions: questions.map((question) => ({ id: question.id })),
      });
      this.emitMessage({
        type: "permission_request",
        toolUseId,
        toolName: "AskUserQuestion",
        input: { questions },
      });
      this.emitMessage({ type: "status", status: "waiting_approval" });
      return;
    }

    if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
      const toolUseId = typeof params.itemId === "string" ? params.itemId : `approval_${randomUUID()}`;
      const toolName = method === "item/fileChange/requestApproval" ? "FileChange" : "Bash";
      this.pendingApprovals.set(toolUseId, {
        requestId,
        toolUseId,
        toolName,
      });
      this.emitMessage({
        type: "permission_request",
        toolUseId,
        toolName,
        input: { ...params },
      });
      this.emitMessage({ type: "status", status: "waiting_approval" });
      return;
    }

    this.respondToServerRequest(requestId, {});
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case "turn/started": {
        const turn = params.turn as { id?: string } | undefined;
        if (turn?.id) {
          this.activeTurnId = turn.id;
        }
        break;
      }

      case "item/started": {
        const item = params.item as Record<string, unknown> | undefined;
        this.handleStartedItem(item);
        break;
      }

      case "item/reasoning/textDelta":
      case "item/reasoning/summaryTextDelta": {
        if (typeof params.delta === "string" && params.delta.length > 0) {
          this.emitMessage({
            type: "thinking_delta",
            id: typeof params.itemId === "string" ? params.itemId : undefined,
            text: params.delta,
          });
        }
        break;
      }

      case "item/agentMessage/delta": {
        if (typeof params.delta === "string" && params.delta.length > 0) {
          this.emitMessage({
            type: "stream_delta",
            id: typeof params.itemId === "string" ? params.itemId : undefined,
            text: params.delta,
          });
        }
        break;
      }

      case "item/completed": {
        const item = params.item as Record<string, unknown> | undefined;
        this.handleCompletedItem(item);
        break;
      }

      case "turn/completed": {
        const turn = params.turn as Record<string, unknown> | undefined;
        const status = typeof turn?.status === "string" ? turn.status : "completed";

        if (status === "completed") {
          this.emitMessage({
            type: "result",
            subtype: "success",
            sessionId: this.threadId ?? undefined,
          });
        } else if (status === "interrupted") {
          this.emitMessage({
            type: "result",
            subtype: "interrupted",
            sessionId: this.threadId ?? undefined,
          });
        } else {
          this.emitMessage({
            type: "result",
            subtype: "error",
            error: status,
            sessionId: this.threadId ?? undefined,
          });
        }

        this.turnInFlight = false;
        this.activeTurnId = null;

        if (status !== "completed") {
          this.pendingApprovals.clear();
          this.pendingUserInputs.clear();
          this.pendingPlanApproval = null;
          this.lastPlanText = "";
        }

        if (this.collaborationMode === "plan" && this.lastPlanText) {
          const toolUseId = `plan_${randomUUID()}`;
          this.pendingPlanApproval = {
            toolUseId,
            plan: this.lastPlanText,
          };
          this.lastPlanText = "";
          this.emitMessage({
            type: "permission_request",
            toolUseId,
            toolName: "ExitPlanMode",
            input: { plan: this.pendingPlanApproval.plan },
          });
          this.emitMessage({ type: "status", status: "waiting_approval" });
          return;
        }

        this.lastPlanText = "";
        this.emitMessage({ type: "status", status: "idle" });
        void this.flushInputQueue();
        break;
      }

      default:
        break;
    }
  }

  private handleStartedItem(item: Record<string, unknown> | undefined): void {
    if (!item || normalizeItemType(item.type) !== "commandexecution") {
      return;
    }

    const id = typeof item.id === "string" ? item.id : `tool_${this.nextRequestId}`;
    const command = Array.isArray(item.command)
      ? item.command.map((part) => String(part)).join(" ")
      : typeof item.command === "string"
        ? item.command
        : "";

    this.emitMessage({
      type: "assistant",
      message: {
        id,
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id,
            name: "Bash",
            input: { command },
          },
        ],
        model: this.startModel || DEFAULT_MODEL,
      },
    });
  }

  private handleCompletedItem(item: Record<string, unknown> | undefined): void {
    if (!item) {
      return;
    }

    const itemType = normalizeItemType(item.type);

    if (itemType === "commandexecution") {
      const id = typeof item.id === "string" ? item.id : `tool_${this.nextRequestId}`;
      const output = typeof item.aggregatedOutput === "string"
        ? item.aggregatedOutput
        : typeof item.output === "string"
          ? item.output
          : "";

      this.emitMessage({
        type: "tool_result",
        toolUseId: id,
        toolName: "Bash",
        content: output || `exit code: ${String(item.exitCode ?? item.exit_code ?? "unknown")}`,
      });
      return;
    }

    if (itemType !== "agentmessage") {
      return;
    }

    const text = typeof item.text === "string" ? item.text : "";
    if (!text) {
      return;
    }

    const id = typeof item.id === "string" ? item.id : `msg_${this.nextRequestId}`;
    const phase = item.phase === "commentary" || item.phase === "final_answer"
      ? item.phase
      : undefined;

    if (this.collaborationMode === "plan" && phase === "final_answer") {
      this.lastPlanText = text;
    }

    this.emitMessage({
      type: "assistant",
      message: {
        id,
        role: "assistant",
        content: [{ type: "text", text }],
        model: this.startModel || DEFAULT_MODEL,
        ...(phase ? { phase } : {}),
      },
    });
  }

  private resolvePendingApproval(toolUseId?: string): PendingApproval | undefined {
    if (toolUseId) {
      return this.pendingApprovals.get(toolUseId);
    }
    const first = this.pendingApprovals.values().next();
    return first.done ? undefined : first.value;
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextRequestId++;
    this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  private respondToServerRequest(id: number | string, result: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  private emitMessage(message: Record<string, unknown>): void {
    this.messageListener(message);
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeItemType(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z]/g, "") : "";
}

function normalizeModelReasoningEffort(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "minimal"
    || normalized === "low"
    || normalized === "medium"
    || normalized === "high"
    || normalized === "xhigh"
    ? normalized
    : "";
}
