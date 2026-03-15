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

    #listPanel {
      max-height: calc(100vh - 32px);
      overflow: auto;
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

    .session-list-controls {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .session-list-nav {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .session-list-summary {
      font-size: 12px;
      color: var(--muted);
    }

    .advanced-controls {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255,255,255,0.46);
      overflow: hidden;
    }

    .advanced-controls summary {
      cursor: pointer;
      list-style: none;
      padding: 12px 14px;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
    }

    .advanced-controls summary::-webkit-details-marker {
      display: none;
    }

    .advanced-controls-body {
      display: grid;
      gap: 12px;
      padding: 0 14px 14px;
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

    .mobile-only {
      display: none;
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
    }

    .session-button {
      width: 100%;
      text-align: left;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--session-border, var(--line));
      background:
        linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0)),
        var(--session-bg, rgba(255,255,255,0.72));
      display: grid;
      gap: 6px;
    }

    .session-button:hover {
      border-color: var(--session-border-strong, rgba(15, 118, 110, 0.3));
    }

    .session-button.active {
      border-color: var(--session-border-strong, rgba(15, 118, 110, 0.34));
      box-shadow:
        inset 0 0 0 1px var(--session-border-strong, rgba(15, 118, 110, 0.22)),
        0 0 0 3px var(--session-ring, rgba(15, 118, 110, 0.14));
      background:
        linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.04)),
        var(--session-bg, rgba(255,255,255,0.88));
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

    .session-title-row {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 10px;
    }

    .session-status {
      width: 24px;
      min-width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid rgba(21, 35, 41, 0.12);
      background: rgba(21, 35, 41, 0.06);
      color: var(--muted);
    }

    .session-status-spinner {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      border: 2px solid currentColor;
      border-right-color: transparent;
      animation: session-status-spin 0.85s linear infinite;
    }

    @keyframes session-status-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
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

    .composer-options {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .inline-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
    }

    .inline-toggle input {
      width: auto;
      margin: 0;
    }

    .hint {
      font-size: 12px;
      color: var(--muted);
    }

    @media (max-width: 980px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .layout.mobile-list-open #viewerPanel {
        display: none;
      }

      .layout.mobile-viewer-open #listPanel {
        display: none;
      }

      .sessions {
        max-height: none;
      }

      #listPanel {
        max-height: none;
        overflow: visible;
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

      .mobile-only {
        display: inline-flex;
      }
    }
  </style>
</head>
  <body>
  <div class="shell">
    <div class="layout">
      <section id="listPanel" class="panel">
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
            <select id="projectPathPicker" hidden>
              <option value="">Select a repository</option>
            </select>
          </label>

          <details id="advancedControls" class="advanced-controls">
            <summary>Advanced Session Options</summary>
            <div class="advanced-controls-body">
              <label>
                Project path (manual)
                <input id="projectPath" type="text" placeholder="/workspace/project">
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
            </div>
          </details>

          <div class="button-row">
            <button id="startBtn" class="primary" type="button">Start Session</button>
          </div>
        </div>

        <div class="panel-header">
          <h2>Conversation List</h2>
          <div class="session-list-controls">
            <input id="sessionFilterInput" type="text" placeholder="Filter conversations">
            <div class="session-list-nav">
              <button id="sessionListPrevBtn" class="secondary" type="button" disabled>Prev</button>
              <button id="sessionListNextBtn" class="secondary" type="button" disabled>Next</button>
            </div>
            <div id="sessionListSummary" class="session-list-summary">No conversations yet.</div>
          </div>
        </div>
        <div id="sessionsList" class="sessions"></div>
      </section>

      <section id="viewerPanel" class="panel viewer">
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
            <button id="viewerBackBtn" class="secondary mobile-only" type="button" hidden>Back to List</button>
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
          <div class="composer-options">
            <label class="inline-toggle">
              <input id="forceSendToggle" type="checkbox" disabled>
              Force send now
            </label>
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
    const projectPathPicker = document.getElementById("projectPathPicker");
    const modelInput = document.getElementById("modelInput");
    const modelReasoningEffortSelect = document.getElementById("modelReasoningEffort");
    const permissionModeSelect = document.getElementById("permissionMode");
    const startBtn = document.getElementById("startBtn");
    const sessionFilterInput = document.getElementById("sessionFilterInput");
    const sessionListPrevBtn = document.getElementById("sessionListPrevBtn");
    const sessionListNextBtn = document.getElementById("sessionListNextBtn");
    const sessionListSummary = document.getElementById("sessionListSummary");
    const sessionsList = document.getElementById("sessionsList");
    const viewerTitle = document.getElementById("viewerTitle");
    const viewerSubtitle = document.getElementById("viewerSubtitle");
    const viewerRepoBadge = document.getElementById("viewerRepoBadge");
    const viewerModelBadge = document.getElementById("viewerModelBadge");
    const viewerModeBadge = document.getElementById("viewerModeBadge");
    const viewerBackBtn = document.getElementById("viewerBackBtn");
    const viewerPinBtn = document.getElementById("viewerPinBtn");
    const viewerCompleteBtn = document.getElementById("viewerCompleteBtn");
    const viewerPanel = document.getElementById("viewerPanel");
    const listPanel = document.getElementById("listPanel");
    const permissionPanel = document.getElementById("permissionPanel");
    const queuedPanel = document.getElementById("queuedPanel");
    const queuedList = document.getElementById("queuedList");
    const messages = document.getElementById("messages");
    const composerInput = document.getElementById("composerInput");
    const sendBtn = document.getElementById("sendBtn");
    const interruptBtn = document.getElementById("interruptBtn");
    const forceSendToggle = document.getElementById("forceSendToggle");
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
      sessionListOffset: 0,
    };
    const STORAGE_KEY = "codex-browser-bridge.viewer";
    const MAX_VISIBLE_SESSIONS = 10;

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
          projectPaths: normalizeProjectPaths(parsed.projectPaths),
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
      state.savedProjectPaths = normalizeProjectPaths([
        normalized,
        ...state.savedProjectPaths.filter((entry) => entry !== normalized),
      ]);
      renderProjectPathOptions();
      saveState();
    }

    function normalizeProjectPaths(projectPaths) {
      if (!Array.isArray(projectPaths)) {
        return [];
      }
      const unique = [];
      const seen = new Set();
      projectPaths.forEach((entry) => {
        const normalized = typeof entry === "string" ? entry.trim() : "";
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        unique.push(normalized);
      });
      return unique.slice(0, 12);
    }

    function renderProjectPathOptions() {
      const pickerPaths = normalizeProjectPaths([
        projectPathInput.value,
        ...state.savedProjectPaths,
      ]);
      const duplicateShortProjects = new Set();
      const shortProjectCounts = new Map();
      pickerPaths.forEach((projectPath) => {
        const short = shortProject(projectPath) || projectPath;
        const count = (shortProjectCounts.get(short) || 0) + 1;
        shortProjectCounts.set(short, count);
        if (count > 1) {
          duplicateShortProjects.add(short);
        }
      });
      projectPathPicker.replaceChildren();
      if (pickerPaths.length === 0) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a repository";
        projectPathPicker.appendChild(placeholder);
        projectPathPicker.hidden = false;
        syncProjectPathPicker();
        return;
      }
      pickerPaths.forEach((projectPath) => {
        const option = document.createElement("option");
        option.value = projectPath;
        const short = shortProject(projectPath) || projectPath;
        option.textContent = duplicateShortProjects.has(short) ? projectPath : short;
        projectPathPicker.appendChild(option);
      });
      projectPathPicker.hidden = false;
      syncProjectPathPicker();
    }

    function syncProjectPathPicker() {
      const normalized = String(projectPathInput.value || "").trim();
      if (!normalized || !state.savedProjectPaths.includes(normalized)) {
        if (Array.from(projectPathPicker.options).some((option) => option.value === normalized)) {
          projectPathPicker.value = normalized;
          return;
        }
        projectPathPicker.value = projectPathPicker.options[0]?.value ?? "";
        return;
      }
      projectPathPicker.value = normalized;
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

    function currentUrlSessionId() {
      const sessionId = new URL(window.location.href).searchParams.get("session");
      return typeof sessionId === "string" ? sessionId.trim() : "";
    }

    function syncSessionUrl(sessionId, historyMode) {
      if (historyMode === "none") {
        return;
      }
      const url = new URL(window.location.href);
      if (sessionId) {
        url.searchParams.set("session", sessionId);
      } else {
        url.searchParams.delete("session");
      }
      const nextUrl = url.pathname + url.search + url.hash;
      const currentUrl = window.location.pathname + window.location.search + window.location.hash;
      if (nextUrl === currentUrl) {
        return;
      }
      if (historyMode === "push") {
        window.history.pushState({ sessionId }, "", nextUrl);
        return;
      }
      window.history.replaceState({ sessionId }, "", nextUrl);
    }

    function isMobileViewport() {
      if (typeof window.matchMedia === "function") {
        return window.matchMedia("(max-width: 980px)").matches;
      }
      return window.innerWidth <= 980;
    }

    function updateResponsiveLayout() {
      const mobile = isMobileViewport();
      const hasSelection = !!state.selectedSessionId;
      const layout = document.querySelector(".layout");
      if (layout) {
        layout.classList.toggle("mobile-list-open", mobile && !hasSelection);
        layout.classList.toggle("mobile-viewer-open", mobile && hasSelection);
      }
      viewerBackBtn.hidden = !mobile || !hasSelection;
    }

    function focusActiveMobilePane() {
      if (!isMobileViewport()) {
        return;
      }
      const target = state.selectedSessionId ? viewerPanel : listPanel;
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "start" });
      }
      if (typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    }

    function currentSession() {
      return state.sessions.find((session) => session.sessionId === state.selectedSessionId) || null;
    }

    function setSelectedSession(sessionId, options = {}) {
      state.selectedSessionId = sessionId || "";
      syncSessionUrl(state.selectedSessionId, options.historyMode || "none");
      updateResponsiveLayout();
      focusActiveMobilePane();
      renderSessionList();
      renderViewerState();
      if (state.selectedSessionId && options.requestHistory !== false) {
        send({ type: "get_history", sessionId: state.selectedSessionId });
      }
    }

    function handleServerMessage(message) {
      if (message.type === "system" && message.subtype === "session_created") {
        if (message.projectPath) {
          projectPathInput.value = message.projectPath;
          rememberProjectPath(message.projectPath);
          syncProjectPathPicker();
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
        setSelectedSession(message.sessionId || "", { historyMode: "push", requestHistory: true });
        send({ type: "list_sessions" });
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
            renderProjectPathOptions();
          }
          state.hydratedProjectPaths = true;
        }
        state.sessions = Array.isArray(message.sessions) ? message.sessions : [];
        if (
          state.selectedSessionId
          && !state.sessions.some((session) => session.sessionId === state.selectedSessionId)
        ) {
          setSelectedSession("", { historyMode: "replace", requestHistory: false });
          return;
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
      const filterQuery = normalizedSessionFilter();
      const filteredSessions = state.sessions.filter((session) => matchesSessionFilter(session, filterQuery));
      state.sessionListOffset = clampSessionListOffset(state.sessionListOffset, filteredSessions.length);
      const visibleSessions = filteredSessions.slice(
        state.sessionListOffset,
        state.sessionListOffset + MAX_VISIBLE_SESSIONS,
      );
      updateSessionListSummary(visibleSessions.length, state.sessions.length, state.sessionListOffset);
      sessionListPrevBtn.disabled = state.sessionListOffset === 0;
      sessionListNextBtn.disabled = state.sessionListOffset + MAX_VISIBLE_SESSIONS >= filteredSessions.length;

      if (filteredSessions.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = state.sessions.length === 0
          ? "No conversations yet."
          : "No matching conversations.";
        sessionsList.appendChild(empty);
        return;
      }

      visibleSessions.forEach((session) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "session-button";
        button.dataset.sessionId = session.sessionId;
        button.setAttribute("style", getSessionPalette(session));
        if (session.sessionId === state.selectedSessionId) {
          button.classList.add("active");
        }
        if (session.pinned) {
          button.classList.add("pinned");
        }
        if (session.completed) {
          button.classList.add("completed");
        }

        const titleRow = document.createElement("div");
        titleRow.className = "session-title-row";

        const title = document.createElement("div");
        title.className = "session-title";
        title.textContent = session.title || session.sessionId;
        titleRow.appendChild(title);

        if (shouldShowSessionSpinner(session)) {
          const status = document.createElement("span");
          status.className = "session-status";
          status.dataset.sessionSpinner = session.sessionId;
          status.title = "Processing until final answer";
          const spinner = document.createElement("span");
          spinner.className = "session-status-spinner";
          spinner.setAttribute("aria-hidden", "true");
          status.appendChild(spinner);
          titleRow.appendChild(status);
        }

        button.appendChild(titleRow);

        const meta = document.createElement("div");
        meta.className = "session-meta";
        meta.textContent = sessionMetaLabel(session) ? " " + sessionMetaLabel(session) + " " : "";
        button.appendChild(meta);

        const preview = document.createElement("div");
        preview.className = "session-preview";
        preview.textContent = session.preview || "No messages yet.";
        button.appendChild(preview);

        button.addEventListener("click", () => {
          setSelectedSession(session.sessionId, { historyMode: "push", requestHistory: true });
        });

        sessionsList.appendChild(button);
      });
    }

    function normalizedSessionFilter() {
      return String(sessionFilterInput.value || "").trim().toLowerCase();
    }

    function matchesSessionFilter(session, query) {
      if (!query) {
        return true;
      }
      const haystacks = [
        session.title,
        session.projectPath,
        session.preview,
      ].map((value) => String(value || "").toLowerCase());
      return haystacks.some((value) => value.includes(query));
    }

    function clampSessionListOffset(offset, filteredCount) {
      if (filteredCount <= 0) {
        return 0;
      }
      const lastPageOffset = Math.floor((filteredCount - 1) / MAX_VISIBLE_SESSIONS) * MAX_VISIBLE_SESSIONS;
      return Math.max(0, Math.min(offset, lastPageOffset));
    }

    function updateSessionListSummary(visibleCount, totalCount, offset) {
      if (totalCount === 0) {
        sessionListSummary.textContent = "No conversations yet.";
        return;
      }
      if (visibleCount === 0) {
        sessionListSummary.textContent = "Showing 0 of " + totalCount + " conversations";
        return;
      }
      if (offset <= 0) {
        sessionListSummary.textContent = "Showing " + visibleCount + " of " + totalCount + " conversations";
        return;
      }
      const start = offset + 1;
      const end = offset + visibleCount;
      sessionListSummary.textContent = "Showing " + start + "-" + end + " of " + totalCount + " conversations";
    }

    function shouldShowSessionSpinner(session) {
      return session.status !== "stopped" && session.answerState === "commentary";
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
      if (!session || queued.length === 0 || !isSessionQueueing(session)) {
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

    function isSessionQueueing(session) {
      return session.status === "running" || session.status === "waiting_approval";
    }

    function updateComposerState() {
      const connected = !!state.socket && state.socket.readyState === WebSocket.OPEN;
      const session = currentSession();
      composerInput.disabled = !connected || !session;
      sendBtn.disabled = !connected || !session;
      interruptBtn.disabled = !connected || !session || session.status !== "running";
      forceSendToggle.disabled = !connected || !session;

      if (!session) {
        composerHint.textContent = "Select a session to start sending messages.";
        return;
      }
      if (!connected) {
        composerHint.textContent = "Reconnect to the bridge to send prompts.";
        return;
      }
      if (session.status === "stopped") {
        composerHint.textContent = "This stored session will resume when you send the next prompt.";
        return;
      }
      if (session.status === "running" || session.status === "waiting_approval") {
        composerHint.textContent = forceSendToggle.checked
          ? "Force send will submit the next prompt immediately without bridge queueing."
          : "Prompts sent now will be queued until the current turn settles. Enable Force send now to submit immediately instead.";
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

        const isTurnEntry = item.role === "thinking" || item.role === "draft"
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

    function hashString(value) {
      let hash = 0;
      const source = String(value || "");
      for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
      }
      return Math.abs(hash);
    }

    function normalizeHue(hue) {
      return ((hue % 360) + 360) % 360;
    }

    function getSessionPalette(session) {
      const repo = shortProject(session && session.projectPath ? session.projectPath : "") || "unknown";
      const normalizedRepo = repo.toLowerCase();
      const repoSeed = hashString(normalizedRepo);
      const repoHueAnchors = [8, 38, 120, 210, 275, 332];
      const baseHue = normalizedRepo === "mserver"
        ? 132
        : repoHueAnchors[repoSeed % repoHueAnchors.length];
      const hue = normalizeHue(baseHue + ((repoSeed % 5) - 2) * 6);
      const saturation = 68 + (repoSeed % 10);
      const backgroundLightness = 86 + ((repoSeed >>> 4) % 5);
      const borderLightness = 54 + ((repoSeed >>> 6) % 8);

      return [
        "--session-bg: hsl(" + hue + " " + saturation + "% " + backgroundLightness + "% / 0.9)",
        "--session-border: hsl(" + hue + " " + Math.max(saturation - 8, 58) + "% " + borderLightness + "% / 0.46)",
        "--session-border-strong: hsl(" + hue + " " + Math.max(saturation + 4, 72) + "% " + Math.max(borderLightness - 8, 42) + "% / 0.8)",
        "--session-ring: hsl(" + hue + " " + Math.max(saturation + 2, 70) + "% " + Math.max(borderLightness - 4, 46) + "% / 0.2)",
      ].join("; ");
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

    viewerBackBtn.addEventListener("click", () => {
      setSelectedSession("", { historyMode: "push", requestHistory: false });
    });

    sendBtn.addEventListener("click", () => {
      const session = currentSession();
      const text = composerInput.value.trim();
      if (!session || !text) {
        return;
      }
      const force = forceSendToggle.checked;
      composerInput.value = "";
      forceSendToggle.checked = false;
      updateComposerState();
      send({
        type: "input",
        sessionId: session.sessionId,
        text,
        ...(force ? { force: true } : {}),
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
    projectPathInput.value = savedState.projectPath || state.savedProjectPaths[0] || "/workspace/mserver";
    renderProjectPathOptions();
    modelInput.value = "gpt-5.4";
    modelReasoningEffortSelect.value = "xhigh";
    bridgeUrlInput.value = defaultSocketUrl();
    projectPathPicker.addEventListener("change", () => {
      if (!projectPathPicker.value) {
        return;
      }
      projectPathInput.value = projectPathPicker.value;
      saveState();
    });
    projectPathInput.addEventListener("change", () => {
      renderProjectPathOptions();
      saveState();
    });
    projectPathInput.addEventListener("input", () => {
      renderProjectPathOptions();
      saveState();
    });
    sessionFilterInput.addEventListener("input", () => {
      state.sessionListOffset = 0;
      renderSessionList();
    });
    sessionListPrevBtn.addEventListener("click", () => {
      state.sessionListOffset = Math.max(0, state.sessionListOffset - MAX_VISIBLE_SESSIONS);
      renderSessionList();
    });
    sessionListNextBtn.addEventListener("click", () => {
      state.sessionListOffset += MAX_VISIBLE_SESSIONS;
      renderSessionList();
    });
    forceSendToggle.addEventListener("change", () => {
      updateComposerState();
    });
    window.addEventListener("popstate", () => {
      setSelectedSession(currentUrlSessionId(), { historyMode: "none", requestHistory: !!currentUrlSessionId() });
    });
    window.addEventListener("resize", () => {
      updateResponsiveLayout();
    });
    ensureSocket();
    setSelectedSession(currentUrlSessionId(), { historyMode: "replace", requestHistory: false });
  </script>
</body>
</html>`;
}
