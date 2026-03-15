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

  it("sends model, effort, and collaboration mode with turn/start", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-plan",
      unrestricted: true,
      model: "gpt-5.4",
      modelReasoningEffort: "xhigh",
      permissionMode: "plan",
    });
    const child = fakeChildren[0];

    await bootstrapSession(child, "thr_plan");
    const session = await startPromise;

    expect(session.getSessionId()).toBe("thr_plan");

    session.sendInput("Create a plan");
    await tick();

    const turnReq = nextOutgoingRequest(child);
    expect(turnReq).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "thr_plan",
        model: "gpt-5.4",
        effort: "xhigh",
        collaborationMode: {
          mode: "plan",
          settings: expect.objectContaining({ model: "gpt-5.4" }),
        },
      },
    });

    session.stop();
  });

  it("resumes an existing thread when threadId is provided", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-resume",
      unrestricted: true,
      threadId: "thr_resume",
    });
    const child = fakeChildren[0];

    await tick();
    const initReq = nextOutgoingRequest(child);
    child.stdout.emit("data", `${JSON.stringify({ id: initReq.id, result: {} })}\n`);
    await tick();
    expect(nextOutgoingNotification(child)).toMatchObject({ method: "initialized" });
    const threadReq = nextOutgoingRequest(child);
    expect(threadReq).toMatchObject({
      method: "thread/resume",
      params: {
        cwd: "/tmp/project-resume",
        threadId: "thr_resume",
      },
    });
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: threadReq.id, result: { thread: { id: "thr_resume" } } })}\n`,
    );

    const session = await startPromise;
    expect(session.getSessionId()).toBe("thr_resume");
    session.stop();
  });

  it("emits AskUserQuestion requests and answers them over JSON-RPC", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-question",
      unrestricted: true,
    });
    const child = fakeChildren[0];

    await bootstrapSession(child, "thr_question");
    const session = await startPromise;
    const messages: Array<Record<string, unknown>> = [];
    session.onMessage((message) => {
      messages.push(message);
    });

    child.stdout.emit(
      "data",
      `${JSON.stringify({
        id: 91,
        method: "item/tool/requestUserInput",
        params: {
          itemId: "ask_1",
          questions: [
            {
              id: "q_1",
              header: "Scope",
              question: "How should I proceed?",
              options: [{ label: "Fast", description: "Take the shortest path" }],
            },
          ],
        },
      })}\n`,
    );

    expect(messages).toContainEqual({
      type: "permission_request",
      toolUseId: "ask_1",
      toolName: "AskUserQuestion",
      input: {
        questions: [
          {
            id: "q_1",
            header: "Scope",
            question: "How should I proceed?",
            options: [{ label: "Fast", description: "Take the shortest path" }],
          },
        ],
      },
    });

    session.answer("ask_1", "Fast");

    expect(nextOutgoingResponse(child)).toEqual({
      id: 91,
      result: {
        answers: [
          {
            question_id: "q_1",
            answer: "Fast",
          },
        ],
      },
    });

    session.stop();
  });

  it("clears request-user-input waiting state after an interrupt so the next prompt can start", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-question-interrupt",
      unrestricted: true,
    });
    const child = fakeChildren[0];

    await bootstrapSession(child, "thr_question_interrupt");
    const session = await startPromise;

    session.sendInput("First prompt");
    await tick();
    const turnReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: turnReq.id, result: { turn: { id: "turn_question_interrupt" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/started", params: { turn: { id: "turn_question_interrupt" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({
        id: 91,
        method: "item/tool/requestUserInput",
        params: {
          itemId: "ask_interrupt",
          questions: [{ id: "q_1", question: "How should I proceed?" }],
        },
      })}\n`,
    );

    session.interrupt();
    await tick();

    expect(nextOutgoingRequest(child)).toMatchObject({
      method: "turn/interrupt",
      params: {
        threadId: "thr_question_interrupt",
        turnId: "turn_question_interrupt",
      },
    });

    child.stdout.emit(
      "data",
      `${JSON.stringify({
        method: "turn/completed",
        params: { turn: { id: "turn_question_interrupt", status: "interrupted" } },
      })}\n`,
    );
    await tick();

    session.sendInput("Second prompt");
    await tick();

    expect(nextOutgoingRequest(child)).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "thr_question_interrupt",
        input: [{ type: "text", text: "Second prompt", text_elements: [] }],
      },
    });

    session.stop();
  });

  it("turns a completed plan into an approval request and executes it after approval", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-plan-approval",
      unrestricted: true,
      permissionMode: "plan",
      model: "gpt-5.4",
      modelReasoningEffort: "xhigh",
    });
    const child = fakeChildren[0];

    await bootstrapSession(child, "thr_plan_approval");
    const session = await startPromise;
    const messages: Array<Record<string, unknown>> = [];
    session.onMessage((message) => {
      messages.push(message);
    });

    session.sendInput("Plan the work");
    await tick();
    const firstTurnReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: firstTurnReq.id, result: { turn: { id: "turn_plan" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/started", params: { turn: { id: "turn_plan" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({
        method: "item/completed",
        params: {
          item: {
            id: "msg_plan",
            type: "agent_message",
            text: "1. Inspect\n2. Edit\n3. Test",
            phase: "final_answer",
          },
        },
      })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({
        method: "turn/completed",
        params: { turn: { id: "turn_plan", status: "completed" } },
      })}\n`,
    );

    await tick();

    expect(messages).toContainEqual({
      type: "permission_request",
      toolUseId: expect.stringMatching(/^plan_/),
      toolName: "ExitPlanMode",
      input: { plan: "1. Inspect\n2. Edit\n3. Test" },
    });

    const planRequest = messages.find((message) => message.type === "permission_request");
    session.approve(String(planRequest?.toolUseId), { plan: "1. Inspect\n2. Edit\n3. Test" });
    await tick();

    const executeReq = nextOutgoingRequest(child);
    expect(executeReq).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "thr_plan_approval",
        collaborationMode: {
          mode: "default",
          settings: expect.objectContaining({ model: "gpt-5.4" }),
        },
        effort: "xhigh",
        input: [
          {
            type: "text",
            text: "Execute the following plan:\n\n1. Inspect\n2. Edit\n3. Test",
            text_elements: [],
          },
        ],
      },
    });

    session.stop();
  });

  it("clears plan-review waiting state on interrupt so a new plan prompt can start", async () => {
    const factory = createCodexSessionFactory();
    const startPromise = factory.startSession({
      projectPath: "/tmp/project-plan-interrupt",
      unrestricted: true,
      permissionMode: "plan",
      model: "gpt-5.4",
      modelReasoningEffort: "xhigh",
    });
    const child = fakeChildren[0];

    await bootstrapSession(child, "thr_plan_interrupt");
    const session = await startPromise;
    const messages: Array<Record<string, unknown>> = [];
    session.onMessage((message) => {
      messages.push(message);
    });

    session.sendInput("Plan the work");
    await tick();
    const firstTurnReq = nextOutgoingRequest(child);
    child.stdout.emit(
      "data",
      `${JSON.stringify({ id: firstTurnReq.id, result: { turn: { id: "turn_plan_interrupt" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({ method: "turn/started", params: { turn: { id: "turn_plan_interrupt" } } })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({
        method: "item/completed",
        params: {
          item: {
            id: "msg_plan_interrupt",
            type: "agent_message",
            text: "1. Inspect\n2. Edit",
            phase: "final_answer",
          },
        },
      })}\n`,
    );
    child.stdout.emit(
      "data",
      `${JSON.stringify({
        method: "turn/completed",
        params: { turn: { id: "turn_plan_interrupt", status: "completed" } },
      })}\n`,
    );
    await tick();

    expect(messages).toContainEqual({
      type: "permission_request",
      toolUseId: expect.stringMatching(/^plan_/),
      toolName: "ExitPlanMode",
      input: { plan: "1. Inspect\n2. Edit" },
    });

    session.interrupt();
    await tick();

    session.sendInput("Revise the plan");
    await tick();

    expect(nextOutgoingRequest(child)).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "thr_plan_interrupt",
        effort: "xhigh",
        collaborationMode: {
          mode: "plan",
          settings: expect.objectContaining({ model: "gpt-5.4" }),
        },
        input: [{ type: "text", text: "Revise the plan", text_elements: [] }],
      },
    });

    session.stop();
  });
});

async function bootstrapSession(child: FakeChildProcess, threadId: string): Promise<void> {
  await tick();
  const initReq = nextOutgoingRequest(child);
  child.stdout.emit("data", `${JSON.stringify({ id: initReq.id, result: {} })}\n`);
  await tick();
  expect(nextOutgoingNotification(child)).toMatchObject({ method: "initialized" });
  const threadReq = nextOutgoingRequest(child);
  child.stdout.emit(
    "data",
    `${JSON.stringify({ id: threadReq.id, result: { thread: { id: threadId } } })}\n`,
  );
  await tick();
}

function nextOutgoingPayload(child: FakeChildProcess): Record<string, unknown> {
  const raw = child.stdin.writes.shift();
  if (!raw) {
    throw new Error("Expected an outgoing payload");
  }
  return JSON.parse(raw.trim()) as Record<string, unknown>;
}

function nextOutgoingRequest(child: FakeChildProcess): Record<string, any> {
  while (true) {
    const payload = nextOutgoingPayload(child);
    if ("id" in payload && "method" in payload) {
      return payload;
    }
  }
}

function nextOutgoingNotification(child: FakeChildProcess): Record<string, unknown> {
  while (true) {
    const payload = nextOutgoingPayload(child);
    if (!("id" in payload) && "method" in payload) {
      return payload;
    }
  }
}

function nextOutgoingResponse(child: FakeChildProcess): Record<string, unknown> {
  while (true) {
    const payload = nextOutgoingPayload(child);
    if ("id" in payload && !("method" in payload)) {
      return payload;
    }
  }
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
