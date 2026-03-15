import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerHtml } from "../src/viewer-html.js";

describe("renderViewerHtml", () => {
  it("uses the current origin websocket url by default", () => {
    const viewer = bootViewer();

    expect(viewer.element("bridgeUrl").value).toBe("ws://127.0.0.1:8765");
    expect(viewer.socketAt(0).url).toBe("ws://127.0.0.1:8765");
  });

  it("reconnects to a manually entered bridge url", () => {
    const viewer = bootViewer();
    const socket1 = viewer.socketAt(0);

    viewer.element("bridgeUrl").value = "ws://bridge.internal:9000";
    viewer.element("connectBtn").dispatch("click");

    const socket2 = viewer.socketAt(1);

    expect(socket1.readyState).toBe(3);
    expect(socket2.url).toBe("ws://bridge.internal:9000");
  });

  it("starts a session from the project path input", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.clearSent();
    viewer.element("projectPath").value = "/workspace/app";

    viewer.element("startBtn").dispatch("click");

    expect(socket.sentJson()).toEqual([{ type: "start", projectPath: "/workspace/app" }]);
  });

  it("stores the active session when the bridge confirms session creation", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "system",
      subtype: "session_created",
      sessionId: "sess_123",
      projectPath: "/workspace/app",
    });

    expect(viewer.element("runtimeLabel").textContent).toBe("Session sess_123 / idle");
    expect(viewer.element("promptInput").disabled).toBe(false);
    expect(viewer.element("sendBtn").disabled).toBe(false);
    expect(viewer.element("interruptBtn").disabled).toBe(false);
    expect(messageBodies(viewer)).toEqual(["Started for /workspace/app"]);
  });

  it("sends prompts to the active session and renders echoed user messages", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "system",
      subtype: "session_created",
      sessionId: "sess_123",
      projectPath: "/workspace/app",
    });
    socket.clearSent();
    viewer.element("promptInput").value = "hello codex";

    viewer.element("sendBtn").dispatch("click");

    expect(socket.sentJson()).toEqual([{ type: "input", text: "hello codex" }]);
    expect(messageBodies(viewer)).toEqual(["Started for /workspace/app"]);

    socket.receive({
      type: "user",
      text: "hello codex",
    });

    expect(messageBodies(viewer)).toEqual([
      "Started for /workspace/app",
      "hello codex",
    ]);
  });

  it("updates the runtime label for status changes without adding a chat card", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "system",
      subtype: "session_created",
      sessionId: "sess_123",
      projectPath: "/workspace/app",
    });
    socket.receive({
      type: "status",
      status: "running",
    });

    expect(viewer.element("runtimeLabel").textContent).toBe("Session sess_123 / running");
    expect(messageBodies(viewer)).toEqual(["Started for /workspace/app"]);
  });

  it("aggregates commentary deltas and final assistant output", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({ type: "thinking_delta", id: "reasoning_1", text: "thinking" });
    socket.receive({ type: "thinking_delta", id: "reasoning_1", text: "..." });
    socket.receive({ type: "stream_delta", id: "msg_1", text: "partial" });
    socket.receive({ type: "stream_delta", id: "msg_1", text: " answer" });
    socket.receive({
      type: "assistant",
      message: {
        id: "msg_1",
        role: "assistant",
        content: [{ type: "text", text: "final answer" }],
        model: "codex",
        phase: "final_answer",
      },
    });

    expect(messageBodies(viewer)).toEqual(["thinking...", "final answer"]);
    expect(messageClasses(viewer)).toEqual(["message commentary", "message final"]);
  });

  it("merges tool use and tool result into one card", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "assistant",
      message: {
        id: "tool_msg_1",
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
    socket.receive({
      type: "tool_result",
      toolUseId: "cmd_1",
      toolName: "Bash",
      content: "file-a\nfile-b",
    });

    expect(messageBodies(viewer)).toEqual(["ls -la\n\nfile-a\nfile-b"]);
    expect(messageClasses(viewer)).toEqual(["message tool"]);
  });

  it("shows bridge errors in the conversation", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "error",
      message: "No active session. Send 'start' first.",
    });

    expect(messageBodies(viewer)).toEqual(["No active session. Send 'start' first."]);
    expect(messageClasses(viewer)).toEqual(["message error"]);
  });
});

function bootViewer() {
  const document = new FakeDocument();
  const webSocketClass = createFakeWebSocketClass();

  const context = {
    window: {
      location: {
        protocol: "http:",
        host: "127.0.0.1:8765",
      },
    },
    document,
    WebSocket: webSocketClass,
    console,
  };

  vm.runInNewContext(extractInlineScript(renderViewerHtml()), context);

  return {
    element(id: string) {
      return document.getElementById(id);
    },
    socketAt(index: number) {
      const socket = webSocketClass.instances[index];
      if (!socket) {
        throw new Error(`No socket at index ${index}`);
      }
      return socket;
    },
  };
}

function messageBodies(viewer: ReturnType<typeof bootViewer>): string[] {
  return viewer
    .element("messages")
    .children
    .map((card) => card.children[1]?.textContent ?? "");
}

function messageClasses(viewer: ReturnType<typeof bootViewer>): string[] {
  return viewer
    .element("messages")
    .children
    .map((card) => card.className);
}

function extractInlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("Inline script not found");
  }
  return match[1];
}

class FakeDocument {
  private readonly elements = new Map<string, FakeElement>();

  constructor() {
    for (const id of [
      "connectionDot",
      "connectionLabel",
      "runtimeLabel",
      "bridgeUrl",
      "connectBtn",
      "projectPath",
      "startBtn",
      "promptInput",
      "sendBtn",
      "interruptBtn",
      "messages",
    ]) {
      this.elements.set(id, new FakeElement(id));
    }
  }

  getElementById(id: string): FakeElement {
    const element = this.elements.get(id);
    if (!element) {
      throw new Error(`Unknown element: ${id}`);
    }
    return element;
  }

  createElement(_tagName: string): FakeElement {
    return new FakeElement();
  }
}

class FakeClassList {
  private readonly names = new Set<string>();

  add(...classNames: string[]): void {
    for (const className of classNames) {
      if (className) {
        this.names.add(className);
      }
    }
  }

  remove(...classNames: string[]): void {
    for (const className of classNames) {
      this.names.delete(className);
    }
  }

  toggle(className: string, force?: boolean): boolean {
    if (force === true) {
      this.names.add(className);
      return true;
    }
    if (force === false) {
      this.names.delete(className);
      return false;
    }
    if (this.names.has(className)) {
      this.names.delete(className);
      return false;
    }
    this.names.add(className);
    return true;
  }

  toString(): string {
    return Array.from(this.names).join(" ");
  }
}

class FakeElement {
  public readonly children: FakeElement[] = [];
  public readonly classList = new FakeClassList();
  public value = "";
  public textContent = "";
  public disabled = false;
  public type = "";
  public scrollTop = 0;
  public scrollHeight = 0;
  private readonly listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();

  constructor(public readonly id = "") {}

  get className(): string {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.remove(...this.className.split(/\s+/).filter(Boolean));
    this.classList.add(...String(value || "").split(/\s+/).filter(Boolean));
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    this.textContent = this.children.map((item) => item.textContent).join("");
    this.scrollHeight = this.children.length;
    return child;
  }

  replaceChildren(...items: FakeElement[]): void {
    this.children.length = 0;
    if (items.length > 0) {
      this.children.push(...items);
    }
    this.textContent = this.children.map((item) => item.textContent).join("");
    this.scrollHeight = this.children.length;
  }

  addEventListener(type: string, listener: (event: Record<string, unknown>) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: Record<string, unknown> = {}): void {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener({ target: this, currentTarget: this, ...event });
    }
  }
}

function createFakeWebSocketClass() {
  return class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    static readonly instances: FakeWebSocket[] = [];

    public readonly sent: string[] = [];
    public readonly listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();
    public readyState = FakeWebSocket.CONNECTING;

    constructor(public readonly url: string) {
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type: string, listener: (event: Record<string, unknown>) => void): void {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    send(payload: string): void {
      this.sent.push(payload);
    }

    close(): void {
      this.readyState = FakeWebSocket.CLOSED;
      this.dispatch("close", {});
    }

    open(): void {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatch("open", {});
    }

    receive(payload: Record<string, unknown>): void {
      this.dispatch("message", { data: JSON.stringify(payload) });
    }

    sentJson(): Array<Record<string, unknown>> {
      return this.sent.map((entry) => JSON.parse(entry));
    }

    clearSent(): void {
      this.sent.length = 0;
    }

    private dispatch(type: string, event: Record<string, unknown>): void {
      const listeners = this.listeners.get(type) ?? [];
      for (const listener of listeners) {
        listener(event);
      }
    }
  };
}
