import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderViewerNextHtml } from "../src/viewer-next-html.js";
import { VIEWER_NEXT_JS } from "../src/viewer-next-js.js";

const doms: JSDOM[] = [];

describe("renderViewerNextHtml", () => {
  afterEach(() => {
    vi.useRealTimers();
    while (doms.length > 0) {
      doms.pop()?.window.close();
      FakeWebSocket.instances.length = 0;
    }
  });

  it("renders the next viewer shell with standalone assets", () => {
    const html = renderViewerNextHtml();

    expect(html).toContain('href="/viewer-next/app.css"');
    expect(html).toContain('src="/viewer-next/app.js"');
    expect(html).toContain('id="sessionsList"');
    expect(html).toContain('id="bridgeControls"');
    expect(html).toContain('id="permissionPanel"');
  });

  it("connects to the current origin and asks for the session list", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    expect(viewer.panel("bridgeControls").hidden).toBe(false);
    expect(viewer.input("projectPath").value).toBe("/workspace/mserver");
    expect(viewer.input("modelInput").value).toBe("gpt-5.4-mini");
    expect(viewer.select("modelReasoningEffort").value).toBe("xhigh");

    socket.open();

    expect(viewer.input("bridgeUrl").value).toBe("ws://127.0.0.1:8765");
    expect(socket.sentJson()).toEqual([{ type: "list_sessions" }]);
    expect(viewer.panel("bridgeControls").hidden).toBe(true);
  });

  it("starts sessions with the configured model, effort, and plan mode", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.clearSent();
    viewer.input("projectPath").value = "/workspace/app";
    viewer.input("modelInput").value = "gpt-5.4";
    viewer.select("modelReasoningEffort").value = "xhigh";
    viewer.select("permissionMode").value = "plan";

    viewer.button("startBtn").click();

    expect(socket.sentJson()).toEqual([
      {
        type: "start",
        projectPath: "/workspace/app",
        model: "gpt-5.4",
        modelReasoningEffort: "xhigh",
        permissionMode: "plan",
      },
    ]);
  });

  it("updates the URL when a conversation is selected and loads its history", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.clearSent();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Alpha",
          projectPath: "/workspace/alpha",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Ready",
          queueLength: 0,
        },
      ],
    });

    viewer.sessionButtons()[0]?.click();

    expect(viewer.locationSearch()).toBe("?session=sess_a");
    expect(socket.sentJson()).toEqual([{ type: "get_history", sessionId: "sess_a" }]);
  });

  it("shows newest messages first and collapses intermediate turn messages after the final answer", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Alpha",
          projectPath: "/workspace/alpha",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Done",
          queueLength: 0,
        },
      ],
    });

    viewer.sessionButtons()[0]?.click();
    socket.receive({
      type: "history",
      sessionId: "sess_a",
      messages: [
        {
          type: "user",
          sessionId: "sess_a",
          text: "Please inspect the repo",
          timestamp: "2026-03-15T00:00:00.000Z",
        },
        {
          type: "thinking_delta",
          sessionId: "sess_a",
          id: "think_1",
          text: "Thinking",
          timestamp: "2026-03-15T00:00:01.000Z",
        },
        {
          type: "assistant",
          sessionId: "sess_a",
          timestamp: "2026-03-15T00:00:03.000Z",
          message: {
            id: "assistant_1",
            role: "assistant",
            phase: "final_answer",
            model: "gpt-5.4",
            content: [{ type: "text", text: "Final answer" }],
          },
        },
      ],
    });

    const blocks = viewer.messageBlocks();
    expect(blocks[0]?.textContent).toContain("Final Answer");
    expect(blocks[1]?.tagName).toBe("DETAILS");
    expect(blocks[1]?.textContent).toContain("途中の会話");
    expect(blocks[2]?.textContent).toContain("Please inspect the repo");
  });

  it("renders plan approvals for the selected session and sends approve actions", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_plan",
          title: "Plan session",
          projectPath: "/workspace/a",
          status: "waiting_approval",
          answerState: "commentary",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "plan",
          pinned: false,
          completed: false,
          preview: "Plan ready",
          queueLength: 0,
          pendingPermission: {
            toolUseId: "plan_1",
            toolName: "ExitPlanMode",
            input: { plan: "1. Inspect\n2. Edit\n3. Test" },
          },
        },
      ],
    });
    viewer.sessionButtons()[0]?.click();
    socket.receive({ type: "history", sessionId: "sess_plan", messages: [] });

    expect(viewer.panel("permissionPanel").textContent).toContain("1. Inspect");

    socket.clearSent();
    viewer.button("approvePermissionBtn").click();

    expect(socket.sentJson()).toEqual([
      {
        type: "approve",
        sessionId: "sess_plan",
        toolUseId: "plan_1",
        updatedInput: { plan: "1. Inspect\n2. Edit\n3. Test" },
      },
    ]);
  });
});

function bootViewer(
  options: { savedStorage?: Record<string, string>; url?: string; width?: number; now?: () => number } = {},
) {
  const dom = new JSDOM(renderViewerNextHtml(), {
    url: options.url ?? "http://127.0.0.1:8765/viewer-next/",
    runScripts: "outside-only",
  });
  doms.push(dom);
  const viewportWidth = options.width ?? 1280;

  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
  });
  if (options.now) {
    Object.defineProperty(dom.window.Date, "now", {
      configurable: true,
      value: options.now,
    });
  }

  (dom.window as unknown as Window & typeof globalThis & { matchMedia?: (query: string) => MediaQueryList }).matchMedia = (query: string) => ({
    matches: query === "(max-width: 980px)" ? viewportWidth <= 980 : false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
  Object.entries(options.savedStorage ?? {}).forEach(([key, value]) => {
    dom.window.localStorage.setItem(key, value);
  });
  FakeWebSocket.instances.length = 0;
  (dom.window as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
  dom.window.eval(VIEWER_NEXT_JS);

  return {
    document: dom.window.document,
    window: dom.window,
    socketAt(index: number) {
      const socket = FakeWebSocket.instances[index];
      if (!socket) {
        throw new Error(`No socket at index ${index}`);
      }
      return socket;
    },
    input(id: string) {
      return dom.window.document.getElementById(id) as HTMLInputElement;
    },
    select(id: string) {
      return dom.window.document.getElementById(id) as HTMLSelectElement;
    },
    button(id: string) {
      return dom.window.document.getElementById(id) as HTMLButtonElement;
    },
    panel(id: string) {
      return dom.window.document.getElementById(id) as HTMLElement;
    },
    sessionButtons(): HTMLButtonElement[] {
      return Array.from(dom.window.document.querySelectorAll("[data-session-id]")) as HTMLButtonElement[];
    },
    locationSearch() {
      return dom.window.location.search;
    },
    messageBlocks(): HTMLElement[] {
      return Array.from(dom.window.document.getElementById("messages")?.children ?? []) as HTMLElement[];
    },
  };
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  public readonly sent: string[] = [];
  public readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
  public readyState = FakeWebSocket.CONNECTING;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
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

  receive(payload: unknown): void {
    this.dispatch("message", { data: JSON.stringify(payload) });
  }

  clearSent(): void {
    this.sent.length = 0;
  }

  sentJson(): unknown[] {
    return this.sent.map((entry) => JSON.parse(entry));
  }

  private dispatch(type: string, event: { data?: string }): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.forEach((listener) => listener(event));
  }
}
