import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  startBridgeServer,
  type BridgeServer,
  type CodexSession,
  type CodexSessionFactory,
} from "../src/bridge-server.js";

class FakeCodexSession implements CodexSession {
  private static nextId = 1;
  public readonly inputs: string[] = [];
  public readonly approved: Array<{ toolUseId?: string; updatedInput?: Record<string, unknown> }> = [];
  public readonly rejected: Array<{ toolUseId?: string; message?: string }> = [];
  public readonly answered: Array<{ toolUseId: string; result: string }> = [];
  public interrupted = false;
  public stopped = false;
  private messageListener: ((message: Record<string, unknown>) => void) | null = null;

  constructor(private readonly sessionId = `thread_fake_${FakeCodexSession.nextId++}`) {}

  getSessionId(): string {
    return this.sessionId;
  }

  sendInput(text: string): void {
    this.inputs.push(text);
  }

  interrupt(): void {
    this.interrupted = true;
  }

  approve(toolUseId?: string, updatedInput?: Record<string, unknown>): void {
    this.approved.push({ toolUseId, updatedInput });
  }

  reject(toolUseId?: string, message?: string): void {
    this.rejected.push({ toolUseId, message });
  }

  answer(toolUseId: string, result: string): void {
    this.answered.push({ toolUseId, result });
  }

  onMessage(listener: (message: Record<string, unknown>) => void): void {
    this.messageListener = listener;
  }

  emit(message: Record<string, unknown>): void {
    this.messageListener?.(message);
  }

  stop(): void {
    this.stopped = true;
  }
}

describe("startBridgeServer", () => {
  const servers: BridgeServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await server.close();
      }
    }
  });

  it("serves the expanded viewer shell at GET /", async () => {
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: { startSession: async () => new FakeCodexSession() },
    });
    servers.push(server);

    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="sessionsList"');
    expect(html).toContain('id="bridgeControls"');
    expect(html).toContain('id="permissionMode"');
    expect(html).toContain('id="modelInput"');
    expect(html).toContain('id="modelReasoningEffort"');
    expect(html).toContain('id="viewerPinBtn"');
    expect(html).toContain('id="viewerCompleteBtn"');
    expect(html).toContain('id="permissionPanel"');
    expect(html).not.toContain("Codex sessions in your browser.");
    expect(html).not.toContain("ccpocket-style layout");
  });

  it("serves the viewer shell when the root URL includes a session query", async () => {
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: { startSession: async () => new FakeCodexSession() },
    });
    servers.push(server);

    const response = await fetch(`http://127.0.0.1:${server.port}/?session=thread_reload`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="sessionsList"');
  });

  it("starts sessions with model, effort, and plan mode, then exposes them in the session list", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const codexSession = new FakeCodexSession("thread_plan");
    const factory: CodexSessionFactory = {
      startSession: async (options) => {
        calls.push(options);
        return codexSession;
      },
    };

    const server = await startBridgeServer({ port: 0, codexSessionRoot: null, codexFactory: factory });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");

    ws.send(JSON.stringify({
      type: "start",
      projectPath: "/workspace/app",
      model: "gpt-5.4",
      modelReasoningEffort: "xhigh",
      permissionMode: "plan",
    }));

    const created = await waitForMessage(ws, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });

    expect(calls).toEqual([{
      projectPath: "/workspace/app",
      unrestricted: true,
      model: "gpt-5.4",
      modelReasoningEffort: "xhigh",
      permissionMode: "plan",
    }]);
    expect(created).toMatchObject({
      type: "system",
      subtype: "session_created",
      sessionId: "thread_plan",
      projectPath: "/workspace/app",
      model: "gpt-5.4",
      modelReasoningEffort: "xhigh",
      permissionMode: "plan",
    });

    ws.send(JSON.stringify({ type: "list_sessions" }));
    const payload = await waitForMessage(ws, (msg) => {
      if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
        return false;
      }
      const current = msg.sessions.find((entry: Record<string, unknown>) => {
        return entry.sessionId === created.sessionId;
      });
      return current?.model === "gpt-5.4" && current?.modelReasoningEffort === "xhigh" && current?.permissionMode === "plan";
    });

    expect(payload).toMatchObject({
      type: "session_list",
      sessions: [
        expect.objectContaining({
          sessionId: created.sessionId,
          projectPath: "/workspace/app",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "plan",
          pinned: false,
          completed: false,
          answerState: "",
        }),
      ],
    });

    ws.close();
  });

  it("reads stored Codex app conversations from the Codex session directory", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "codex-browser-bridge-external-"));
    const codexSessionRoot = join(tempRoot, "sessions");
    try {
      await writeCodexSessionFile(codexSessionRoot, {
        threadId: "thread_external",
        projectPath: "/workspace/external",
        model: "gpt-5.4",
        reasoningEffort: "xhigh",
        userText: "External hello",
        assistantText: "External reply",
      });

      const server = await startBridgeServer({
        port: 0,
        codexSessionRoot,
        codexFactory: { startSession: async () => new FakeCodexSession() },
      });
      servers.push(server);

      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
      await once(ws, "open");

      ws.send(JSON.stringify({ type: "list_sessions" }));
      const listed = await waitForMessage(ws, (msg) => {
        if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
          return false;
        }
        return msg.sessions.some((entry: Record<string, unknown>) => {
          return entry.sessionId === "thread_external";
        });
      });

      expect(listed).toMatchObject({
        projectPaths: ["/workspace/external"],
        sessions: [
          expect.objectContaining({
            sessionId: "thread_external",
            projectPath: "/workspace/external",
            title: "External hello",
            preview: "External reply",
            status: "stopped",
            model: "gpt-5.4",
            modelReasoningEffort: "xhigh",
            answerState: "final_answer",
          }),
        ],
      });

      ws.send(JSON.stringify({ type: "get_history", sessionId: "thread_external" }));
      const history = await waitForMessage(ws, (msg) => msg.type === "history");
      expect(history).toMatchObject({
        sessionId: "thread_external",
        messages: [
          expect.objectContaining({ type: "user", text: "External hello" }),
          expect.objectContaining({
            type: "assistant",
            message: expect.objectContaining({
              phase: "final_answer",
              content: [{ type: "text", text: "External reply" }],
            }),
          }),
        ],
      });

      ws.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("excludes project path dropdown candidates when the path contains worktree", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "codex-browser-bridge-path-filter-"));
    const mainRepoPath = join(tempRoot, "main-repo");
    const worktreePath = join(tempRoot, "feature-worktree-repo");

    try {
      const sessions = [
        new FakeCodexSession("thread_main_repo"),
        new FakeCodexSession("thread_worktree"),
      ];
      const factory: CodexSessionFactory = {
        startSession: async () => {
          const next = sessions.shift();
          if (!next) {
            throw new Error("missing fake session");
          }
          return next;
        },
      };

      const server = await startBridgeServer({
        port: 0,
        codexSessionRoot: null,
        codexFactory: factory,
      });
      servers.push(server);

      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
      await once(ws, "open");

      ws.send(JSON.stringify({ type: "start", projectPath: mainRepoPath }));
      await waitForMessage(ws, (msg) => msg.type === "system" && msg.subtype === "session_created");

      ws.send(JSON.stringify({ type: "start", projectPath: worktreePath }));
      await waitForMessage(ws, (msg) => msg.type === "system" && msg.subtype === "session_created" && msg.projectPath === worktreePath);

      ws.send(JSON.stringify({ type: "list_sessions" }));
      const listed = await waitForMessage(ws, (msg) => {
        return msg.type === "session_list" && Array.isArray(msg.selectableProjectPaths);
      });

      expect(listed.selectableProjectPaths).toEqual([mainRepoPath]);
      expect(listed.projectPaths).toContain(mainRepoPath);
      expect(listed.projectPaths).toContain(worktreePath);

      ws.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("resumes a stored session when a new prompt is sent", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "codex-browser-bridge-resume-"));
    const codexSessionRoot = join(tempRoot, "sessions");
    const calls: Array<Record<string, unknown>> = [];
    const resumedSession = new FakeCodexSession("thread_external");
    try {
      await writeCodexSessionFile(codexSessionRoot, {
        threadId: "thread_external",
        projectPath: "/workspace/external",
        model: "gpt-5.4",
        reasoningEffort: "xhigh",
        userText: "External hello",
        assistantText: "External reply",
      });

      const server = await startBridgeServer({
        port: 0,
        codexSessionRoot,
        codexFactory: {
          startSession: async (options) => {
            calls.push(options);
            return resumedSession;
          },
        },
      });
      servers.push(server);

      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
      await once(ws, "open");

      ws.send(JSON.stringify({ type: "list_sessions" }));
      await waitForMessage(ws, (msg) => {
        return msg.type === "session_list"
          && Array.isArray(msg.sessions)
          && msg.sessions.some((entry: Record<string, unknown>) => entry.sessionId === "thread_external");
      });

      ws.send(JSON.stringify({
        type: "input",
        sessionId: "thread_external",
        text: "Continue the work",
      }));

      const ack = await waitForMessage(ws, (msg) => msg.type === "input_ack");
      expect(ack).toEqual({
        type: "input_ack",
        sessionId: "thread_external",
        queued: false,
        text: "Continue the work",
      });
      expect(calls).toEqual([{
        projectPath: "/workspace/external",
        unrestricted: true,
        model: "gpt-5.4",
        modelReasoningEffort: "xhigh",
        permissionMode: "default",
        threadId: "thread_external",
      }]);
      expect(resumedSession.inputs).toEqual(["Continue the work"]);

      ws.close();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("queues prompts while a session is still running and dispatches them after idle", async () => {
    let session: FakeCodexSession | undefined;
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: {
        startSession: async () => {
          session = new FakeCodexSession();
          return session;
        },
      },
    });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    const created = await waitForMessage(ws, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });

    if (!session) {
      throw new Error("expected session");
    }
    session.emit({ type: "status", status: "running" });
    await waitForMessage(ws, (msg) => msg.type === "status" && msg.status === "running");

    ws.send(JSON.stringify({
      type: "input",
      sessionId: created.sessionId,
      text: "queued prompt",
    }));

    const ack = await waitForMessage(ws, (msg) => msg.type === "input_ack");
    expect(ack).toEqual({
      type: "input_ack",
      sessionId: created.sessionId,
      queued: true,
      text: "queued prompt",
    });
    expect(session.inputs).toEqual([]);

    ws.send(JSON.stringify({ type: "get_history", sessionId: created.sessionId }));
    const historyBeforeIdle = await waitForMessage(ws, (msg) => msg.type === "history");
    expect(historyBeforeIdle).toEqual({
      type: "history",
      sessionId: created.sessionId,
      messages: [],
    });

    session.emit({ type: "status", status: "idle" });

    const queuedSession = session;
    await vi.waitFor(() => {
      expect(queuedSession.inputs).toEqual(["queued prompt"]);
    });

    ws.send(JSON.stringify({ type: "get_history", sessionId: created.sessionId }));
    const historyAfterIdle = await waitForMessage(ws, (msg) => msg.type === "history");
    expect(historyAfterIdle).toMatchObject({
      type: "history",
      sessionId: created.sessionId,
      messages: [
        expect.objectContaining({
          type: "user",
          sessionId: created.sessionId,
          text: "queued prompt",
        }),
      ],
    });

    ws.close();
  });

  it("dispatches force-sent prompts immediately without interrupting the active turn", async () => {
    let session: FakeCodexSession | undefined;
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: {
        startSession: async () => {
          session = new FakeCodexSession();
          return session;
        },
      },
    });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    const created = await waitForMessage(ws, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });

    if (!session) {
      throw new Error("expected session");
    }

    session.emit({ type: "status", status: "running" });
    await waitForMessage(ws, (msg) => msg.type === "status" && msg.status === "running");

    ws.send(JSON.stringify({
      type: "input",
      sessionId: created.sessionId,
      text: "queued prompt",
    }));
    await waitForMessage(ws, (msg) => {
      return msg.type === "input_ack" && msg.queued === true && msg.text === "queued prompt";
    });

    ws.send(JSON.stringify({
      type: "input",
      sessionId: created.sessionId,
      text: "force prompt",
      force: true,
    }));

    const forcedAck = await waitForMessage(ws, (msg) => {
      return msg.type === "input_ack" && msg.queued === false && msg.text === "force prompt";
    });

    expect(forcedAck).toEqual({
      type: "input_ack",
      sessionId: created.sessionId,
      queued: false,
      text: "force prompt",
      force: true,
    });
    expect(session.interrupted).toBe(false);
    expect(session.inputs).toEqual(["force prompt"]);

    ws.send(JSON.stringify({ type: "get_history", sessionId: created.sessionId }));
    const historyBeforeIdle = await waitForMessage(ws, (msg) => {
      return msg.type === "history" && Array.isArray(msg.messages) && msg.messages.length > 0;
    });
    expect(historyBeforeIdle).toMatchObject({
      type: "history",
      sessionId: created.sessionId,
      messages: [
        expect.objectContaining({
          type: "user",
          sessionId: created.sessionId,
          text: "force prompt",
        }),
      ],
    });

    session.emit({ type: "status", status: "idle" });

    await vi.waitFor(() => {
      expect(session?.inputs).toEqual(["force prompt", "queued prompt"]);
    });

    ws.close();
  });

  it("accepts the first prompt immediately after session creation", async () => {
    let session: FakeCodexSession | undefined;
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: {
        startSession: async () => {
          session = new FakeCodexSession();
          return session;
        },
      },
    });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");

    ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    const created = await waitForMessage(ws, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });

    ws.send(JSON.stringify({
      type: "input",
      sessionId: created.sessionId,
      text: "first prompt",
    }));

    const ack = await waitForMessage(ws, (msg) => msg.type === "input_ack");
    expect(ack).toEqual({
      type: "input_ack",
      sessionId: created.sessionId,
      queued: false,
      text: "first prompt",
    });
    expect(session?.inputs).toEqual(["first prompt"]);

    ws.close();
  });

  it("stores history, pin state, and completion state in the session list", async () => {
    let session: FakeCodexSession | undefined;
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: {
        startSession: async () => {
          session = new FakeCodexSession();
          return session;
        },
      },
    });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    const created = await waitForMessage(ws, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });
    if (!session) {
      throw new Error("expected session");
    }
    session.emit({ type: "status", status: "idle" });
    await waitForMessage(ws, (msg) => {
      return msg.type === "status" && msg.status === "idle";
    });

    ws.send(JSON.stringify({
      type: "input",
      sessionId: created.sessionId,
      text: "Summarize the repo",
    }));
    await waitForMessage(ws, (msg) => msg.type === "input_ack" && msg.queued === false);
    session.emit({
      type: "assistant",
      message: {
        id: "msg_1",
        role: "assistant",
        content: [{ type: "text", text: "Here is the answer." }],
        model: "gpt-5.4",
        modelReasoningEffort: "xhigh",
        phase: "final_answer",
      },
    });

    ws.send(JSON.stringify({ type: "set_session_pin", sessionId: created.sessionId, pinned: true }));
    ws.send(JSON.stringify({
      type: "set_session_completion",
      sessionId: created.sessionId,
      completed: true,
    }));

    ws.send(JSON.stringify({ type: "list_sessions" }));
    const payload = await waitForMessage(ws, (msg) => {
      if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
        return false;
      }
      const current = msg.sessions.find((entry: Record<string, unknown>) => {
        return entry.sessionId === created.sessionId;
      });
      return current?.pinned === true && current?.completed === true;
    });

    expect(payload).toMatchObject({
      type: "session_list",
      sessions: [
        expect.objectContaining({
          sessionId: created.sessionId,
          title: "Summarize the repo",
          preview: "Here is the answer.",
          pinned: true,
          completed: true,
          answerState: "final_answer",
        }),
      ],
    });

    ws.close();
  });

  it("shares pinned, completed, and recent project path state with another client", async () => {
    let session: FakeCodexSession | undefined;
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: {
        startSession: async () => {
          session = new FakeCodexSession();
          return session;
        },
      },
    });
    servers.push(server);

    const wsA = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const wsB = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await Promise.all([once(wsA, "open"), once(wsB, "open")]);

    wsA.send(JSON.stringify({ type: "start", projectPath: "/workspace/shared" }));
    const created = await waitForMessage(wsA, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });

    const sharedList = await waitForMessage(wsB, (msg) => {
      if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
        return false;
      }
      const current = msg.sessions.find((entry: Record<string, unknown>) => {
        return entry.sessionId === created.sessionId;
      });
      return current?.projectPath === "/workspace/shared"
        && Array.isArray(msg.projectPaths)
        && msg.projectPaths.includes("/workspace/shared");
    });
    expect(sharedList).toMatchObject({
      projectPaths: ["/workspace/shared"],
      sessions: [
        expect.objectContaining({
          sessionId: created.sessionId,
          projectPath: "/workspace/shared",
          pinned: false,
          completed: false,
        }),
      ],
    });

    wsA.send(JSON.stringify({ type: "set_session_pin", sessionId: created.sessionId, pinned: true }));
    wsA.send(JSON.stringify({
      type: "set_session_completion",
      sessionId: created.sessionId,
      completed: true,
    }));

    const updatedList = await waitForMessage(wsB, (msg) => {
      if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
        return false;
      }
      const current = msg.sessions.find((entry: Record<string, unknown>) => {
        return entry.sessionId === created.sessionId;
      });
      return current?.pinned === true && current?.completed === true;
    });
    expect(updatedList).toMatchObject({
      projectPaths: ["/workspace/shared"],
      sessions: [
        expect.objectContaining({
          sessionId: created.sessionId,
          pinned: true,
          completed: true,
        }),
      ],
    });

    wsA.close();
    wsB.close();
  });

  it("marks session summaries as commentary until a final answer is received", async () => {
    let session: FakeCodexSession | undefined;
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: {
        startSession: async () => {
          session = new FakeCodexSession();
          return session;
        },
      },
    });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    const created = await waitForMessage(ws, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });

    ws.send(JSON.stringify({
      type: "input",
      sessionId: created.sessionId,
      text: "Explain the repo",
    }));
    await waitForMessage(ws, (msg) => msg.type === "input_ack" && msg.queued === false);

    ws.send(JSON.stringify({ type: "list_sessions" }));
    const commentarySummary = await waitForMessage(ws, (msg) => {
      if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
        return false;
      }
      const current = msg.sessions.find((entry: Record<string, unknown>) => entry.sessionId === created.sessionId);
      return current?.answerState === "commentary";
    });
    expect(commentarySummary).toMatchObject({
      sessions: [
        expect.objectContaining({
          sessionId: created.sessionId,
          answerState: "commentary",
        }),
      ],
    });

    if (!session) {
      throw new Error("expected session");
    }
    session.emit({
      type: "assistant",
      message: {
        id: "msg_final",
        role: "assistant",
        content: [{ type: "text", text: "Final reply" }],
        model: "gpt-5.4",
        phase: "final_answer",
      },
    });

    ws.send(JSON.stringify({ type: "list_sessions" }));
    const finalSummary = await waitForMessage(ws, (msg) => {
      if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
        return false;
      }
      const current = msg.sessions.find((entry: Record<string, unknown>) => entry.sessionId === created.sessionId);
      return current?.answerState === "final_answer";
    });
    expect(finalSummary).toMatchObject({
      sessions: [
        expect.objectContaining({
          sessionId: created.sessionId,
          answerState: "final_answer",
        }),
      ],
    });

    ws.close();
  });

  it("surfaces plan approvals in the session summary and relays approve actions", async () => {
    let session: FakeCodexSession | undefined;
    const server = await startBridgeServer({
      port: 0,
      codexSessionRoot: null,
      codexFactory: {
        startSession: async () => {
          session = new FakeCodexSession();
          return session;
        },
      },
    });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app", permissionMode: "plan" }));
    const created = await waitForMessage(ws, (msg) => {
      return msg.type === "system" && msg.subtype === "session_created";
    });

    if (!session) {
      throw new Error("expected session");
    }
    session.emit({
      type: "permission_request",
      toolUseId: "plan_1",
      toolName: "ExitPlanMode",
      input: { plan: "1. Inspect\n2. Edit\n3. Test" },
    });

    ws.send(JSON.stringify({ type: "list_sessions" }));
    const payload = await waitForMessage(ws, (msg) => {
      if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
        return false;
      }
      const current = msg.sessions.find((entry: Record<string, unknown>) => {
        return entry.sessionId === created.sessionId;
      });
      return current?.pendingPermission?.toolUseId === "plan_1";
    });
    expect(payload).toMatchObject({
      sessions: [
        expect.objectContaining({
          sessionId: created.sessionId,
          pendingPermission: {
            toolUseId: "plan_1",
            toolName: "ExitPlanMode",
            input: { plan: "1. Inspect\n2. Edit\n3. Test" },
          },
        }),
      ],
    });

    ws.send(JSON.stringify({
      type: "approve",
      sessionId: created.sessionId,
      toolUseId: "plan_1",
      updatedInput: { plan: "1. Inspect\n2. Edit\n3. Test" },
    }));

    await vi.waitFor(() => {
      expect(session?.approved).toEqual([
        {
          toolUseId: "plan_1",
          updatedInput: { plan: "1. Inspect\n2. Edit\n3. Test" },
        },
      ]);
    });

    ws.close();
  });

  it("restores prior conversations, project paths, and session flags after the server restarts", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "codex-browser-bridge-"));
    const stateFilePath = join(tempRoot, "state", "sessions.json");
    try {
      let session: FakeCodexSession | undefined;
      const firstServer = await startBridgeServer({
        port: 0,
        codexSessionRoot: null,
        stateFilePath,
        codexFactory: {
          startSession: async () => {
            session = new FakeCodexSession();
            return session;
          },
        },
      });
      servers.push(firstServer);

      const ws1 = new WebSocket(`ws://127.0.0.1:${firstServer.port}`);
      await once(ws1, "open");
      ws1.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
      const created = await waitForMessage(ws1, (msg) => {
        return msg.type === "system" && msg.subtype === "session_created";
      });

      ws1.send(JSON.stringify({
        type: "input",
        sessionId: created.sessionId,
        text: "Remember this chat",
      }));
      await waitForMessage(ws1, (msg) => msg.type === "input_ack" && msg.queued === false);
      if (!session) {
        throw new Error("expected session");
      }
      session.emit({
        type: "assistant",
        message: {
          id: "msg_saved",
          role: "assistant",
          content: [{ type: "text", text: "Stored answer" }],
          model: "gpt-5.4",
          phase: "final_answer",
        },
      });
      ws1.send(JSON.stringify({ type: "set_session_pin", sessionId: created.sessionId, pinned: true }));
      ws1.send(JSON.stringify({
        type: "set_session_completion",
        sessionId: created.sessionId,
        completed: true,
      }));
      ws1.send(JSON.stringify({ type: "list_sessions" }));
      await waitForMessage(ws1, (msg) => {
        if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
          return false;
        }
        const current = msg.sessions.find((entry: Record<string, unknown>) => {
          return entry.sessionId === created.sessionId;
        });
        return current?.pinned === true && current?.completed === true;
      });

      ws1.close();
      await firstServer.close();
      servers.pop();

      const secondServer = await startBridgeServer({
        port: 0,
        codexSessionRoot: null,
        stateFilePath,
        codexFactory: {
          startSession: async () => new FakeCodexSession(created.sessionId),
        },
      });
      servers.push(secondServer);

      const ws2 = new WebSocket(`ws://127.0.0.1:${secondServer.port}`);
      await once(ws2, "open");

      ws2.send(JSON.stringify({ type: "list_sessions" }));
      const restoredList = await waitForMessage(ws2, (msg) => {
        if (msg.type !== "session_list" || !Array.isArray(msg.sessions)) {
          return false;
        }
        const current = msg.sessions.find((entry: Record<string, unknown>) => {
          return entry.sessionId === created.sessionId;
        });
        return current?.status === "stopped";
      });
      expect(restoredList).toMatchObject({
        projectPaths: ["/workspace/app"],
        sessions: [
          expect.objectContaining({
            sessionId: created.sessionId,
            title: "Remember this chat",
            preview: "Stored answer",
            status: "stopped",
            pinned: true,
            completed: true,
          }),
        ],
      });

      ws2.send(JSON.stringify({ type: "get_history", sessionId: created.sessionId }));
      const restoredHistory = await waitForMessage(ws2, (msg) => msg.type === "history");
      expect(restoredHistory).toMatchObject({
        sessionId: created.sessionId,
        messages: [
          expect.objectContaining({ type: "user", text: "Remember this chat" }),
          expect.objectContaining({
            type: "assistant",
            message: expect.objectContaining({
              content: [{ type: "text", text: "Stored answer" }],
            }),
          }),
        ],
      });

      ws2.send(JSON.stringify({
        type: "input",
        sessionId: created.sessionId,
        text: "resume after restart",
      }));
      const restoredAck = await waitForMessage(ws2, (msg) => msg.type === "input_ack");
      expect(restoredAck).toEqual({
        type: "input_ack",
        sessionId: created.sessionId,
        queued: false,
        text: "resume after restart",
      });

      ws2.close();
      await secondServer.close();
      servers.pop();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

async function waitForMessage(
  ws: WebSocket,
  predicate: (payload: Record<string, any>) => boolean,
): Promise<Record<string, any>> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", handleMessage);
      reject(new Error("Timed out waiting for websocket message"));
    }, 2000);

    const handleMessage = (raw: WebSocket.RawData) => {
      const payload = JSON.parse(String(raw)) as Record<string, any>;
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timeout);
      ws.off("message", handleMessage);
      resolve(payload);
    };

    ws.on("message", handleMessage);
  });
}

async function writeCodexSessionFile(
  codexSessionRoot: string,
  options: {
    threadId: string;
    projectPath: string;
    model: string;
    reasoningEffort: string;
    userText: string;
    assistantText: string;
  },
): Promise<void> {
  const dayDir = join(codexSessionRoot, "2026", "03", "15");
  await mkdir(dayDir, { recursive: true });
  const filePath = join(dayDir, `rollout-2026-03-15T00-00-00-${options.threadId}.jsonl`);
  const lines = [
    JSON.stringify({
      timestamp: "2026-03-15T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: options.threadId,
        cwd: options.projectPath,
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T00:00:01.000Z",
      type: "turn_context",
      payload: {
        model: options.model,
        collaboration_mode: {
          settings: {
            reasoning_effort: options.reasoningEffort,
          },
        },
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T00:00:02.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: options.userText,
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T00:00:03.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "final_answer",
        content: [
          {
            type: "output_text",
            text: options.assistantText,
          },
        ],
      },
    }),
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}
