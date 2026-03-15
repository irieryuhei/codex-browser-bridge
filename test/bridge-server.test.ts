import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  startBridgeServer,
  type BridgeServer,
  type CodexSession,
  type CodexSessionFactory,
} from "../src/bridge-server.js";

class FakeCodexSession implements CodexSession {
  public readonly inputs: string[] = [];
  public interrupted = false;
  public stopped = false;
  private messageListener: ((message: Record<string, unknown>) => void) | null = null;

  sendInput(text: string): void {
    this.inputs.push(text);
  }

  interrupt(): void {
    this.interrupted = true;
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

  it("serves GET /health", async () => {
    const factory: CodexSessionFactory = {
      startSession: async () => new FakeCodexSession(),
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const response = await fetch(`http://127.0.0.1:${server.port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("serves the minimal browser viewer at GET /", async () => {
    const factory: CodexSessionFactory = {
      startSession: async () => new FakeCodexSession(),
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("<title>codex-browser-bridge</title>");
    expect(html).toContain('id="bridgeUrl"');
    expect(html).toContain('id="connectBtn"');
    expect(html).toContain('id="projectPath"');
    expect(html).toContain('id="startBtn"');
    expect(html).toContain('id="promptInput"');
    expect(html).toContain('id="sendBtn"');
    expect(html).toContain('id="interruptBtn"');
    expect(html).toContain('id="messages"');
  });

  it("starts a Codex session in unrestricted mode and announces it to the browser", async () => {
    const calls: Array<{ projectPath: string; unrestricted: boolean }> = [];
    const factory: CodexSessionFactory = {
      startSession: async (options) => {
        calls.push(options);
        return new FakeCodexSession();
      },
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");

    const messages = await collectMessages(ws, 2, () => {
      ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    });

    expect(calls).toEqual([{ projectPath: "/workspace/app", unrestricted: true }]);
    expect(messages[0]).toMatchObject({
      type: "system",
      subtype: "session_created",
      projectPath: "/workspace/app",
    });
    expect(messages[1]).toEqual({ type: "status", status: "idle" });

    ws.close();
  });

  it("echoes browser input and forwards it to the active Codex session", async () => {
    const startedSessions: FakeCodexSession[] = [];
    const factory: CodexSessionFactory = {
      startSession: async () => {
        const session = new FakeCodexSession();
        startedSessions.push(session);
        return session;
      },
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    await collectMessages(ws, 2, () => {
      ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    });

    const payload = await collectMessages(ws, 1, () => {
      ws.send(JSON.stringify({ type: "input", text: "hello codex" }));
    });

    expect(payload).toEqual([{ type: "user", text: "hello codex" }]);
    expect(startedSessions[0]?.inputs ?? null).toEqual(["hello codex"]);

    ws.close();
  });

  it("interrupts the active Codex session", async () => {
    let session: FakeCodexSession | null = null;
    const factory: CodexSessionFactory = {
      startSession: async () => {
        session = new FakeCodexSession();
        return session;
      },
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    await collectMessages(ws, 2, () => {
      ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    });

    ws.send(JSON.stringify({ type: "interrupt" }));

    await vi.waitFor(() => {
      expect(session?.interrupted).toBe(true);
    });

    ws.close();
  });

  it("relays Codex messages back to the websocket client", async () => {
    let session: FakeCodexSession | null = null;
    const factory: CodexSessionFactory = {
      startSession: async () => {
        session = new FakeCodexSession();
        return session;
      },
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    await collectMessages(ws, 2, () => {
      ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    });

    const payload = await collectMessages(ws, 1, () => {
      session?.emit({
        type: "assistant",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "text", text: "final answer" }],
          model: "codex",
          phase: "final_answer",
        },
      });
    });

    expect(payload).toEqual([
      {
        type: "assistant",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "text", text: "final answer" }],
          model: "codex",
          phase: "final_answer",
        },
      },
    ]);

    ws.close();
  });

  it("returns an error when input arrives before a session starts", async () => {
    const factory: CodexSessionFactory = {
      startSession: async () => new FakeCodexSession(),
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");

    const payload = await collectMessages(ws, 1, () => {
      ws.send(JSON.stringify({ type: "input", text: "hello codex" }));
    });

    expect(payload).toEqual([
      { type: "error", message: "No active session. Send 'start' first." },
    ]);

    ws.close();
  });

  it("stops the active Codex session when the websocket closes", async () => {
    let session: FakeCodexSession | null = null;
    const factory: CodexSessionFactory = {
      startSession: async () => {
        session = new FakeCodexSession();
        return session;
      },
    };

    const server = await startBridgeServer({ port: 0, codexFactory: factory });
    servers.push(server);

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, "open");
    await collectMessages(ws, 2, () => {
      ws.send(JSON.stringify({ type: "start", projectPath: "/workspace/app" }));
    });

    ws.close();

    await vi.waitFor(() => {
      expect(session?.stopped).toBe(true);
    });
  });
});

async function collectMessages(
  ws: WebSocket,
  count: number,
  action: () => void,
): Promise<Array<Record<string, unknown>>> {
  return await new Promise((resolve) => {
    const messages: Array<Record<string, unknown>> = [];
    const handleMessage = (raw: WebSocket.RawData) => {
      messages.push(JSON.parse(String(raw)) as Record<string, unknown>);
      if (messages.length >= count) {
        ws.off("message", handleMessage);
        resolve(messages);
      }
    };

    ws.on("message", handleMessage);
    action();
  });
}
