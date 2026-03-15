import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { getStoredCodexSessionHistory } from "../src/codex-sessions.js";

describe("getStoredCodexSessionHistory", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  it("deduplicates stored user and assistant text messages emitted in two formats", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "codex-browser-bridge-history-"));
    tempRoots.push(tempRoot);
    const sessionsRoot = join(tempRoot, "sessions");
    const dayDir = join(sessionsRoot, "2026", "03", "16");
    const filePath = join(dayDir, "rollout-2026-03-16T00-00-00-thread_dup.jsonl");
    await mkdir(dayDir, { recursive: true });
    const lines = [
      JSON.stringify({
        timestamp: "2026-03-16T00:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "thread_dup",
          cwd: "/workspace/app",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-16T00:00:01.000Z",
        type: "turn_context",
        payload: {
          model: "gpt-5.4",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-16T00:00:02.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: "Add these tables",
          }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-16T00:00:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Add these tables",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-16T00:00:03.000Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Done",
          phase: "final_answer",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-16T00:00:03.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "final_answer",
          content: [{
            type: "output_text",
            text: "Done",
          }],
        },
      }),
    ];
    await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");

    const history = await getStoredCodexSessionHistory("thread_dup", sessionsRoot);

    expect(history).toEqual([
      {
        type: "user",
        sessionId: "thread_dup",
        timestamp: "2026-03-16T00:00:02.000Z",
        text: "Add these tables",
      },
      {
        type: "assistant",
        sessionId: "thread_dup",
        timestamp: "2026-03-16T00:00:03.000Z",
        message: {
          id: "agent_4",
          role: "assistant",
          model: "gpt-5.4",
          phase: "final_answer",
          content: [{
            type: "text",
            text: "Done",
          }],
        },
      },
    ]);
  });
});
