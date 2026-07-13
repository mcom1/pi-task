import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ensureExitSentinelDirectory,
  getExitSentinelPath,
  readExitSentinel,
  wrapWithHerdrExitSentinel,
} from "../src/subagent/exitSentinel.js";

test("reads only a matching versioned task exit sentinel", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-task-exit-"));
  const path = getExitSentinelPath(dir, "task-1");
  ensureExitSentinelDirectory(path);
  assert.equal(readExitSentinel(path, "task-1"), null);
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, taskId: "other", exitCode: 7, completedAt: "now" }));
  assert.equal(readExitSentinel(path, "task-1"), null);
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, taskId: "task-1", exitCode: 7, completedAt: "now" }));
  assert.equal(readExitSentinel(path, "task-1")?.exitCode, 7);
});

test("HerdR wrapper writes the sentinel before closing a successful pane", () => {
  const command = wrapWithHerdrExitSentinel(
    "pi --mode json",
    "/tmp/task.exit.json",
    "task-1",
    "/tmp/task.jsonl",
  );
  const writeIndex = command.indexOf("node -e");
  const closeIndex = command.indexOf("herdr pane close");
  assert.ok(writeIndex >= 0);
  assert.ok(closeIndex > writeIndex);
  assert.match(command, /if \[ "\$status" -eq 0 \]/);
  assert.match(command, /task\.jsonl/);
  assert.match(command, /setInterval/);
  assert.match(command, /hasUser/);
  assert.match(command, /active/);
  assert.match(command, /pane.*close/);
  assert.match(command, /child exited/);
});
