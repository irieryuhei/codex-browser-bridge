export function renderViewerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>codex-browser-bridge</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f1e8;
      --panel: rgba(255, 250, 243, 0.94);
      --ink: #172126;
      --muted: #5c6a6d;
      --line: rgba(23, 33, 38, 0.12);
      --accent: #0f766e;
      --accent-strong: #115e59;
      --commentary: #eef7f6;
      --final: #fdf0e3;
      --tool: #f3ead8;
      --user: #edf2f7;
      --error: #fff0ef;
      --shadow: 0 18px 42px rgba(34, 41, 47, 0.08);
      font-family: "IBM Plex Sans", "Noto Sans", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.16), transparent 24%),
        radial-gradient(circle at bottom right, rgba(212, 140, 46, 0.15), transparent 28%),
        var(--bg);
    }

    .shell {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 18px 36px;
    }

    .hero {
      margin-bottom: 18px;
    }

    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
      font-weight: 700;
    }

    h1 {
      margin: 0;
      font-size: clamp(30px, 5vw, 56px);
      line-height: 0.95;
      max-width: 10ch;
    }

    .subcopy {
      margin: 14px 0 0;
      max-width: 56ch;
      color: var(--muted);
      line-height: 1.6;
      font-size: 15px;
    }

    .panel {
      background: var(--panel);
      border: 1px solid rgba(255, 255, 255, 0.65);
      border-radius: 22px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
      overflow: hidden;
    }

    .controls {
      display: grid;
      gap: 14px;
      padding: 18px;
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0)),
        rgba(255, 250, 243, 0.98);
    }

    .row {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      align-items: end;
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
    }

    input, textarea, button {
      font: inherit;
    }

    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.88);
      color: var(--ink);
      outline: none;
    }

    textarea {
      min-height: 108px;
      resize: vertical;
    }

    input:focus, textarea:focus {
      border-color: rgba(15, 118, 110, 0.45);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
    }

    .button-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    button {
      border: 0;
      border-radius: 14px;
      padding: 12px 16px;
      cursor: pointer;
      font-weight: 700;
      transition: transform 120ms ease, opacity 120ms ease;
    }

    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: 0.45; cursor: default; transform: none; }

    .primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #fff;
    }

    .secondary {
      background: rgba(255,255,255,0.92);
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
      box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.16);
    }

    .dot.connected {
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.16);
    }

    .conversation {
      padding: 18px;
      display: grid;
      gap: 12px;
    }

    .message {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px 16px;
      background: rgba(255,255,255,0.78);
      white-space: pre-wrap;
      line-height: 1.6;
    }

    .message.commentary { background: var(--commentary); }
    .message.final { background: var(--final); }
    .message.tool { background: var(--tool); }
    .message.user { background: var(--user); }
    .message.error { background: var(--error); }
    .message.system { color: var(--muted); }

    .message-header {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="eyebrow">Podman / Codex / Browser</div>
      <h1>Codex in your browser.</h1>
      <p class="subcopy">
        This bridge runs Codex with full access inside your container and streams the conversation straight into the browser.
      </p>
    </section>

    <section class="panel">
      <div class="controls">
        <div class="statusbar">
          <span id="connectionDot" class="dot"></span>
          <strong id="connectionLabel">Connecting...</strong>
          <span id="runtimeLabel">No session</span>
        </div>

        <div class="row">
          <label>
            Bridge URL
            <input id="bridgeUrl" type="text" placeholder="ws://127.0.0.1:8765">
          </label>
          <div class="button-row">
            <button id="connectBtn" class="secondary" type="button">Reconnect Bridge</button>
          </div>
        </div>

        <div class="row">
          <label>
            Project path
            <input id="projectPath" type="text" placeholder="/workspace/project">
          </label>
          <div class="button-row">
            <button id="startBtn" class="primary" type="button">Start Codex Session</button>
          </div>
        </div>

        <label>
          Prompt
          <textarea id="promptInput" placeholder="Ask Codex to inspect, edit, or explain something." disabled></textarea>
        </label>

        <div class="button-row">
          <button id="sendBtn" class="primary" type="button" disabled>Send Prompt</button>
          <button id="interruptBtn" class="secondary" type="button" disabled>Interrupt</button>
        </div>
      </div>

      <div id="messages" class="conversation"></div>
    </section>
  </div>

  <script>
    const connectionDot = document.getElementById("connectionDot");
    const connectionLabel = document.getElementById("connectionLabel");
    const runtimeLabel = document.getElementById("runtimeLabel");
    const bridgeUrl = document.getElementById("bridgeUrl");
    const connectBtn = document.getElementById("connectBtn");
    const projectPath = document.getElementById("projectPath");
    const startBtn = document.getElementById("startBtn");
    const promptInput = document.getElementById("promptInput");
    const sendBtn = document.getElementById("sendBtn");
    const interruptBtn = document.getElementById("interruptBtn");
    const messages = document.getElementById("messages");

    let socket = null;
    let hasSession = false;
    let currentSessionId = "";
    let currentStatus = "idle";
    let pendingStartProjectPath = "";
    const streamingCards = new Map();
    const toolCards = new Map();

    function defaultSocketUrl() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return protocol + "//" + window.location.host;
    }

    function normalizeBridgeUrl(value) {
      const trimmed = String(value || "").trim();
      return trimmed || defaultSocketUrl();
    }

    function setConnection(connected) {
      connectionDot.classList.toggle("connected", connected);
      connectionLabel.textContent = connected ? "Connected" : "Disconnected";
      updateControls();
    }

    function updateRuntimeLabel() {
      if (!hasSession) {
        runtimeLabel.textContent = "No session";
        return;
      }
      runtimeLabel.textContent = "Session " + currentSessionId + " / " + currentStatus;
    }

    function updateControls() {
      const connected = Boolean(socket) && socket.readyState === WebSocket.OPEN;
      const interactive = connected && hasSession;
      promptInput.disabled = !interactive;
      sendBtn.disabled = !interactive;
      interruptBtn.disabled = !interactive;
    }

    function setSessionReady(ready, sessionId = "") {
      hasSession = ready;
      currentSessionId = ready ? sessionId : "";
      if (!ready) {
        currentStatus = "idle";
      }
      updateRuntimeLabel();
      updateControls();
    }

    function clearConversation() {
      messages.replaceChildren();
      streamingCards.clear();
      toolCards.clear();
      messages.scrollTop = 0;
    }

    function createMessageEntry(kind, title, text) {
      const card = document.createElement("article");
      card.className = "message " + kind;

      const header = document.createElement("div");
      header.className = "message-header";
      header.textContent = title;
      card.appendChild(header);

      const body = document.createElement("div");
      body.textContent = text;
      card.appendChild(body);

      messages.appendChild(card);
      messages.scrollTop = messages.scrollHeight;
      return { card, header, body };
    }

    function setMessageEntry(entry, kind, title, text) {
      entry.card.className = "message " + kind;
      entry.header.textContent = title;
      entry.body.textContent = text;
      messages.scrollTop = messages.scrollHeight;
    }

    function appendMessage(kind, title, text) {
      createMessageEntry(kind, title, text);
    }

    function streamingKey(prefix, id) {
      return prefix + ":" + (id || "default");
    }

    function appendStreamingText(prefix, id, kind, title, delta) {
      const key = streamingKey(prefix, id);
      const existing = streamingCards.get(key);
      if (!existing) {
        streamingCards.set(key, createMessageEntry(kind, title, delta));
        return;
      }
      setMessageEntry(existing, kind, title, existing.body.textContent + delta);
    }

    function finalizeStreamingText(prefix, id, kind, title, text) {
      const key = streamingKey(prefix, id);
      const existing = streamingCards.get(key);
      if (!existing) {
        appendMessage(kind, title, text);
        return;
      }
      setMessageEntry(existing, kind, title, text);
      streamingCards.delete(key);
    }

    function upsertToolCard(id, title, text) {
      const key = id || "default";
      const existing = toolCards.get(key);
      if (!existing) {
        toolCards.set(key, createMessageEntry("tool", title, text));
        return;
      }
      setMessageEntry(existing, "tool", title, text);
    }

    function finalizeToolCard(id, title, result) {
      const key = id || "default";
      const existing = toolCards.get(key);
      if (!existing) {
        appendMessage("tool", title, result);
        return;
      }

      const command = existing.body.textContent || "";
      const merged = command && result ? command + "\\n\\n" + result : command || result;
      setMessageEntry(existing, "tool", title, merged);
      toolCards.delete(key);
    }

    function handleServerMessage(msg) {
      if (msg.type === "system" && msg.subtype === "session_created") {
        const sessionId = msg.sessionId || "";
        const nextProjectPath = msg.projectPath || "";
        setSessionReady(Boolean(sessionId), sessionId);
        if (nextProjectPath) {
          projectPath.value = nextProjectPath;
        }
        appendMessage("system", "Session", "Started for " + nextProjectPath);
        return;
      }

      if (msg.type === "status") {
        currentStatus = msg.status || "idle";
        updateRuntimeLabel();
        updateControls();
        return;
      }

      if (msg.type === "thinking_delta") {
        appendStreamingText("thinking", msg.id || "", "commentary", "Thinking", msg.text || "");
        return;
      }

      if (msg.type === "stream_delta") {
        appendStreamingText("assistant", msg.id || "", "commentary", "Assistant", msg.text || "");
        return;
      }

      if (msg.type === "assistant") {
        const content = Array.isArray(msg.message && msg.message.content)
          ? msg.message.content
          : [];
        const toolUse = content.find((entry) => entry.type === "tool_use");
        if (toolUse) {
          const command = toolUse.input && toolUse.input.command ? String(toolUse.input.command) : "";
          upsertToolCard(toolUse.id || "", toolUse.name || "Tool", command);
          return;
        }

        const text = content
          .filter((entry) => entry.type === "text")
          .map((entry) => entry.text || "")
          .join("\\n");
        const kind = msg.message && msg.message.phase === "commentary" ? "commentary" : "final";
        finalizeStreamingText("assistant", msg.message && msg.message.id ? msg.message.id : "", kind, "Assistant", text);
        return;
      }

      if (msg.type === "tool_result") {
        finalizeToolCard(msg.toolUseId || "", msg.toolName || "Tool Result", msg.content || "");
        return;
      }

      if (msg.type === "user") {
        appendMessage("user", "You", msg.text || "");
        return;
      }

      if (msg.type === "result") {
        appendMessage("system", "Result", msg.subtype || "completed");
        return;
      }

      if (msg.type === "error") {
        appendMessage("error", "Error", msg.message || "Unknown error");
      }
    }

    function ensureSocket() {
      if (socket && socket.readyState === WebSocket.OPEN) {
        return socket;
      }
      if (socket && socket.readyState === WebSocket.CONNECTING) {
        return socket;
      }

      const ws = new WebSocket(normalizeBridgeUrl(bridgeUrl.value));
      bridgeUrl.value = ws.url;
      socket = ws;
      setConnection(false);

      ws.addEventListener("open", () => {
        if (socket !== ws) {
          return;
        }
        setConnection(true);
        if (pendingStartProjectPath) {
          ws.send(JSON.stringify({ type: "start", projectPath: pendingStartProjectPath }));
          pendingStartProjectPath = "";
        }
      });

      ws.addEventListener("close", () => {
        if (socket !== ws) {
          return;
        }
        setConnection(false);
        setSessionReady(false);
      });

      ws.addEventListener("message", (event) => {
        if (socket !== ws) {
          return;
        }
        handleServerMessage(JSON.parse(event.data));
      });

      return ws;
    }

    function reconnectBridge() {
      setSessionReady(false);
      clearConversation();

      if (socket && socket.readyState !== WebSocket.CLOSED) {
        const previousSocket = socket;
        socket = null;
        previousSocket.close();
      }

      ensureSocket();
    }

    function startSession() {
      const project = String(projectPath.value || "").trim();
      if (!project) {
        appendMessage("error", "Validation", "Project path is required.");
        return;
      }

      pendingStartProjectPath = project;
      clearConversation();
      setSessionReady(false);

      const ws = ensureSocket();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "start", projectPath: project }));
        pendingStartProjectPath = "";
      }
    }

    function sendPrompt() {
      const text = String(promptInput.value || "").trim();
      if (!text || !socket || socket.readyState !== WebSocket.OPEN || !hasSession) {
        return;
      }

      socket.send(JSON.stringify({ type: "input", text }));
      promptInput.value = "";
    }

    connectBtn.addEventListener("click", () => {
      reconnectBridge();
    });

    startBtn.addEventListener("click", () => {
      startSession();
    });

    sendBtn.addEventListener("click", () => {
      sendPrompt();
    });

    interruptBtn.addEventListener("click", () => {
      if (!socket || socket.readyState !== WebSocket.OPEN || !hasSession) {
        return;
      }
      socket.send(JSON.stringify({ type: "interrupt" }));
    });

    bridgeUrl.value = defaultSocketUrl();
    ensureSocket();
  </script>
</body>
</html>`;
}
