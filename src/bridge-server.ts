import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  getStoredCodexSessionHistory,
  listStoredCodexSessions,
} from "./codex-sessions.js";
import {
  SessionStateStore,
  type PersistedHistoryMessage,
  type PersistedSessionRecord,
} from "./session-state.js";
import { renderViewerHtml } from "./viewer-html.js";

export type PermissionMode = "default" | "plan";
export type SessionStatus = "starting" | "idle" | "running" | "waiting_approval" | "stopped";
export type SessionAnswerState = "" | "commentary" | "final_answer";

export interface CodexSession {
  getSessionId(): string | null;
  sendInput(text: string): void;
  interrupt(): void;
  approve(toolUseId?: string, updatedInput?: Record<string, unknown>): void;
  reject(toolUseId?: string, message?: string): void;
  answer(toolUseId: string, result: string): void;
  onMessage(listener: (message: Record<string, unknown>) => void): void;
  stop(): void;
}

export interface CodexSessionFactory {
  startSession(options: {
    projectPath: string;
    unrestricted: boolean;
    threadId?: string;
    model?: string;
    modelReasoningEffort?: string;
    permissionMode?: PermissionMode;
  }): Promise<CodexSession>;
}

export interface BridgeServer {
  port: number;
  close(): Promise<void>;
}

interface StartBridgeServerOptions {
  port: number;
  host?: string;
  codexFactory: CodexSessionFactory;
  stateFilePath?: string;
  codexSessionRoot?: string | null;
}

type ClientMessage =
  | {
      type: "start";
      projectPath: string;
      model?: string;
      modelReasoningEffort?: string;
      permissionMode?: PermissionMode;
    }
  | { type: "input"; sessionId: string; text: string; force?: boolean }
  | { type: "interrupt"; sessionId: string }
  | { type: "approve"; sessionId: string; toolUseId?: string; updatedInput?: Record<string, unknown> }
  | { type: "reject"; sessionId: string; toolUseId?: string; message?: string }
  | { type: "answer"; sessionId: string; toolUseId: string; result: string }
  | { type: "list_sessions" }
  | { type: "get_history"; sessionId: string }
  | { type: "set_session_pin"; sessionId: string; pinned: boolean }
  | { type: "set_session_completion"; sessionId: string; completed: boolean };

interface AssistantTextContent {
  type: "text";
  text: string;
}

interface AssistantToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AssistantMessage {
  id: string;
  role: "assistant";
  content: Array<AssistantTextContent | AssistantToolUseContent>;
  model: string;
  phase?: "commentary" | "final_answer";
}

interface HistoryBase {
  sessionId: string;
  timestamp: string;
}

type HistoryMessage =
  | (HistoryBase & { type: "user"; text: string })
  | (HistoryBase & { type: "thinking_delta"; id?: string; text: string })
  | (HistoryBase & { type: "stream_delta"; id?: string; text: string })
  | (HistoryBase & { type: "assistant"; message: AssistantMessage })
  | (HistoryBase & { type: "tool_result"; toolUseId: string; toolName?: string; content: string })
  | (HistoryBase & { type: "error"; message: string });

interface PendingPermission {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface QueuedInput {
  id: string;
  text: string;
  queuedAt: string;
}

interface SessionRecord {
  sessionId: string;
  projectPath: string;
  title: string;
  storedPreview: string;
  storedAnswerState: SessionAnswerState;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  model: string;
  modelReasoningEffort: string;
  permissionMode: PermissionMode;
  pinned: boolean;
  completed: boolean;
  codexSession: CodexSession | null;
  history: HistoryMessage[];
  queuedInputs: QueuedInput[];
  pendingPermission: PendingPermission | null;
}

interface SessionSummary {
  sessionId: string;
  title: string;
  projectPath: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  model: string;
  modelReasoningEffort: string;
  permissionMode: PermissionMode;
  pinned: boolean;
  completed: boolean;
  preview: string;
  answerState: SessionAnswerState;
  queueLength: number;
  pendingPermission?: PendingPermission;
}

const MAX_HISTORY = 400;

export async function startBridgeServer(
  options: StartBridgeServerOptions,
): Promise<BridgeServer> {
  const host = options.host ?? "127.0.0.1";
  const sessions = new Map<string, SessionRecord>();
  const clients = new Set<WebSocket>();
  const stateStore = new SessionStateStore(options.stateFilePath ?? null);
  const recentProjectPaths: string[] = [];

  const persistSessions = async (): Promise<void> => {
    const persisted: PersistedSessionRecord[] = Array.from(sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      projectPath: session.projectPath,
      title: session.title,
      status: session.codexSession ? session.status : "stopped",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      model: session.model,
      modelReasoningEffort: session.modelReasoningEffort,
      permissionMode: session.permissionMode,
      pinned: session.pinned,
      completed: session.completed,
      history: toPersistedHistory(session.history),
      pendingPermission: session.codexSession ? session.pendingPermission : null,
    }));
    await stateStore.save({
      sessions: persisted,
      recentProjectPaths,
    });
  };

  const rememberProjectPath = (projectPath: string): void => {
    const normalized = projectPath.trim();
    if (!normalized) {
      return;
    }
    const next = [
      normalized,
      ...recentProjectPaths.filter((entry) => entry !== normalized),
    ].slice(0, 12);
    recentProjectPaths.splice(0, recentProjectPaths.length, ...next);
  };

  const shouldUseStoredTitle = (title: string, sessionId: string, projectPath: string): boolean => {
    return !title || title === `Session ${sessionId}` || title === defaultSessionTitle(projectPath);
  };

  const syncStoredCodexSessions = async (): Promise<void> => {
    if (options.codexSessionRoot === null) {
      return;
    }
    const storedSessions = await listStoredCodexSessions(options.codexSessionRoot);

    storedSessions.forEach((stored) => {
      rememberProjectPath(stored.projectPath);
      const existing = sessions.get(stored.sessionId);
      if (existing) {
        existing.projectPath ||= stored.projectPath;
        if (shouldUseStoredTitle(existing.title, existing.sessionId, stored.projectPath)) {
          existing.title = stored.title;
        }
        if (!summarizeSessionPreview(existing)) {
          existing.storedPreview = stored.preview;
        }
        if (!existing.history.length) {
          existing.storedAnswerState = stored.answerState;
        }
        existing.createdAt ||= stored.createdAt;
        if (!existing.updatedAt || Date.parse(stored.updatedAt) > Date.parse(existing.updatedAt)) {
          existing.updatedAt = stored.updatedAt;
        }
        if (!existing.model) {
          existing.model = stored.model;
        }
        if (!existing.modelReasoningEffort) {
          existing.modelReasoningEffort = stored.modelReasoningEffort;
        }
        if (existing.permissionMode !== "plan") {
          existing.permissionMode = stored.permissionMode;
        }
        if (!existing.codexSession) {
          existing.status = "stopped";
        }
        return;
      }

      sessions.set(stored.sessionId, {
        sessionId: stored.sessionId,
        projectPath: stored.projectPath,
        title: stored.title,
        storedPreview: stored.preview,
        storedAnswerState: stored.answerState,
        status: "stopped",
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        model: stored.model,
        modelReasoningEffort: stored.modelReasoningEffort,
        permissionMode: stored.permissionMode,
        pinned: false,
        completed: false,
        codexSession: null,
        history: [],
        queuedInputs: [],
        pendingPermission: null,
      });
    });
  };

  const httpServer = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderViewerHtml());
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  const wss = new WebSocketServer({ server: httpServer });

  const broadcast = (payload: unknown): void => {
    for (const client of clients) {
      send(client, payload);
    }
  };

  const buildSessionSummary = (session: SessionRecord): SessionSummary => ({
    sessionId: session.sessionId,
    title: session.title,
    projectPath: session.projectPath,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    model: session.model,
    modelReasoningEffort: session.modelReasoningEffort,
    permissionMode: session.permissionMode,
    pinned: session.pinned,
    completed: session.completed,
    preview: summarizeSessionPreview(session) || session.storedPreview,
    answerState: summarizeSessionAnswerState(session),
    queueLength: session.queuedInputs.length,
    ...(session.pendingPermission ? { pendingPermission: session.pendingPermission } : {}),
  });

  const buildSessionListPayload = (): Record<string, unknown> => ({
    type: "session_list",
    projectPaths: [...recentProjectPaths],
    sessions: Array.from(sessions.values()).sort(compareSessionsForList).map(buildSessionSummary),
  });

  const broadcastSessionList = (): void => {
    broadcast(buildSessionListPayload());
  };

  const pushHistory = (session: SessionRecord, message: HistoryMessage): void => {
    session.history.push(message);
    if (session.history.length > MAX_HISTORY) {
      session.history.splice(0, session.history.length - MAX_HISTORY);
    }
    session.updatedAt = message.timestamp;
    broadcast(message);
    broadcastSessionList();
    void persistSessions();
  };

  const dispatchPendingInput = (session: SessionRecord): void => {
    if (session.status !== "idle") {
      return;
    }
    const next = session.queuedInputs.shift();
    if (!next) {
      return;
    }
    dispatchSessionInput(session, next.text);
    broadcastSessionList();
  };

  const dispatchSessionInput = (session: SessionRecord, text: string): void => {
    const timestamp = new Date().toISOString();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (isDefaultSessionTitle(session.title, session.projectPath)) {
      session.title = automaticSessionTitle(trimmed);
    }

    pushHistory(session, {
      type: "user",
      sessionId: session.sessionId,
      text: trimmed,
      timestamp,
    });
    session.codexSession?.sendInput(trimmed);
  };

  const attachLiveCodexSession = (session: SessionRecord, codexSession: CodexSession): void => {
    session.codexSession = codexSession;
    session.status = "idle";
    session.pendingPermission = null;
    codexSession.onMessage((serverMessage) => {
      const active = sessions.get(session.sessionId);
      if (!active) {
        return;
      }
      handleSessionMessage(active, serverMessage);
    });
  };

  const resumeStoppedSession = async (session: SessionRecord): Promise<void> => {
    if (session.codexSession) {
      return;
    }
    const codexSession = await options.codexFactory.startSession({
      projectPath: session.projectPath,
      unrestricted: true,
      threadId: session.sessionId,
      model: normalizeModel(session.model),
      modelReasoningEffort: normalizeModelReasoningEffort(session.modelReasoningEffort),
      permissionMode: normalizePermissionMode(session.permissionMode),
    });
    attachLiveCodexSession(session, codexSession);
    const timestamp = new Date().toISOString();
    broadcast({
      type: "status",
      sessionId: session.sessionId,
      status: "idle",
      timestamp,
    });
    broadcastSessionList();
    void persistSessions();
  };

  const handleSessionMessage = (session: SessionRecord, message: Record<string, unknown>): void => {
    const timestamp = new Date().toISOString();

    if (message.type === "status") {
      session.status = normalizeStatus(message.status);
      session.updatedAt = timestamp;
      broadcast({
        type: "status",
        sessionId: session.sessionId,
        status: session.status,
        timestamp,
      });
      broadcastSessionList();
      if (session.status === "idle") {
        dispatchPendingInput(session);
      }
      return;
    }

    if (message.type === "permission_request") {
      const pendingPermission = normalizePendingPermission(message);
      session.pendingPermission = pendingPermission;
      session.updatedAt = timestamp;
      broadcastSessionList();
      void persistSessions();
      return;
    }

    session.pendingPermission = null;

    const historyMessage = normalizeHistoryMessage(session.sessionId, timestamp, message);
    if (!historyMessage) {
      broadcastSessionList();
      return;
    }

    pushHistory(session, historyMessage);
  };

  wss.on("connection", (ws) => {
    clients.add(ws);

    ws.on("message", async (raw) => {
      const message = parseClientMessage(String(raw));
      if (!message) {
        send(ws, { type: "error", message: "Invalid message format" });
        return;
      }

      if (message.type === "list_sessions") {
        await syncStoredCodexSessions();
        send(ws, buildSessionListPayload());
        return;
      }

      if (message.type === "get_history") {
        await syncStoredCodexSessions();
        const session = sessions.get(message.sessionId);
        if (!session) {
          send(ws, { type: "error", message: `Session ${message.sessionId} was not found.` });
          return;
        }
        const storedHistory = session.codexSession || options.codexSessionRoot === null
          ? []
          : await getStoredCodexSessionHistory(message.sessionId, options.codexSessionRoot);
        send(ws, {
          type: "history",
          sessionId: session.sessionId,
          messages: storedHistory.length > 0 ? storedHistory : session.history,
        });
        return;
      }

      if (message.type === "start") {
        const projectPath = message.projectPath.trim();
        if (!projectPath) {
          send(ws, { type: "error", message: "Project path is required." });
          return;
        }

        try {
          const codexSession = await options.codexFactory.startSession({
            projectPath,
            unrestricted: true,
            model: normalizeModel(message.model),
            modelReasoningEffort: normalizeModelReasoningEffort(message.modelReasoningEffort),
            permissionMode: normalizePermissionMode(message.permissionMode),
          });

          if (ws.readyState !== WebSocket.OPEN) {
            codexSession.stop();
            return;
          }

          const now = new Date().toISOString();
          rememberProjectPath(projectPath);
          const sessionId = codexSession.getSessionId() || randomUUID().slice(0, 8);
          const session: SessionRecord = {
            sessionId,
            projectPath,
            title: defaultSessionTitle(projectPath),
            storedPreview: "",
            storedAnswerState: "",
            status: "idle",
            createdAt: now,
            updatedAt: now,
            model: normalizeModel(message.model),
            modelReasoningEffort: normalizeModelReasoningEffort(message.modelReasoningEffort),
            permissionMode: normalizePermissionMode(message.permissionMode),
            pinned: false,
            completed: false,
            codexSession,
            history: [],
            queuedInputs: [],
            pendingPermission: null,
          };

          sessions.set(session.sessionId, session);
          attachLiveCodexSession(session, codexSession);

          send(ws, {
            type: "system",
            subtype: "session_created",
            sessionId: session.sessionId,
            projectPath,
            model: session.model,
            modelReasoningEffort: session.modelReasoningEffort,
            permissionMode: session.permissionMode,
          });
          send(ws, {
            type: "status",
            sessionId: session.sessionId,
            status: "idle",
            timestamp: now,
          });
          broadcastSessionList();
          void persistSessions();
        } catch (error) {
          send(ws, {
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const session = sessions.get(message.sessionId);
      if (!session) {
        send(ws, { type: "error", message: `Session ${message.sessionId} was not found.` });
        return;
      }

      switch (message.type) {
        case "input": {
          const text = message.text.trim();
          if (!text) {
            send(ws, { type: "error", message: "Prompt text is required." });
            return;
          }

          if (!session.codexSession) {
            try {
              await resumeStoppedSession(session);
            } catch (error) {
              send(ws, {
                type: "error",
                message: error instanceof Error ? error.message : String(error),
              });
              return;
            }
          }

          const liveSession = session.codexSession;
          if (!liveSession) {
            send(ws, {
              type: "error",
              message: `Session ${message.sessionId} could not be resumed.`,
            });
            return;
          }

          if (message.force === true && session.status !== "idle") {
            dispatchSessionInput(session, text);
            send(ws, {
              type: "input_ack",
              sessionId: session.sessionId,
              queued: false,
              text,
              force: true,
            });
            broadcastSessionList();
            void persistSessions();
            return;
          }

          if (session.status !== "idle") {
            session.queuedInputs.push({
              id: randomUUID().slice(0, 8),
              text,
              queuedAt: new Date().toISOString(),
            });
            session.updatedAt = new Date().toISOString();
            send(ws, {
              type: "input_ack",
              sessionId: session.sessionId,
              queued: true,
              text,
            });
            broadcastSessionList();
            void persistSessions();
            return;
          }

          dispatchSessionInput(session, text);
          send(ws, {
            type: "input_ack",
            sessionId: session.sessionId,
            queued: false,
            text,
          });
          return;
        }

        case "interrupt":
          if (!session.codexSession) {
            send(ws, {
              type: "error",
              message: `Session ${message.sessionId} is restored history only.`,
            });
            return;
          }
          session.codexSession.interrupt();
          return;

        case "approve":
          if (!session.codexSession) {
            send(ws, {
              type: "error",
              message: `Session ${message.sessionId} is restored history only.`,
            });
            return;
          }
          session.pendingPermission = null;
          session.codexSession.approve(message.toolUseId, message.updatedInput);
          broadcastSessionList();
          return;

        case "reject":
          if (!session.codexSession) {
            send(ws, {
              type: "error",
              message: `Session ${message.sessionId} is restored history only.`,
            });
            return;
          }
          session.pendingPermission = null;
          session.codexSession.reject(message.toolUseId, message.message);
          broadcastSessionList();
          return;

        case "answer":
          if (!session.codexSession) {
            send(ws, {
              type: "error",
              message: `Session ${message.sessionId} is restored history only.`,
            });
            return;
          }
          session.pendingPermission = null;
          session.codexSession.answer(message.toolUseId, message.result);
          broadcastSessionList();
          return;

        case "set_session_pin":
          session.pinned = message.pinned;
          session.updatedAt = new Date().toISOString();
          broadcastSessionList();
          void persistSessions();
          return;

        case "set_session_completion":
          session.completed = message.completed;
          session.updatedAt = new Date().toISOString();
          broadcastSessionList();
          void persistSessions();
          return;
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  await listen(httpServer, options.port, host);
  const persistedState = await stateStore.load();
  recentProjectPaths.splice(0, recentProjectPaths.length, ...persistedState.recentProjectPaths);
  persistedState.sessions.forEach((restored) => {
    const restoredHistory = fromPersistedHistory(restored.history);
    if (!recentProjectPaths.includes(restored.projectPath)) {
      rememberProjectPath(restored.projectPath);
    }
    sessions.set(restored.sessionId, {
      sessionId: restored.sessionId,
      projectPath: restored.projectPath,
      title: restored.title,
      storedPreview: "",
      storedAnswerState: "",
      status: "stopped",
      createdAt: restored.createdAt,
      updatedAt: restored.updatedAt,
      model: restored.model,
      modelReasoningEffort: restored.modelReasoningEffort,
      permissionMode: normalizePermissionMode(restored.permissionMode),
      pinned: restored.pinned,
      completed: restored.completed,
      codexSession: null,
      history: restoredHistory,
      queuedInputs: [],
      pendingPermission: null,
    });
  });
  await syncStoredCodexSessions();
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine listening port");
  }

  return {
    port: address.port,
    async close() {
      await persistSessions();
      for (const session of sessions.values()) {
        session.codexSession?.stop();
      }
      sessions.clear();
      for (const client of wss.clients) {
        client.close();
      }
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          wss.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
      ]);
    },
  };
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;

    if (data.type === "start" && typeof data.projectPath === "string") {
      return {
        type: "start",
        projectPath: data.projectPath,
        ...(typeof data.model === "string" ? { model: data.model } : {}),
        ...(typeof data.modelReasoningEffort === "string"
          ? { modelReasoningEffort: data.modelReasoningEffort }
          : {}),
        ...(data.permissionMode === "plan" ? { permissionMode: "plan" as const } : {}),
      };
    }

    if (data.type === "input" && typeof data.sessionId === "string" && typeof data.text === "string") {
      return {
        type: "input",
        sessionId: data.sessionId,
        text: data.text,
        ...(data.force === true ? { force: true } : {}),
      };
    }

    if (data.type === "interrupt" && typeof data.sessionId === "string") {
      return { type: "interrupt", sessionId: data.sessionId };
    }

    if (data.type === "approve" && typeof data.sessionId === "string") {
      return {
        type: "approve",
        sessionId: data.sessionId,
        ...(typeof data.toolUseId === "string" ? { toolUseId: data.toolUseId } : {}),
        ...(isRecord(data.updatedInput) ? { updatedInput: data.updatedInput } : {}),
      };
    }

    if (data.type === "reject" && typeof data.sessionId === "string") {
      return {
        type: "reject",
        sessionId: data.sessionId,
        ...(typeof data.toolUseId === "string" ? { toolUseId: data.toolUseId } : {}),
        ...(typeof data.message === "string" ? { message: data.message } : {}),
      };
    }

    if (
      data.type === "answer"
      && typeof data.sessionId === "string"
      && typeof data.toolUseId === "string"
      && typeof data.result === "string"
    ) {
      return {
        type: "answer",
        sessionId: data.sessionId,
        toolUseId: data.toolUseId,
        result: data.result,
      };
    }

    if (data.type === "list_sessions") {
      return { type: "list_sessions" };
    }

    if (data.type === "get_history" && typeof data.sessionId === "string") {
      return { type: "get_history", sessionId: data.sessionId };
    }

    if (
      data.type === "set_session_pin"
      && typeof data.sessionId === "string"
      && typeof data.pinned === "boolean"
    ) {
      return { type: "set_session_pin", sessionId: data.sessionId, pinned: data.pinned };
    }

    if (
      data.type === "set_session_completion"
      && typeof data.sessionId === "string"
      && typeof data.completed === "boolean"
    ) {
      return {
        type: "set_session_completion",
        sessionId: data.sessionId,
        completed: data.completed,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeHistoryMessage(
  sessionId: string,
  timestamp: string,
  message: Record<string, unknown>,
): HistoryMessage | null {
  if (message.type === "thinking_delta" && typeof message.text === "string") {
    return {
      type: "thinking_delta",
      sessionId,
      timestamp,
      text: message.text,
      ...(typeof message.id === "string" ? { id: message.id } : {}),
    };
  }

  if (message.type === "stream_delta" && typeof message.text === "string") {
    return {
      type: "stream_delta",
      sessionId,
      timestamp,
      text: message.text,
      ...(typeof message.id === "string" ? { id: message.id } : {}),
    };
  }

  if (message.type === "assistant" && isRecord(message.message)) {
    const normalizedMessage = normalizeAssistantMessage(message.message);
    if (!normalizedMessage) {
      return null;
    }
    return {
      type: "assistant",
      sessionId,
      timestamp,
      message: normalizedMessage,
    };
  }

  if (
    message.type === "tool_result"
    && typeof message.toolUseId === "string"
    && typeof message.content === "string"
  ) {
    return {
      type: "tool_result",
      sessionId,
      timestamp,
      toolUseId: message.toolUseId,
      content: message.content,
      ...(typeof message.toolName === "string" ? { toolName: message.toolName } : {}),
    };
  }

  if (message.type === "error" && typeof message.message === "string") {
    return {
      type: "error",
      sessionId,
      timestamp,
      message: message.message,
    };
  }

  return null;
}

function normalizeAssistantMessage(value: Record<string, unknown>): AssistantMessage | null {
  if (
    typeof value.id !== "string"
    || value.role !== "assistant"
    || !Array.isArray(value.content)
    || typeof value.model !== "string"
  ) {
    return null;
  }

  const content: Array<AssistantTextContent | AssistantToolUseContent> = [];
  value.content.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.type !== "string") {
      return;
    }
    if (entry.type === "text" && typeof entry.text === "string") {
      content.push({ type: "text", text: entry.text });
      return;
    }
    if (
      entry.type === "tool_use"
      && typeof entry.id === "string"
      && typeof entry.name === "string"
      && isRecord(entry.input)
    ) {
      content.push({
        type: "tool_use",
        id: entry.id,
        name: entry.name,
        input: entry.input,
      });
      return;
    }
  });

  return {
    id: value.id,
    role: "assistant",
    content,
    model: value.model,
    ...(value.phase === "commentary" || value.phase === "final_answer"
      ? { phase: value.phase }
      : {}),
  };
}

function toPersistedHistory(history: HistoryMessage[]): PersistedHistoryMessage[] {
  return history.map((message) => ({ ...message }));
}

function fromPersistedHistory(history: PersistedHistoryMessage[]): HistoryMessage[] {
  const restored: HistoryMessage[] = [];

  history.forEach((message) => {
    if (message.type === "user" && typeof message.text === "string") {
      restored.push({
        type: "user",
        sessionId: message.sessionId,
        timestamp: message.timestamp,
        text: message.text,
      });
      return;
    }

    if (message.type === "thinking_delta" && typeof message.text === "string") {
      restored.push({
        type: "thinking_delta",
        sessionId: message.sessionId,
        timestamp: message.timestamp,
        text: message.text,
        ...(typeof message.id === "string" ? { id: message.id } : {}),
      });
      return;
    }

    if (message.type === "stream_delta" && typeof message.text === "string") {
      restored.push({
        type: "stream_delta",
        sessionId: message.sessionId,
        timestamp: message.timestamp,
        text: message.text,
        ...(typeof message.id === "string" ? { id: message.id } : {}),
      });
      return;
    }

    if (message.type === "assistant" && isRecord(message.message)) {
      const normalized = normalizeAssistantMessage(message.message);
      if (!normalized) {
        return;
      }
      restored.push({
        type: "assistant",
        sessionId: message.sessionId,
        timestamp: message.timestamp,
        message: normalized,
      });
      return;
    }

    if (
      message.type === "tool_result"
      && typeof message.toolUseId === "string"
      && typeof message.content === "string"
    ) {
      restored.push({
        type: "tool_result",
        sessionId: message.sessionId,
        timestamp: message.timestamp,
        toolUseId: message.toolUseId,
        content: message.content,
        ...(typeof message.toolName === "string" ? { toolName: message.toolName } : {}),
      });
      return;
    }

    if (message.type === "error" && typeof message.message === "string") {
      restored.push({
        type: "error",
        sessionId: message.sessionId,
        timestamp: message.timestamp,
        message: message.message,
      });
    }
  });

  return restored;
}

function normalizePendingPermission(message: Record<string, unknown>): PendingPermission {
  return {
    toolUseId: typeof message.toolUseId === "string" ? message.toolUseId : randomUUID().slice(0, 8),
    toolName: typeof message.toolName === "string" ? message.toolName : "Approval",
    input: isRecord(message.input) ? message.input : {},
  };
}

function normalizeStatus(value: unknown): SessionStatus {
  return value === "running" || value === "waiting_approval" || value === "starting"
    ? value
    : "idle";
}

function normalizePermissionMode(value: unknown): PermissionMode {
  return value === "plan" ? "plan" : "default";
}

function normalizeModel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeModelReasoningEffort(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "minimal"
    || normalized === "low"
    || normalized === "medium"
    || normalized === "high"
    || normalized === "xhigh"
    ? normalized
    : "";
}

function defaultSessionTitle(projectPath: string): string {
  const short = basename(projectPath.trim()) || "Codex";
  return `New Chat: ${short}`;
}

function isDefaultSessionTitle(title: string, projectPath: string): boolean {
  return title === defaultSessionTitle(projectPath);
}

function automaticSessionTitle(text: string): string {
  const firstMeaningfulLine = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstMeaningfulLine) {
    return "New Chat";
  }
  const collapsed = firstMeaningfulLine.replace(/\s+/gu, " ").trim();
  return collapsed.length > 80 ? `${collapsed.slice(0, 77).trimEnd()}...` : collapsed;
}

function summarizeSessionPreview(session: SessionRecord): string {
  for (let index = session.history.length - 1; index >= 0; index -= 1) {
    const item = session.history[index];
    if (!item) {
      continue;
    }
    if (item.type === "assistant") {
      const text = item.message.content
        .filter((entry): entry is AssistantTextContent => entry.type === "text")
        .map((entry) => entry.text.trim())
        .filter(Boolean)
        .join("\n");
      if (text) {
        return collapseWhitespace(text);
      }
      const toolUse = item.message.content.find(
        (entry): entry is AssistantToolUseContent => entry.type === "tool_use",
      );
      if (toolUse) {
        return collapseWhitespace(String(toolUse.input.command ?? toolUse.name));
      }
    }
    if (item.type === "user") {
      return collapseWhitespace(item.text);
    }
    if (item.type === "tool_result") {
      return collapseWhitespace(item.content);
    }
    if (item.type === "error") {
      return collapseWhitespace(item.message);
    }
  }
  return "";
}

function summarizeSessionAnswerState(session: SessionRecord): SessionAnswerState {
  let answerState = session.storedAnswerState;

  for (const item of session.history) {
    if (item.type === "user") {
      answerState = "commentary";
      continue;
    }
    if (item.type === "assistant") {
      if (item.message.phase === "final_answer") {
        answerState = "final_answer";
        continue;
      }
      if (item.message.phase === "commentary" || item.message.content.length > 0) {
        answerState = "commentary";
      }
      continue;
    }
    if (item.type === "thinking_delta" || item.type === "stream_delta" || item.type === "tool_result") {
      answerState = "commentary";
      continue;
    }
    if (item.type === "error") {
      answerState = "";
    }
  }

  return answerState;
}

function collapseWhitespace(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 90) {
    return normalized;
  }
  return `${normalized.slice(0, 87).trimEnd()}...`;
}

function compareSessionsForList(left: SessionRecord, right: SessionRecord): number {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

async function listen(server: HttpServer, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", reject);
  });
}
