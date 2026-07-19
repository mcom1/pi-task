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
import { waitForTaskCompletion, checkTaskCompletion } from "../src/subagent/waitCompletion.js";

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

{
  const t = "terminal JSONL result takes precedence over an exit sentinel";
  const dir = makeSessionFileWithText("valid final result", "stop");
  const sentinelPath = join(dir, "task.exit.json");
  writeFileSync(sentinelPath, JSON.stringify({
    schemaVersion: 1,
    taskId: "task-test",
    exitCode: 1,
    completedAt: new Date().toISOString(),
  }));
  try {
    const result = await waitForTaskCompletion({
      sessionDir: join(dir, "sessions", "test-task"),
      sessionName: "task-test",
      taskId: "task-test",
      exitSentinelPath: sentinelPath,
      timeoutMs: 5000,
      pollMs: 50,
    });
    assert.equal(result.status, "completed", t);
    assert.match(result.content, /valid final result/, t);
  } finally {
    cleanup(dir);
  }
}

for (const reason of ["stop", "endTurn", "length", "error", "aborted"]) {
  const t = `terminal stop reason ${reason} remains completed`;
  const dir = makeSessionFileWithText(`terminal ${reason}`, reason);
  try {
    const result = await waitForTaskCompletion({
      sessionDir: join(dir, "sessions", "test-task"),
      sessionName: "task-test",
      timeoutMs: 5000,
      pollMs: 50,
    });
    assert.equal(result.status, "completed", t);
  } finally {
    cleanup(dir);
  }
}

{
  const t = "newest JSONL file is preferred over older ones";
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  try {
    const sessionDir = join(dir, "sessions", "test-task");
    mkdirSync(sessionDir, { recursive: true });

    // Write an older JSONL file with non-terminal content
    const oldFile = join(sessionDir, "task-test.jsonl");
    writeFileSync(oldFile, JSON.stringify({
      type: "session_info",
      data: { name: "task-test" },
      id: "019f0000-0000-7000-8000-000000000001",
      name: "task-test",
    }) + "\n");

    // Write a newer JSONL file with terminal content
    const newFile = join(sessionDir, "task-test.2.jsonl");
    writeFileSync(newFile, JSON.stringify({
      type: "session_info",
      data: { name: "task-test" },
      id: "019f0000-0000-7000-8000-000000000002",
      name: "task-test",
    }) + "\n" + JSON.stringify({
      type: "message",
      message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "newest file result" }] },
      timestamp: new Date().toISOString(),
    }) + "\n");

    const result = await waitForTaskCompletion({
      sessionDir,
      sessionName: "task-test",
      timeoutMs: 5000,
      pollMs: 50,
    });
    assert.equal(result.status, "completed", t);
    assert.match(result.content, /newest file result/, t);
  } finally {
    cleanup(dir);
  }
}

{
  // checkTaskCompletion returns "failed" when no pane and no session text
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  try {
    const sessionDir = join(dir, "sessions", "test-task");
    mkdirSync(sessionDir, { recursive: true });
    const result = await checkTaskCompletion({
      sessionDir,
      sessionName: "task-test",
    });
    assert.equal(result.status, "failed");
    assert.equal(result.source, "pane");
  } finally {
    cleanup(dir);
  }
}

{
  // checkTaskCompletion returns completed when session has terminal stop reason
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  try {
    const sessionDir = join(dir, "sessions", "test-task");
    mkdirSync(sessionDir, { recursive: true });
    const jsonlPath = join(sessionDir, "task-test.jsonl");
    writeFileSync(jsonlPath, JSON.stringify({
      type: "session_info",
      data: { name: "task-test", cwd: dir },
      id: "019f0000-0000-7000-8000-000000000099",
      name: "task-test",
    }) + "\n" + JSON.stringify({
      type: "message",
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: "task completed direct" }],
      },
      timestamp: new Date().toISOString(),
    }) + "\n");
    const result = await checkTaskCompletion({
      sessionDir,
      sessionName: "task-test",
    });
    assert.equal(result.status, "completed");
    assert.match(result.content, /task completed direct/);
  } finally {
    cleanup(dir);
  }
}

{
  const t = "soft timeout requests wrap-up once and accepts a final result during grace";
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  const sessionDir = join(dir, "sessions", "test-task");
  mkdirSync(sessionDir, { recursive: true });
  let wrapUpCount = 0;
  try {
    const result = await waitForTaskCompletion({
      sessionDir,
      sessionName: "task-test",
      paneId: "%1",
      resourceExists: () => true,
      timeoutMs: 15,
      timeoutGraceMs: 200,
      pollMs: 5,
      requestWrapUp: () => {
        wrapUpCount += 1;
        writeFileSync(join(sessionDir, "task-test.jsonl"), [
          JSON.stringify({ type: "session_info", name: "task-test" }),
          JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "final report during grace" }],
            },
          }),
        ].join("\n"));
      },
    });
    assert.equal(result.status, "completed", `${t}: status`);
    assert.match(result.content, /final report during grace/, `${t}: content`);
    assert.equal(wrapUpCount, 1, `${t}: warning count`);
  } finally {
    cleanup(dir);
  }
}

{
  const t = "hard deadline waits through grace and includes supplied diagnostics";
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  const sessionDir = join(dir, "sessions", "test-task");
  mkdirSync(sessionDir, { recursive: true });
  let wrapUpCount = 0;
  const startedAt = Date.now();
  try {
    const result = await waitForTaskCompletion({
      sessionDir,
      sessionName: "task-test",
      paneId: "%1",
      resourceExists: () => true,
      timeoutMs: 20,
      timeoutGraceMs: 30,
      pollMs: 5,
      requestWrapUp: () => { wrapUpCount += 1; },
      getTimeoutDiagnostics: async () => "Terminal pane tail:\npartial work",
    });
    assert.equal(result.status, "timeout", `${t}: status`);
    assert.ok(Date.now() - startedAt >= 45, `${t}: grace elapsed`);
    assert.match(result.content, /soft timeout of 0\.02s and 0\.03s grace period/, `${t}: deadline`);
    assert.match(result.content, /partial work/, `${t}: diagnostics`);
    assert.equal(wrapUpCount, 1, `${t}: warning count`);
  } finally {
    cleanup(dir);
  }
}

{
  const t = "foreground hard timeout rechecks completion before cleanup";
  const dir = mkdtempSync(join(tmpdir(), "pi-task-wait-"));
  const sessionDir = join(dir, "sessions", "test-task");
  mkdirSync(sessionDir, { recursive: true });
  try {
    let wrapUpCount = 0;
    const result = await waitForTaskCompletion({
      sessionDir,
      sessionName: "task-test",
      paneId: "%1",
      resourceExists: () => true,
      timeoutMs: 10,
      timeoutGraceMs: 10,
      pollMs: 5,
      requestWrapUp: () => { wrapUpCount += 1; },
      getTimeoutDiagnostics: async () => {
        writeFileSync(join(sessionDir, "task-test.jsonl"), [
          JSON.stringify({ type: "session_info", name: "task-test" }),
          JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "finished during timeout reporting" }],
            },
          }),
        ].join("\n"));
        return "";
      },
    });
    assert.equal(result.status, "completed", `${t}: status`);
    assert.match(result.content, /finished during timeout reporting/, `${t}: content`);
    assert.equal(wrapUpCount, 1, `${t}: warning count`);
  } finally {
    cleanup(dir);
  }
}

console.log("ALL WAIT COMPLETION TESTS PASSED");
