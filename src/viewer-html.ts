export function renderViewerHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>codex-browser-bridge</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5efe5;
      --panel: rgba(255, 251, 246, 0.94);
      --panel-strong: rgba(255, 248, 239, 0.98);
      --ink: #152329;
      --muted: #637177;
      --line: rgba(21, 35, 41, 0.12);
      --accent: #0f766e;
      --accent-strong: #115e59;
      --accent-soft: rgba(15, 118, 110, 0.12);
      --commentary: #eef7f6;
      --final: #fdf1e3;
      --tool: #f4eadb;
      --user: #edf2f7;
      --error: #fff0ef;
      --queued: #f7f2df;
      --shadow: 0 24px 52px rgba(26, 37, 44, 0.09);
      font-family: "IBM Plex Sans", "Noto Sans JP", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 24%),
        radial-gradient(circle at bottom right, rgba(212, 140, 46, 0.14), transparent 28%),
        var(--bg);
    }

    .shell {
      max-width: 1380px;
      margin: 0 auto;
      padding: 14px 12px 18px;
    }

    .layout {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
      align-items: start;
    }

    .panel {
      background: var(--panel);
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
      overflow: hidden;
    }

    .panel-header {
      padding: 16px 18px 0;
    }

    .panel-header h2 {
      margin: 0;
      font-size: 15px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .controls {
      display: grid;
      gap: 12px;
      padding: 18px;
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.44), rgba(255,255,255,0)),
        var(--panel-strong);
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
    }

    input, textarea, button, select {
      font: inherit;
    }

    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 11px 13px;
      background: rgba(255,255,255,0.9);
      color: var(--ink);
      outline: none;
    }

    textarea {
      min-height: 110px;
      resize: vertical;
    }

    input:focus, textarea:focus, select:focus {
      border-color: rgba(15, 118, 110, 0.44);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
    }

    .row {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .button-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    button {
      border: 0;
      border-radius: 14px;
      padding: 11px 15px;
      cursor: pointer;
      font-weight: 700;
      transition: transform 120ms ease, opacity 120ms ease;
    }

    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: default; transform: none; }

    .primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #fff;
    }

    .secondary {
      background: rgba(255,255,255,0.94);
      color: var(--ink);
      border: 1px solid var(--line);
    }

    .statusbar {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      font-size: 14px;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #d97706;
      box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.15);
    }

    .dot.connected {
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.16);
    }

    .sessions {
      display: grid;
      gap: 10px;
      padding: 16px 18px 18px;
      max-height: calc(100vh - 360px);
      overflow: auto;
    }

    .session-button {
      width: 100%;
      text-align: left;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.72);
      display: grid;
      gap: 6px;
    }

    .session-button.active {
      border-color: rgba(15, 118, 110, 0.34);
      box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.22);
      background: linear-gradient(180deg, rgba(15,118,110,0.09), rgba(255,255,255,0.88));
    }

    .session-button.pinned::before {
      content: "PIN";
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--accent);
    }

    .session-button.completed {
      opacity: 0.58;
    }

    .session-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--ink);
    }

    .session-meta,
    .session-preview {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
    }

    .viewer {
      min-height: calc(100vh - 120px);
      display: grid;
      grid-template-rows: auto auto auto auto auto minmax(0, 1fr);
    }

    .viewer-head {
      padding: 18px;
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.44), rgba(255,255,255,0)),
        var(--panel-strong);
      display: grid;
      gap: 12px;
    }

    .viewer-title-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      flex-wrap: wrap;
    }

    .viewer-title-block h2 {
      margin: 0 0 6px;
      font-size: 26px;
      line-height: 1.05;
    }

    .viewer-title-block p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }

    .viewer-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      font-size: 12px;
      color: var(--muted);
    }

    .permission-panel {
      margin: 0 18px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid rgba(15, 118, 110, 0.18);
      background: rgba(15, 118, 110, 0.08);
      display: grid;
      gap: 12px;
    }

    .queued-panel {
      margin: 0 18px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(212, 140, 46, 0.22);
      background: var(--queued);
      display: grid;
      gap: 8px;
    }

    .queued-panel h3,
    .permission-panel h3 {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .queued-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 6px;
    }

    .messages {
      padding: 18px;
      display: grid;
      gap: 12px;
      align-content: start;
      overflow: auto;
    }

    .message-card,
    .conversation-collapse {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,255,0.82);
      overflow: hidden;
    }

    .message-card {
      padding: 14px 16px;
      white-space: pre-wrap;
      line-height: 1.6;
    }

    .message-card.commentary { background: var(--commentary); }
    .message-card.final { background: var(--final); }
    .message-card.tool { background: var(--tool); }
    .message-card.user { background: var(--user); }
    .message-card.error { background: var(--error); }

    .message-header {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .conversation-collapse summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      padding: 14px 16px;
      background: rgba(255,255,255,0.74);
      font-size: 13px;
      color: var(--muted);
    }

    .conversation-collapse summary::-webkit-details-marker {
      display: none;
    }

    .conversation-collapse-body {
      display: grid;
      gap: 10px;
      padding: 0 14px 14px;
    }

    .composer {
      display: grid;
      gap: 12px;
      padding: 18px;
      border-top: 1px solid var(--line);
      background: rgba(255, 250, 243, 0.94);
    }

    .composer-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .hint {
      font-size: 12px;
      color: var(--muted);
    }

    @media (max-width: 980px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .sessions {
        max-height: none;
      }

      .viewer {
        min-height: auto;
      }

      .row {
        grid-template-columns: 1fr;
      }

      .viewer-title-row {
        flex-direction: column;
      }
    }
  </style>
</head>
  <body>
  <div class="shell">
    <div class="layout">
      <section class="panel">
        <div class="controls">
          <div class="statusbar">
            <span id="connectionDot" class="dot"></span>
            <strong id="connectionLabel">Connecting...</strong>
            <span id="runtimeLabel">No session selected</span>
          </div>

          <div id="bridgeControls">
            <label>
              Bridge URL
              <input id="bridgeUrl" type="text" placeholder="ws://127.0.0.1:8765">
            </label>

            <div class="button-row">
              <button id="connectBtn" class="secondary" type="button">Reconnect Bridge</button>
            </div>
          </div>

          <label>
            Project path
            <input id="projectPath" type="text" list="projectPathOptions" placeholder="/workspace/project">
            <datalist id="projectPathOptions"></datalist>
          </label>

          <div class="row">
            <label>
              Model
              <input id="modelInput" type="text" placeholder="Leave empty for Codex default">
            </label>
            <label>
              Reasoning effort
              <select id="modelReasoningEffort">
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </label>
          </div>

          <div class="row">
            <label>
              Open mode
              <select id="permissionMode">
                <option value="default">Default</option>
                <option value="plan">Plan mode</option>
              </select>
            </label>
          </div>

          <div class="button-row">
            <button id="startBtn" class="primary" type="button">Start Session</button>
          </div>
        </div>

        <div class="panel-header">
          <h2>Conversation List</h2>
        </div>
        <div id="sessionsList" class="sessions"></div>
      </section>

      <section class="panel viewer">
        <div class="viewer-head">
          <div class="viewer-title-row">
            <div class="viewer-title-block">
              <h2 id="viewerTitle">No session selected</h2>
              <p id="viewerSubtitle">Start a new chat or choose one from the list to inspect its conversation.</p>
            </div>
            <div class="viewer-badges">
              <div id="viewerRepoBadge" class="badge" hidden></div>
              <div id="viewerModelBadge" class="badge" hidden></div>
              <div id="viewerModeBadge" class="badge" hidden></div>
            </div>
          </div>

          <div class="button-row">
            <button id="viewerPinBtn" class="secondary" type="button" disabled>Pin</button>
            <button id="viewerCompleteBtn" class="secondary" type="button" disabled>Complete</button>
          </div>
        </div>

        <div class="composer">
          <label>
            Prompt
            <textarea id="composerInput" placeholder="Send a prompt to the selected session." disabled></textarea>
          </label>
          <div class="composer-actions">
            <button id="sendBtn" class="primary" type="button" disabled>Send</button>
            <button id="interruptBtn" class="secondary" type="button" disabled>Interrupt</button>
          </div>
          <div id="composerHint" class="hint">Select a session to start sending messages.</div>
        </div>

        <section id="permissionPanel" class="permission-panel" hidden></section>

        <section id="queuedPanel" class="queued-panel" hidden>
          <h3>Queued Prompts</h3>
          <ul id="queuedList" class="queued-list"></ul>
        </section>

        <div id="messages" class="messages"></div>
      </section>
    </div>
  </div>

  <script>
    const connectionDot = document.getElementById("connectionDot");
    const connectionLabel = document.getElementById("connectionLabel");
    const runtimeLabel = document.getElementById("runtimeLabel");
    const bridgeUrlInput = document.getElementById("bridgeUrl");
    const bridgeControls = document.getElementById("bridgeControls");
    const connectBtn = document.getElementById("connectBtn");
    const projectPathInput = document.getElementById("projectPath");
    const projectPathOptions = document.getElementById("projectPathOptions");
    const modelInput = document.getElementById("modelInput");
    const modelReasoningEffortSelect = document.getElementById("modelReasoningEffort");
    const permissionModeSelect = document.getElementById("permissionMode");
    const startBtn = document.getElementById("startBtn");
    const sessionsList = document.getElementById("sessionsList");
    const viewerTitle = document.getElementById("viewerTitle");
    const viewerSubtitle = document.getElementById("viewerSubtitle");
    const viewerRepoBadge = document.getElementById("viewerRepoBadge");
    const viewerModelBadge = document.getElementById("viewerModelBadge");
    const viewerModeBadge = document.getElementById("viewerModeBadge");
    const viewerPinBtn = document.getElementById("viewerPinBtn");
    const viewerCompleteBtn = document.getElementById("viewerCompleteBtn");
    const permissionPanel = document.getElementById("permissionPanel");
    const queuedPanel = document.getElementById("queuedPanel");
    const queuedList = document.getElementById("queuedList");
    const messages = document.getElementById("messages");
    const composerInput = document.getElementById("composerInput");
    const sendBtn = document.getElementById("sendBtn");
    const interruptBtn = document.getElementById("interruptBtn");
    const composerHint = document.getElementById("composerHint");

    const state = {
      socket: null,
      sessions: [],
      histories: new Map(),
      selectedSessionId: "",
      queuedDrafts: new Map(),
      outboundQueue: [],
      savedProjectPaths: [],
      hydratedProjectPaths: false,
    };
    const STORAGE_KEY = "codex-browser-bridge.viewer";

    function defaultSocketUrl() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return protocol + "//" + window.location.host;
    }

    function normalizeBridgeUrl(value) {
      const trimmed = String(value || "").trim();
      return trimmed || defaultSocketUrl();
    }

    function loadSavedState() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
        if (!parsed || typeof parsed !== "object") {
          return { projectPath: "", projectPaths: [] };
        }
        return {
          projectPath: typeof parsed.projectPath === "string" ? parsed.projectPath : "",
          projectPaths: Array.isArray(parsed.projectPaths)
            ? parsed.projectPaths.filter((entry) => typeof entry === "string")
            : [],
        };
      } catch {
        return { projectPath: "", projectPaths: [] };
      }
    }

    function saveState() {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        projectPath: projectPathInput.value,
        projectPaths: state.savedProjectPaths,
      }));
    }

    function rememberProjectPath(projectPath) {
      const normalized = String(projectPath || "").trim();
      if (!normalized) {
        return;
      }
      state.savedProjectPaths = [
        normalized,
        ...state.savedProjectPaths.filter((entry) => entry !== normalized),
      ].slice(0, 12);
      renderProjectPathOptions();
      saveState();
    }

    function renderProjectPathOptions() {
      projectPathOptions.replaceChildren();
      state.savedProjectPaths.forEach((projectPath) => {
        const option = document.createElement("option");
        option.value = projectPath;
        projectPathOptions.appendChild(option);
      });
    }

    function send(payload) {
      const socket = ensureSocket();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
        return;
      }
      state.outboundQueue.push(payload);
    }

    function flushOutboundQueue() {
      if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      state.socket.send(JSON.stringify({ type: "list_sessions" }));
      while (state.outboundQueue.length > 0) {
        state.socket.send(JSON.stringify(state.outboundQueue.shift()));
      }
    }

    function ensureSocket() {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        return state.socket;
      }
      if (state.socket && state.socket.readyState === WebSocket.CONNECTING) {
        return state.socket;
      }

      const socket = new WebSocket(normalizeBridgeUrl(bridgeUrlInput.value));
      bridgeUrlInput.value = socket.url;
      state.socket = socket;
      setConnection(false);

      socket.addEventListener("open", () => {
        if (state.socket !== socket) {
          return;
        }
        setConnection(true);
        flushOutboundQueue();
      });

      socket.addEventListener("close", () => {
        if (state.socket !== socket) {
          return;
        }
        setConnection(false);
      });

      socket.addEventListener("message", (event) => {
        if (state.socket !== socket) {
          return;
        }
        handleServerMessage(JSON.parse(event.data));
      });

      return socket;
    }

    function setConnection(connected) {
      connectionDot.classList.toggle("connected", connected);
      connectionLabel.textContent = connected ? "Connected" : "Disconnected";
      bridgeControls.hidden = connected;
      updateComposerState();
    }

    function currentSession() {
      return state.sessions.find((session) => session.sessionId === state.selectedSessionId) || null;
    }

    function setSelectedSession(sessionId) {
      state.selectedSessionId = sessionId || "";
      renderSessionList();
      renderViewerState();
      if (state.selectedSessionId) {
        send({ type: "get_history", sessionId: state.selectedSessionId });
      }
    }

    function handleServerMessage(message) {
      if (message.type === "system" && message.subtype === "session_created") {
        if (message.projectPath) {
          projectPathInput.value = message.projectPath;
          rememberProjectPath(message.projectPath);
        }
        if (typeof message.model === "string") {
          modelInput.value = message.model;
        }
        if (typeof message.modelReasoningEffort === "string" && message.modelReasoningEffort) {
          modelReasoningEffortSelect.value = message.modelReasoningEffort;
        }
        if (message.permissionMode === "plan" || message.permissionMode === "default") {
          permissionModeSelect.value = message.permissionMode;
        }
        state.selectedSessionId = message.sessionId || "";
        send({ type: "get_history", sessionId: state.selectedSessionId });
        send({ type: "list_sessions" });
        renderViewerState();
        return;
      }

      if (message.type === "session_list") {
        if (Array.isArray(message.projectPaths)) {
          state.savedProjectPaths = message.projectPaths
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .filter((entry, index, array) => array.indexOf(entry) === index)
            .slice(0, 12);
          renderProjectPathOptions();
          if (
            !state.hydratedProjectPaths
            && state.savedProjectPaths.length > 0
            && (!projectPathInput.value || projectPathInput.value === "/workspace/mserver")
          ) {
            projectPathInput.value = state.savedProjectPaths[0];
            saveState();
          }
          state.hydratedProjectPaths = true;
        }
        state.sessions = Array.isArray(message.sessions) ? message.sessions : [];
        if (
          state.selectedSessionId
          && !state.sessions.some((session) => session.sessionId === state.selectedSessionId)
        ) {
          state.selectedSessionId = "";
        }
        renderSessionList();
        renderViewerState();
        return;
      }

      if (message.type === "history" && typeof message.sessionId === "string") {
        state.histories.set(message.sessionId, Array.isArray(message.messages) ? message.messages : []);
        reconcileQueuedDrafts(message.sessionId);
        if (message.sessionId === state.selectedSessionId) {
          renderMessages();
          renderQueuedDrafts();
        }
        return;
      }

      if (typeof message.sessionId === "string" && isHistoryMessage(message)) {
        appendHistoryMessage(message.sessionId, message);
        if (message.type === "user") {
          shiftQueuedDraft(message.sessionId, message.text || "");
        }
        if (message.sessionId === state.selectedSessionId) {
          renderMessages();
          renderQueuedDrafts();
        }
        return;
      }

      if (message.type === "status" && typeof message.sessionId === "string") {
        patchSession(message.sessionId, { status: message.status || "idle", updatedAt: message.timestamp || new Date().toISOString() });
        renderSessionList();
        renderViewerState();
        return;
      }

      if (message.type === "input_ack" && typeof message.sessionId === "string") {
        if (message.queued === true && typeof message.text === "string") {
          enqueueDraft(message.sessionId, message.text);
        }
        renderQueuedDrafts();
      }
    }

    function isHistoryMessage(message) {
      return [
        "user",
        "thinking_delta",
        "stream_delta",
        "assistant",
        "tool_result",
        "error",
      ].includes(message.type);
    }

    function appendHistoryMessage(sessionId, message) {
      const history = state.histories.get(sessionId) || [];
      history.push(message);
      state.histories.set(sessionId, history);
    }

    function patchSession(sessionId, patch) {
      state.sessions = state.sessions.map((session) => {
        if (session.sessionId !== sessionId) {
          return session;
        }
        return { ...session, ...patch };
      });
    }

    function enqueueDraft(sessionId, text) {
      const queue = state.queuedDrafts.get(sessionId) || [];
      queue.push(text);
      state.queuedDrafts.set(sessionId, queue);
    }

    function shiftQueuedDraft(sessionId, text) {
      const queue = state.queuedDrafts.get(sessionId) || [];
      const index = queue.findIndex((entry) => entry === text);
      if (index >= 0) {
        queue.splice(index, 1);
      } else if (queue.length > 0) {
        queue.shift();
      }
      state.queuedDrafts.set(sessionId, queue);
    }

    function reconcileQueuedDrafts(sessionId) {
      const queue = state.queuedDrafts.get(sessionId) || [];
      if (queue.length === 0) {
        return;
      }
      const history = state.histories.get(sessionId) || [];
      const remaining = queue.filter((queuedText) => {
        return !history.some((item) => item.type === "user" && item.text === queuedText);
      });
      state.queuedDrafts.set(sessionId, remaining);
    }

    function renderSessionList() {
      sessionsList.replaceChildren();
      if (state.sessions.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = "No conversations yet.";
        sessionsList.appendChild(empty);
        return;
      }

      state.sessions.forEach((session) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "session-button";
        button.dataset.sessionId = session.sessionId;
        if (session.sessionId === state.selectedSessionId) {
          button.classList.add("active");
        }
        if (session.pinned) {
          button.classList.add("pinned");
        }
        if (session.completed) {
          button.classList.add("completed");
        }

        const title = document.createElement("div");
        title.className = "session-title";
        title.textContent = (session.title || session.sessionId) + " ";
        button.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "session-meta";
        meta.textContent = sessionMetaLabel(session) ? sessionMetaLabel(session) + " " : "";
        button.appendChild(meta);

        const preview = document.createElement("div");
        preview.className = "session-preview";
        preview.textContent = session.preview || "No messages yet.";
        button.appendChild(preview);

        button.addEventListener("click", () => {
          setSelectedSession(session.sessionId);
        });

        sessionsList.appendChild(button);
      });
    }

    function sessionMetaLabel(session) {
      const parts = [];
      const repo = shortProject(session.projectPath);
      if (repo) {
        parts.push("repo: " + repo);
      }
      if (session.model) {
        parts.push("model: " + sessionModelLabel(session));
      } else if (session.permissionMode === "plan") {
        parts.push("mode: plan");
      }
      if (session.queueLength > 0) {
        parts.push("queued: " + session.queueLength);
      }
      return parts.join(" ");
    }

    function renderViewerState() {
      const session = currentSession();
      if (!session) {
        viewerTitle.textContent = "No session selected";
        viewerSubtitle.textContent = "Start a new chat or choose one from the list to inspect its conversation.";
        setBadge(viewerRepoBadge, "", true);
        setBadge(viewerModelBadge, "", true);
        setBadge(viewerModeBadge, "", true);
        permissionPanel.hidden = true;
        messages.replaceChildren();
        runtimeLabel.textContent = "No session selected";
        viewerPinBtn.disabled = true;
        viewerCompleteBtn.disabled = true;
        renderQueuedDrafts();
        updateComposerState();
        return;
      }

      viewerTitle.textContent = session.title || session.sessionId;
      viewerSubtitle.textContent = session.preview || "No messages yet.";
      runtimeLabel.textContent = (session.title || session.sessionId) + " / " + (session.status || "idle");
      setBadge(viewerRepoBadge, shortProject(session.projectPath) ? "repo: " + shortProject(session.projectPath) : "", !shortProject(session.projectPath));
      setBadge(viewerModelBadge, session.model ? "model: " + sessionModelLabel(session) : "", !session.model);
      setBadge(viewerModeBadge, session.permissionMode === "plan" ? "mode: plan" : "", session.permissionMode !== "plan");
      viewerPinBtn.disabled = false;
      viewerCompleteBtn.disabled = false;
      viewerPinBtn.textContent = session.pinned ? "Unpin" : "Pin";
      viewerCompleteBtn.textContent = session.completed ? "Mark Active" : "Complete";
      renderPermissionPanel();
      renderMessages();
      renderQueuedDrafts();
      updateComposerState();
    }

    function setBadge(element, text, hidden) {
      element.hidden = hidden;
      element.textContent = hidden ? "" : text;
    }

    function sessionModelLabel(session) {
      const model = typeof session.model === "string" ? session.model.trim() : "";
      const effort = typeof session.modelReasoningEffort === "string"
        ? session.modelReasoningEffort.trim()
        : "";
      if (!model) {
        return "";
      }
      return effort ? model + " / effort: " + effort : model;
    }

    function renderPermissionPanel() {
      const session = currentSession();
      permissionPanel.replaceChildren();
      if (!session || !session.pendingPermission) {
        permissionPanel.hidden = true;
        return;
      }

      permissionPanel.hidden = false;
      const title = document.createElement("h3");
      title.textContent = session.pendingPermission.toolName === "ExitPlanMode"
        ? "Plan Review"
        : session.pendingPermission.toolName === "AskUserQuestion"
          ? "Question"
          : "Approval";
      permissionPanel.appendChild(title);

      if (session.pendingPermission.toolName === "ExitPlanMode") {
        const preview = document.createElement("div");
        preview.className = "hint";
        preview.textContent = typeof session.pendingPermission.input.plan === "string"
          ? session.pendingPermission.input.plan
          : "";
        permissionPanel.appendChild(preview);

        const textarea = document.createElement("textarea");
        textarea.id = "permissionPlanInput";
        textarea.value = typeof session.pendingPermission.input.plan === "string"
          ? session.pendingPermission.input.plan
          : "";
        permissionPanel.appendChild(textarea);

        const actions = document.createElement("div");
        actions.className = "button-row";
        const approveBtn = document.createElement("button");
        approveBtn.id = "approvePermissionBtn";
        approveBtn.type = "button";
        approveBtn.className = "primary";
        approveBtn.textContent = "Approve Plan";
        approveBtn.addEventListener("click", () => {
          send({
            type: "approve",
            sessionId: session.sessionId,
            toolUseId: session.pendingPermission.toolUseId,
            updatedInput: { plan: textarea.value },
          });
        });
        const rejectBtn = document.createElement("button");
        rejectBtn.id = "rejectPermissionBtn";
        rejectBtn.type = "button";
        rejectBtn.className = "secondary";
        rejectBtn.textContent = "Send Back";
        rejectBtn.addEventListener("click", () => {
          send({
            type: "reject",
            sessionId: session.sessionId,
            toolUseId: session.pendingPermission.toolUseId,
            message: textarea.value,
          });
        });
        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);
        permissionPanel.appendChild(actions);
        return;
      }

      if (session.pendingPermission.toolName === "AskUserQuestion") {
        const prompt = document.createElement("div");
        prompt.className = "hint";
        prompt.textContent = Array.isArray(session.pendingPermission.input.questions)
          && session.pendingPermission.input.questions[0]
          && session.pendingPermission.input.questions[0].question
          ? session.pendingPermission.input.questions[0].question
          : "Answer required";
        permissionPanel.appendChild(prompt);

        const textarea = document.createElement("textarea");
        textarea.id = "permissionAnswerInput";
        permissionPanel.appendChild(textarea);

        const answerBtn = document.createElement("button");
        answerBtn.id = "answerPermissionBtn";
        answerBtn.type = "button";
        answerBtn.className = "primary";
        answerBtn.textContent = "Send Answer";
        answerBtn.addEventListener("click", () => {
          send({
            type: "answer",
            sessionId: session.sessionId,
            toolUseId: session.pendingPermission.toolUseId,
            result: textarea.value,
          });
        });
        permissionPanel.appendChild(answerBtn);
        return;
      }

      const detail = document.createElement("pre");
      detail.textContent = JSON.stringify(session.pendingPermission.input, null, 2);
      permissionPanel.appendChild(detail);

      const actions = document.createElement("div");
      actions.className = "button-row";
      const approveBtn = document.createElement("button");
      approveBtn.id = "approvePermissionBtn";
      approveBtn.type = "button";
      approveBtn.className = "primary";
      approveBtn.textContent = "Approve";
      approveBtn.addEventListener("click", () => {
        send({
          type: "approve",
          sessionId: session.sessionId,
          toolUseId: session.pendingPermission.toolUseId,
        });
      });
      const rejectBtn = document.createElement("button");
      rejectBtn.id = "rejectPermissionBtn";
      rejectBtn.type = "button";
      rejectBtn.className = "secondary";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", () => {
        send({
          type: "reject",
          sessionId: session.sessionId,
          toolUseId: session.pendingPermission.toolUseId,
        });
      });
      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      permissionPanel.appendChild(actions);
    }

    function renderQueuedDrafts() {
      const session = currentSession();
      const queued = session ? (state.queuedDrafts.get(session.sessionId) || []) : [];
      queuedList.replaceChildren();
      if (!session || queued.length === 0) {
        queuedPanel.hidden = true;
        return;
      }
      queuedPanel.hidden = false;
      queued.forEach((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        queuedList.appendChild(item);
      });
    }

    function updateComposerState() {
      const connected = !!state.socket && state.socket.readyState === WebSocket.OPEN;
      const session = currentSession();
      composerInput.disabled = !connected || !session || session.status === "stopped";
      sendBtn.disabled = !connected || !session || session.status === "stopped";
      interruptBtn.disabled = !connected || !session || session.status !== "running";

      if (!session) {
        composerHint.textContent = "Select a session to start sending messages.";
        return;
      }
      if (!connected) {
        composerHint.textContent = "Reconnect to the bridge to send prompts.";
        return;
      }
      if (session.status === "stopped") {
        composerHint.textContent = "This restored session is read-only. Start a new session to continue.";
        return;
      }
      if (session.status === "running" || session.status === "waiting_approval") {
        composerHint.textContent = "Prompts sent now will be queued until the current turn settles.";
        return;
      }
      composerHint.textContent = "Send a new prompt or interrupt the active run.";
    }

    function renderMessages() {
      messages.replaceChildren();
      const session = currentSession();
      if (!session) {
        return;
      }

      const history = state.histories.get(session.sessionId) || [];
      const entries = buildDisplayEntries(history);
      const blocks = buildConversationBlocks(entries);
      const rendered = blocks.slice().reverse().map(renderConversationBlock);
      messages.replaceChildren(...rendered);
    }

    function buildDisplayEntries(history) {
      const entries = [];

      history.forEach((item) => {
        if (item.type === "user") {
          entries.push({
            role: "user",
            text: item.text || "",
            timestamp: item.timestamp,
          });
          return;
        }

        if (item.type === "thinking_delta") {
          const last = entries[entries.length - 1];
          if (last && last.role === "thinking" && last.deltaId === (item.id || "")) {
            last.text += item.text || "";
            return;
          }
          entries.push({
            role: "thinking",
            text: item.text || "",
            deltaId: item.id || "",
            timestamp: item.timestamp,
          });
          return;
        }

        if (item.type === "stream_delta") {
          const last = entries[entries.length - 1];
          if (last && last.role === "draft" && last.deltaId === (item.id || "")) {
            last.text += item.text || "";
            return;
          }
          entries.push({
            role: "draft",
            text: item.text || "",
            deltaId: item.id || "",
            timestamp: item.timestamp,
          });
          return;
        }

        if (item.type === "assistant" && item.message) {
          const content = Array.isArray(item.message.content) ? item.message.content : [];
          const toolUse = content.find((entry) => entry && entry.type === "tool_use");
          if (toolUse) {
            entries.push({
              role: "tool",
              text: toolUse.input && toolUse.input.command ? String(toolUse.input.command) : toolUse.name || "Tool",
              toolUseId: toolUse.id || "",
              timestamp: item.timestamp,
            });
            return;
          }

          const text = content
            .filter((entry) => entry && entry.type === "text")
            .map((entry) => entry.text || "")
            .join("\\n")
            .trim();
          if (!text) {
            return;
          }
          entries.push({
            role: "assistant",
            phase: item.message.phase || null,
            text,
            timestamp: item.timestamp,
          });
          return;
        }

        if (item.type === "tool_result") {
          const last = entries[entries.length - 1];
          if (last && last.role === "tool" && last.toolUseId === item.toolUseId) {
            last.text = last.text && item.content ? last.text + "\\n\\n" + item.content : last.text || item.content || "";
            return;
          }
          entries.push({
            role: "tool",
            text: item.content || "",
            toolUseId: item.toolUseId || "",
            timestamp: item.timestamp,
          });
          return;
        }

        if (item.type === "error") {
          entries.push({
            role: "error",
            text: item.message || "",
            timestamp: item.timestamp,
          });
        }
      });

      return entries;
    }

    function buildConversationBlocks(entries) {
      const blocks = [];
      let currentTurn = null;
      let lastUser = null;

      function flushAssistantTurn() {
        if (!currentTurn || currentTurn.items.length === 0) {
          currentTurn = null;
          return;
        }

        if (currentTurn.hasFinalAnswer) {
          const finalAnswer = currentTurn.items.find((item) => item.role === "assistant" && item.phase === "final_answer");
          const summary = finalAnswer || currentTurn.items[currentTurn.items.length - 1];
          const collapsedItems = currentTurn.items.filter((item) => item !== finalAnswer);
          if (collapsedItems.length > 0) {
            blocks.push({
              type: "collapsed-turn",
              summary,
              items: collapsedItems,
              userItem: currentTurn.userItem,
            });
          }
          blocks.push({ type: "message", item: summary });
        } else {
          currentTurn.items.forEach((item) => {
            blocks.push({ type: "message", item });
          });
        }

        currentTurn = null;
      }

      entries.forEach((item) => {
        if (item.role === "user") {
          flushAssistantTurn();
          blocks.push({ type: "message", item });
          lastUser = item;
          return;
        }

        const isTurnEntry = item.role === "thinking" || item.role === "draft" || item.role === "tool"
          || (item.role === "assistant");

        if (!isTurnEntry) {
          flushAssistantTurn();
          blocks.push({ type: "message", item });
          return;
        }

        if (!currentTurn) {
          currentTurn = {
            items: [],
            hasFinalAnswer: false,
            userItem: lastUser,
          };
        }
        currentTurn.items.push(item);
        if (item.role === "assistant" && item.phase === "final_answer") {
          currentTurn.hasFinalAnswer = true;
        }
      });

      flushAssistantTurn();
      return blocks;
    }

    function renderConversationBlock(block) {
      if (block.type === "message") {
        return renderMessageCard(block.item);
      }

      const detail = document.createElement("details");
      detail.className = "conversation-collapse";
      const summary = document.createElement("summary");
      const left = document.createElement("strong");
      left.textContent = "途中の会話 (" + block.items.length + "件)";
      const right = document.createElement("span");
      const elapsed = formatElapsedDuration(block.userItem ? block.userItem.timestamp : "", block.summary ? block.summary.timestamp : "");
      right.textContent = elapsed ? "処理時間 " + elapsed : "途中の会話";
      summary.appendChild(left);
      summary.appendChild(right);
      detail.appendChild(summary);

      const body = document.createElement("div");
      body.className = "conversation-collapse-body";
      block.items.slice().reverse().forEach((item) => {
        body.appendChild(renderMessageCard(item));
      });
      detail.appendChild(body);
      return detail;
    }

    function renderMessageCard(item) {
      const card = document.createElement("article");
      const kind = item.role === "assistant" && item.phase === "final_answer"
        ? "final"
        : item.role === "assistant" || item.role === "thinking" || item.role === "draft"
          ? "commentary"
          : item.role;
      card.className = "message-card " + kind;

      const header = document.createElement("div");
      header.className = "message-header";
      header.textContent =
        item.role === "user" ? "You" :
        item.role === "thinking" ? "Thinking" :
        item.role === "draft" ? "Draft" :
        item.role === "tool" ? "Tool" :
        item.role === "error" ? "Error" :
        item.phase === "final_answer" ? "Final Answer" :
        "Assistant";
      card.appendChild(header);

      const body = document.createElement("div");
      body.textContent = item.text || "";
      card.appendChild(body);
      return card;
    }

    function formatElapsedDuration(start, end) {
      const startMs = Date.parse(start || "");
      const endMs = Date.parse(end || "");
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        return "";
      }
      const totalSeconds = Math.round((endMs - startMs) / 1000);
      if (totalSeconds < 60) {
        return totalSeconds + "s";
      }
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return seconds > 0 ? minutes + "m " + seconds + "s" : minutes + "m";
    }

    function shortProject(path) {
      const normalized = String(path || "").trim();
      if (!normalized) {
        return "";
      }
      const parts = normalized.split("/");
      return parts[parts.length - 1] || normalized;
    }

    connectBtn.addEventListener("click", () => {
      if (state.socket) {
        state.socket.close();
      }
      state.socket = null;
      ensureSocket();
    });

    startBtn.addEventListener("click", () => {
      rememberProjectPath(projectPathInput.value);
      send({
        type: "start",
        projectPath: projectPathInput.value,
        model: modelInput.value,
        modelReasoningEffort: modelReasoningEffortSelect.value,
        permissionMode: permissionModeSelect.value,
      });
    });

    viewerPinBtn.addEventListener("click", () => {
      const session = currentSession();
      if (!session) {
        return;
      }
      send({
        type: "set_session_pin",
        sessionId: session.sessionId,
        pinned: !session.pinned,
      });
    });

    viewerCompleteBtn.addEventListener("click", () => {
      const session = currentSession();
      if (!session) {
        return;
      }
      send({
        type: "set_session_completion",
        sessionId: session.sessionId,
        completed: !session.completed,
      });
    });

    sendBtn.addEventListener("click", () => {
      const session = currentSession();
      const text = composerInput.value.trim();
      if (!session || !text) {
        return;
      }
      composerInput.value = "";
      send({
        type: "input",
        sessionId: session.sessionId,
        text,
      });
    });

    interruptBtn.addEventListener("click", () => {
      const session = currentSession();
      if (!session) {
        return;
      }
      send({
        type: "interrupt",
        sessionId: session.sessionId,
      });
    });

    const savedState = loadSavedState();
    state.savedProjectPaths = Array.isArray(savedState.projectPaths) ? savedState.projectPaths : [];
    renderProjectPathOptions();
    projectPathInput.value = savedState.projectPath || state.savedProjectPaths[0] || "/workspace/mserver";
    modelInput.value = "gpt-5.4";
    modelReasoningEffortSelect.value = "xhigh";
    bridgeUrlInput.value = defaultSocketUrl();
    projectPathInput.addEventListener("change", () => {
      saveState();
    });
    projectPathInput.addEventListener("input", () => {
      saveState();
    });
    ensureSocket();
  </script>
</body>
</html>`;
}
