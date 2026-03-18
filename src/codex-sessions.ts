import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";

type PermissionMode = "default" | "plan";
type SessionAnswerState = "" | "commentary" | "final_answer";

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

export type CodexHistoryMessage =
  | { type: "user"; sessionId: string; timestamp: string; text: string }
  | { type: "thinking_delta"; sessionId: string; timestamp: string; id?: string; text: string }
  | { type: "assistant"; sessionId: string; timestamp: string; message: AssistantMessage };

export interface StoredCodexSessionSummary {
  sessionId: string;
  projectPath: string;
  title: string;
  preview: string;
  answerState: SessionAnswerState;
  finalAnswerAt?: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  modelReasoningEffort: string;
  permissionMode: PermissionMode;
}

interface ParseState {
  threadId: string;
  projectPath: string;
  firstPrompt: string;
  lastPrompt: string;
  lastAssistantText: string;
  answerState: SessionAnswerState;
  finalAnswerAt: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  modelReasoningEffort: string;
  permissionMode: PermissionMode;
  hasExplicitSessionId: boolean;
}

export function getDefaultCodexSessionRoot(override?: string): string {
  if (override?.trim()) {
    return override.trim();
  }
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
  return join(codexHome, "sessions");
}

export async function listStoredCodexSessions(rootOverride?: string): Promise<StoredCodexSessionSummary[]> {
  const root = getDefaultCodexSessionRoot(rootOverride);
  const filePaths = await listJsonlFiles(root);
  const sessions = await Promise.all(filePaths.map(async (filePath) => {
    const parsed = await parseCodexSessionSummaryFile(filePath);
    return parsed;
  }));

  return sessions
    .filter((session): session is StoredCodexSessionSummary => session !== null)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export async function getStoredCodexSessionHistory(
  threadId: string,
  rootOverride?: string,
): Promise<CodexHistoryMessage[]> {
  const filePath = await findStoredCodexSessionFile(threadId, rootOverride);
  if (!filePath) {
    return [];
  }

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  const messages: CodexHistoryMessage[] = [];
  let model = "";

  raw.split("\n").forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : new Date(0).toISOString();

    if (entry.type === "turn_context") {
      const payload = asObject(entry.payload);
      if (typeof payload?.model === "string") {
        model = payload.model;
      }
      return;
    }

    if (entry.type === "event_msg") {
      const payload = asObject(entry.payload);
      if (!payload) {
        return;
      }

      if (payload.type === "user_message") {
        const text = typeof payload.message === "string" ? payload.message : "";
        if (!text.trim()) {
          return;
        }
        messages.push({
          type: "user",
          sessionId: threadId,
          timestamp,
          text,
        });
        return;
      }

      if (payload.type === "agent_message" && typeof payload.message === "string" && payload.message.trim()) {
        messages.push({
          type: "assistant",
          sessionId: threadId,
          timestamp,
          message: {
            id: `agent_${index}`,
            role: "assistant",
            model,
            ...(payload.phase === "commentary" || payload.phase === "final_answer"
              ? { phase: payload.phase }
              : {}),
            content: [{ type: "text", text: payload.message }],
          },
        });
      }
      return;
    }

    if (entry.type !== "response_item") {
      return;
    }

    const payload = asObject(entry.payload);
    if (!payload) {
      return;
    }

    if (payload.type === "message") {
      const phase = payload.phase === "commentary" || payload.phase === "final_answer"
        ? payload.phase
        : undefined;
      const content = Array.isArray(payload.content) ? payload.content : [];

      if (payload.role === "user") {
        const text = content
          .filter((item) => isObjectWithType(item, "input_text") && typeof item.text === "string")
          .map((item) => item.text as string)
          .join("\n");
        if (text.trim() && !isCodexInjectedUserContext(text)) {
          messages.push({
            type: "user",
            sessionId: threadId,
            timestamp,
            text,
          });
        }
        return;
      }

      if (payload.role === "assistant") {
        const reasoning = content
          .filter((item) => isObjectWithType(item, "reasoning") && typeof item.text === "string")
          .map((item) => item.text as string)
          .join("\n");
        if (reasoning.trim()) {
          messages.push({
            type: "thinking_delta",
            sessionId: threadId,
            timestamp,
            id: `reasoning_${index}`,
            text: reasoning,
          });
        }

        const text = content
          .filter((item) => isObjectWithType(item, "output_text") && typeof item.text === "string")
          .map((item) => item.text as string)
          .join("\n");
        if (text.trim()) {
          messages.push({
            type: "assistant",
            sessionId: threadId,
            timestamp,
            message: {
              id: `message_${index}`,
              role: "assistant",
              model,
              ...(phase ? { phase } : {}),
              content: [{ type: "text", text }],
            },
          });
        }
        return;
      }
    }

    const toolUse = parseToolUsePayload(payload, index);
    if (!toolUse) {
      return;
    }

    messages.push({
      type: "assistant",
      sessionId: threadId,
      timestamp,
      message: {
        id: toolUse.id,
        role: "assistant",
        model,
        phase: "commentary",
        content: [{
          type: "tool_use",
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        }],
      },
    });
  });

  return dedupeStoredHistory(messages);
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true }) as Dirent[];
    } catch {
      continue;
    }

    entries.forEach((entry) => {
      const filePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(filePath);
        return;
      }
      if (entry.isFile() && filePath.endsWith(".jsonl")) {
        files.push(filePath);
      }
    });
  }

  return files;
}

async function parseCodexSessionSummaryFile(filePath: string): Promise<StoredCodexSessionSummary | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const fallbackSessionId = extractFallbackSessionId(filePath);
  const state: ParseState = {
    threadId: fallbackSessionId,
    projectPath: "",
    firstPrompt: "",
    lastPrompt: "",
    lastAssistantText: "",
    answerState: "",
    finalAnswerAt: "",
    createdAt: "",
    updatedAt: "",
    model: "",
    modelReasoningEffort: "",
    permissionMode: "default",
    hasExplicitSessionId: false,
  };

  raw.split("\n").forEach((line) => {
    if (!line.trim()) {
      return;
    }

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    applySummaryEntry(state, entry);
  });

  if (!state.projectPath || (!state.firstPrompt && !state.lastAssistantText && !state.lastPrompt)) {
    return null;
  }

  if (!state.createdAt || !state.updatedAt) {
    try {
      const fileStat = await stat(filePath);
      const fallbackTimestamp = new Date(fileStat.mtimeMs).toISOString();
      state.createdAt ||= fallbackTimestamp;
      state.updatedAt ||= fallbackTimestamp;
    } catch {
      state.createdAt ||= new Date(0).toISOString();
      state.updatedAt ||= state.createdAt;
    }
  }

  return {
    sessionId: state.threadId,
    projectPath: state.projectPath,
    title: collapseTitle(state.firstPrompt || defaultSessionTitle(state.projectPath)),
    preview: collapsePreview(state.lastAssistantText || state.lastPrompt || state.firstPrompt),
    answerState: state.answerState,
    ...(state.finalAnswerAt ? { finalAnswerAt: state.finalAnswerAt } : {}),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    model: state.model,
    modelReasoningEffort: state.modelReasoningEffort,
    permissionMode: state.permissionMode,
  };
}

function applySummaryEntry(state: ParseState, entry: Record<string, unknown>): void {
  const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";
  if (timestamp) {
    state.createdAt ||= timestamp;
    state.updatedAt = timestamp;
  }

  if (entry.type === "session_meta") {
    const payload = asObject(entry.payload);
    if (!payload) {
      return;
    }
    if (!state.hasExplicitSessionId && typeof payload.id === "string" && payload.id.trim()) {
      state.threadId = payload.id;
      state.hasExplicitSessionId = true;
    }
    if (typeof payload.cwd === "string" && payload.cwd.trim()) {
      state.projectPath ||= payload.cwd;
    }
    return;
  }

  if (entry.type === "turn_context") {
    const payload = asObject(entry.payload);
    if (!payload) {
      return;
    }
    if (typeof payload.model === "string") {
      state.model = payload.model;
    }
    const collaborationMode = asObject(payload.collaboration_mode);
    if (collaborationMode && typeof collaborationMode.mode === "string") {
      state.permissionMode = collaborationMode.mode === "plan" ? "plan" : "default";
    }
    const settings = asObject(collaborationMode?.settings);
    if (typeof settings?.reasoning_effort === "string") {
      state.modelReasoningEffort = settings.reasoning_effort;
    }
    return;
  }

  if (entry.type === "event_msg") {
    const payload = asObject(entry.payload);
    if (!payload) {
      return;
    }
    if (payload.type === "user_message" && typeof payload.message === "string" && payload.message.trim()) {
      state.firstPrompt ||= payload.message;
      state.lastPrompt = payload.message;
      state.answerState = "commentary";
      return;
    }
    if (payload.type === "agent_message" && typeof payload.message === "string" && payload.message.trim()) {
      state.lastAssistantText = payload.message;
      state.answerState = "final_answer";
      state.finalAnswerAt = timestamp || state.finalAnswerAt;
    }
    return;
  }

  if (entry.type !== "response_item") {
    return;
  }

  const payload = asObject(entry.payload);
  if (!payload || payload.type !== "message") {
    return;
  }

  if (payload.role === "user") {
    const content = Array.isArray(payload.content) ? payload.content : [];
    const text = content
      .filter((item) => isObjectWithType(item, "input_text") && typeof item.text === "string")
      .map((item) => item.text as string)
      .join("\n");
    if (text.trim() && !isCodexInjectedUserContext(text)) {
      state.firstPrompt ||= text;
      state.lastPrompt = text;
      state.answerState = "commentary";
    }
    return;
  }

  if (payload.role !== "assistant") {
    return;
  }

  const content = Array.isArray(payload.content) ? payload.content : [];
  const text = content
    .filter((item) => isObjectWithType(item, "output_text") && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
  if (text.trim()) {
    state.lastAssistantText = text;
  }
  if (payload.phase === "commentary") {
    state.answerState = "commentary";
    return;
  }
  if (payload.phase === "final_answer" || text.trim()) {
    state.answerState = "final_answer";
    state.finalAnswerAt = timestamp || state.finalAnswerAt;
  }
}

async function findStoredCodexSessionFile(
  threadId: string,
  rootOverride?: string,
): Promise<string | null> {
  const root = getDefaultCodexSessionRoot(rootOverride);
  const filePaths = await listJsonlFiles(root);
  const candidateByName = filePaths.filter((filePath) => isThreadFilenameCandidate(filePath, threadId));
  const namedMatch = await pickNewestFile(candidateByName);
  if (namedMatch) {
    return namedMatch;
  }

  for (const filePath of filePaths) {
    const summary = await parseCodexSessionSummaryFile(filePath);
    if (summary?.sessionId === threadId) {
      return filePath;
    }
  }

  return null;
}

async function pickNewestFile(filePaths: string[]): Promise<string | null> {
  let latest: { filePath: string; mtimeMs: number } | null = null;

  for (const filePath of filePaths) {
    try {
      const fileStat = await stat(filePath);
      if (!latest || fileStat.mtimeMs > latest.mtimeMs) {
        latest = { filePath, mtimeMs: fileStat.mtimeMs };
      }
    } catch {
      continue;
    }
  }

  return latest?.filePath ?? null;
}

function isThreadFilenameCandidate(filePath: string, threadId: string): boolean {
  const fileName = basename(filePath);
  return fileName === `${threadId}.jsonl` || fileName.endsWith(`-${threadId}.jsonl`);
}

function extractFallbackSessionId(filePath: string): string {
  const fileName = basename(filePath, ".jsonl");
  const match = fileName.match(/([0-9a-f]{8}-[0-9a-f-]{27,})$/i);
  return match?.[1] ?? fileName;
}

function dedupeStoredHistory(messages: CodexHistoryMessage[]): CodexHistoryMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const fingerprint = getStoredHistoryFingerprint(message);
    if (!fingerprint) {
      return true;
    }
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

function getStoredHistoryFingerprint(message: CodexHistoryMessage): string | null {
  if (message.type === "user") {
    return [
      "user",
      message.timestamp,
      normalizeStoredHistoryText(message.text),
    ].join("\u0000");
  }

  if (message.type !== "assistant") {
    return null;
  }

  const text = message.message.content
    .filter((item): item is AssistantTextContent => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  if (!text.trim()) {
    return null;
  }

  return [
    "assistant",
    message.timestamp,
    message.message.phase ?? "",
    normalizeStoredHistoryText(text),
  ].join("\u0000");
}

function normalizeStoredHistoryText(text: string): string {
  return text.trim();
}

function parseToolUsePayload(
  payload: Record<string, unknown>,
  index: number,
): { id: string; name: string; input: Record<string, unknown> } | null {
  if (payload.type === "function_call") {
    return {
      id: typeof payload.call_id === "string" ? payload.call_id : `tool_${index}`,
      name: normalizeCodexToolName(typeof payload.name === "string" ? payload.name : "tool"),
      input: parseObjectLike(payload.arguments),
    };
  }

  if (payload.type === "custom_tool_call") {
    return {
      id: typeof payload.call_id === "string" ? payload.call_id : `tool_${index}`,
      name: normalizeCodexToolName(typeof payload.name === "string" ? payload.name : "custom_tool"),
      input: parseObjectLike(payload.input),
    };
  }

  if (payload.type === "command_execution") {
    return {
      id: typeof payload.id === "string" ? payload.id : `tool_${index}`,
      name: "Bash",
      input: typeof payload.command === "string" ? { command: payload.command } : parseObjectLike(payload),
    };
  }

  if (payload.type === "web_search_call" || payload.type === "web_search") {
    return {
      id: typeof payload.call_id === "string"
        ? payload.call_id
        : typeof payload.id === "string"
          ? payload.id
          : `tool_${index}`,
      name: "WebSearch",
      input: getCodexSearchInput(payload),
    };
  }

  if (payload.type === "mcp_tool_call") {
    const server = typeof payload.server === "string" ? payload.server : "unknown";
    const tool = typeof payload.tool === "string" ? payload.tool : "tool";
    return {
      id: typeof payload.id === "string"
        ? payload.id
        : typeof payload.call_id === "string"
          ? payload.call_id
          : `tool_${index}`,
      name: `mcp:${server}/${tool}`,
      input: parseObjectLike(payload.arguments),
    };
  }

  return null;
}

function parseObjectLike(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return asObject(parsed) ?? { value: parsed };
    } catch {
      return { value };
    }
  }
  return asObject(value) ?? {};
}

function getCodexSearchInput(payload: Record<string, unknown>): Record<string, unknown> {
  const action = asObject(payload.action);
  if (typeof payload.query === "string") {
    return { query: payload.query };
  }
  if (typeof action?.query === "string") {
    return { query: action.query };
  }
  if (Array.isArray(action?.queries)) {
    return { queries: action.queries.filter((entry) => typeof entry === "string") };
  }
  return {};
}

function normalizeCodexToolName(name: string): string {
  if (name === "exec_command" || name === "write_stdin") {
    return "Bash";
  }
  if (name.startsWith("mcp__")) {
    const [server, ...toolParts] = name.slice("mcp__".length).split("__");
    if (server && toolParts.length > 0) {
      return `mcp:${server}/${toolParts.join("__")}`;
    }
  }
  return name;
}

function isCodexInjectedUserContext(text: string): boolean {
  const normalized = text.trimStart();
  return (
    normalized.startsWith("# AGENTS.md instructions for ")
    || normalized.startsWith("<environment_context>")
    || normalized.startsWith("<permissions instructions>")
  );
}

function defaultSessionTitle(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  const short = parts.at(-1) || "Codex";
  return `New Chat: ${short}`;
}

function collapseTitle(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return "New Chat";
  }
  return normalized.length > 80 ? `${normalized.slice(0, 77).trimEnd()}...` : normalized;
}

function collapsePreview(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 90) {
    return normalized;
  }
  return `${normalized.slice(0, 87).trimEnd()}...`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isObjectWithType(value: unknown, type: string): value is Record<string, unknown> {
  const object = asObject(value);
  return object?.type === type;
}
