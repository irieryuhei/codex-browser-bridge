import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderViewerHtml } from "../src/viewer-html.js";

const doms: JSDOM[] = [];

describe("renderViewerHtml", () => {
  afterEach(() => {
    while (doms.length > 0) {
      doms.pop()?.window.close();
      FakeWebSocket.instances.length = 0;
    }
  });

  it("connects to the current origin and asks for the session list", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    expect(viewer.panel("bridgeControls").hidden).toBe(false);
    expect(viewer.input("projectPath").value).toBe("/workspace/mserver");
    expect((viewer.panel("advancedControls") as HTMLDetailsElement).open).toBe(false);
    expect(viewer.select("projectPathPicker").hidden).toBe(false);
    expect(viewer.projectPathChoices()).toEqual([
      { value: "/workspace/mserver", label: "mserver" },
    ]);
    expect(viewer.input("modelInput").value).toBe("gpt-5.4");
    expect(viewer.select("modelReasoningEffort").value).toBe("xhigh");

    socket.open();

    expect(viewer.input("bridgeUrl").value).toBe("ws://127.0.0.1:8765");
    expect(socket.sentJson()).toEqual([{ type: "list_sessions" }]);
    expect(viewer.panel("bridgeControls").hidden).toBe(true);
  });

  it("places the composer above the message list", () => {
    const viewer = bootViewer();
    const composer = viewer.textarea("composerInput").closest(".composer");
    const messages = viewer.panel("messages");
    const nodeApi = composer?.ownerDocument.defaultView?.Node;

    expect(composer).not.toBeNull();
    expect(nodeApi).toBeDefined();
    if (!composer || !nodeApi) {
      throw new Error("expected composer and Node API");
    }
    expect(composer.compareDocumentPosition(messages) & nodeApi.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("starts sessions with the configured model, effort, and plan mode from the composer controls", () => {
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

  it("hydrates recent project paths from the bridge so another browser sees the same choices", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      projectPaths: ["/workspace/alpha", "/workspace/beta"],
      sessions: [],
    });

    expect(viewer.input("projectPath").value).toBe("/workspace/alpha");
    expect(viewer.projectPathChoices()).toEqual([
      { value: "/workspace/alpha", label: "alpha" },
      { value: "/workspace/beta", label: "beta" },
    ]);
  });

  it("fills the project path input with the full path when a remembered repository is chosen", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      projectPaths: ["/workspace/alpha", "/workspace/beta"],
      sessions: [],
    });

    viewer.select("projectPathPicker").value = "/workspace/beta";
    viewer.select("projectPathPicker").dispatchEvent(new viewer.document.defaultView!.Event("change"));

    expect(viewer.input("projectPath").value).toBe("/workspace/beta");
  });

  it("deduplicates remembered project paths loaded from localStorage", () => {
    const viewer = bootViewer({
      savedStorage: {
        "codex-browser-bridge.viewer": JSON.stringify({
          projectPath: "/workspace/alpha",
          projectPaths: ["/workspace/alpha", "/workspace/alpha", "/workspace/beta"],
        }),
      },
    });

    expect(viewer.projectPathChoices()).toEqual([
      { value: "/workspace/alpha", label: "alpha" },
      { value: "/workspace/beta", label: "beta" },
    ]);
  });

  it("updates the URL when a conversation is selected", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Session A",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "",
          queueLength: 0,
        },
      ],
    });

    viewer.sessionButtons()[0]?.click();

    expect(viewer.locationSearch()).toBe("?session=sess_a");
  });

  it("shows one pane at a time on mobile and returns to the list with the back button", () => {
    const viewer = bootViewer({ width: 430 });
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Session A",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "",
          queueLength: 0,
        },
      ],
    });

    expect(viewer.layoutClassName()).toContain("mobile-list-open");

    viewer.sessionButtons()[0]?.click();

    expect(viewer.layoutClassName()).toContain("mobile-viewer-open");
    expect(viewer.locationSearch()).toBe("?session=sess_a");
    expect(viewer.button("viewerBackBtn").hidden).toBe(false);
    expect(viewer.scrollToCalls()).toContainEqual([{ top: 0, behavior: "auto" }]);

    viewer.button("viewerBackBtn").click();

    expect(viewer.layoutClassName()).toContain("mobile-list-open");
    expect(viewer.locationSearch()).toBe("");
    expect(viewer.text("viewerTitle")).toBe("No session selected");
  });

  it("restores the list when browser back style navigation is applied on mobile", async () => {
    const viewer = bootViewer({ width: 430 });
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Session A",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "",
          queueLength: 0,
        },
      ],
    });

    viewer.sessionButtons()[0]?.click();
    viewer.window.history.replaceState({}, "", "/");
    viewer.window.dispatchEvent(new viewer.window.PopStateEvent("popstate"));

    expect(viewer.layoutClassName()).toContain("mobile-list-open");
    expect(viewer.locationSearch()).toBe("");
    expect(viewer.text("viewerTitle")).toBe("No session selected");
  });

  it("renders the session list, model badge, and pin or complete actions", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Pinned session",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: true,
          completed: false,
          preview: "Ready",
          queueLength: 0,
        },
        {
          sessionId: "sess_b",
          title: "Completed session",
          projectPath: "/workspace/b",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:01.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "plan",
          pinned: false,
          completed: true,
          preview: "Done",
          queueLength: 0,
        },
      ],
    });

    const buttons = viewer.sessionButtons();
    expect(buttons.map((button: HTMLButtonElement) => button.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "Pinned session repo: a model: gpt-5.4 / effort: xhigh Ready",
      "Completed session repo: b mode: plan Done",
    ]);
    expect(buttons[0]?.className).toContain("pinned");
    expect(buttons[1]?.className).toContain("completed");

    socket.clearSent();
    buttons[0]?.click();
    expect(socket.sentJson()).toEqual([{ type: "get_history", sessionId: "sess_a" }]);

    socket.receive({
      type: "history",
      sessionId: "sess_a",
      messages: [],
    });

    expect(viewer.text("viewerModelBadge")).toBe("model: gpt-5.4 / effort: xhigh");

    socket.clearSent();
    viewer.button("viewerPinBtn").click();
    viewer.button("viewerCompleteBtn").click();

    expect(socket.sentJson()).toEqual([
      { type: "set_session_pin", sessionId: "sess_a", pinned: false },
      { type: "set_session_completion", sessionId: "sess_a", completed: true },
    ]);
  });

  it("limits the conversation list to ten rows and filters by title, repo, or preview", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: Array.from({ length: 12 }, (_, index) => ({
        sessionId: `sess_${index + 1}`,
        title: index === 10 ? "Needle session" : `Session ${index + 1}`,
        projectPath: index === 11 ? "/workspace/filter-target" : `/workspace/repo-${index + 1}`,
        status: "idle",
        answerState: "final_answer",
        updatedAt: `2026-03-15T00:00:${String(index).padStart(2, "0")}.000Z`,
        model: "",
        modelReasoningEffort: "",
        permissionMode: "default",
        pinned: false,
        completed: false,
        preview: index === 11 ? "Needle preview" : `Preview ${index + 1}`,
        queueLength: 0,
      })),
    });

    expect(viewer.sessionButtons()).toHaveLength(10);
    expect(viewer.text("sessionListSummary")).toBe("Showing 10 of 12 conversations");
    expect(viewer.button("sessionListPrevBtn").disabled).toBe(true);
    expect(viewer.button("sessionListNextBtn").disabled).toBe(false);

    viewer.input("sessionFilterInput").value = "Needle";
    viewer.input("sessionFilterInput").dispatchEvent(new viewer.document.defaultView!.Event("input"));

    expect(viewer.sessionButtons()).toHaveLength(2);
    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_11",
      "sess_12",
    ]);
    expect(viewer.text("sessionListSummary")).toBe("Showing 2 of 12 conversations");
  });

  it("pages the conversation list with previous and next buttons", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: Array.from({ length: 12 }, (_, index) => ({
        sessionId: `sess_${index + 1}`,
        title: `Session ${index + 1}`,
        projectPath: `/workspace/repo-${index + 1}`,
        status: "idle",
        answerState: "final_answer",
        updatedAt: `2026-03-15T00:00:${String(index).padStart(2, "0")}.000Z`,
        model: "",
        modelReasoningEffort: "",
        permissionMode: "default",
        pinned: false,
        completed: false,
        preview: `Preview ${index + 1}`,
        queueLength: 0,
      })),
    });

    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_1",
      "sess_2",
      "sess_3",
      "sess_4",
      "sess_5",
      "sess_6",
      "sess_7",
      "sess_8",
      "sess_9",
      "sess_10",
    ]);

    viewer.button("sessionListNextBtn").click();

    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_11",
      "sess_12",
    ]);
    expect(viewer.text("sessionListSummary")).toBe("Showing 11-12 of 12 conversations");
    expect(viewer.button("sessionListPrevBtn").disabled).toBe(false);
    expect(viewer.button("sessionListNextBtn").disabled).toBe(true);

    viewer.button("sessionListPrevBtn").click();

    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_1",
      "sess_2",
      "sess_3",
      "sess_4",
      "sess_5",
      "sess_6",
      "sess_7",
      "sess_8",
      "sess_9",
      "sess_10",
    ]);
    expect(viewer.text("sessionListSummary")).toBe("Showing 10 of 12 conversations");
    expect(viewer.button("sessionListPrevBtn").disabled).toBe(true);
    expect(viewer.button("sessionListNextBtn").disabled).toBe(false);
  });

  it("shows a spinner in the conversation list until the final answer arrives", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Running session",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "commentary",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Thinking...",
          queueLength: 0,
        },
      ],
    });

    expect(viewer.sessionSpinners()).toEqual(["sess_a"]);

    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Running session",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:08.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Done",
          queueLength: 0,
        },
      ],
    });

    expect(viewer.sessionSpinners()).toEqual([]);
  });

  it("keeps queued prompts hidden when there is no actual queued message text", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Running session",
          projectPath: "/workspace/a",
          status: "running",
          answerState: "commentary",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Thinking...",
          queueLength: 2,
        },
      ],
    });
    viewer.sessionButtons()[0]?.click();
    socket.receive({ type: "history", sessionId: "sess_a", messages: [] });

    expect(viewer.panel("queuedPanel").hidden).toBe(true);
    expect(viewer.queuedItems()).toEqual([]);
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
          title: "Session A",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "",
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
          id: "reason_1",
          text: "Inspecting...",
          timestamp: "2026-03-15T00:00:04.000Z",
        },
        {
          type: "assistant",
          sessionId: "sess_a",
          timestamp: "2026-03-15T00:00:06.000Z",
          message: {
            id: "msg_1",
            role: "assistant",
            model: "gpt-5.4",
            phase: "final_answer",
            content: [{ type: "text", text: "All good." }],
          },
        },
      ],
    });

    const cards = viewer.messageBlocks();
    expect(cards[0]?.textContent).toContain("All good.");
    expect(cards[1]?.tagName).toBe("DETAILS");
    expect(cards[1]?.textContent).toContain("途中の会話");
    expect(cards[1]?.textContent).toContain("6s");
    expect(cards[2]?.textContent).toContain("Please inspect the repo");
  });

  it("keeps queued prompts out of history until the bridge confirms the user turn", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Session A",
          projectPath: "/workspace/a",
          status: "running",
          answerState: "commentary",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "",
          queueLength: 0,
        },
      ],
    });
    viewer.sessionButtons()[0]?.click();
    socket.receive({ type: "history", sessionId: "sess_a", messages: [] });

    expect(viewer.panel("queuedPanel").hidden).toBe(true);

    viewer.textarea("composerInput").value = "Queued follow-up";
    viewer.button("sendBtn").click();

    expect(socket.sentJson().at(-1)).toEqual({
      type: "input",
      sessionId: "sess_a",
      text: "Queued follow-up",
    });

    socket.receive({
      type: "input_ack",
      sessionId: "sess_a",
      queued: true,
      text: "Queued follow-up",
    });

    expect(viewer.queuedItems()).toEqual(["Queued follow-up"]);
    expect(viewer.panel("queuedPanel").hidden).toBe(false);
    expect(viewer.messageBlocks().map((block: HTMLElement) => block.textContent?.trim())).toEqual([]);

    socket.receive({
      type: "user",
      sessionId: "sess_a",
      text: "Queued follow-up",
      timestamp: "2026-03-15T00:00:07.000Z",
    });

    expect(viewer.queuedItems()).toEqual([]);
    expect(viewer.panel("queuedPanel").hidden).toBe(true);
    expect(viewer.messageBlocks()[0]?.textContent).toContain("Queued follow-up");
  });

  it("sends force input payloads when the force-send option is enabled", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Session A",
          projectPath: "/workspace/a",
          status: "running",
          answerState: "commentary",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "",
          queueLength: 0,
        },
      ],
    });
    viewer.sessionButtons()[0]?.click();
    socket.receive({ type: "history", sessionId: "sess_a", messages: [] });

    viewer.input("forceSendToggle").checked = true;
    viewer.textarea("composerInput").value = "Force follow-up";
    viewer.button("sendBtn").click();

    expect(socket.sentJson().at(-1)).toEqual({
      type: "input",
      sessionId: "sess_a",
      text: "Force follow-up",
      force: true,
    });
  });

  it("treats restored stopped sessions as read-only", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_old",
          title: "Old session",
          projectPath: "/workspace/old",
          status: "stopped",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "gpt-5.4",
          modelReasoningEffort: "xhigh",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Stored answer",
          queueLength: 0,
        },
      ],
    });
    viewer.sessionButtons()[0]?.click();
    socket.receive({ type: "history", sessionId: "sess_old", messages: [] });

    expect(viewer.textarea("composerInput").disabled).toBe(false);
    expect(viewer.button("sendBtn").disabled).toBe(false);
    expect(viewer.text("composerHint")).toContain("resume");
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

function bootViewer(options: { savedStorage?: Record<string, string>; url?: string; width?: number } = {}) {
  const dom = new JSDOM(renderViewerHtml(), {
    url: options.url ?? "http://127.0.0.1:8765/",
    runScripts: "outside-only",
  });
  doms.push(dom);
  const scrollToMock = vi.fn();
  Object.defineProperty(dom.window, "scrollTo", {
    configurable: true,
    value: scrollToMock,
  });
  const viewportWidth = options.width ?? 1280;
  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
  });
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
  dom.window.eval(extractInlineScript(renderViewerHtml()));

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
    textarea(id: string) {
      return dom.window.document.getElementById(id) as HTMLTextAreaElement;
    },
    select(id: string) {
      return dom.window.document.getElementById(id) as HTMLSelectElement;
    },
    text(id: string) {
      return dom.window.document.getElementById(id)?.textContent?.trim() ?? "";
    },
    button(id: string) {
      return dom.window.document.getElementById(id) as HTMLButtonElement;
    },
    panel(id: string) {
      return dom.window.document.getElementById(id) as HTMLElement;
    },
    layoutClassName() {
      return dom.window.document.querySelector(".layout")?.className ?? "";
    },
    locationSearch() {
      return dom.window.location.search;
    },
    scrollToCalls() {
      return scrollToMock.mock.calls;
    },
    sessionButtons(): HTMLButtonElement[] {
      return Array.from(dom.window.document.querySelectorAll("[data-session-id]")) as HTMLButtonElement[];
    },
    sessionSpinners(): string[] {
      return Array.from(dom.window.document.querySelectorAll("[data-session-spinner]"))
        .map((item) => (item as HTMLElement).dataset.sessionSpinner ?? "");
    },
    messageBlocks(): HTMLElement[] {
      return Array.from(dom.window.document.getElementById("messages")?.children ?? []) as HTMLElement[];
    },
    queuedItems(): string[] {
      return Array.from(dom.window.document.querySelectorAll("#queuedList li"))
        .map((item) => (item as HTMLElement).textContent?.trim() ?? "");
    },
    projectPathChoices(): Array<{ value: string; label: string }> {
      return Array.from(dom.window.document.querySelectorAll("#projectPathPicker option"))
        .map((item) => ({
          value: (item as HTMLOptionElement).value,
          label: (item as HTMLOptionElement).textContent ?? "",
        }));
    },
    snapshotStorage(): Record<string, string> {
      const snapshot: Record<string, string> = {};
      for (let index = 0; index < dom.window.localStorage.length; index += 1) {
        const key = dom.window.localStorage.key(index);
        if (!key) {
          continue;
        }
        snapshot[key] = dom.window.localStorage.getItem(key) ?? "";
      }
      return snapshot;
    },
  };
}

function extractInlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("Inline script not found");
  }
  return match[1];
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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

  receive(payload: Record<string, unknown>): void {
    this.dispatch("message", { data: JSON.stringify(payload) });
  }

  clearSent(): void {
    this.sent.length = 0;
  }

  sentJson(): Array<Record<string, unknown>> {
    return this.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
  }

  private dispatch(type: string, event: { data?: string }): void {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(event);
    }
  }
}
