import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface PersistedHistoryMessage {
  type: string;
  sessionId: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface PersistedPendingPermission {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface PersistedSessionRecord {
  sessionId: string;
  projectPath: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  modelReasoningEffort: string;
  permissionMode: string;
  pinned: boolean;
  completed: boolean;
  history: PersistedHistoryMessage[];
  pendingPermission: PersistedPendingPermission | null;
}

export interface PersistedBridgeState {
  sessions: PersistedSessionRecord[];
  recentProjectPaths: string[];
}

export class SessionStateStore {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string | null) {}

  async load(): Promise<PersistedBridgeState> {
    if (!this.filePath) {
      return { sessions: [], recentProjectPaths: [] };
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      if (!raw.trim()) {
        return { sessions: [], recentProjectPaths: [] };
      }
      const parsed = JSON.parse(raw) as PersistedBridgeState;
      if (!parsed || !Array.isArray(parsed.sessions)) {
        return { sessions: [], recentProjectPaths: [] };
      }
      return {
        sessions: parsed.sessions.flatMap((session) => normalizeSession(session)),
        recentProjectPaths: normalizeRecentProjectPaths(parsed.recentProjectPaths),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return { sessions: [], recentProjectPaths: [] };
      }
      throw error;
    }
  }

  async save(state: PersistedBridgeState): Promise<void> {
    const filePath = this.filePath;
    if (!filePath) {
      return;
    }

    this.pendingWrite = this.pendingWrite.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const tempFilePath = `${filePath}.tmp`;
      await writeFile(tempFilePath, JSON.stringify(state, null, 2), "utf8");
      await rename(tempFilePath, filePath);
    });

    await this.pendingWrite;
  }
}

function normalizeSession(value: unknown): PersistedSessionRecord[] {
  if (!isRecord(value)) {
    return [];
  }

  const sessionId = asString(value.sessionId);
  const projectPath = asString(value.projectPath);
  const createdAt = asString(value.createdAt);
  const updatedAt = asString(value.updatedAt);
  if (!sessionId || !projectPath || !createdAt || !updatedAt) {
    return [];
  }

  return [{
    sessionId,
    projectPath,
    title: asString(value.title) || `Session ${sessionId}`,
    status: asString(value.status) || "stopped",
    createdAt,
    updatedAt,
    model: asString(value.model),
    modelReasoningEffort: asString(value.modelReasoningEffort),
    permissionMode: asString(value.permissionMode) || "default",
    pinned: value.pinned === true,
    completed: value.completed === true,
    history: Array.isArray(value.history)
      ? value.history.filter((entry): entry is PersistedHistoryMessage => isRecord(entry) && typeof entry.type === "string" && typeof entry.sessionId === "string" && typeof entry.timestamp === "string")
      : [],
    pendingPermission: normalizePendingPermission(value.pendingPermission),
  }];
}

function normalizePendingPermission(value: unknown): PersistedPendingPermission | null {
  if (!isRecord(value)) {
    return null;
  }
  const toolUseId = asString(value.toolUseId);
  const toolName = asString(value.toolName);
  const input = isRecord(value.input) ? value.input : null;
  if (!toolUseId || !toolName || !input) {
    return null;
  }
  return { toolUseId, toolName, input };
}

function normalizeRecentProjectPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  value.forEach((entry) => {
    const normalized = asString(entry).trim();
    if (!normalized) {
      return;
    }
    unique.add(normalized);
  });
  return Array.from(unique).slice(0, 12);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
