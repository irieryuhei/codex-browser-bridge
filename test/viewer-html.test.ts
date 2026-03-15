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
      { value: "", label: "Select a repository" },
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

  it("renders the mobile back button with an emphasized color style", () => {
    const html = renderViewerHtml();

    expect(html).toContain('id="viewerBackBtn" class="secondary back-to-list mobile-only"');
    expect(html).toContain(".back-to-list {");
    expect(html).toContain("background: linear-gradient(135deg, #d97706, #b45309);");
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

  it("prioritizes project path choices from the ten most recent conversations and appends shared candidates", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      projectPaths: ["/workspace/ignored"],
      sessions: Array.from({ length: 12 }, (_, index) => ({
        sessionId: `sess_${index + 1}`,
        title: `Session ${index + 1}`,
        projectPath: index < 10 ? `/workspace/repo-${index + 1}` : `/workspace/extra-${index - 9}`,
        status: "idle",
        answerState: "final_answer",
        updatedAt: `2026-03-15T00:00:${String(index).padStart(2, "0")}.000Z`,
        model: "",
        modelReasoningEffort: "",
        permissionMode: "default",
        pinned: false,
        completed: false,
        preview: "",
        queueLength: 0,
      })),
    });

    expect(viewer.input("projectPath").value).toBe("/workspace/repo-1");
    expect(viewer.projectPathChoices()).toEqual([
      { value: "", label: "Select a repository" },
      { value: "/workspace/repo-1", label: "repo-1" },
      { value: "/workspace/repo-2", label: "repo-2" },
      { value: "/workspace/repo-3", label: "repo-3" },
      { value: "/workspace/repo-4", label: "repo-4" },
      { value: "/workspace/repo-5", label: "repo-5" },
      { value: "/workspace/repo-6", label: "repo-6" },
      { value: "/workspace/repo-7", label: "repo-7" },
      { value: "/workspace/repo-8", label: "repo-8" },
      { value: "/workspace/repo-9", label: "repo-9" },
      { value: "/workspace/repo-10", label: "repo-10" },
      { value: "/workspace/ignored", label: "ignored" },
    ]);
  });

  it("hydrates shared project path choices from the bridge when no conversation list is available yet", () => {
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
      { value: "", label: "Select a repository" },
      { value: "/workspace/alpha", label: "alpha" },
      { value: "/workspace/beta", label: "beta" },
    ]);
  });

  it("prefers selectable project path choices from the bridge for the dropdown", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      projectPaths: ["/workspace/main-repo", "/workspace/feature-worktree-repo"],
      selectableProjectPaths: ["/workspace/main-repo"],
      sessions: [],
    });

    expect(viewer.input("projectPath").value).toBe("/workspace/main-repo");
    expect(viewer.projectPathChoices()).toEqual([
      { value: "", label: "Select a repository" },
      { value: "/workspace/main-repo", label: "main-repo" },
    ]);
  });

  it("fills the project path input with the full path when a conversation repository is chosen", () => {
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
          preview: "",
          queueLength: 0,
        },
        {
          sessionId: "sess_b",
          title: "Beta",
          projectPath: "/workspace/beta",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:04.000Z",
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

    viewer.select("projectPathPicker").value = "/workspace/beta";
    viewer.select("projectPathPicker").dispatchEvent(new viewer.document.defaultView!.Event("change"));

    expect(viewer.input("projectPath").value).toBe("/workspace/beta");
  });

  it("ignores saved project path candidates until conversations are listed", () => {
    const viewer = bootViewer({
      savedStorage: {
        "codex-browser-bridge.viewer": JSON.stringify({
          projectPath: "/workspace/alpha",
          projectPaths: ["/workspace/alpha", "/workspace/alpha", "/workspace/beta"],
        }),
      },
    });

    expect(viewer.projectPathChoices()).toEqual([{ value: "", label: "Select a repository" }]);
  });

  it("shows full paths when recent conversation repositories share the same basename", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "App A",
          projectPath: "/workspace/team-a/app",
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
        {
          sessionId: "sess_b",
          title: "App B",
          projectPath: "/workspace/team-b/app",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:04.000Z",
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

    expect(viewer.projectPathChoices()).toEqual([
      { value: "", label: "Select a repository" },
      { value: "/workspace/team-a/app", label: "/workspace/team-a/app" },
      { value: "/workspace/team-b/app", label: "/workspace/team-b/app" },
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

  it("allows resizing the conversation list and persists the custom width", () => {
    const viewer = bootViewer();

    expect(viewer.panel("listResizeHandle").hidden).toBe(false);

    viewer.panel("listResizeHandle").dispatchEvent(new viewer.window.MouseEvent("mousedown", {
      bubbles: true,
      clientX: 380,
    }));
    viewer.window.dispatchEvent(new viewer.window.MouseEvent("mousemove", {
      bubbles: true,
      clientX: 500,
    }));
    viewer.window.dispatchEvent(new viewer.window.MouseEvent("mouseup", {
      bubbles: true,
    }));

    expect(viewer.layoutStyle("--list-panel-width")).toBe("500px");
    expect(JSON.parse(viewer.snapshotStorage()["codex-browser-bridge.viewer"])).toMatchObject({
      projectPath: "/workspace/mserver",
      listPanelWidth: 500,
    });
  });

  it("restores a saved conversation list width", () => {
    const viewer = bootViewer({
      savedStorage: {
        "codex-browser-bridge.viewer": JSON.stringify({
          projectPath: "/workspace/alpha",
          listPanelWidth: 540,
        }),
      },
    });

    expect(viewer.layoutStyle("--list-panel-width")).toBe("540px");
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

    expect(viewer.panel("listResizeHandle").hidden).toBe(true);
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

  it("colors conversation rows consistently by repository", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Alpha 1",
          projectPath: "/workspace/alpha",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "First alpha",
          queueLength: 0,
        },
        {
          sessionId: "sess_b",
          title: "Alpha 2",
          projectPath: "/tmp/alpha",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:04.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Second alpha",
          queueLength: 0,
        },
        {
          sessionId: "sess_c",
          title: "Beta",
          projectPath: "/workspace/beta",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:03.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Beta preview",
          queueLength: 0,
        },
      ],
    });

    const [alphaOne, alphaTwo, beta] = viewer.sessionButtons();
    expect(alphaOne?.getAttribute("style")).toContain("--session-bg:");
    expect(alphaOne?.getAttribute("style")).toBe(alphaTwo?.getAttribute("style"));
    expect(alphaOne?.getAttribute("style")).not.toBe(beta?.getAttribute("style"));
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

  it("filters conversations with an explicit repository selector", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Alpha 1",
          projectPath: "/workspace/alpha",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "First alpha",
          queueLength: 0,
        },
        {
          sessionId: "sess_b",
          title: "Beta",
          projectPath: "/workspace/beta",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:04.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Only beta",
          queueLength: 0,
        },
        {
          sessionId: "sess_c",
          title: "Alpha 2",
          projectPath: "/tmp/alpha",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:03.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "Second alpha",
          queueLength: 0,
        },
      ],
    });

    const repoOptions = Array.from(viewer.select("sessionRepoFilter").options).map((option) => ({
      value: option.value,
      label: option.textContent ?? "",
    }));
    expect(repoOptions).toEqual([
      { value: "", label: "All repositories" },
      { value: "alpha", label: "alpha" },
      { value: "beta", label: "beta" },
    ]);

    viewer.select("sessionRepoFilter").value = "alpha";
    viewer.select("sessionRepoFilter").dispatchEvent(new viewer.document.defaultView!.Event("change"));

    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_a",
      "sess_c",
    ]);
    expect(viewer.text("sessionListSummary")).toBe("Showing 2 of 3 conversations");
  });

  it("filters conversations by unread, settled, and completed toggles", () => {
    const viewer = bootViewer();
    const socket = viewer.socketAt(0);

    socket.open();
    socket.receive({
      type: "session_list",
      sessions: [
        {
          sessionId: "sess_a",
          title: "Viewed settled",
          projectPath: "/workspace/a",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:05.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "A preview",
          queueLength: 0,
        },
        {
          sessionId: "sess_b",
          title: "Running session",
          projectPath: "/workspace/b",
          status: "running",
          answerState: "commentary",
          updatedAt: "2026-03-15T00:00:04.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "B preview",
          queueLength: 0,
        },
        {
          sessionId: "sess_c",
          title: "Completed settled",
          projectPath: "/workspace/c",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:03.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: true,
          preview: "C preview",
          queueLength: 0,
        },
        {
          sessionId: "sess_d",
          title: "Unread settled",
          projectPath: "/workspace/d",
          status: "idle",
          answerState: "final_answer",
          updatedAt: "2026-03-15T00:00:02.000Z",
          model: "",
          modelReasoningEffort: "",
          permissionMode: "default",
          pinned: false,
          completed: false,
          preview: "D preview",
          queueLength: 0,
        },
      ],
    });

    viewer.sessionButtons()[0]?.click();
    socket.receive({ type: "history", sessionId: "sess_a", messages: [] });

    socket.receive({
      type: "assistant",
      sessionId: "sess_d",
      timestamp: "2026-03-15T00:00:06.000Z",
      message: {
        id: "msg_d",
        role: "assistant",
        model: "gpt-5.4",
        phase: "final_answer",
        content: [{ type: "text", text: "Unread reply" }],
      },
    });

    viewer.input("unreadOnlyFilter").checked = true;
    viewer.input("unreadOnlyFilter").dispatchEvent(new viewer.document.defaultView!.Event("change"));
    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_d",
    ]);

    viewer.input("unreadOnlyFilter").checked = false;
    viewer.input("unreadOnlyFilter").dispatchEvent(new viewer.document.defaultView!.Event("change"));
    viewer.input("settledOnlyFilter").checked = true;
    viewer.input("settledOnlyFilter").dispatchEvent(new viewer.document.defaultView!.Event("change"));
    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_a",
      "sess_c",
      "sess_d",
    ]);

    viewer.input("showCompletedFilter").checked = false;
    viewer.input("showCompletedFilter").dispatchEvent(new viewer.document.defaultView!.Event("change"));
    expect(viewer.sessionButtons().map((button: HTMLButtonElement) => button.dataset.sessionId)).toEqual([
      "sess_a",
      "sess_d",
    ]);
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

  it("clamps long final answers by default and expands them on demand", () => {
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
          type: "assistant",
          sessionId: "sess_a",
          timestamp: "2026-03-15T00:00:06.000Z",
          message: {
            id: "msg_1",
            role: "assistant",
            model: "gpt-5.4",
            phase: "final_answer",
            content: [{
              type: "text",
              text: "line 1\nline 2\nline 3\nline 4\nline 5\nline 6",
            }],
          },
        },
      ],
    });

    const finalCard = viewer.messageBlocks()[0] as HTMLElement;
    const toggle = finalCard.querySelector(".message-expand-toggle") as HTMLButtonElement;

    expect(finalCard.dataset.expandable).toBe("true");
    expect(finalCard.dataset.expanded).toBe("false");
    expect(toggle.hidden).toBe(false);
    expect(toggle.textContent).toBe("Show more");

    toggle.click();

    expect(finalCard.dataset.expanded).toBe("true");
    expect(toggle.textContent).toBe("Show less");
  });

  it("keeps short final answers fully visible without an expand control", () => {
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

    const finalCard = viewer.messageBlocks()[0] as HTMLElement;
    const toggle = finalCard.querySelector(".message-expand-toggle") as HTMLButtonElement;

    expect(finalCard.dataset.expandable).toBe("false");
    expect(finalCard.dataset.expanded).toBe("false");
    expect(toggle.hidden).toBe(true);
  });

  it("keeps tool messages out of the conversation view", () => {
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
          text: "Check status",
          timestamp: "2026-03-15T00:00:00.000Z",
        },
        {
          type: "assistant",
          sessionId: "sess_a",
          timestamp: "2026-03-15T00:00:01.000Z",
          message: {
            id: "tool_msg_1",
            role: "assistant",
            model: "gpt-5.4",
            phase: "commentary",
            content: [{
              type: "tool_use",
              id: "tool_1",
              name: "Bash",
              input: { command: "git status" },
            }],
          },
        },
        {
          type: "tool_result",
          sessionId: "sess_a",
          toolUseId: "tool_1",
          toolName: "Bash",
          content: "On branch main",
          timestamp: "2026-03-15T00:00:02.000Z",
        },
        {
          type: "assistant",
          sessionId: "sess_a",
          timestamp: "2026-03-15T00:00:03.000Z",
          message: {
            id: "msg_1",
            role: "assistant",
            model: "gpt-5.4",
            phase: "final_answer",
            content: [{ type: "text", text: "Repository is clean." }],
          },
        },
      ],
    });

    const cards = viewer.messageBlocks();
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("Repository is clean.");
    expect(cards[1]?.textContent).toContain("Check status");
    expect(cards[0]?.textContent).not.toContain("git status");
    expect(cards[0]?.textContent).not.toContain("On branch main");
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

    expect(viewer.messageBlocks().map((block: HTMLElement) => block.textContent?.trim())).toEqual([]);

    socket.receive({
      type: "user",
      sessionId: "sess_a",
      text: "Queued follow-up",
      timestamp: "2026-03-15T00:00:07.000Z",
    });

    expect(viewer.messageBlocks()[0]?.textContent).toContain("Queued follow-up");
  });

  it("preserves live messages when a stale history snapshot arrives afterward", () => {
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

    socket.receive({
      type: "user",
      sessionId: "sess_a",
      text: "First prompt",
      timestamp: "2026-03-15T00:00:06.000Z",
    });

    socket.receive({
      type: "history",
      sessionId: "sess_a",
      messages: [],
    });

    expect(viewer.messageBlocks()).toHaveLength(1);
    expect(viewer.messageBlocks()[0]?.textContent).toContain("First prompt");
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
    layoutStyle(property: string) {
      return (dom.window.document.querySelector(".layout") as HTMLElement | null)?.style.getPropertyValue(property) ?? "";
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
