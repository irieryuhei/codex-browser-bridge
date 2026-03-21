const rootEl = document.documentElement
const layoutEl = document.getElementById("viewer2Layout")
const listPanelEl = document.getElementById("listPanel")
const viewerPanelEl = document.getElementById("viewerPanel")
const bridgeUrlInput = document.getElementById("bridgeUrl")
const projectPathInput = document.getElementById("projectPath")
const projectPathPicker = document.getElementById("projectPathPicker")
const modelInput = document.getElementById("modelInput")
const modelReasoningEffortSelect = document.getElementById("modelReasoningEffort")
const permissionModeSelect = document.getElementById("permissionMode")
const connectBtn = document.getElementById("connectBtn")
const startBtn = document.getElementById("startBtn")
const sessionFilterInput = document.getElementById("sessionFilterInput")
const sessionRepoFilter = document.getElementById("sessionRepoFilter")
const unreadOnlyFilter = document.getElementById("unreadOnlyFilter")
const includeAnsweringFilter = document.getElementById("includeAnsweringFilter")
const showCompletedFilter = document.getElementById("showCompletedFilter")
const sessionListPrevBtn = document.getElementById("sessionListPrevBtn")
const sessionListNextBtn = document.getElementById("sessionListNextBtn")
const sessionListSummary = document.getElementById("sessionListSummary")
const sessionsList = document.getElementById("sessionsList")
const connectionDot = document.getElementById("connectionDot")
const connectionLabel = document.getElementById("connectionLabel")
const runtimeLabel = document.getElementById("runtimeLabel")
const bridgeControls = document.getElementById("bridgeControls")
const viewerTitle = document.getElementById("viewerTitle")
const viewerSubtitle = document.getElementById("viewerSubtitle")
const viewerRepoBadge = document.getElementById("viewerRepoBadge")
const viewerModelBadge = document.getElementById("viewerModelBadge")
const viewerModeBadge = document.getElementById("viewerModeBadge")
const viewerBackBtn = document.getElementById("viewerBackBtn")
const viewerPinBtn = document.getElementById("viewerPinBtn")
const viewerCompleteBtn = document.getElementById("viewerCompleteBtn")
const permissionPanel = document.getElementById("permissionPanel")
const messagesEl = document.getElementById("messages")
const composerInput = document.getElementById("composerInput")
const sendBtn = document.getElementById("sendBtn")
const interruptBtn = document.getElementById("interruptBtn")
const forceSendToggle = document.getElementById("forceSendToggle")
const composerHint = document.getElementById("composerHint")
const listResizeHandle = document.getElementById("listResizeHandle")

const STORAGE_KEY = "codex-browser-bridge.viewer-next2"
const MAX_VISIBLE_SESSIONS = 10
const MAX_UNREAD_SESSIONS = 50
const DEFAULT_SIDEBAR_WIDTH = 360
const MIN_SIDEBAR_WIDTH = 280
const MAX_SIDEBAR_WIDTH = 760
const MIN_MAIN_WIDTH = 420
const RESIZER_WIDTH = 18
const FINAL_ANSWER_PREVIEW_LINES = 5

const viewerState = {
  socket: null,
  pendingPayloads: [],
  sessions: [],
  histories: new Map(),
  selectedSessionId: "",
  unreadSessionIds: new Set(),
  queuedDrafts: new Map(),
  knownProjectPaths: [],
  hydratedProjectPaths: false,
  pendingRepoValue: "",
  sessionOffset: 0,
  sidebarWidth: null,
  activeResize: null,
  openCollapsedTurns: new Set(),
  openFinalAnswers: new Set(),
}

function socketUrlFromLocation() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return protocol + "//" + window.location.host
}

function normalizeBridgeUrl(value) {
  const trimmed = String(value || "").trim()
  return trimmed || socketUrlFromLocation()
}

function loadLocalState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}")
    const savedWidth = Number(parsed.sidebarWidth)
    return {
      projectPath: typeof parsed.projectPath === "string" ? parsed.projectPath : "",
      unreadSessionIds: Array.isArray(parsed.unreadSessionIds)
        ? parsed.unreadSessionIds.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
      sidebarWidth: Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : null,
    }
  } catch {
    return { projectPath: "", unreadSessionIds: [], sidebarWidth: null }
  }
}

function saveLocalState() {
  const snapshot = {
    projectPath: projectPathInput.value,
    unreadSessionIds: Array.from(viewerState.unreadSessionIds),
  }
  if (Number.isFinite(viewerState.sidebarWidth) && viewerState.sidebarWidth > 0) {
    snapshot.sidebarWidth = Math.round(viewerState.sidebarWidth)
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

function shortProject(projectPath) {
  const normalized = String(projectPath || "").trim()
  if (!normalized) {
    return ""
  }
  const parts = normalized.split("/")
  return parts[parts.length - 1] || normalized
}

function stableHash(source) {
  let hash = 0
  const value = String(source || "")
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function sessionToneStyle(session) {
  const repo = shortProject(session && session.projectPath ? session.projectPath : "") || "unknown"
  const seed = stableHash(repo.toLowerCase())
  const anchors = [18, 42, 96, 155, 215, 328]
  const hue = anchors[seed % anchors.length] + ((seed % 7) - 3) * 4
  const saturation = 66 + (seed % 12)
  const background = 86 + ((seed >>> 3) % 6)
  const border = 50 + ((seed >>> 5) % 10)
  return [
    "--session-bg: hsl(" + hue + " " + saturation + "% " + background + "% / 0.92)",
    "--session-border: hsl(" + hue + " " + Math.max(saturation - 12, 52) + "% " + border + "% / 0.44)",
    "--session-ring: hsl(" + hue + " " + saturation + "% " + Math.max(border - 4, 40) + "% / 0.18)",
  ].join("; ")
}

function clampSidebarWidth(value) {
  const availableWidth = Math.max(0, window.innerWidth - MIN_MAIN_WIDTH - RESIZER_WIDTH - 28)
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, availableWidth || MAX_SIDEBAR_WIDTH))
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(value, maxWidth))
}

function applySidebarWidth(nextWidth) {
  const width = clampSidebarWidth(Number(nextWidth) || DEFAULT_SIDEBAR_WIDTH)
  viewerState.sidebarWidth = width
  rootEl.style.setProperty("--viewer2-sidebar-width", width + "px")
  if (listResizeHandle) {
    listResizeHandle.setAttribute("aria-valuenow", String(Math.round(width)))
  }
}

function currentSidebarWidth() {
  if (Number.isFinite(viewerState.sidebarWidth) && viewerState.sidebarWidth > 0) {
    return viewerState.sidebarWidth
  }
  return DEFAULT_SIDEBAR_WIDTH
}

function beginSidebarResize(clientX) {
  if (isMobileViewport()) {
    return
  }
  viewerState.activeResize = {
    startX: clientX,
    startWidth: currentSidebarWidth(),
  }
  document.body.classList.add("viewer2-resizing")
}

function finishSidebarResize(shouldPersist) {
  viewerState.activeResize = null
  document.body.classList.remove("viewer2-resizing")
  if (shouldPersist) {
    saveLocalState()
  }
}

function handleSidebarResizeMove(event) {
  if (!viewerState.activeResize) {
    return
  }
  const delta = event.clientX - viewerState.activeResize.startX
  applySidebarWidth(viewerState.activeResize.startWidth + delta)
}

function isMobileViewport() {
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 980px)").matches
  }
  return window.innerWidth <= 980
}

function applyResponsiveMode() {
  if (!layoutEl) {
    return
  }
  layoutEl.classList.remove("mobile-list-open", "mobile-main-open")
  if (!isMobileViewport()) {
    viewerBackBtn.hidden = true
    return
  }
  const showMain = !!viewerState.selectedSessionId
  layoutEl.classList.add(showMain ? "mobile-main-open" : "mobile-list-open")
  viewerBackBtn.hidden = !showMain
}

function currentUrlState() {
  const params = new URL(window.location.href).searchParams
  return {
    sessionId: String(params.get("session") || "").trim(),
    query: String(params.get("q") || ""),
    repo: String(params.get("repo") || ""),
    unreadOnly: parseUrlFlag(params.get("unreadOnly"), false),
    includeAnswering: parseUrlFlag(params.get("includeAnswering"), true),
    showCompleted: parseUrlFlag(params.get("showCompleted"), true),
  }
}

function parseUrlFlag(value, fallback) {
  if (value === null) {
    return fallback
  }
  const normalized = String(value).trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }
  return fallback
}

function applyUrlState() {
  const stateFromUrl = currentUrlState()
  sessionFilterInput.value = stateFromUrl.query
  viewerState.pendingRepoValue = stateFromUrl.repo
  sessionRepoFilter.value = stateFromUrl.repo
  unreadOnlyFilter.checked = stateFromUrl.unreadOnly
  includeAnsweringFilter.checked = stateFromUrl.includeAnswering
  showCompletedFilter.checked = stateFromUrl.showCompleted
  viewerState.sessionOffset = 0
  return stateFromUrl.sessionId
}

function syncUrl(sessionId, mode) {
  if (mode === "none") {
    return
  }
  const url = new URL(window.location.href)
  const query = String(sessionFilterInput.value || "").trim()
  const repo = currentRepoFilterValue()

  if (sessionId) {
    url.searchParams.set("session", sessionId)
  } else {
    url.searchParams.delete("session")
  }
  if (query) {
    url.searchParams.set("q", query)
  } else {
    url.searchParams.delete("q")
  }
  if (repo) {
    url.searchParams.set("repo", repo)
  } else {
    url.searchParams.delete("repo")
  }
  if (unreadOnlyFilter.checked) {
    url.searchParams.set("unreadOnly", "1")
  } else {
    url.searchParams.delete("unreadOnly")
  }
  if (!includeAnsweringFilter.checked) {
    url.searchParams.set("includeAnswering", "0")
  } else {
    url.searchParams.delete("includeAnswering")
  }
  if (!showCompletedFilter.checked) {
    url.searchParams.set("showCompleted", "0")
  } else {
    url.searchParams.delete("showCompleted")
  }

  const nextUrl = url.pathname + url.search + url.hash
  const current = window.location.pathname + window.location.search + window.location.hash
  if (nextUrl === current) {
    return
  }
  if (mode === "push") {
    window.history.pushState({ sessionId }, "", nextUrl)
  } else {
    window.history.replaceState({ sessionId }, "", nextUrl)
  }
}

function ensureSocket() {
  if (viewerState.socket && viewerState.socket.readyState === WebSocket.OPEN) {
    return viewerState.socket
  }
  if (viewerState.socket && viewerState.socket.readyState === WebSocket.CONNECTING) {
    return viewerState.socket
  }

  const socket = new WebSocket(normalizeBridgeUrl(bridgeUrlInput.value))
  bridgeUrlInput.value = socket.url
  viewerState.socket = socket
  setConnectionState(false)

  socket.addEventListener("open", () => {
    if (viewerState.socket !== socket) {
      return
    }
    setConnectionState(true)
    flushPendingPayloads()
  })

  socket.addEventListener("close", () => {
    if (viewerState.socket !== socket) {
      return
    }
    setConnectionState(false)
  })

  socket.addEventListener("message", (event) => {
    if (viewerState.socket !== socket) {
      return
    }
    let payload = null
    try {
      payload = JSON.parse(String(event.data || ""))
    } catch {
      payload = null
    }
    if (!payload || typeof payload !== "object") {
      return
    }
    handleServerPayload(payload)
  })

  return socket
}

function sendPayload(payload) {
  const socket = ensureSocket()
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
    return
  }
  viewerState.pendingPayloads.push(payload)
}

function flushPendingPayloads() {
  if (!viewerState.socket || viewerState.socket.readyState !== WebSocket.OPEN) {
    return
  }
  viewerState.socket.send(JSON.stringify({ type: "list_sessions" }))
  while (viewerState.pendingPayloads.length > 0) {
    viewerState.socket.send(JSON.stringify(viewerState.pendingPayloads.shift()))
  }
}

function setConnectionState(connected) {
  connectionDot.classList.toggle("connected", connected)
  connectionLabel.textContent = connected ? "Connected" : "Disconnected"
  bridgeControls.hidden = connected
  updateComposerState()
}

function normalizeProjectPaths(projectPaths) {
  const unique = []
  const seen = new Set()
  if (!Array.isArray(projectPaths)) {
    return unique
  }
  projectPaths.forEach((entry) => {
    const normalized = typeof entry === "string" ? entry.trim() : ""
    if (!normalized || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    unique.push(normalized)
  })
  return unique.slice(0, 12)
}

function projectPathChoices() {
  const fromSessions = viewerState.sessions.slice(0, MAX_VISIBLE_SESSIONS).map((session) => session.projectPath)
  return normalizeProjectPaths([...fromSessions, ...viewerState.knownProjectPaths])
}

function renderProjectPathPicker() {
  const choices = projectPathChoices()
  const duplicates = new Set()
  const counts = new Map()

  choices.forEach((projectPath) => {
    const short = shortProject(projectPath) || projectPath
    const nextCount = (counts.get(short) || 0) + 1
    counts.set(short, nextCount)
    if (nextCount > 1) {
      duplicates.add(short)
    }
  })

  projectPathPicker.replaceChildren()
  const placeholder = document.createElement("option")
  placeholder.value = ""
  placeholder.textContent = "Select a repository"
  projectPathPicker.appendChild(placeholder)

  choices.forEach((projectPath) => {
    const option = document.createElement("option")
    const short = shortProject(projectPath) || projectPath
    option.value = projectPath
    option.textContent = duplicates.has(short) ? projectPath : short
    projectPathPicker.appendChild(option)
  })
  projectPathPicker.hidden = false

  const normalized = String(projectPathInput.value || "").trim()
  if (!normalized) {
    projectPathPicker.value = ""
    return
  }
  const hasExact = Array.from(projectPathPicker.options).some((option) => option.value === normalized)
  projectPathPicker.value = hasExact ? normalized : ""
}

function currentSession() {
  return viewerState.sessions.find((session) => session.sessionId === viewerState.selectedSessionId) || null
}

function currentRepoFilterValue() {
  return String(sessionRepoFilter.value || viewerState.pendingRepoValue || "").trim().toLowerCase()
}

function selectSession(sessionId, options) {
  const settings = {
    historyMode: "replace",
    requestHistory: true,
    ...options,
  }
  viewerState.selectedSessionId = sessionId || ""
  syncUrl(viewerState.selectedSessionId, settings.historyMode)

  if (viewerState.selectedSessionId && settings.requestHistory) {
    sendPayload({ type: "get_history", sessionId: viewerState.selectedSessionId })
    clearUnread(viewerState.selectedSessionId)
  }

  renderSessionList()
  renderViewer()
  applyResponsiveMode()
}

function parseHistoryKey(message) {
  if (!message || typeof message !== "object") {
    return JSON.stringify(message)
  }
  if (message.type === "assistant") {
    const assistantMessage = message.message && typeof message.message === "object" ? message.message : {}
    return JSON.stringify({
      type: message.type,
      timestamp: message.timestamp || "",
      phase: assistantMessage.phase || "",
      content: Array.isArray(assistantMessage.content) ? assistantMessage.content : [],
    })
  }
  return JSON.stringify({
    type: message.type,
    timestamp: message.timestamp || "",
    id: message.id || "",
    text: message.text || "",
    message: message.message || "",
  })
}

function mergeHistorySnapshot(sessionId, incomingMessages) {
  const currentMessages = viewerState.histories.get(sessionId) || []
  if (currentMessages.length === 0) {
    return incomingMessages.slice()
  }
  if (incomingMessages.length === 0) {
    return currentMessages.slice()
  }

  const merged = incomingMessages.slice()
  const seen = new Set(merged.map(parseHistoryKey))
  currentMessages.forEach((message) => {
    const key = parseHistoryKey(message)
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    merged.push(message)
  })
  return merged
}

function isLiveHistoryPayload(payload) {
  return ["user", "thinking_delta", "stream_delta", "assistant", "tool_result", "error"].includes(payload.type)
}

function appendHistoryMessage(sessionId, payload) {
  const history = viewerState.histories.get(sessionId) || []
  history.push(payload)
  viewerState.histories.set(sessionId, history)
}

function enqueueDraft(sessionId, text) {
  const queue = viewerState.queuedDrafts.get(sessionId) || []
  queue.push(text)
  viewerState.queuedDrafts.set(sessionId, queue)
}

function shiftDraft(sessionId, text) {
  const queue = viewerState.queuedDrafts.get(sessionId) || []
  const index = queue.findIndex((entry) => entry === text)
  if (index >= 0) {
    queue.splice(index, 1)
  } else if (queue.length > 0) {
    queue.shift()
  }
  viewerState.queuedDrafts.set(sessionId, queue)
}

function reconcileDrafts(sessionId) {
  const queue = viewerState.queuedDrafts.get(sessionId) || []
  if (queue.length === 0) {
    return
  }
  const history = viewerState.histories.get(sessionId) || []
  viewerState.queuedDrafts.set(sessionId, queue.filter((draft) => {
    return !history.some((item) => item.type === "user" && item.text === draft)
  }))
}

function pruneUnreadSessions() {
  const trackedIds = new Set(viewerState.sessions.slice(0, MAX_UNREAD_SESSIONS).map((session) => session.sessionId))
  let changed = false
  Array.from(viewerState.unreadSessionIds).forEach((sessionId) => {
    if (!trackedIds.has(sessionId)) {
      viewerState.unreadSessionIds.delete(sessionId)
      changed = true
    }
  })
  if (changed) {
    saveLocalState()
  }
}

function markUnread(sessionId) {
  if (!sessionId || sessionId === viewerState.selectedSessionId) {
    return
  }
  if (!viewerState.unreadSessionIds.has(sessionId)) {
    viewerState.unreadSessionIds.add(sessionId)
    pruneUnreadSessions()
    saveLocalState()
  }
}

function clearUnread(sessionId) {
  if (!sessionId) {
    return
  }
  if (viewerState.unreadSessionIds.delete(sessionId)) {
    saveLocalState()
  }
}

function patchSession(sessionId, patch) {
  viewerState.sessions = viewerState.sessions.map((session) => {
    if (session.sessionId !== sessionId) {
      return session
    }
    return { ...session, ...patch }
  })
}

function handleServerPayload(payload) {
  if (payload.type === "system" && payload.subtype === "session_created") {
    if (typeof payload.projectPath === "string") {
      projectPathInput.value = payload.projectPath
      saveLocalState()
      renderProjectPathPicker()
    }
    if (typeof payload.model === "string") {
      modelInput.value = payload.model
    }
    if (typeof payload.modelReasoningEffort === "string" && payload.modelReasoningEffort) {
      modelReasoningEffortSelect.value = payload.modelReasoningEffort
    }
    if (payload.permissionMode === "plan" || payload.permissionMode === "default") {
      permissionModeSelect.value = payload.permissionMode
    }
    selectSession(String(payload.sessionId || ""), { historyMode: "push", requestHistory: true })
    sendPayload({ type: "list_sessions" })
    return
  }

  if (payload.type === "session_list") {
    viewerState.sessions = Array.isArray(payload.sessions) ? payload.sessions : []
    viewerState.knownProjectPaths = normalizeProjectPaths(
      Array.isArray(payload.selectableProjectPaths) ? payload.selectableProjectPaths : payload.projectPaths,
    )
    pruneUnreadSessions()
    renderProjectPathPicker()

    const choices = projectPathChoices()
    if (
      !viewerState.hydratedProjectPaths
      && choices.length > 0
      && (!projectPathInput.value || projectPathInput.value === "/workspace/mserver")
    ) {
      projectPathInput.value = choices[0]
      saveLocalState()
      renderProjectPathPicker()
    }
    if (choices.length > 0) {
      viewerState.hydratedProjectPaths = true
    }

    if (viewerState.selectedSessionId && !viewerState.sessions.some((session) => session.sessionId === viewerState.selectedSessionId)) {
      selectSession("", { historyMode: "replace", requestHistory: false })
      return
    }
    if (viewerState.selectedSessionId && !viewerState.histories.has(viewerState.selectedSessionId)) {
      sendPayload({ type: "get_history", sessionId: viewerState.selectedSessionId })
    }
    renderSessionList()
    renderViewer()
    return
  }

  if (payload.type === "history" && typeof payload.sessionId === "string") {
    const incomingMessages = Array.isArray(payload.messages) ? payload.messages : []
    viewerState.histories.set(payload.sessionId, mergeHistorySnapshot(payload.sessionId, incomingMessages))
    reconcileDrafts(payload.sessionId)
    if (payload.sessionId === viewerState.selectedSessionId) {
      clearUnread(payload.sessionId)
    }
    renderSessionList()
    if (payload.sessionId === viewerState.selectedSessionId) {
      renderMessages()
    }
    return
  }

  if (payload.type === "status" && typeof payload.sessionId === "string") {
    patchSession(payload.sessionId, {
      status: payload.status || "idle",
      updatedAt: payload.timestamp || new Date().toISOString(),
    })
    renderSessionList()
    renderViewer()
    return
  }

  if (payload.type === "input_ack" && typeof payload.sessionId === "string") {
    if (payload.queued === true && typeof payload.text === "string") {
      enqueueDraft(payload.sessionId, payload.text)
    }
    updateComposerState()
    return
  }

  if (typeof payload.sessionId === "string" && isLiveHistoryPayload(payload)) {
    appendHistoryMessage(payload.sessionId, payload)
    if (payload.type === "user") {
      shiftDraft(payload.sessionId, payload.text || "")
    }
    if (payload.sessionId === viewerState.selectedSessionId) {
      clearUnread(payload.sessionId)
      renderMessages()
    } else {
      markUnread(payload.sessionId)
    }
    renderSessionList()
  }
}

function normalizedSearch() {
  return String(sessionFilterInput.value || "").trim().toLowerCase()
}

function currentFilters() {
  return {
    query: normalizedSearch(),
    repo: currentRepoFilterValue(),
    unreadOnly: unreadOnlyFilter.checked,
    includeAnswering: includeAnsweringFilter.checked,
    showCompleted: showCompletedFilter.checked,
  }
}

function isSettled(session) {
  return !!session && session.answerState === "final_answer"
}

function isUnread(session) {
  return !!session && viewerState.unreadSessionIds.has(session.sessionId)
}

function matchesFilters(session, filters) {
  if (filters.query) {
    const haystacks = [session.title, session.projectPath, session.preview]
      .map((value) => String(value || "").toLowerCase())
    if (!haystacks.some((value) => value.includes(filters.query))) {
      return false
    }
  }
  if (filters.repo && shortProject(session.projectPath).toLowerCase() !== filters.repo) {
    return false
  }
  if (filters.unreadOnly && !isUnread(session)) {
    return false
  }
  if (!filters.includeAnswering && !isSettled(session)) {
    return false
  }
  if (!filters.showCompleted && session.completed === true) {
    return false
  }
  return true
}

function clampSessionOffset(offset, totalCount) {
  if (totalCount <= 0) {
    return 0
  }
  const lastPageOffset = Math.floor((totalCount - 1) / MAX_VISIBLE_SESSIONS) * MAX_VISIBLE_SESSIONS
  return Math.max(0, Math.min(offset, lastPageOffset))
}

function renderRepoFilterOptions(visibleSessions) {
  const currentValue = currentRepoFilterValue()
  const repos = []
  const seen = new Set()
  visibleSessions.forEach((session) => {
    const repo = shortProject(session.projectPath).trim().toLowerCase()
    if (!repo || seen.has(repo)) {
      return
    }
    seen.add(repo)
    repos.push(repo)
  })

  sessionRepoFilter.replaceChildren()
  const allOption = document.createElement("option")
  allOption.value = ""
  allOption.textContent = "All repositories"
  sessionRepoFilter.appendChild(allOption)

  repos.forEach((repo) => {
    const option = document.createElement("option")
    option.value = repo
    option.textContent = repo
    sessionRepoFilter.appendChild(option)
  })

  if (currentValue && !seen.has(currentValue)) {
    const option = document.createElement("option")
    option.value = currentValue
    option.textContent = currentValue
    sessionRepoFilter.appendChild(option)
    seen.add(currentValue)
  }

  sessionRepoFilter.value = currentValue && seen.has(currentValue) ? currentValue : ""
  viewerState.pendingRepoValue = ""
}

function sessionRelativeTime(session) {
  const timestamp = session && session.answerState === "final_answer"
    ? (session.finalAnswerAt || session.updatedAt)
    : session.updatedAt
  return relativeTime(timestamp)
}

function relativeTime(timestamp) {
  const parsed = Date.parse(String(timestamp || ""))
  if (Number.isNaN(parsed)) {
    return ""
  }
  const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000))
  if (seconds < 60) {
    return seconds + " sec ago"
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return minutes + " min ago"
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return hours + " hr ago"
  }
  const days = Math.floor(hours / 24)
  return days + " day ago"
}

function shouldShowSpinner(session) {
  return session.status !== "stopped" && session.answerState === "commentary"
}

function updateSessionSummaryLabel(visibleCount, totalCount, offset) {
  if (totalCount === 0) {
    sessionListSummary.textContent = viewerState.sessions.length === 0 ? "No conversations yet." : "No matching conversations."
    return
  }
  if (offset <= 0) {
    sessionListSummary.textContent = "Showing " + visibleCount + " of " + totalCount + " conversations"
    return
  }
  sessionListSummary.textContent = "Showing " + (offset + 1) + "-" + (offset + visibleCount) + " of " + totalCount + " conversations"
}

function renderSessionList() {
  sessionsList.replaceChildren()
  const filters = currentFilters()
  const filteredSessions = viewerState.sessions.filter((session) => matchesFilters(session, filters))
  viewerState.sessionOffset = clampSessionOffset(viewerState.sessionOffset, filteredSessions.length)
  const visibleSessions = filteredSessions.slice(viewerState.sessionOffset, viewerState.sessionOffset + MAX_VISIBLE_SESSIONS)

  renderRepoFilterOptions(visibleSessions)
  sessionListPrevBtn.disabled = viewerState.sessionOffset === 0
  sessionListNextBtn.disabled = viewerState.sessionOffset + MAX_VISIBLE_SESSIONS >= filteredSessions.length
  updateSessionSummaryLabel(visibleSessions.length, filteredSessions.length, viewerState.sessionOffset)

  if (filteredSessions.length === 0) {
    const empty = document.createElement("div")
    empty.className = "viewer2-hint"
    empty.textContent = viewerState.sessions.length === 0 ? "No conversations yet." : "No matching conversations."
    sessionsList.appendChild(empty)
    return
  }

  const hasPinned = visibleSessions.some((session) => session.pinned)
  const hasRegular = visibleSessions.some((session) => !session.pinned)
  let insertedDivider = false

  visibleSessions.forEach((session) => {
    if (hasPinned && hasRegular && !insertedDivider && !session.pinned) {
      const divider = document.createElement("hr")
      divider.className = "viewer2-divider"
      sessionsList.appendChild(divider)
      insertedDivider = true
    }

    const button = document.createElement("button")
    button.type = "button"
    button.className = "viewer2-session-btn"
    button.dataset.sessionId = session.sessionId
    button.setAttribute("style", sessionToneStyle(session))
    if (session.sessionId === viewerState.selectedSessionId) {
      button.classList.add("active")
    }
    if (session.pinned) {
      button.classList.add("pinned")
    }
    if (session.completed) {
      button.classList.add("completed")
    }

    const top = document.createElement("div")
    top.className = "viewer2-session-top"
    const titleWrap = document.createElement("div")
    titleWrap.className = "viewer2-session-title-wrap"

    const title = document.createElement("div")
    title.className = "viewer2-session-title"
    title.textContent = session.title || session.sessionId
    titleWrap.appendChild(title)

    if (isUnread(session)) {
      const unread = document.createElement("span")
      unread.className = "viewer2-chip unread"
      unread.textContent = "Unread"
      titleWrap.appendChild(unread)
    }

    const timeLabel = sessionRelativeTime(session)
    if (timeLabel) {
      const time = document.createElement("span")
      time.className = "viewer2-session-time"
      time.textContent = timeLabel
      titleWrap.appendChild(time)
    }
    top.appendChild(titleWrap)

    if (shouldShowSpinner(session)) {
      const status = document.createElement("span")
      status.className = "viewer2-status-indicator"
      status.dataset.sessionSpinner = session.sessionId
      const spinner = document.createElement("span")
      spinner.className = "viewer2-spinner"
      spinner.setAttribute("aria-hidden", "true")
      status.appendChild(spinner)
      const label = document.createElement("span")
      label.textContent = "Answering"
      status.appendChild(label)
      top.appendChild(status)
    }

    const preview = document.createElement("div")
    preview.className = "viewer2-session-preview"
    preview.textContent = session.preview || "No messages yet."

    button.appendChild(top)
    button.appendChild(preview)
    button.addEventListener("click", () => {
      selectSession(session.sessionId, { historyMode: "push", requestHistory: true })
    })

    sessionsList.appendChild(button)
  })
}

function setBadge(element, text, hidden) {
  element.hidden = hidden
  element.textContent = hidden ? "" : text
}

function modelLabel(session) {
  const model = typeof session.model === "string" ? session.model.trim() : ""
  const effort = typeof session.modelReasoningEffort === "string" ? session.modelReasoningEffort.trim() : ""
  if (!model) {
    return ""
  }
  return effort ? model + " / effort: " + effort : model
}

function renderViewer() {
  const session = currentSession()
  if (!session) {
    viewerTitle.textContent = "No session selected"
    viewerSubtitle.textContent = "Start a new chat or choose a conversation from the list."
    runtimeLabel.textContent = "No session selected"
    setBadge(viewerRepoBadge, "", true)
    setBadge(viewerModelBadge, "", true)
    setBadge(viewerModeBadge, "", true)
    viewerPinBtn.disabled = true
    viewerCompleteBtn.disabled = true
    permissionPanel.hidden = true
    messagesEl.replaceChildren()
    updateComposerState()
    applyResponsiveMode()
    return
  }

  viewerTitle.textContent = session.title || session.sessionId
  viewerSubtitle.textContent = session.preview || "No messages yet."
  runtimeLabel.textContent = (session.title || session.sessionId) + " / " + (session.status || "idle")
  setBadge(viewerRepoBadge, shortProject(session.projectPath) ? "repo: " + shortProject(session.projectPath) : "", !shortProject(session.projectPath))
  setBadge(viewerModelBadge, session.model ? "model: " + modelLabel(session) : "", !session.model)
  setBadge(viewerModeBadge, session.permissionMode === "plan" ? "mode: plan" : "", session.permissionMode !== "plan")
  viewerPinBtn.disabled = false
  viewerCompleteBtn.disabled = false
  viewerPinBtn.textContent = session.pinned ? "Unpin" : "Pin"
  viewerCompleteBtn.textContent = session.completed ? "Mark Active" : "Complete"
  renderPermissionPanel(session)
  renderMessages()
  updateComposerState()
  applyResponsiveMode()
}

function createActionButton(config) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = config.className
  button.textContent = config.text
  if (config.id) {
    button.id = config.id
  }
  button.addEventListener("click", config.onClick)
  return button
}

function renderPermissionPanel(session) {
  permissionPanel.replaceChildren()
  if (!session.pendingPermission) {
    permissionPanel.hidden = true
    return
  }

  permissionPanel.hidden = false
  const header = document.createElement("h3")
  header.textContent = session.pendingPermission.toolName === "ExitPlanMode"
    ? "Plan Review"
    : session.pendingPermission.toolName === "AskUserQuestion"
      ? "Question"
      : "Approval"
  permissionPanel.appendChild(header)

  if (session.pendingPermission.toolName === "ExitPlanMode") {
    const preview = document.createElement("div")
    preview.className = "viewer2-hint"
    preview.textContent = typeof session.pendingPermission.input.plan === "string" ? session.pendingPermission.input.plan : ""
    permissionPanel.appendChild(preview)

    const textarea = document.createElement("textarea")
    textarea.id = "permissionPlanInput"
    textarea.value = typeof session.pendingPermission.input.plan === "string" ? session.pendingPermission.input.plan : ""
    permissionPanel.appendChild(textarea)

    const actions = document.createElement("div")
    actions.className = "viewer2-actions"
    actions.appendChild(createActionButton({
      id: "approvePermissionBtn",
      text: "Approve Plan",
      className: "btn primary",
      onClick() {
        sendPayload({
          type: "approve",
          sessionId: session.sessionId,
          toolUseId: session.pendingPermission.toolUseId,
          updatedInput: { plan: textarea.value },
        })
      },
    }))
    actions.appendChild(createActionButton({
      id: "rejectPermissionBtn",
      text: "Send Back",
      className: "btn ghost",
      onClick() {
        sendPayload({
          type: "reject",
          sessionId: session.sessionId,
          toolUseId: session.pendingPermission.toolUseId,
          message: textarea.value,
        })
      },
    }))
    permissionPanel.appendChild(actions)
    return
  }

  if (session.pendingPermission.toolName === "AskUserQuestion") {
    const prompt = document.createElement("div")
    prompt.className = "viewer2-hint"
    const firstQuestion = Array.isArray(session.pendingPermission.input.questions)
      ? session.pendingPermission.input.questions[0]
      : null
    prompt.textContent = firstQuestion && firstQuestion.question ? firstQuestion.question : "Answer required"
    permissionPanel.appendChild(prompt)

    const textarea = document.createElement("textarea")
    textarea.id = "permissionAnswerInput"
    permissionPanel.appendChild(textarea)

    permissionPanel.appendChild(createActionButton({
      id: "answerPermissionBtn",
      text: "Send Answer",
      className: "btn primary",
      onClick() {
        sendPayload({
          type: "answer",
          sessionId: session.sessionId,
          toolUseId: session.pendingPermission.toolUseId,
          result: textarea.value,
        })
      },
    }))
    return
  }

  const pre = document.createElement("pre")
  pre.textContent = JSON.stringify(session.pendingPermission.input, null, 2)
  permissionPanel.appendChild(pre)

  const actions = document.createElement("div")
  actions.className = "viewer2-actions"
  actions.appendChild(createActionButton({
    id: "approvePermissionBtn",
    text: "Approve",
    className: "btn primary",
    onClick() {
      sendPayload({
        type: "approve",
        sessionId: session.sessionId,
        toolUseId: session.pendingPermission.toolUseId,
      })
    },
  }))
  actions.appendChild(createActionButton({
    id: "rejectPermissionBtn",
    text: "Reject",
    className: "btn ghost",
    onClick() {
      sendPayload({
        type: "reject",
        sessionId: session.sessionId,
        toolUseId: session.pendingPermission.toolUseId,
      })
    },
  }))
  permissionPanel.appendChild(actions)
}

function updateComposerState() {
  const connected = !!viewerState.socket && viewerState.socket.readyState === WebSocket.OPEN
  const session = currentSession()
  composerInput.disabled = !connected || !session
  sendBtn.disabled = !connected || !session
  interruptBtn.disabled = !connected || !session || session.status !== "running"
  forceSendToggle.disabled = !connected || !session

  if (!connected) {
    composerHint.textContent = "Reconnect the bridge to send prompts."
    return
  }
  if (!session) {
    composerHint.textContent = "Select a conversation to send a prompt."
    return
  }
  if (session.status === "stopped") {
    composerHint.textContent = "Send a prompt to resume this stored session."
    return
  }
  if (session.status === "running") {
    composerHint.textContent = "Enable Force Send to submit immediately instead of queueing."
    return
  }
  if ((session.queueLength || 0) > 0) {
    composerHint.textContent = "New prompts will be queued until the current turn finishes."
    return
  }
  composerHint.textContent = ""
}

function buildDisplayEntries(history) {
  const entries = []
  history.forEach((item) => {
    if (item.type === "user") {
      entries.push({
        role: "user",
        text: item.text || "",
        timestamp: item.timestamp,
      })
      return
    }

    if (item.type === "thinking_delta") {
      const last = entries[entries.length - 1]
      if (last && last.role === "thinking" && last.deltaId === (item.id || "")) {
        last.text += item.text || ""
        return
      }
      entries.push({
        role: "thinking",
        deltaId: item.id || "",
        text: item.text || "",
        timestamp: item.timestamp,
      })
      return
    }

    if (item.type === "stream_delta") {
      const last = entries[entries.length - 1]
      if (last && last.role === "draft" && last.deltaId === (item.id || "")) {
        last.text += item.text || ""
        return
      }
      entries.push({
        role: "draft",
        deltaId: item.id || "",
        text: item.text || "",
        timestamp: item.timestamp,
      })
      return
    }

    if (item.type === "assistant" && item.message) {
      const content = Array.isArray(item.message.content) ? item.message.content : []
      const hasToolUse = content.some((entry) => entry && entry.type === "tool_use")
      if (hasToolUse) {
        return
      }
      const text = content
        .filter((entry) => entry && entry.type === "text")
        .map((entry) => entry.text || "")
        .join("\n")
        .trim()
      if (!text) {
        return
      }
      entries.push({
        role: "assistant",
        phase: item.message.phase || null,
        id: item.message.id || "",
        text,
        timestamp: item.timestamp,
      })
      return
    }

    if (item.type === "error") {
      entries.push({
        role: "error",
        text: item.message || "",
        timestamp: item.timestamp,
      })
    }
  })
  return entries
}

function buildConversationBlocks(entries) {
  const blocks = []
  let activeTurn = null
  let lastUser = null

  function flushTurn() {
    if (!activeTurn || activeTurn.items.length === 0) {
      activeTurn = null
      return
    }

    if (activeTurn.finalItem) {
      const collapsedItems = activeTurn.items.filter((item) => item !== activeTurn.finalItem)
      if (collapsedItems.length > 0) {
        blocks.push({
          type: "collapsed",
          sessionId: viewerState.selectedSessionId,
          items: collapsedItems,
          finalItem: activeTurn.finalItem,
          userItem: activeTurn.userItem,
        })
      }
      blocks.push({ type: "message", item: activeTurn.finalItem })
    } else {
      activeTurn.items.forEach((item) => blocks.push({ type: "message", item }))
    }
    activeTurn = null
  }

  entries.forEach((entry) => {
    if (entry.role === "user") {
      flushTurn()
      blocks.push({ type: "message", item: entry })
      lastUser = entry
      return
    }

    const isTurnEntry = entry.role === "thinking" || entry.role === "draft" || entry.role === "assistant"
    if (!isTurnEntry) {
      flushTurn()
      blocks.push({ type: "message", item: entry })
      return
    }

    if (!activeTurn) {
      activeTurn = {
        items: [],
        finalItem: null,
        userItem: lastUser,
      }
    }
    activeTurn.items.push(entry)
    if (entry.role === "assistant" && entry.phase === "final_answer") {
      activeTurn.finalItem = entry
    }
  })

  flushTurn()
  return blocks
}

function collapseKey(block) {
  const finalKey = block.finalItem
    ? [block.finalItem.id || "", block.finalItem.timestamp || "", block.finalItem.text || ""].join("|")
    : ""
  const userKey = block.userItem
    ? [block.userItem.timestamp || "", block.userItem.text || ""].join("|")
    : ""
  return [viewerState.selectedSessionId || "", userKey, finalKey].join("::")
}

function finalAnswerKey(item) {
  return item.id || [item.phase || "", item.timestamp || "", item.text || ""].join("|")
}

function elapsedLabel(start, end) {
  const startMs = Date.parse(String(start || ""))
  const endMs = Date.parse(String(end || ""))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return ""
  }
  const totalSeconds = Math.round((endMs - startMs) / 1000)
  if (totalSeconds < 60) {
    return totalSeconds + "s"
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? minutes + "m " + seconds + "s" : minutes + "m"
}

function renderCollapsedBlock(block) {
  const details = document.createElement("details")
  details.className = "viewer2-collapse"
  const key = collapseKey(block)
  details.open = viewerState.openCollapsedTurns.has(key)
  details.addEventListener("toggle", () => {
    if (details.open) {
      viewerState.openCollapsedTurns.add(key)
    } else {
      viewerState.openCollapsedTurns.delete(key)
    }
  })

  const summary = document.createElement("summary")
  const left = document.createElement("strong")
  left.textContent = "Intermediate turn (" + block.items.length + ")"
  const right = document.createElement("span")
  const elapsed = elapsedLabel(block.userItem ? block.userItem.timestamp : "", block.finalItem ? block.finalItem.timestamp : "")
  right.textContent = elapsed ? "Elapsed " + elapsed : "Intermediate turn"
  summary.appendChild(left)
  summary.appendChild(right)
  details.appendChild(summary)

  const body = document.createElement("div")
  body.className = "viewer2-collapse-body"
  block.items.slice().reverse().forEach((item) => {
    body.appendChild(renderMessageCard(item))
  })
  details.appendChild(body)
  return details
}

function labelForEntry(item) {
  if (item.role === "user") {
    return "You"
  }
  if (item.role === "thinking") {
    return "Thinking"
  }
  if (item.role === "draft") {
    return "Draft"
  }
  if (item.role === "error") {
    return "Error"
  }
  if (item.phase === "final_answer") {
    return "Final Answer"
  }
  return "Assistant"
}

function renderedLineCount(text, body) {
  const rectWidth = typeof body.getBoundingClientRect === "function" ? body.getBoundingClientRect().width : 0
  const charsPerLine = rectWidth > 0 ? Math.max(24, Math.floor(rectWidth / 8)) : 72
  return String(text || "").split(/\r?\n/).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(line.length / charsPerLine))
  }, 0)
}

function isExpandableFinal(body) {
  const text = String(body.textContent || "")
  if (!text.trim()) {
    return false
  }
  const computed = typeof window.getComputedStyle === "function" ? window.getComputedStyle(body) : null
  const lineHeight = computed ? parseFloat(computed.lineHeight || "") : NaN
  const scrollHeight = Number(body.scrollHeight)
  if (Number.isFinite(scrollHeight) && scrollHeight > 0 && Number.isFinite(lineHeight) && lineHeight > 0) {
    return scrollHeight > (lineHeight * FINAL_ANSWER_PREVIEW_LINES) + 1
  }
  return renderedLineCount(text, body) > FINAL_ANSWER_PREVIEW_LINES
}

function syncExpandableCard(card) {
  const body = card.querySelector(".viewer2-card-body")
  const toggle = card.querySelector(".viewer2-expand")
  if (!body || !toggle) {
    return
  }

  const expandable = isExpandableFinal(body)
  card.dataset.expandable = expandable ? "true" : "false"
  if (!expandable) {
    card.classList.remove("expandable")
    card.dataset.expanded = "false"
    toggle.hidden = true
    toggle.textContent = "Show more"
    toggle.setAttribute("aria-expanded", "false")
    return
  }

  card.classList.add("expandable")
  const key = card.dataset.finalAnswerKey || ""
  const expanded = key ? viewerState.openFinalAnswers.has(key) : false
  card.dataset.expanded = expanded ? "true" : "false"
  toggle.hidden = false
  toggle.textContent = expanded ? "Show less" : "Show more"
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false")
}

function syncExpandableCards() {
  Array.from(messagesEl.querySelectorAll(".viewer2-card.final[data-final-answer-key]")).forEach((node) => {
    syncExpandableCard(node)
  })
}

function renderMessageCard(item) {
  const isFinal = item.role === "assistant" && item.phase === "final_answer"
  const kind = isFinal
    ? "final"
    : item.role === "assistant" || item.role === "thinking" || item.role === "draft"
      ? "commentary"
      : item.role

  const card = document.createElement("article")
  card.className = "viewer2-card " + kind

  const head = document.createElement("div")
  head.className = "viewer2-card-head"
  const label = document.createElement("span")
  label.textContent = labelForEntry(item)
  head.appendChild(label)
  const time = relativeTime(item.timestamp)
  if (time) {
    const timeNode = document.createElement("span")
    timeNode.className = "viewer2-card-time"
    timeNode.dataset.timestamp = String(item.timestamp || "")
    timeNode.textContent = time
    head.appendChild(timeNode)
  }
  card.appendChild(head)

  const body = document.createElement("div")
  body.className = "viewer2-card-body"
  body.textContent = item.text || ""
  card.appendChild(body)

  if (isFinal) {
    const key = finalAnswerKey(item)
    card.dataset.finalAnswerKey = key
    card.dataset.expanded = "false"

    const footer = document.createElement("div")
    footer.className = "viewer2-card-footer"
    const toggle = document.createElement("button")
    toggle.type = "button"
    toggle.className = "viewer2-expand"
    toggle.hidden = true
    toggle.textContent = "Show more"
    toggle.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (card.dataset.expandable !== "true") {
        return
      }
      if (viewerState.openFinalAnswers.has(key)) {
        viewerState.openFinalAnswers.delete(key)
      } else {
        viewerState.openFinalAnswers.add(key)
      }
      syncExpandableCard(card)
    })
    footer.appendChild(toggle)
    card.appendChild(footer)
  }

  return card
}

function refreshMessageTimes() {
  Array.from(messagesEl.querySelectorAll(".viewer2-card-time[data-timestamp]")).forEach((node) => {
    node.textContent = relativeTime(node.dataset.timestamp || "")
  })
}

function renderMessages() {
  const session = currentSession()
  messagesEl.replaceChildren()
  if (!session) {
    return
  }

  const history = viewerState.histories.get(session.sessionId) || []
  const entries = buildDisplayEntries(history)
  const blocks = buildConversationBlocks(entries)
  const nodes = blocks.slice().reverse().map((block) => {
    return block.type === "collapsed" ? renderCollapsedBlock(block) : renderMessageCard(block.item)
  })
  messagesEl.replaceChildren(...nodes)
  syncExpandableCards()
  refreshMessageTimes()
}

function refreshSessionTimes() {
  if (viewerState.sessions.length > 0) {
    renderSessionList()
  }
  if (viewerState.selectedSessionId) {
    refreshMessageTimes()
  }
}

connectBtn.addEventListener("click", () => {
  if (viewerState.socket) {
    viewerState.socket.close()
  }
  viewerState.socket = null
  ensureSocket()
})

startBtn.addEventListener("click", () => {
  saveLocalState()
  sendPayload({
    type: "start",
    projectPath: projectPathInput.value,
    model: modelInput.value,
    modelReasoningEffort: modelReasoningEffortSelect.value,
    permissionMode: permissionModeSelect.value,
  })
})

viewerPinBtn.addEventListener("click", () => {
  const session = currentSession()
  if (!session) {
    return
  }
  sendPayload({
    type: "set_session_pin",
    sessionId: session.sessionId,
    pinned: !session.pinned,
  })
})

viewerCompleteBtn.addEventListener("click", () => {
  const session = currentSession()
  if (!session) {
    return
  }
  sendPayload({
    type: "set_session_completion",
    sessionId: session.sessionId,
    completed: !session.completed,
  })
})

viewerBackBtn.addEventListener("click", () => {
  selectSession("", { historyMode: "push", requestHistory: false })
})

sendBtn.addEventListener("click", () => {
  const session = currentSession()
  const text = String(composerInput.value || "").trim()
  if (!session || !text) {
    return
  }
  composerInput.value = ""
  updateComposerState()
  sendPayload({
    type: "input",
    sessionId: session.sessionId,
    text,
    ...(forceSendToggle.checked ? { force: true } : {}),
  })
})

interruptBtn.addEventListener("click", () => {
  const session = currentSession()
  if (!session) {
    return
  }
  sendPayload({
    type: "interrupt",
    sessionId: session.sessionId,
  })
})

projectPathPicker.addEventListener("change", () => {
  if (!projectPathPicker.value) {
    return
  }
  projectPathInput.value = projectPathPicker.value
  saveLocalState()
})

projectPathInput.addEventListener("input", () => {
  renderProjectPathPicker()
  saveLocalState()
})

projectPathInput.addEventListener("change", () => {
  renderProjectPathPicker()
  saveLocalState()
})

sessionFilterInput.addEventListener("input", () => {
  viewerState.sessionOffset = 0
  renderSessionList()
  syncUrl(viewerState.selectedSessionId, "replace")
})

sessionRepoFilter.addEventListener("change", () => {
  viewerState.sessionOffset = 0
  renderSessionList()
  syncUrl(viewerState.selectedSessionId, "replace")
})

unreadOnlyFilter.addEventListener("change", () => {
  viewerState.sessionOffset = 0
  renderSessionList()
  syncUrl(viewerState.selectedSessionId, "replace")
})

includeAnsweringFilter.addEventListener("change", () => {
  viewerState.sessionOffset = 0
  renderSessionList()
  syncUrl(viewerState.selectedSessionId, "replace")
})

showCompletedFilter.addEventListener("change", () => {
  viewerState.sessionOffset = 0
  renderSessionList()
  syncUrl(viewerState.selectedSessionId, "replace")
})

sessionListPrevBtn.addEventListener("click", () => {
  viewerState.sessionOffset = Math.max(0, viewerState.sessionOffset - MAX_VISIBLE_SESSIONS)
  renderSessionList()
})

sessionListNextBtn.addEventListener("click", () => {
  viewerState.sessionOffset += MAX_VISIBLE_SESSIONS
  renderSessionList()
})

if (listResizeHandle) {
  listResizeHandle.addEventListener("mousedown", (event) => {
    event.preventDefault()
    beginSidebarResize(event.clientX)
  })
  listResizeHandle.addEventListener("keydown", (event) => {
    if (isMobileViewport()) {
      return
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      applySidebarWidth(currentSidebarWidth() - (event.shiftKey ? 48 : 24))
      saveLocalState()
      return
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      applySidebarWidth(currentSidebarWidth() + (event.shiftKey ? 48 : 24))
      saveLocalState()
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      applySidebarWidth(MIN_SIDEBAR_WIDTH)
      saveLocalState()
      return
    }
    if (event.key === "End") {
      event.preventDefault()
      applySidebarWidth(MAX_SIDEBAR_WIDTH)
      saveLocalState()
    }
  })

  window.addEventListener("mousemove", handleSidebarResizeMove)
  window.addEventListener("mouseup", () => finishSidebarResize(true))
}

window.addEventListener("popstate", () => {
  const sessionId = applyUrlState()
  selectSession(sessionId, { historyMode: "none", requestHistory: !!sessionId })
})

window.addEventListener("resize", () => {
  applyResponsiveMode()
  if (viewerState.sidebarWidth !== null) {
    applySidebarWidth(viewerState.sidebarWidth)
  }
  syncExpandableCards()
})

window.setInterval(refreshSessionTimes, 1000)

const savedState = loadLocalState()
viewerState.unreadSessionIds = new Set(savedState.unreadSessionIds || [])
projectPathInput.value = savedState.projectPath || "/workspace/mserver"
modelInput.value = "gpt-5.4-mini"
modelReasoningEffortSelect.value = "xhigh"
bridgeUrlInput.value = socketUrlFromLocation()
renderProjectPathPicker()
applySidebarWidth(savedState.sidebarWidth === null ? DEFAULT_SIDEBAR_WIDTH : savedState.sidebarWidth)
applyResponsiveMode()
ensureSocket()
const initialSessionId = applyUrlState()
selectSession(initialSessionId, { historyMode: "replace", requestHistory: false })
