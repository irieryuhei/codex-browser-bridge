export const VIEWER_NEXT_JS = String.raw`    const connectionDot = document.getElementById("connectionDot");
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
    const viewerTitle = document.getElementById("viewerTitle");
    const viewerSubtitle = document.getElementById("viewerSubtitle");
    const viewerRepoBadge = document.getElementById("viewerRepoBadge");
    const viewerModelBadge = document.getElementById("viewerModelBadge");
    const viewerModeBadge = document.getElementById("viewerModeBadge");
    const viewerBackBtn = document.getElementById("viewerBackBtn");
    const viewerPinBtn = document.getElementById("viewerPinBtn");
    const viewerCompleteBtn = document.getElementById("viewerCompleteBtn");
    const layout = document.querySelector(".layout");
    const viewerPanel = document.getElementById("viewerPanel");
    const listPanel = document.getElementById("listPanel");
    const listResizeHandle = document.getElementById("listResizeHandle");
    const permissionPanel = document.getElementById("permissionPanel");
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
      hydratedProjectPaths: false,
      sharedProjectPaths: [],
      sessionListOffset: 0,
      unreadSessionIds: new Set(),
      pendingRepoFilterValue: "",
      expandedConversationKeys: new Set(),
      expandedFinalAnswerKeys: new Set(),
      listPanelWidth: null,
      activeListResize: null,
    };
    const STORAGE_KEY = "codex-browser-bridge.viewer-next";
    const MAX_VISIBLE_SESSIONS = 10;
    const MAX_UNREAD_SESSION_COUNT = 50;
    const DEFAULT_LIST_PANEL_WIDTH = 380;
    const MIN_LIST_PANEL_WIDTH = 280;
    const MAX_LIST_PANEL_WIDTH = 720;
    const MIN_VIEWER_PANEL_WIDTH = 420;
    const LIST_RESIZER_WIDTH = 18;
    const FINAL_ANSWER_PREVIEW_LINES = 5;

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
          return { projectPath: "", listPanelWidth: null, unreadSessionIds: [] };
        }
        const savedWidth = Number(parsed.listPanelWidth);
        return {
          projectPath: typeof parsed.projectPath === "string" ? parsed.projectPath : "",
          listPanelWidth: Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : null,
          unreadSessionIds: normalizeSavedUnreadSessionIds(parsed.unreadSessionIds),
        };
      } catch {
        return { projectPath: "", listPanelWidth: null, unreadSessionIds: [] };
      }
    }

    function saveState() {
      const nextState = {
        projectPath: projectPathInput.value,
      };
      if (Number.isFinite(state.listPanelWidth) && state.listPanelWidth > 0) {
        nextState.listPanelWidth = Math.round(state.listPanelWidth);
      }
      nextState.unreadSessionIds = Array.from(state.unreadSessionIds);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    }

    function normalizeSavedUnreadSessionIds(value) {
      if (!Array.isArray(value)) {
        return [];
      }
      const unique = [];
      const seen = new Set();
      value.forEach((entry) => {
        const sessionId = String(entry || "").trim();
        if (!sessionId || seen.has(sessionId)) {
          return;
        }
        seen.add(sessionId);
        unique.push(sessionId);
      });
      return unique;
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

    function projectPathsFromRecentConversations() {
      const unique = [];
      const seen = new Set();
      state.sessions.slice(0, MAX_VISIBLE_SESSIONS).forEach((session) => {
        const normalized = typeof session?.projectPath === "string"
          ? session.projectPath.trim()
          : "";
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        unique.push(normalized);
      });
      return unique;
    }

    function projectPathChoices() {
      return normalizeProjectPaths([
        ...projectPathsFromRecentConversations(),
        ...state.sharedProjectPaths,
      ]);
    }

    function renderProjectPathOptions() {
      const pickerPaths = projectPathChoices();
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
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select a repository";
      projectPathPicker.appendChild(placeholder);
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
      if (!normalized) {
        projectPathPicker.value = "";
        return;
      }
      if (Array.from(projectPathPicker.options).some((option) => option.value === normalized)) {
        projectPathPicker.value = normalized;
        return;
      }
      projectPathPicker.value = "";
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

    function parseUrlBoolean(value, defaultValue) {
      if (value === null) {
        return defaultValue;
      }
      const normalized = String(value).trim().toLowerCase();
      if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
        return true;
      }
      if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
        return false;
      }
      return defaultValue;
    }

    function currentUrlState() {
      const searchParams = new URL(window.location.href).searchParams;
      return {
        sessionId: String(searchParams.get("session") || "").trim(),
        query: String(searchParams.get("q") || ""),
        repo: String(searchParams.get("repo") || ""),
        unreadOnly: parseUrlBoolean(searchParams.get("unreadOnly"), false),
        includeAnswering: parseUrlBoolean(searchParams.get("includeAnswering"), true),
        showCompleted: parseUrlBoolean(searchParams.get("showCompleted"), true),
      };
    }

    function applyUrlState() {
      const urlState = currentUrlState();
      sessionFilterInput.value = urlState.query;
      state.pendingRepoFilterValue = urlState.repo;
      sessionRepoFilter.value = urlState.repo;
      unreadOnlyFilter.checked = urlState.unreadOnly;
      includeAnsweringFilter.checked = urlState.includeAnswering;
      showCompletedFilter.checked = urlState.showCompleted;
      state.sessionListOffset = 0;
      return urlState.sessionId;
    }

    function currentRepoFilterValue() {
      return String(sessionRepoFilter.value || state.pendingRepoFilterValue || "").trim().toLowerCase();
    }

    function syncViewerUrl(sessionId, historyMode) {
      if (historyMode === "none") {
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
      if (includeAnsweringFilter.checked) {
        url.searchParams.delete("includeAnswering");
      } else {
        url.searchParams.set("includeAnswering", "0");
      }
      if (showCompletedFilter.checked) {
        url.searchParams.delete("showCompleted");
      } else {
        url.searchParams.set("showCompleted", "0");
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

    function availableLayoutWidth() {
      if (layout && typeof layout.getBoundingClientRect === "function") {
        const layoutWidth = layout.getBoundingClientRect().width;
        if (layoutWidth > 0) {
          return layoutWidth;
        }
      }
      return Math.max(0, Math.min(window.innerWidth - 24, 1380));
    }

    function listPanelWidthBounds() {
      const maxFromViewport = availableLayoutWidth() - MIN_VIEWER_PANEL_WIDTH - LIST_RESIZER_WIDTH;
      return {
        min: MIN_LIST_PANEL_WIDTH,
        max: Math.max(MIN_LIST_PANEL_WIDTH, Math.min(MAX_LIST_PANEL_WIDTH, maxFromViewport)),
      };
    }

    function currentListPanelWidth() {
      if (Number.isFinite(state.listPanelWidth) && state.listPanelWidth > 0) {
        return state.listPanelWidth;
      }
      if (listPanel && typeof listPanel.getBoundingClientRect === "function") {
        const panelWidth = listPanel.getBoundingClientRect().width;
        if (panelWidth > 0) {
          return panelWidth;
        }
      }
      return DEFAULT_LIST_PANEL_WIDTH;
    }

    function updateListResizeHandle() {
      if (!listResizeHandle) {
        return;
      }
      const bounds = listPanelWidthBounds();
      const currentWidth = Math.round(currentListPanelWidth());
      listResizeHandle.setAttribute("role", "separator");
      listResizeHandle.setAttribute("aria-valuemin", String(bounds.min));
      listResizeHandle.setAttribute("aria-valuemax", String(bounds.max));
      listResizeHandle.setAttribute("aria-valuenow", String(currentWidth));
    }

    function applyListPanelWidth(nextWidth) {
      if (!layout) {
        return;
      }
      const bounds = listPanelWidthBounds();
      const clampedWidth = Math.round(Math.max(bounds.min, Math.min(bounds.max, nextWidth)));
      state.listPanelWidth = clampedWidth;
      layout.style.setProperty("--list-panel-width", clampedWidth + "px");
      updateListResizeHandle();
      syncExpandableFinalAnswerCards();
    }

    function stopListResize(shouldPersist) {
      if (!state.activeListResize) {
        return;
      }
      state.activeListResize = null;
      document.body.classList.remove("resizing");
      window.removeEventListener("mousemove", handleListResizeMove);
      window.removeEventListener("mouseup", handleListResizeStop);
      if (shouldPersist) {
        saveState();
      }
    }

    function handleListResizeMove(event) {
      if (!state.activeListResize || isMobileViewport()) {
        return;
      }
      const nextWidth = state.activeListResize.startWidth + (event.clientX - state.activeListResize.startX);
      applyListPanelWidth(nextWidth);
    }

    function handleListResizeStop() {
      stopListResize(true);
    }

    function startListResize(clientX) {
      if (!layout || isMobileViewport()) {
        return;
      }
      state.activeListResize = {
        startX: clientX,
        startWidth: currentListPanelWidth(),
      };
      document.body.classList.add("resizing");
      window.addEventListener("mousemove", handleListResizeMove);
      window.addEventListener("mouseup", handleListResizeStop);
    }

    function updateResponsiveLayout() {
      const mobile = isMobileViewport();
      const hasSelection = !!state.selectedSessionId;
      if (layout) {
        layout.classList.toggle("mobile-list-open", mobile && !hasSelection);
        layout.classList.toggle("mobile-viewer-open", mobile && hasSelection);
      }
      if (mobile) {
        stopListResize(false);
      }
      if (listResizeHandle) {
        listResizeHandle.hidden = mobile;
      }
      updateListResizeHandle();
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
      if (state.selectedSessionId) {
        clearSessionUnread(state.selectedSessionId);
      }
      syncViewerUrl(state.selectedSessionId, options.historyMode || "none");
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
          saveState();
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
        state.sessions = Array.isArray(message.sessions) ? message.sessions : [];
        state.sharedProjectPaths = normalizeProjectPaths(
          Array.isArray(message.selectableProjectPaths) ? message.selectableProjectPaths : message.projectPaths,
        );
        pruneUnreadSessions();
        renderProjectPathOptions();
        const recentConversationProjectPaths = projectPathChoices();
        if (
          !state.hydratedProjectPaths
          && recentConversationProjectPaths.length > 0
          && (!projectPathInput.value || projectPathInput.value === "/workspace/mserver")
        ) {
          projectPathInput.value = recentConversationProjectPaths[0];
          saveState();
          renderProjectPathOptions();
        }
        if (recentConversationProjectPaths.length > 0) {
          state.hydratedProjectPaths = true;
        }
        if (
          state.selectedSessionId
          && !state.sessions.some((session) => session.sessionId === state.selectedSessionId)
        ) {
          setSelectedSession("", { historyMode: "replace", requestHistory: false });
          return;
        }
        if (state.selectedSessionId && !state.histories.has(state.selectedSessionId)) {
          send({ type: "get_history", sessionId: state.selectedSessionId });
        }
        renderSessionList();
        renderViewerState();
        return;
      }

      if (message.type === "history" && typeof message.sessionId === "string") {
        state.histories.set(
          message.sessionId,
          mergeHistorySnapshot(message.sessionId, Array.isArray(message.messages) ? message.messages : []),
        );
        reconcileQueuedDrafts(message.sessionId);
        if (message.sessionId === state.selectedSessionId) {
          clearSessionUnread(message.sessionId);
        }
        renderSessionList();
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
        if (message.sessionId !== state.selectedSessionId) {
          markSessionUnread(message.sessionId);
        } else {
          clearSessionUnread(message.sessionId);
        }
        renderSessionList();
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

    function mergeHistorySnapshot(sessionId, incomingMessages) {
      const existingMessages = state.histories.get(sessionId) || [];
      if (existingMessages.length === 0) {
        return incomingMessages.slice();
      }
      if (incomingMessages.length === 0) {
        return existingMessages.slice();
      }

      const merged = incomingMessages.slice();
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

    function historyMessageKey(message) {
      if (!message || typeof message !== "object") {
        return JSON.stringify(message);
      }

      if (message.type === "assistant") {
        const assistantMessage = message.message && typeof message.message === "object"
          ? message.message
          : {};
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
      });
    }

    function patchSession(sessionId, patch) {
      state.sessions = state.sessions.map((session) => {
        if (session.sessionId !== sessionId) {
          return session;
        }
        return { ...session, ...patch };
      });
    }

    function pruneUnreadSessions() {
      const trackedIds = new Set(
        state.sessions
          .slice(0, MAX_UNREAD_SESSION_COUNT)
          .map((session) => session.sessionId),
      );
      let changed = false;
      Array.from(state.unreadSessionIds).forEach((sessionId) => {
        if (!trackedIds.has(sessionId)) {
          state.unreadSessionIds.delete(sessionId);
          changed = true;
        }
      });
      if (changed) {
        saveState();
      }
    }

    function markSessionUnread(sessionId) {
      if (!sessionId || sessionId === state.selectedSessionId) {
        return;
      }
      if (!state.unreadSessionIds.has(sessionId)) {
        state.unreadSessionIds.add(sessionId);
        saveState();
      }
    }

    function clearSessionUnread(sessionId) {
      if (!sessionId) {
        return;
      }
      if (state.unreadSessionIds.delete(sessionId)) {
        saveState();
      }
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
      const filters = currentSessionFilters();
      const filteredSessions = state.sessions.filter((session) => matchesSessionFilter(session, filters));
      state.sessionListOffset = clampSessionListOffset(state.sessionListOffset, filteredSessions.length);
      const visibleSessions = filteredSessions.slice(
        state.sessionListOffset,
        state.sessionListOffset + MAX_VISIBLE_SESSIONS,
      );
      renderSessionRepoOptions(visibleSessions);
      updateSessionListSummary(visibleSessions.length, filteredSessions.length, state.sessionListOffset);
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

      const shouldShowPinnedDivider = visibleSessions.some((session) => session.pinned)
        && visibleSessions.some((session) => !session.pinned);
      let insertedPinnedDivider = false;
      visibleSessions.forEach((session) => {
        if (shouldShowPinnedDivider && !insertedPinnedDivider && !session.pinned) {
          const divider = document.createElement("hr");
          divider.className = "session-list-divider";
          divider.setAttribute("aria-hidden", "true");
          sessionsList.appendChild(divider);
          insertedPinnedDivider = true;
        }

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
        if (isSessionUnread(session)) {
          button.dataset.unread = "true";
        }

        const titleRow = document.createElement("div");
        titleRow.className = "session-title-row";

        const titleGroup = document.createElement("div");
        titleGroup.className = "session-title-group";

        const title = document.createElement("div");
        title.className = "session-title";
        title.textContent = session.title || session.sessionId;
        titleGroup.appendChild(title);

        if (isSessionUnread(session)) {
          const unreadBadge = document.createElement("span");
          unreadBadge.className = "session-badge unread";
          unreadBadge.textContent = "未読";
          titleGroup.appendChild(unreadBadge);
        }

        const relativeTime = sessionRelativeTimeLabel(session);
        if (relativeTime) {
          const time = document.createElement("span");
          time.className = "session-time";
          time.textContent = relativeTime;
          titleGroup.appendChild(time);
        }

        titleRow.appendChild(titleGroup);

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

    function currentSessionFilters() {
      return {
        query: normalizedSessionFilter(),
        repo: currentRepoFilterValue(),
        unreadOnly: unreadOnlyFilter.checked,
        includeAnswering: includeAnsweringFilter.checked,
        showCompleted: showCompletedFilter.checked,
      };
    }

    function isSessionUnread(session) {
      return !!session && state.unreadSessionIds.has(session.sessionId);
    }

    function isSessionSettled(session) {
      return session && session.answerState === "final_answer";
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

      if (filters.unreadOnly && !isSessionUnread(session)) {
        return false;
      }

      if (!filters.includeAnswering && !isSessionSettled(session)) {
        return false;
      }

      if (!filters.showCompleted && session.completed === true) {
        return false;
      }

      return true;
    }

    function renderSessionRepoOptions(sessions) {
      const currentValue = currentRepoFilterValue();
      const repos = [];
      const seenRepos = new Set();

      sessions.forEach((session) => {
        const repo = shortProject(session.projectPath).trim().toLowerCase();
        if (!repo || seenRepos.has(repo)) {
          return;
        }
        seenRepos.add(repo);
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

      if (currentValue && !seenRepos.has(currentValue)) {
        const selectedOption = document.createElement("option");
        selectedOption.value = currentValue;
        selectedOption.textContent = currentValue;
        sessionRepoFilter.appendChild(selectedOption);
        seenRepos.add(currentValue);
      }

      sessionRepoFilter.value = currentValue && seenRepos.has(currentValue) ? currentValue : "";
      state.pendingRepoFilterValue = "";
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

    function sessionRelativeTimeLabel(session) {
      const timestamp = session && session.answerState === "final_answer"
        ? (session.finalAnswerAt || session.updatedAt)
        : session.updatedAt;
      return formatRelativeTime(timestamp);
    }

    function formatRelativeTime(value) {
      const timestamp = Date.parse(String(value || ""));
      if (Number.isNaN(timestamp)) {
        return "";
      }
      const elapsedMs = Math.max(0, Date.now() - timestamp);
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      if (elapsedSeconds < 60) {
        return elapsedSeconds + "秒前";
      }
      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      if (elapsedMinutes < 60) {
        return elapsedMinutes + "分前";
      }
      const elapsedHours = Math.floor(elapsedMinutes / 60);
      if (elapsedHours < 24) {
        return elapsedHours + "時間前";
      }
      const elapsedDays = Math.floor(elapsedHours / 24);
      return elapsedDays + "日前";
    }

    window.setInterval(() => {
      if (state.sessions.length > 0) {
        renderSessionList();
      }
      if (state.selectedSessionId) {
        refreshMessageRelativeTimestamps();
      }
    }, 1000);

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
      return;
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

    function renderMessages() {
      messages.replaceChildren();
      const session = currentSession();
      if (!session) {
        return;
      }

      const history = state.histories.get(session.sessionId) || [];
      const entries = buildDisplayEntries(history);
      const blocks = buildConversationBlocks(entries);
      const rendered = blocks.slice().reverse().map((block) => renderConversationBlock(block, session.sessionId));
      messages.replaceChildren(...rendered);
      syncExpandableFinalAnswerCards();
      refreshMessageRelativeTimestamps();
    }

    function refreshMessageRelativeTimestamps() {
      Array.from(messages.querySelectorAll(".message-timestamp[data-timestamp]")).forEach((item) => {
        const timestamp = item instanceof HTMLElement ? item : null;
        if (!timestamp) {
          return;
        }
        timestamp.textContent = formatRelativeTime(timestamp.dataset.timestamp || "");
      });
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
            id: item.message.id || "",
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

    function renderConversationBlock(block, sessionId) {
      if (block.type === "message") {
        return renderMessageCard(block.item);
      }

      const detail = document.createElement("details");
      detail.className = "conversation-collapse";
      const conversationKey = conversationCollapseKey(block, sessionId);
      detail.open = state.expandedConversationKeys.has(conversationKey);
      detail.addEventListener("toggle", () => {
        if (detail.open) {
          state.expandedConversationKeys.add(conversationKey);
          return;
        }
        state.expandedConversationKeys.delete(conversationKey);
      });
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

    function conversationCollapseKey(block, sessionId) {
      const summary = block && block.summary ? block.summary : null;
      const userItem = block && block.userItem ? block.userItem : null;
      const summaryKey = summary
        ? [
            summary.id || "",
            summary.phase || "",
            summary.timestamp || "",
            summary.text || "",
          ].join("|")
        : "";
      const userKey = userItem
        ? [
            userItem.timestamp || "",
            userItem.text || "",
          ].join("|")
        : "";
      return [sessionId || "", userKey, summaryKey].join("::");
    }

    function renderMessageCard(item) {
      const card = document.createElement("article");
      const isFinalAnswer = item.role === "assistant" && item.phase === "final_answer";
      const kind = isFinalAnswer
        ? "final"
        : item.role === "assistant" || item.role === "thinking" || item.role === "draft"
          ? "commentary"
          : item.role;
      card.className = "message-card " + kind;

      const header = document.createElement("div");
      header.className = "message-header";
      const title = document.createElement("span");
      title.textContent =
        item.role === "user" ? "You" :
        item.role === "thinking" ? "Thinking" :
        item.role === "draft" ? "Draft" :
        item.role === "tool" ? "Tool" :
        item.role === "error" ? "Error" :
        item.phase === "final_answer" ? "Final Answer" :
        "Assistant";
      header.appendChild(title);
      const relativeTimestamp = formatRelativeTime(item.timestamp);
      if (relativeTimestamp) {
        const timestamp = document.createElement("span");
        timestamp.className = "message-timestamp";
        timestamp.dataset.timestamp = String(item.timestamp || "");
        timestamp.textContent = relativeTimestamp;
        header.appendChild(timestamp);
      }
      card.appendChild(header);

      const body = document.createElement("div");
      body.className = "message-body";
      body.textContent = item.text || "";
      card.appendChild(body);

      if (isFinalAnswer) {
        card.dataset.finalAnswerKey = finalAnswerEntryKey(item);
        card.dataset.expanded = "false";
        const footer = document.createElement("div");
        footer.className = "message-card-footer";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "message-expand-toggle";
        toggle.hidden = true;
        toggle.textContent = "Show more";
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFinalAnswerCard(card);
        });
        footer.appendChild(toggle);
        card.appendChild(footer);
      }
      return card;
    }

    function finalAnswerEntryKey(item) {
      return item.id || [item.phase || "", item.timestamp || "", item.text || ""].join("|");
    }

    function toggleFinalAnswerCard(card) {
      if (!card || card.dataset.expandable !== "true") {
        return;
      }
      const key = card.dataset.finalAnswerKey || "";
      const expanded = card.dataset.expanded === "true";
      if (expanded) {
        state.expandedFinalAnswerKeys.delete(key);
      } else if (key) {
        state.expandedFinalAnswerKeys.add(key);
      }
      syncExpandableFinalAnswerCard(card);
    }

    function syncExpandableFinalAnswerCards() {
      Array.from(messages.querySelectorAll(".message-card.final[data-final-answer-key]")).forEach((card) => {
        syncExpandableFinalAnswerCard(card);
      });
    }

    function syncExpandableFinalAnswerCard(card) {
      const body = card.querySelector(".message-body");
      const toggle = card.querySelector(".message-expand-toggle");
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
      const expanded = key ? state.expandedFinalAnswerKeys.has(key) : false;
      card.dataset.expanded = expanded ? "true" : "false";
      toggle.hidden = false;
      toggle.textContent = expanded ? "Show less" : "Show more";
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
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
      return estimateRenderedLineCount(text, body) > FINAL_ANSWER_PREVIEW_LINES;
    }

    function estimateRenderedLineCount(text, body) {
      const charsPerLine = approximateCharsPerLine(body);
      return String(text || "").split(/\\r?\\n/).reduce((total, line) => {
        return total + Math.max(1, Math.ceil(line.length / charsPerLine));
      }, 0);
    }

    function approximateCharsPerLine(body) {
      const width = typeof body.getBoundingClientRect === "function"
        ? body.getBoundingClientRect().width
        : 0;
      if (Number.isFinite(width) && width > 0) {
        return Math.max(24, Math.floor(width / 8));
      }
      return 72;
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
      saveState();
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

    if (listResizeHandle) {
      listResizeHandle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        startListResize(event.clientX);
      });
      listResizeHandle.addEventListener("keydown", (event) => {
        if (isMobileViewport()) {
          return;
        }
        const bounds = listPanelWidthBounds();
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          applyListPanelWidth(currentListPanelWidth() - (event.shiftKey ? 48 : 24));
          saveState();
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          applyListPanelWidth(currentListPanelWidth() + (event.shiftKey ? 48 : 24));
          saveState();
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          applyListPanelWidth(bounds.min);
          saveState();
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          applyListPanelWidth(bounds.max);
          saveState();
        }
      });
    }

    sendBtn.addEventListener("click", () => {
      const session = currentSession();
      const text = composerInput.value.trim();
      if (!session || !text) {
        return;
      }
      composerInput.value = "";
      updateComposerState();
      send({
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
      send({
        type: "interrupt",
        sessionId: session.sessionId,
      });
    });

    const savedState = loadSavedState();
    projectPathInput.value = savedState.projectPath || "/workspace/mserver";
    state.unreadSessionIds = new Set(savedState.unreadSessionIds || []);
    renderProjectPathOptions();
    modelInput.value = "gpt-5.4-mini";
    modelReasoningEffortSelect.value = "xhigh";
    bridgeUrlInput.value = defaultSocketUrl();
    if (savedState.listPanelWidth !== null) {
      applyListPanelWidth(savedState.listPanelWidth);
    } else {
      updateListResizeHandle();
    }
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
      syncViewerUrl(state.selectedSessionId, "replace");
    });
    sessionRepoFilter.addEventListener("change", () => {
      state.sessionListOffset = 0;
      renderSessionList();
      syncViewerUrl(state.selectedSessionId, "replace");
    });
    unreadOnlyFilter.addEventListener("change", () => {
      state.sessionListOffset = 0;
      renderSessionList();
      syncViewerUrl(state.selectedSessionId, "replace");
    });
    includeAnsweringFilter.addEventListener("change", () => {
      state.sessionListOffset = 0;
      renderSessionList();
      syncViewerUrl(state.selectedSessionId, "replace");
    });
    showCompletedFilter.addEventListener("change", () => {
      state.sessionListOffset = 0;
      renderSessionList();
      syncViewerUrl(state.selectedSessionId, "replace");
    });
    sessionListPrevBtn.addEventListener("click", () => {
      state.sessionListOffset = Math.max(0, state.sessionListOffset - MAX_VISIBLE_SESSIONS);
      renderSessionList();
    });
    sessionListNextBtn.addEventListener("click", () => {
      state.sessionListOffset += MAX_VISIBLE_SESSIONS;
      renderSessionList();
    });
    window.addEventListener("popstate", () => {
      const sessionId = applyUrlState();
      setSelectedSession(sessionId, { historyMode: "none", requestHistory: !!sessionId });
    });
    window.addEventListener("resize", () => {
      updateResponsiveLayout();
      if (state.listPanelWidth !== null) {
        applyListPanelWidth(state.listPanelWidth);
      } else {
        updateListResizeHandle();
      }
      syncExpandableFinalAnswerCards();
    });
    ensureSocket();
    const initialSessionId = applyUrlState();
    setSelectedSession(initialSessionId, { historyMode: "replace", requestHistory: false });`;
