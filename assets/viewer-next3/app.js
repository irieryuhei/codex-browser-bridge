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
const sessionRepoFilter = document.getElementById("sessionRepoFilter");
const unreadOnlyFilter = document.getElementById("unreadOnlyFilter");
const includeAnsweringFilter = document.getElementById("includeAnsweringFilter");
const showCompletedFilter = document.getElementById("showCompletedFilter");
const sessionListPrevBtn = document.getElementById("sessionListPrevBtn");
const sessionListNextBtn = document.getElementById("sessionListNextBtn");
const sessionListSummary = document.getElementById("sessionListSummary");
const sessionsList = document.getElementById("sessionsList");
const layout = document.getElementById("n3Layout");
const listPanel = document.getElementById("listPanel");
const listResizeHandle = document.getElementById("listResizeHandle");
const viewerPanel = document.getElementById("viewerPanel");
const viewerTitle = document.getElementById("viewerTitle");
const viewerSubtitle = document.getElementById("viewerSubtitle");
const viewerRepoBadge = document.getElementById("viewerRepoBadge");
const viewerModelBadge = document.getElementById("viewerModelBadge");
const viewerModeBadge = document.getElementById("viewerModeBadge");
const viewerBackBtn = document.getElementById("viewerBackBtn");
const viewerPinBtn = document.getElementById("viewerPinBtn");
const viewerCompleteBtn = document.getElementById("viewerCompleteBtn");
const permissionPanel = document.getElementById("permissionPanel");
const messages = document.getElementById("messages");
const composerInput = document.getElementById("composerInput");
const sendBtn = document.getElementById("sendBtn");
const interruptBtn = document.getElementById("interruptBtn");
const forceSendToggle = document.getElementById("forceSendToggle");
const composerHint = document.getElementById("composerHint");

const STORAGE_KEY = "codex-browser-bridge.viewer-next3";
const DEFAULT_SIDEBAR_WIDTH = 348;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 760;
const RESIZER_WIDTH = 18;
const MIN_MAIN_WIDTH = 420;
const MAX_VISIBLE_SESSIONS = 10;
const MAX_UNREAD_SESSIONS = 50;
const FINAL_ANSWER_PREVIEW_LINES = 5;

const state = {
  socket: null,
  outboundQueue: [],
  sessions: [],
  selectedSessionId: "",
  histories: new Map(),
  queuedDrafts: new Map(),
  unreadSessionIds: new Set(),
  projectPathChoices: [],
  hydratedProjectPathChoices: false,
  pendingRepoFilterValue: "",
  sessionListOffset: 0,
  openCollapseKeys: new Set(),
  openFinalAnswerKeys: new Set(),
  sidebarWidth: null,
  activeResize: null,
};

function socketUrlFromWindow() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return protocol + "//" + window.location.host;
}

function normalizeBridgeUrl(value) {
  const trimmed = String(value || "").trim();
  return trimmed || socketUrlFromWindow();
}

function parseUrlBoolean(value, fallback) {
  if (value === null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readSavedState() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const savedWidth = Number(raw.sidebarWidth);
    return {
      projectPath: typeof raw.projectPath === "string" ? raw.projectPath : "",
      sidebarWidth: Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : null,
      unreadSessionIds: Array.isArray(raw.unreadSessionIds)
        ? raw.unreadSessionIds.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      projectPath: "",
      sidebarWidth: null,
      unreadSessionIds: [],
    };
  }
}

function persistState() {
  const nextState = {
    projectPath: projectPathInput.value,
    unreadSessionIds: Array.from(state.unreadSessionIds),
  };
  if (Number.isFinite(state.sidebarWidth) && state.sidebarWidth > 0) {
    nextState.sidebarWidth = Math.round(state.sidebarWidth);
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function shortProject(projectPath) {
  const normalized = String(projectPath || "").trim();
  if (!normalized) {
    return "";
  }
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

function hashValue(source) {
  let hash = 0;
  const input = String(source || "");
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sessionPalette(session) {
  const repo = shortProject(session && session.projectPath ? session.projectPath : "") || "unknown";
  const seed = hashValue(repo.toLowerCase());
  const anchors = [12, 36, 98, 164, 214, 332];
  const baseHue = anchors[seed % anchors.length];
  const hue = ((baseHue + ((seed % 5) - 2) * 7) % 360 + 360) % 360;
  const saturation = 66 + (seed % 12);
  const background = 86 + ((seed >>> 4) % 5);
  const border = 52 + ((seed >>> 6) % 10);

  return [
    "--session-bg: hsl(" + hue + " " + saturation + "% " + background + "% / 0.9)",
    "--session-border: hsl(" + hue + " " + Math.max(saturation - 8, 52) + "% " + border + "% / 0.42)",
    "--session-ring: hsl(" + hue + " " + saturation + "% " + Math.max(border - 5, 42) + "% / 0.18)",
  ].join("; ");
}

function nowIsoString() {
  return new Date().toISOString();
}

function relativeTime(timestamp) {
  const parsed = Date.parse(String(timestamp || ""));
  if (Number.isNaN(parsed)) {
    return "";
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (elapsedSeconds < 60) {
    return elapsedSeconds + " sec ago";
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return elapsedMinutes + " min ago";
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return elapsedHours + " hr ago";
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return elapsedDays + " day ago";
}

function elapsedDuration(start, end) {
  const startMs = Date.parse(String(start || ""));
  const endMs = Date.parse(String(end || ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return "";
  }
  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < 60) {
    return seconds + "s";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? minutes + "m " + remainder + "s" : minutes + "m";
}

function normalizedProjectPaths(items) {
  const unique = [];
  const seen = new Set();
  if (!Array.isArray(items)) {
    return unique;
  }
  items.forEach((item) => {
    const normalized = typeof item === "string" ? item.trim() : "";
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(normalized);
  });
  return unique.slice(0, 12);
}

function currentProjectPathChoices() {
  return normalizedProjectPaths([
    ...state.sessions.slice(0, MAX_VISIBLE_SESSIONS).map((session) => session.projectPath),
    ...state.projectPathChoices,
  ]);
}

function renderProjectPathPicker() {
  const choices = currentProjectPathChoices();
  const counts = new Map();
  const duplicateShortNames = new Set();

  choices.forEach((projectPath) => {
    const short = shortProject(projectPath) || projectPath;
    const nextCount = (counts.get(short) || 0) + 1;
    counts.set(short, nextCount);
    if (nextCount > 1) {
      duplicateShortNames.add(short);
    }
  });

  projectPathPicker.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a repository";
  projectPathPicker.appendChild(placeholder);

  choices.forEach((projectPath) => {
    const option = document.createElement("option");
    const short = shortProject(projectPath) || projectPath;
    option.value = projectPath;
    option.textContent = duplicateShortNames.has(short) ? projectPath : short;
    projectPathPicker.appendChild(option);
  });

  projectPathPicker.hidden = false;
  const normalized = String(projectPathInput.value || "").trim();
  const matches = Array.from(projectPathPicker.options).some((option) => option.value === normalized);
  projectPathPicker.value = matches ? normalized : "";
}

function setConnectionState(connected) {
  connectionDot.classList.toggle("connected", connected);
  connectionLabel.textContent = connected ? "Connected" : "Disconnected";
  bridgeControls.hidden = connected;
  updateComposerState();
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
  setConnectionState(false);

  socket.addEventListener("open", () => {
    if (state.socket !== socket) {
      return;
    }
    setConnectionState(true);
    flushOutboundQueue();
  });

  socket.addEventListener("close", () => {
    if (state.socket !== socket) {
      return;
    }
    setConnectionState(false);
  });

  socket.addEventListener("message", (event) => {
    if (state.socket !== socket) {
      return;
    }
    let payload = null;
    try {
      payload = JSON.parse(String(event.data || ""));
    } catch {
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      return;
    }
    handleServerMessage(payload);
  });

  return socket;
}

function sendPayload(payload) {
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

function currentUrlState() {
  const params = new URL(window.location.href).searchParams;
  return {
    sessionId: String(params.get("session") || "").trim(),
    query: String(params.get("q") || ""),
    repo: String(params.get("repo") || ""),
    unreadOnly: parseUrlBoolean(params.get("unreadOnly"), false),
    includeAnswering: parseUrlBoolean(params.get("includeAnswering"), true),
    showCompleted: parseUrlBoolean(params.get("showCompleted"), true),
  };
}

function currentRepoFilterValue() {
  return String(sessionRepoFilter.value || state.pendingRepoFilterValue || "").trim().toLowerCase();
}

function applyUrlState() {
  const nextState = currentUrlState();
  sessionFilterInput.value = nextState.query;
  state.pendingRepoFilterValue = nextState.repo;
  sessionRepoFilter.value = nextState.repo;
  unreadOnlyFilter.checked = nextState.unreadOnly;
  includeAnsweringFilter.checked = nextState.includeAnswering;
  showCompletedFilter.checked = nextState.showCompleted;
  state.sessionListOffset = 0;
  return nextState.sessionId;
}

function syncUrl(sessionId, mode) {
  if (mode === "none") {
    return;
  }
  const url = new URL(window.location.href);
  const query = String(sessionFilterInput.value || "").trim();
  const repo = currentRepoFilterValue();

  if (sessionId) {
    url.searchParams.set("session", sessionId);
  } else {
    url.searchParams.delete("session");
  }
  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }
  if (repo) {
    url.searchParams.set("repo", repo);
  } else {
    url.searchParams.delete("repo");
  }
  if (unreadOnlyFilter.checked) {
    url.searchParams.set("unreadOnly", "1");
  } else {
    url.searchParams.delete("unreadOnly");
  }
  if (!includeAnsweringFilter.checked) {
    url.searchParams.set("includeAnswering", "0");
  } else {
    url.searchParams.delete("includeAnswering");
  }
  if (!showCompletedFilter.checked) {
    url.searchParams.set("showCompleted", "0");
  } else {
    url.searchParams.delete("showCompleted");
  }

  const nextUrl = url.pathname + url.search + url.hash;
  const currentUrl = window.location.pathname + window.location.search + window.location.hash;
  if (nextUrl === currentUrl) {
    return;
  }
  if (mode === "push") {
    window.history.pushState({ sessionId }, "", nextUrl);
  } else {
    window.history.replaceState({ sessionId }, "", nextUrl);
  }
}

function clampSidebarWidth(width) {
  const availableWidth = Math.max(0, window.innerWidth - MIN_MAIN_WIDTH - RESIZER_WIDTH - 24);
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, availableWidth || MAX_SIDEBAR_WIDTH));
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, maxWidth));
}

function currentSidebarWidth() {
  if (Number.isFinite(state.sidebarWidth) && state.sidebarWidth > 0) {
    return state.sidebarWidth;
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

function applySidebarWidth(width) {
  const nextWidth = clampSidebarWidth(Number(width) || DEFAULT_SIDEBAR_WIDTH);
  state.sidebarWidth = nextWidth;
  document.documentElement.style.setProperty("--n3-sidebar-width", nextWidth + "px");
  listResizeHandle?.setAttribute("aria-valuenow", String(Math.round(nextWidth)));
}

function isMobileViewport() {
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 980px)").matches;
  }
  return window.innerWidth <= 980;
}

function updateResponsiveLayout() {
  if (!layout) {
    return;
  }
  layout.classList.remove("n3-mobile-list", "n3-mobile-view");
  if (!isMobileViewport()) {
    viewerBackBtn.hidden = true;
    return;
  }
  const showViewer = !!state.selectedSessionId;
  layout.classList.add(showViewer ? "n3-mobile-view" : "n3-mobile-list");
  viewerBackBtn.hidden = !showViewer;
}

function startResize(clientX) {
  if (isMobileViewport()) {
    return;
  }
  state.activeResize = {
    startX: clientX,
    startWidth: currentSidebarWidth(),
  };
  document.body.classList.add("n3-resizing");
}

function stopResize(shouldPersist) {
  state.activeResize = null;
  document.body.classList.remove("n3-resizing");
  if (shouldPersist) {
    persistState();
  }
}

function handleResizeMove(event) {
  if (!state.activeResize) {
    return;
  }
  const delta = event.clientX - state.activeResize.startX;
  applySidebarWidth(state.activeResize.startWidth + delta);
}

function currentSession() {
  return state.sessions.find((session) => session.sessionId === state.selectedSessionId) || null;
}

function historyMessageKey(message) {
  if (!message || typeof message !== "object") {
    return JSON.stringify(message);
  }
  if (message.type === "assistant") {
    const assistantMessage = message.message && typeof message.message === "object" ? message.message : {};
    return JSON.stringify({
      type: message.type,
      timestamp: message.timestamp || "",
      phase: assistantMessage.phase || "",
      content: Array.isArray(assistantMessage.content) ? assistantMessage.content : [],
    });
  }
  return JSON.stringify({
    type: message.type,
    timestamp: message.timestamp || "",
    id: message.id || "",
    text: message.text || "",
    message: message.message || "",
    toolUseId: message.toolUseId || "",
  });
}

function mergeHistorySnapshot(sessionId, messagesFromServer) {
  const existingMessages = state.histories.get(sessionId) || [];
  if (existingMessages.length === 0) {
    return messagesFromServer.slice();
  }
  if (messagesFromServer.length === 0) {
    return existingMessages.slice();
  }

  const merged = messagesFromServer.slice();
  const seen = new Set(merged.map(historyMessageKey));
  existingMessages.forEach((message) => {
    const key = historyMessageKey(message);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(message);
  });
  return merged;
}

function enqueueDraft(sessionId, text) {
  const queue = state.queuedDrafts.get(sessionId) || [];
  queue.push(text);
  state.queuedDrafts.set(sessionId, queue);
}

function shiftDraft(sessionId, text) {
  const queue = state.queuedDrafts.get(sessionId) || [];
  const index = queue.findIndex((item) => item === text);
  if (index >= 0) {
    queue.splice(index, 1);
  } else if (queue.length > 0) {
    queue.shift();
  }
  state.queuedDrafts.set(sessionId, queue);
}

function reconcileDrafts(sessionId) {
  const queue = state.queuedDrafts.get(sessionId) || [];
  if (queue.length === 0) {
    return;
  }
  const history = state.histories.get(sessionId) || [];
  state.queuedDrafts.set(sessionId, queue.filter((draft) => {
    return !history.some((message) => message.type === "user" && message.text === draft);
  }));
}

function pruneUnreadSessions() {
  const trackedIds = new Set(state.sessions.slice(0, MAX_UNREAD_SESSIONS).map((session) => session.sessionId));
  let changed = false;
  Array.from(state.unreadSessionIds).forEach((sessionId) => {
    if (!trackedIds.has(sessionId)) {
      state.unreadSessionIds.delete(sessionId);
      changed = true;
    }
  });
  if (changed) {
    persistState();
  }
}

function markUnread(sessionId) {
  if (!sessionId || sessionId === state.selectedSessionId) {
    return;
  }
  if (!state.unreadSessionIds.has(sessionId)) {
    state.unreadSessionIds.add(sessionId);
    pruneUnreadSessions();
    persistState();
  }
}

function clearUnread(sessionId) {
  if (!sessionId) {
    return;
  }
  if (state.unreadSessionIds.delete(sessionId)) {
    persistState();
  }
}

function patchSession(sessionId, patch) {
  state.sessions = state.sessions.map((session) => {
    if (session.sessionId !== sessionId) {
      return session;
    }
    return { ...session, ...patch };
  });
}

function isHistoryMessage(payload) {
  return ["user", "thinking_delta", "stream_delta", "assistant", "tool_result", "error"].includes(payload.type);
}

function appendHistoryMessage(sessionId, payload) {
  const history = state.histories.get(sessionId) || [];
  history.push(payload);
  state.histories.set(sessionId, history);
}

function setSelectedSession(sessionId, options) {
  const settings = {
    historyMode: "replace",
    requestHistory: true,
    ...options,
  };

  state.selectedSessionId = sessionId || "";
  syncUrl(state.selectedSessionId, settings.historyMode);
  if (state.selectedSessionId && settings.requestHistory) {
    sendPayload({ type: "get_history", sessionId: state.selectedSessionId });
    clearUnread(state.selectedSessionId);
  }
  renderSessionList();
  renderViewer();
  updateResponsiveLayout();
}

function renderRepoFilterOptions(visibleSessions) {
  const currentValue = currentRepoFilterValue();
  const repos = [];
  const seen = new Set();

  visibleSessions.forEach((session) => {
    const repo = shortProject(session.projectPath).trim().toLowerCase();
    if (!repo || seen.has(repo)) {
      return;
    }
    seen.add(repo);
    repos.push(repo);
  });

  sessionRepoFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All repositories";
  sessionRepoFilter.appendChild(allOption);

  repos.forEach((repo) => {
    const option = document.createElement("option");
    option.value = repo;
    option.textContent = repo;
    sessionRepoFilter.appendChild(option);
  });

  if (currentValue && !seen.has(currentValue)) {
    const option = document.createElement("option");
    option.value = currentValue;
    option.textContent = currentValue;
    sessionRepoFilter.appendChild(option);
    seen.add(currentValue);
  }

  sessionRepoFilter.value = currentValue && seen.has(currentValue) ? currentValue : "";
  state.pendingRepoFilterValue = "";
}

function isUnread(session) {
  return !!session && state.unreadSessionIds.has(session.sessionId);
}

function isSettled(session) {
  return !!session && session.answerState === "final_answer";
}

function matchesSessionFilter(session, filters) {
  if (filters.query) {
    const haystacks = [
      session.title,
      session.projectPath,
      session.preview,
    ].map((value) => String(value || "").toLowerCase());
    if (!haystacks.some((value) => value.includes(filters.query))) {
      return false;
    }
  }
  if (filters.repo && shortProject(session.projectPath).toLowerCase() !== filters.repo) {
    return false;
  }
  if (filters.unreadOnly && !isUnread(session)) {
    return false;
  }
  if (!filters.includeAnswering && !isSettled(session)) {
    return false;
  }
  if (!filters.showCompleted && session.completed === true) {
    return false;
  }
  return true;
}

function currentFilters() {
  return {
    query: String(sessionFilterInput.value || "").trim().toLowerCase(),
    repo: currentRepoFilterValue(),
    unreadOnly: unreadOnlyFilter.checked,
    includeAnswering: includeAnsweringFilter.checked,
    showCompleted: showCompletedFilter.checked,
  };
}

function clampSessionOffset(offset, totalCount) {
  if (totalCount <= 0) {
    return 0;
  }
  const lastPageOffset = Math.floor((totalCount - 1) / MAX_VISIBLE_SESSIONS) * MAX_VISIBLE_SESSIONS;
  return Math.max(0, Math.min(offset, lastPageOffset));
}

function sessionRelativeTime(session) {
  const timestamp = session.answerState === "final_answer"
    ? (session.finalAnswerAt || session.updatedAt)
    : session.updatedAt;
  return relativeTime(timestamp);
}

function shouldShowSessionSpinner(session) {
  return session.status !== "stopped" && session.answerState === "commentary";
}

function renderSessionListSummary(visibleCount, totalCount, offset) {
  if (totalCount === 0) {
    sessionListSummary.textContent = state.sessions.length === 0 ? "No conversations yet." : "No matching conversations.";
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

function renderSessionList() {
  sessionsList.replaceChildren();
  const filters = currentFilters();
  const filteredSessions = state.sessions.filter((session) => matchesSessionFilter(session, filters));
  state.sessionListOffset = clampSessionOffset(state.sessionListOffset, filteredSessions.length);
  const visibleSessions = filteredSessions.slice(
    state.sessionListOffset,
    state.sessionListOffset + MAX_VISIBLE_SESSIONS,
  );

  renderRepoFilterOptions(visibleSessions);
  renderSessionListSummary(visibleSessions.length, filteredSessions.length, state.sessionListOffset);
  sessionListPrevBtn.disabled = state.sessionListOffset === 0;
  sessionListNextBtn.disabled = state.sessionListOffset + MAX_VISIBLE_SESSIONS >= filteredSessions.length;

  if (filteredSessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "n3-hint";
    empty.textContent = state.sessions.length === 0 ? "No conversations yet." : "No matching conversations.";
    sessionsList.appendChild(empty);
    return;
  }

  const hasPinned = visibleSessions.some((session) => session.pinned);
  const hasRegular = visibleSessions.some((session) => !session.pinned);
  let insertedDivider = false;

  visibleSessions.forEach((session) => {
    if (hasPinned && hasRegular && !insertedDivider && !session.pinned) {
      const divider = document.createElement("hr");
      divider.className = "n3-divider";
      sessionsList.appendChild(divider);
      insertedDivider = true;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "n3-session-card";
    button.dataset.sessionId = session.sessionId;
    button.setAttribute("style", sessionPalette(session));
    if (session.sessionId === state.selectedSessionId) {
      button.classList.add("active");
    }
    if (session.pinned) {
      button.classList.add("pinned");
    }
    if (session.completed) {
      button.classList.add("completed");
    }

    const top = document.createElement("div");
    top.className = "n3-session-top";

    const titleWrap = document.createElement("div");
    titleWrap.className = "n3-session-title-wrap";

    const title = document.createElement("div");
    title.className = "n3-session-title";
    title.textContent = session.title || session.sessionId;
    titleWrap.appendChild(title);

    if (isUnread(session)) {
      const unreadTag = document.createElement("span");
      unreadTag.className = "n3-tag unread";
      unreadTag.textContent = "Unread";
      titleWrap.appendChild(unreadTag);
    }

    const time = sessionRelativeTime(session);
    if (time) {
      const timeLabel = document.createElement("span");
      timeLabel.className = "n3-session-time";
      timeLabel.textContent = time;
      titleWrap.appendChild(timeLabel);
    }

    top.appendChild(titleWrap);

    if (shouldShowSessionSpinner(session)) {
      const status = document.createElement("span");
      status.className = "n3-status-pill";
      status.dataset.sessionSpinner = session.sessionId;
      const spinner = document.createElement("span");
      spinner.className = "n3-spinner";
      spinner.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = "Answering";
      status.appendChild(spinner);
      status.appendChild(label);
      top.appendChild(status);
    }

    const preview = document.createElement("div");
    preview.className = "n3-session-preview";
    preview.textContent = session.preview || "No messages yet.";

    button.appendChild(top);
    button.appendChild(preview);
    button.addEventListener("click", () => {
      setSelectedSession(session.sessionId, { historyMode: "push", requestHistory: true });
    });

    sessionsList.appendChild(button);
  });
}

function setBadge(element, text, hidden) {
  element.hidden = hidden;
  element.textContent = hidden ? "" : text;
}

function sessionModelLabel(session) {
  const model = typeof session.model === "string" ? session.model.trim() : "";
  const effort = typeof session.modelReasoningEffort === "string" ? session.modelReasoningEffort.trim() : "";
  if (!model) {
    return "";
  }
  return effort ? model + " / effort: " + effort : model;
}

function renderPermissionPanel(session) {
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
    preview.className = "n3-hint";
    preview.textContent = typeof session.pendingPermission.input.plan === "string"
      ? session.pendingPermission.input.plan
      : "";
    permissionPanel.appendChild(preview);

    const textarea = document.createElement("textarea");
    textarea.id = "permissionPlanInput";
    textarea.value = preview.textContent || "";
    permissionPanel.appendChild(textarea);

    const actions = document.createElement("div");
    actions.className = "n3-permission-actions";

    const approveBtn = document.createElement("button");
    approveBtn.id = "approvePermissionBtn";
    approveBtn.type = "button";
    approveBtn.className = "n3-button primary";
    approveBtn.textContent = "Approve Plan";
    approveBtn.addEventListener("click", () => {
      sendPayload({
        type: "approve",
        sessionId: session.sessionId,
        toolUseId: session.pendingPermission.toolUseId,
        updatedInput: { plan: textarea.value },
      });
    });

    const rejectBtn = document.createElement("button");
    rejectBtn.id = "rejectPermissionBtn";
    rejectBtn.type = "button";
    rejectBtn.className = "n3-button secondary";
    rejectBtn.textContent = "Send Back";
    rejectBtn.addEventListener("click", () => {
      sendPayload({
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
    prompt.className = "n3-hint";
    const questions = Array.isArray(session.pendingPermission.input.questions)
      ? session.pendingPermission.input.questions
      : [];
    prompt.textContent = questions[0] && questions[0].question ? questions[0].question : "Answer required";
    permissionPanel.appendChild(prompt);

    const textarea = document.createElement("textarea");
    textarea.id = "permissionAnswerInput";
    permissionPanel.appendChild(textarea);

    const answerBtn = document.createElement("button");
    answerBtn.id = "answerPermissionBtn";
    answerBtn.type = "button";
    answerBtn.className = "n3-button primary";
    answerBtn.textContent = "Send Answer";
    answerBtn.addEventListener("click", () => {
      sendPayload({
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
  actions.className = "n3-permission-actions";

  const approveBtn = document.createElement("button");
  approveBtn.id = "approvePermissionBtn";
  approveBtn.type = "button";
  approveBtn.className = "n3-button primary";
  approveBtn.textContent = "Approve";
  approveBtn.addEventListener("click", () => {
    sendPayload({
      type: "approve",
      sessionId: session.sessionId,
      toolUseId: session.pendingPermission.toolUseId,
    });
  });

  const rejectBtn = document.createElement("button");
  rejectBtn.id = "rejectPermissionBtn";
  rejectBtn.type = "button";
  rejectBtn.className = "n3-button secondary";
  rejectBtn.textContent = "Reject";
  rejectBtn.addEventListener("click", () => {
    sendPayload({
      type: "reject",
      sessionId: session.sessionId,
      toolUseId: session.pendingPermission.toolUseId,
    });
  });

  actions.appendChild(approveBtn);
  actions.appendChild(rejectBtn);
  permissionPanel.appendChild(actions);
}

function updateComposerState() {
  const connected = !!state.socket && state.socket.readyState === WebSocket.OPEN;
  const session = currentSession();
  composerInput.disabled = !connected || !session;
  sendBtn.disabled = !connected || !session;
  interruptBtn.disabled = !connected || !session || session.status !== "running";
  forceSendToggle.disabled = !connected || !session;

  if (!connected) {
    composerHint.textContent = "Reconnect the bridge to send prompts.";
    return;
  }
  if (!session) {
    composerHint.textContent = "Select a conversation to send a prompt.";
    return;
  }
  if (session.status === "stopped") {
    composerHint.textContent = "Send a prompt to resume this stored session.";
    return;
  }
  if (session.status === "running") {
    composerHint.textContent = "Enable Force Send to submit immediately instead of queueing.";
    return;
  }
  if (session.queueLength > 0) {
    composerHint.textContent = "New prompts will be queued until the current turn finishes.";
    return;
  }
  composerHint.textContent = "";
}

function renderViewer() {
  const session = currentSession();
  if (!session) {
    viewerTitle.textContent = "No session selected";
    viewerSubtitle.textContent = "Start a new chat or choose one from the list.";
    runtimeLabel.textContent = "No session selected";
    setBadge(viewerRepoBadge, "", true);
    setBadge(viewerModelBadge, "", true);
    setBadge(viewerModeBadge, "", true);
    viewerPinBtn.disabled = true;
    viewerCompleteBtn.disabled = true;
    permissionPanel.hidden = true;
    messages.replaceChildren();
    updateComposerState();
    updateResponsiveLayout();
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

  renderPermissionPanel(session);
  renderMessages();
  updateComposerState();
  updateResponsiveLayout();
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
        deltaId: item.id || "",
        text: item.text || "",
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
        deltaId: item.id || "",
        text: item.text || "",
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
        .join("\n")
        .trim();
      if (!text) {
        return;
      }
      entries.push({
        role: "assistant",
        phase: item.message.phase || null,
        id: item.message.id || "",
        text,
        timestamp: item.timestamp,
      });
      return;
    }

    if (item.type === "tool_result") {
      entries.push({
        role: "tool",
        text: item.content || "",
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

    if (currentTurn.finalAnswer) {
      const collapsedItems = currentTurn.items.filter((item) => item !== currentTurn.finalAnswer);
      if (collapsedItems.length > 0) {
        blocks.push({
          type: "collapse",
          summary: currentTurn.finalAnswer,
          items: collapsedItems,
          userItem: currentTurn.userItem,
        });
      }
      blocks.push({ type: "message", item: currentTurn.finalAnswer });
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

    const isTurnEntry = item.role === "thinking" || item.role === "draft" || item.role === "assistant" || item.role === "tool";
    if (!isTurnEntry) {
      flushAssistantTurn();
      blocks.push({ type: "message", item });
      return;
    }

    if (!currentTurn) {
      currentTurn = {
        items: [],
        finalAnswer: null,
        userItem: lastUser,
      };
    }

    currentTurn.items.push(item);
    if (item.role === "assistant" && item.phase === "final_answer") {
      currentTurn.finalAnswer = item;
    }
  });

  flushAssistantTurn();
  return blocks;
}

function collapseKey(block) {
  const summary = block && block.summary ? block.summary : null;
  const userItem = block && block.userItem ? block.userItem : null;
  const summaryKey = summary
    ? [summary.id || "", summary.phase || "", summary.timestamp || "", summary.text || ""].join("|")
    : "";
  const userKey = userItem
    ? [userItem.timestamp || "", userItem.text || ""].join("|")
    : "";
  return [state.selectedSessionId || "", userKey, summaryKey].join("::");
}

function finalAnswerKey(item) {
  return item.id || [item.phase || "", item.timestamp || "", item.text || ""].join("|");
}

function renderCollapseBlock(block) {
  const detail = document.createElement("details");
  detail.className = "n3-collapse";
  const key = collapseKey(block);
  detail.open = state.openCollapseKeys.has(key);
  detail.addEventListener("toggle", () => {
    if (detail.open) {
      state.openCollapseKeys.add(key);
    } else {
      state.openCollapseKeys.delete(key);
    }
  });

  const summary = document.createElement("summary");
  const left = document.createElement("strong");
  left.textContent = "Intermediate turn (" + block.items.length + ")";
  const right = document.createElement("span");
  const elapsed = elapsedDuration(block.userItem ? block.userItem.timestamp : "", block.summary ? block.summary.timestamp : "");
  right.textContent = elapsed ? "Elapsed " + elapsed : "Intermediate turn";
  summary.appendChild(left);
  summary.appendChild(right);
  detail.appendChild(summary);

  const body = document.createElement("div");
  body.className = "n3-collapse-body";
  block.items.slice().reverse().forEach((item) => {
    body.appendChild(renderMessageCard(item));
  });
  detail.appendChild(body);
  return detail;
}

function messageLabel(item) {
  if (item.role === "user") {
    return "You";
  }
  if (item.role === "thinking") {
    return "Thinking";
  }
  if (item.role === "draft") {
    return "Draft";
  }
  if (item.role === "tool") {
    return "Tool";
  }
  if (item.role === "error") {
    return "Error";
  }
  if (item.phase === "final_answer") {
    return "Final Answer";
  }
  return "Assistant";
}

function estimateLineCount(text, body) {
  const width = typeof body.getBoundingClientRect === "function" ? body.getBoundingClientRect().width : 0;
  const charsPerLine = width > 0 ? Math.max(24, Math.floor(width / 8)) : 72;
  return String(text || "").split(/\r?\n/).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
}

function isFinalAnswerExpandable(body) {
  const text = String(body.textContent || "");
  if (!text.trim()) {
    return false;
  }
  const computed = typeof window.getComputedStyle === "function" ? window.getComputedStyle(body) : null;
  const lineHeight = computed ? parseFloat(computed.lineHeight || "") : NaN;
  const scrollHeight = Number(body.scrollHeight);
  if (Number.isFinite(scrollHeight) && scrollHeight > 0 && Number.isFinite(lineHeight) && lineHeight > 0) {
    return scrollHeight > (lineHeight * FINAL_ANSWER_PREVIEW_LINES) + 1;
  }
  return estimateLineCount(text, body) > FINAL_ANSWER_PREVIEW_LINES;
}

function syncExpandableFinalAnswerCard(card) {
  const body = card.querySelector(".n3-message-body");
  const toggle = card.querySelector(".n3-expand");
  if (!body || !toggle) {
    return;
  }

  const expandable = isFinalAnswerExpandable(body);
  card.dataset.expandable = expandable ? "true" : "false";
  if (!expandable) {
    card.classList.remove("expandable");
    card.dataset.expanded = "false";
    toggle.hidden = true;
    toggle.textContent = "Show more";
    toggle.setAttribute("aria-expanded", "false");
    return;
  }

  card.classList.add("expandable");
  const key = card.dataset.finalAnswerKey || "";
  const expanded = key ? state.openFinalAnswerKeys.has(key) : false;
  card.dataset.expanded = expanded ? "true" : "false";
  toggle.hidden = false;
  toggle.textContent = expanded ? "Show less" : "Show more";
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function syncExpandableFinalAnswerCards() {
  Array.from(messages.querySelectorAll(".n3-message.final[data-final-answer-key]")).forEach((card) => {
    syncExpandableFinalAnswerCard(card);
  });
}

function renderMessageCard(item) {
  const isFinalAnswer = item.role === "assistant" && item.phase === "final_answer";
  const kind = isFinalAnswer
    ? "final"
    : item.role === "assistant" || item.role === "thinking" || item.role === "draft"
      ? "commentary"
      : item.role;

  const card = document.createElement("article");
  card.className = "n3-message " + kind;

  const header = document.createElement("div");
  header.className = "n3-message-head";
  const label = document.createElement("span");
  label.textContent = messageLabel(item);
  header.appendChild(label);

  const time = relativeTime(item.timestamp);
  if (time) {
    const timestamp = document.createElement("span");
    timestamp.className = "n3-message-time";
    timestamp.dataset.timestamp = String(item.timestamp || "");
    timestamp.textContent = time;
    header.appendChild(timestamp);
  }
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "n3-message-body";
  body.textContent = item.text || "";
  card.appendChild(body);

  if (isFinalAnswer) {
    const key = finalAnswerKey(item);
    card.dataset.finalAnswerKey = key;
    card.dataset.expanded = "false";

    const footer = document.createElement("div");
    footer.className = "n3-message-footer";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "n3-expand";
    toggle.hidden = true;
    toggle.textContent = "Show more";
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (card.dataset.expandable !== "true") {
        return;
      }
      if (state.openFinalAnswerKeys.has(key)) {
        state.openFinalAnswerKeys.delete(key);
      } else {
        state.openFinalAnswerKeys.add(key);
      }
      syncExpandableFinalAnswerCard(card);
    });
    footer.appendChild(toggle);
    card.appendChild(footer);
  }

  return card;
}

function refreshMessageRelativeTimes() {
  Array.from(messages.querySelectorAll(".n3-message-time[data-timestamp]")).forEach((item) => {
    if (item instanceof HTMLElement) {
      item.textContent = relativeTime(item.dataset.timestamp || "");
    }
  });
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
  const rendered = blocks.slice().reverse().map((block) => {
    if (block.type === "collapse") {
      return renderCollapseBlock(block);
    }
    return renderMessageCard(block.item);
  });

  messages.replaceChildren(...rendered);
  syncExpandableFinalAnswerCards();
  refreshMessageRelativeTimes();
}

function refreshRelativeTimes() {
  if (state.sessions.length > 0) {
    renderSessionList();
  }
  if (state.selectedSessionId) {
    refreshMessageRelativeTimes();
  }
}

function handleServerMessage(message) {
  if (message.type === "system" && message.subtype === "session_created") {
    if (typeof message.projectPath === "string") {
      projectPathInput.value = message.projectPath;
      persistState();
      renderProjectPathPicker();
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
    setSelectedSession(String(message.sessionId || ""), { historyMode: "push", requestHistory: true });
    sendPayload({ type: "list_sessions" });
    return;
  }

  if (message.type === "session_list") {
    state.sessions = Array.isArray(message.sessions) ? message.sessions : [];
    state.projectPathChoices = normalizedProjectPaths(
      Array.isArray(message.selectableProjectPaths) ? message.selectableProjectPaths : message.projectPaths,
    );
    pruneUnreadSessions();
    renderProjectPathPicker();

    const choices = currentProjectPathChoices();
    if (
      !state.hydratedProjectPathChoices
      && choices.length > 0
      && (!projectPathInput.value || projectPathInput.value === "/workspace/mserver")
    ) {
      projectPathInput.value = choices[0];
      persistState();
      renderProjectPathPicker();
    }
    if (choices.length > 0) {
      state.hydratedProjectPathChoices = true;
    }

    if (state.selectedSessionId && !state.sessions.some((session) => session.sessionId === state.selectedSessionId)) {
      setSelectedSession("", { historyMode: "replace", requestHistory: false });
      return;
    }
    if (state.selectedSessionId && !state.histories.has(state.selectedSessionId)) {
      sendPayload({ type: "get_history", sessionId: state.selectedSessionId });
    }
    renderSessionList();
    renderViewer();
    return;
  }

  if (message.type === "history" && typeof message.sessionId === "string") {
    const incomingMessages = Array.isArray(message.messages) ? message.messages : [];
    state.histories.set(message.sessionId, mergeHistorySnapshot(message.sessionId, incomingMessages));
    reconcileDrafts(message.sessionId);
    if (message.sessionId === state.selectedSessionId) {
      clearUnread(message.sessionId);
    }
    renderSessionList();
    if (message.sessionId === state.selectedSessionId) {
      renderMessages();
    }
    return;
  }

  if (message.type === "status" && typeof message.sessionId === "string") {
    patchSession(message.sessionId, {
      status: message.status || "idle",
      updatedAt: message.timestamp || nowIsoString(),
    });
    renderSessionList();
    renderViewer();
    return;
  }

  if (message.type === "input_ack" && typeof message.sessionId === "string") {
    if (message.queued === true && typeof message.text === "string") {
      enqueueDraft(message.sessionId, message.text);
    }
    updateComposerState();
    return;
  }

  if (typeof message.sessionId === "string" && isHistoryMessage(message)) {
    appendHistoryMessage(message.sessionId, message);
    if (message.type === "user") {
      shiftDraft(message.sessionId, message.text || "");
    }
    if (message.sessionId === state.selectedSessionId) {
      clearUnread(message.sessionId);
      renderMessages();
    } else {
      markUnread(message.sessionId);
    }
    renderSessionList();
  }
}

connectBtn.addEventListener("click", () => {
  if (state.socket) {
    state.socket.close();
  }
  state.socket = null;
  ensureSocket();
});

startBtn.addEventListener("click", () => {
  persistState();
  sendPayload({
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
  sendPayload({
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
  sendPayload({
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
  const text = String(composerInput.value || "").trim();
  if (!session || !text) {
    return;
  }
  composerInput.value = "";
  updateComposerState();
  sendPayload({
    type: "input",
    sessionId: session.sessionId,
    text,
    ...(forceSendToggle.checked ? { force: true } : {}),
  });
});

interruptBtn.addEventListener("click", () => {
  const session = currentSession();
  if (!session) {
    return;
  }
  sendPayload({
    type: "interrupt",
    sessionId: session.sessionId,
  });
});

projectPathPicker.addEventListener("change", () => {
  if (!projectPathPicker.value) {
    return;
  }
  projectPathInput.value = projectPathPicker.value;
  persistState();
});

projectPathInput.addEventListener("change", () => {
  renderProjectPathPicker();
  persistState();
});

projectPathInput.addEventListener("input", () => {
  renderProjectPathPicker();
  persistState();
});

sessionFilterInput.addEventListener("input", () => {
  state.sessionListOffset = 0;
  renderSessionList();
  syncUrl(state.selectedSessionId, "replace");
});

sessionRepoFilter.addEventListener("change", () => {
  state.sessionListOffset = 0;
  renderSessionList();
  syncUrl(state.selectedSessionId, "replace");
});

unreadOnlyFilter.addEventListener("change", () => {
  state.sessionListOffset = 0;
  renderSessionList();
  syncUrl(state.selectedSessionId, "replace");
});

includeAnsweringFilter.addEventListener("change", () => {
  state.sessionListOffset = 0;
  renderSessionList();
  syncUrl(state.selectedSessionId, "replace");
});

showCompletedFilter.addEventListener("change", () => {
  state.sessionListOffset = 0;
  renderSessionList();
  syncUrl(state.selectedSessionId, "replace");
});

sessionListPrevBtn.addEventListener("click", () => {
  state.sessionListOffset = Math.max(0, state.sessionListOffset - MAX_VISIBLE_SESSIONS);
  renderSessionList();
});

sessionListNextBtn.addEventListener("click", () => {
  state.sessionListOffset += MAX_VISIBLE_SESSIONS;
  renderSessionList();
});

if (listResizeHandle) {
  listResizeHandle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    startResize(event.clientX);
  });

  listResizeHandle.addEventListener("keydown", (event) => {
    if (isMobileViewport()) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applySidebarWidth(currentSidebarWidth() - (event.shiftKey ? 48 : 24));
      persistState();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      applySidebarWidth(currentSidebarWidth() + (event.shiftKey ? 48 : 24));
      persistState();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      applySidebarWidth(MIN_SIDEBAR_WIDTH);
      persistState();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      applySidebarWidth(MAX_SIDEBAR_WIDTH);
      persistState();
    }
  });

  window.addEventListener("mousemove", handleResizeMove);
  window.addEventListener("mouseup", () => {
    stopResize(true);
  });
}

window.addEventListener("popstate", () => {
  const sessionId = applyUrlState();
  setSelectedSession(sessionId, { historyMode: "none", requestHistory: !!sessionId });
});

window.addEventListener("resize", () => {
  updateResponsiveLayout();
  if (state.sidebarWidth !== null) {
    applySidebarWidth(state.sidebarWidth);
  }
  syncExpandableFinalAnswerCards();
});

window.setInterval(refreshRelativeTimes, 1000);

const savedState = readSavedState();
projectPathInput.value = savedState.projectPath || "/workspace/mserver";
state.unreadSessionIds = new Set(savedState.unreadSessionIds || []);
modelInput.value = "gpt-5.4-mini";
modelReasoningEffortSelect.value = "xhigh";
bridgeUrlInput.value = socketUrlFromWindow();
applySidebarWidth(savedState.sidebarWidth === null ? DEFAULT_SIDEBAR_WIDTH : savedState.sidebarWidth);
renderProjectPathPicker();
ensureSocket();
const initialSessionId = applyUrlState();
setSelectedSession(initialSessionId, { historyMode: "replace", requestHistory: false });
