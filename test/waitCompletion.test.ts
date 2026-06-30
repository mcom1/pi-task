/**
 * Unit tests for the foreground wait / cancel behavior.
 *
 * Covers:
 * - signal abort returns partial content from the JSONL when available
 * - signal abort returns the generic message when JSONL has nothing
 * - successful completion still works
 *
 * Run: npx tsx --test test/waitCompletion.test.ts
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitForTaskCompletion } from "../src/subagent/waitCompletion.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSessionFileWithText(text: string, stopReason: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  const sessionDir = join(dir, "sessions", "test-task");
  mkdirSync(sessionDir, { recursive: true });
  const file = join(sessionDir, "task-test.jsonl");
  writeFileSync(
    file,
    JSON.stringify({
      type: "session_info",
      data: { name: "task-test", cwd: dir },
      id: "019f0000-0000-7000-8000-000000000001",
      name: "task-test",
    }) +
      "\n" +
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          stopReason,
          content: [{ type: "text", text }],
        },
        timestamp: new Date().toISOString(),
      }) +
      "\n",
  );
  return dir;
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

{
  const t = "signal abort returns the partial text already in the JSONL";
  const dir = makeSessionFileWithText(
    "Found three commits on the remote. The fix landed in 1.2.3.",
    "toolUse", // mid-streaming — the assistant hasn't formally "stopped" yet
  );
  try {
    const controller = new AbortController();
    controller.abort(); // already aborted before we even start
    const result = await waitForTaskCompletion({
      sessionDir: join(dir, "sessions", "test-task"),
      sessionName: "task-test",
      paneId: undefined,
      signal: controller.signal,
      timeoutMs: 1000,
    });
    assert.equal(result.status, "cancelled", `${t}: status`);
    assert.ok(
      result.content.includes("Found three commits on the remote"),
      `${t}: partial content preserved`,
    );
    assert.equal(result.source, "signal", `${t}: source`);
  } finally {
    cleanup(dir);
  }
}

{
  const t = "signal abort with no JSONL content returns the generic message";
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  try {
    // Empty session dir — no file at all.
    const sessionDir = join(dir, "sessions", "test-task");
    mkdirSync(sessionDir, { recursive: true });
    const controller = new AbortController();
    controller.abort();
    const result = await waitForTaskCompletion({
      sessionDir,
      sessionName: "task-test",
      paneId: undefined,
      signal: controller.signal,
      timeoutMs: 1000,
    });
    assert.equal(result.status, "cancelled", `${t}: status`);
    assert.equal(result.content, "Task was cancelled.", `${t}: fallback message`);
  } finally {
    cleanup(dir);
  }
}

{
  const t = "successful completion returns the terminal text";
  const dir = makeSessionFileWithText("All done — see the report.", "stop");
  try {
    const result = await waitForTaskCompletion({
      sessionDir: join(dir, "sessions", "test-task"),
      sessionName: "task-test",
      paneId: undefined,
      timeoutMs: 5000,
      pollMs: 50,
    });
    assert.equal(result.status, "completed", `${t}: status`);
    assert.ok(
      result.content.includes("All done — see the report"),
      `${t}: content`,
    );
  } finally {
    cleanup(dir);
  }
}

console.log("ALL WAIT COMPLETION TESTS PASSED");
