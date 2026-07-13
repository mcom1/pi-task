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

test("HerdR wrapper records child exit without stealing parent cleanup ownership", () => {
  const command = wrapWithHerdrExitSentinel(
    "pi --mode json",
    "/tmp/task.exit.json",
    "task-1",
  );
  assert.match(command, /node -e/);
  assert.match(command, /task\.exit\.json/);
  assert.match(command, /child exited/);
  assert.doesNotMatch(command, /herdr pane close/);
  assert.doesNotMatch(command, /setInterval/);
});
