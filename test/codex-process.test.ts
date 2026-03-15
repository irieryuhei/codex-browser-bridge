import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock, fakeChildren } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  fakeChildren: [] as FakeChildProcess[],
}));

class FakeWritable extends EventEmitter {
  public writes: string[] = [];

  write(chunk: string): boolean {
    this.writes.push(chunk);
    this.emit("write", chunk);
    return true;
  }
}

class FakeReadable extends EventEmitter {
  setEncoding(_encoding: string): void {}
}

class FakeChildProcess extends EventEmitter {
  public stdout = new FakeReadable();
  public stderr = new FakeReadable();
  public stdin = new FakeWritable();
  public killed = false;

  kill(_signal?: NodeJS.Signals): boolean {
    this.killed = true;
    this.emit("exit", 0);
    return true;
  }
}

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { createCodexSessionFactory, getCodexSpawnCommand } from "../src/codex-process.js";

describe("codex-process", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    fakeChildren.length = 0;
    spawnMock.mockImplementation(() => {
      const child = new FakeChildProcess();
      fakeChildren.push(child);
      return child;
    });
  });

  afterEach(() => {
    for (const child of fakeChildren) {
      if (!child.killed) {
        child.kill();
      }
    }
  });

  it("always starts codex app-server with full access", () => {
    expect(getCodexSpawnCommand()).toEqual({
      command: "codex",
      args: [
        "--dangerously-bypass-approvals-and-sandbox",
        "app-server",
        "--listen",
        "stdio://",
      ],
    });
  });

  it("initializes app-server and starts a thread in unrestricted mode", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-a",
      unrestricted: true,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["--dangerously-bypass-approvals-and-sandbox", "app-server", "--listen", "stdio://"],
      expect.objectContaining({ cwd: "/tmp/project-a" }),
    );

    const child = fakeChildren[0];
    await tick();

    const initReq = nextOutgoingRequest(child);
    expect(initReq).toMatchObject({
      method: "initialize",
      params: {
        clientInfo: expect.objectContaining({
          name: "codex_browser_bridge",
        }),
      },
    });
    child.stdout.emit("data", `${JSON.stringify({ id: initReq.id, result: {} })}\n`);

    await tick();
    expect(nextOutgoingNotification(child)).toMatchObject({
      method: "initialized",
    });

    const threadReq = nextOutgoingRequest(child);
    expect(threadReq).toMatchObject({
      method: "thread/start",
      params: {
        cwd: "/tmp/project-a",
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        experimentalRawEvents: false,
        persistExtendedHistory: true,
      },
    });

    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: threadReq.id, result: { thread: { id: "thr_1" } } })}\n`,
    );

    const session = await startPromise;
    session.stop();
  });

  it("sends turn/start for browser input and maps stream notifications", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-b",
      unrestricted: true,
    });
    const child = fakeChildren[0];

    await tick();
    const initReq = nextOutgoingRequest(child);
    child.stdout.emit("data", `${JSON.stringify({ id: initReq.id, result: {} })}\n`);
    await tick();
    nextOutgoingNotification(child);
    const threadReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: threadReq.id, result: { thread: { id: "thr_2" } } })}\n`,
    );

    const session = await startPromise;
    const messages: Array<Record<string, unknown>> = [];
    session.onMessage((message) => {
      messages.push(message);
    });

    session.sendInput("hello codex");
    await tick();

    const turnReq = nextOutgoingRequest(child);
    expect(turnReq).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "thr_2",
        input: [{ type: "text", text: "hello codex", text_elements: [] }],
      },
    });

    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: turnReq.id, result: { turn: { id: "turn_1" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/started", params: { turn: { id: "turn_1" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "item/reasoning/textDelta", params: { delta: "thinking...", threadId: "thr_2", turnId: "turn_1", itemId: "reasoning_1", contentIndex: 0 } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "item/agentMessage/delta", params: { delta: "partial", threadId: "thr_2", turnId: "turn_1", itemId: "msg_1" } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "item/completed", params: { threadId: "thr_2", turnId: "turn_1", item: { id: "msg_1", type: "agent_message", text: "final answer", phase: "final_answer" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/completed", params: { threadId: "thr_2", turn: { id: "turn_1", status: "completed" } } })}\n`,
    );

    await tick();

    expect(messages).toContainEqual({ type: "thinking_delta", id: "reasoning_1", text: "thinking..." });
    expect(messages).toContainEqual({ type: "stream_delta", id: "msg_1", text: "partial" });
    expect(messages).toContainEqual({
      type: "assistant",
      message: {
        id: "msg_1",
        role: "assistant",
        content: [{ type: "text", text: "final answer" }],
        model: "codex",
        phase: "final_answer",
      },
    });
    expect(messages).toContainEqual({
      type: "result",
      subtype: "success",
      sessionId: "thr_2",
    });

    session.stop();
  });

  it("emits status and bash tool progress for command execution items", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-tool",
      unrestricted: true,
    });
    const child = fakeChildren[0];

    await tick();
    const initReq = nextOutgoingRequest(child);
    child.stdout.emit("data", `${JSON.stringify({ id: initReq.id, result: {} })}\n`);
    await tick();
    nextOutgoingNotification(child);
    const threadReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: threadReq.id, result: { thread: { id: "thr_tool" } } })}\n`,
    );

    const session = await startPromise;
    const messages: Array<Record<string, unknown>> = [];
    session.onMessage((message) => {
      messages.push(message);
    });

    session.sendInput("run ls");
    await tick();

    const turnReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: turnReq.id, result: { turn: { id: "turn_tool" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/started", params: { turn: { id: "turn_tool" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "item/started", params: { threadId: "thr_tool", turnId: "turn_tool", item: { id: "cmd_1", type: "command_execution", command: "ls -la" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "item/completed", params: { threadId: "thr_tool", turnId: "turn_tool", item: { id: "cmd_1", type: "command_execution", aggregatedOutput: "file-a\nfile-b", exitCode: 0 } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/completed", params: { threadId: "thr_tool", turn: { id: "turn_tool", status: "completed" } } })}\n`,
    );

    await tick();

    expect(messages).toContainEqual({ type: "status", status: "running" });
    expect(messages).toContainEqual({
      type: "assistant",
      message: {
        id: "cmd_1",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "cmd_1",
            name: "Bash",
            input: { command: "ls -la" },
          },
        ],
        model: "codex",
      },
    });
    expect(messages).toContainEqual({
      type: "tool_result",
      toolUseId: "cmd_1",
      toolName: "Bash",
      content: "file-a\nfile-b",
    });
    expect(messages).toContainEqual({ type: "status", status: "idle" });

    session.stop();
  });

  it("interrupts the active turn", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-c",
      unrestricted: true,
    });
    const child = fakeChildren[0];

    await tick();
    const initReq = nextOutgoingRequest(child);
    child.stdout.emit("data", `${JSON.stringify({ id: initReq.id, result: {} })}\n`);
    await tick();
    nextOutgoingNotification(child);
    const threadReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: threadReq.id, result: { thread: { id: "thr_3" } } })}\n`,
    );

    const session = await startPromise;
    session.sendInput("interrupt me");
    await tick();

    const turnReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: turnReq.id, result: { turn: { id: "turn_interrupt" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/started", params: { turn: { id: "turn_interrupt" } } })}\n`,
    );
    await tick();

    session.interrupt();
    await tick();

    const interruptReq = nextOutgoingRequest(child);
    expect(interruptReq).toMatchObject({
      method: "turn/interrupt",
      params: { threadId: "thr_3", turnId: "turn_interrupt" },
    });

    session.stop();
  });
});

function consumeOutgoing(
  child: FakeChildProcess,
  predicate: (value: Record<string, unknown>) => boolean,
): Record<string, unknown> {
  const lines = child.stdin.writes
    .flatMap((chunk) => chunk.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const index = parsed.findIndex(predicate);
  if (index < 0) {
    throw new Error("Expected outgoing JSON-RPC message was not found");
  }
  const remaining = lines.filter((_, lineIndex) => lineIndex !== index);
  child.stdin.writes = remaining.length > 0 ? [`${remaining.join("\n")}\n`] : [];
  return parsed[index];
}

function nextOutgoingRequest(child: FakeChildProcess): Record<string, unknown> {
  return consumeOutgoing(child, (value) => typeof value.method === "string" && value.id !== undefined);
}

function nextOutgoingNotification(child: FakeChildProcess): Record<string, unknown> {
  return consumeOutgoing(child, (value) => typeof value.method === "string" && value.id === undefined);
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
