import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { CodexSession, CodexSessionFactory } from "./bridge-server.js";

export interface CodexSpawnCommand {
  command: string;
  args: string[];
}

interface JsonRpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: {
    message?: string;
  };
}

interface JsonRpcNotification {
  method: string;
  params?: Record<string, unknown>;
}

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
  private messageListener: (message: Record<string, unknown>) => void = () => {};
  private threadId: string | null = null;
  private activeTurnId: string | null = null;
  private turnInFlight = false;
  private stopped = false;

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
      // Stderr is intentionally ignored in the minimal MVP implementation.
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
  }): Promise<AppServerCodexSession> {
    const spawnCommand = getCodexSpawnCommand(options.unrestricted);
    const child = spawn(spawnCommand.command, spawnCommand.args, {
      cwd: options.projectPath,
      stdio: "pipe",
      env: process.env,
    });

    const session = new AppServerCodexSession(child);
    await session.bootstrap(options.projectPath);
    return session;
  }

  onMessage(listener: (message: Record<string, unknown>) => void): void {
    this.messageListener = listener;
  }

  sendInput(text: string): void {
    this.pendingInputs.push(text);
    void this.flushInputQueue();
  }

  interrupt(): void {
    if (!this.threadId || !this.activeTurnId) {
      return;
    }

    void this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId: this.activeTurnId,
    }).catch(() => {
      // Ignore interrupt failures in the MVP implementation.
    });
  }

  stop(): void {
    this.stopped = true;
    this.rejectAllPending(new Error("stopped"));
    this.child.kill("SIGTERM");
  }

  private async bootstrap(projectPath: string): Promise<void> {
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

    const threadStart = await this.request("thread/start", {
      cwd: projectPath,
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    }) as { thread?: { id?: string } };

    const threadId = threadStart.thread?.id;
    if (!threadId) {
      throw new Error("thread/start returned no thread id");
    }

    this.threadId = threadId;
    this.emitMessage({ type: "status", status: "idle" });
  }

  private async flushInputQueue(): Promise<void> {
    if (this.turnInFlight || !this.threadId || this.pendingInputs.length === 0) {
      return;
    }

    const text = this.pendingInputs.shift();
    if (!text) {
      return;
    }

    this.turnInFlight = true;
    try {
      const turnStart = await this.request("turn/start", {
        threadId: this.threadId,
        input: [{ type: "text", text, text_elements: [] }],
      }) as { turn?: { id?: string } };

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

      const payload = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
      if ("id" in payload && payload.id !== undefined) {
        this.handleResponse(payload);
        continue;
      }
      if ("method" in payload) {
        this.handleNotification(payload);
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
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

  private handleNotification(notification: JsonRpcNotification): void {
    const params = notification.params ?? {};

    switch (notification.method) {
      case "turn/started": {
        const turn = params.turn as { id?: string } | undefined;
        if (turn?.id) {
          this.activeTurnId = turn.id;
        }
        this.emitMessage({ type: "status", status: "running" });
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
        this.emitMessage({ type: "status", status: "idle" });
        void this.flushInputQueue();
        break;
      }

      default:
        break;
    }
  }

  private handleStartedItem(item: Record<string, unknown> | undefined): void {
    if (!item) {
      return;
    }

    if (normalizeItemType(item.type) !== "commandexecution") {
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
        model: "codex",
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

    this.emitMessage({
      type: "assistant",
      message: {
        id,
        role: "assistant",
        content: [{ type: "text", text }],
        model: "codex",
        ...(phase ? { phase } : {}),
      },
    });
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextRequestId++;
    const payload: JsonRpcRequest = { id, method, params };
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
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

function normalizeItemType(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z]/g, "") : "";
}
