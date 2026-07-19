import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_TASK_TIMEOUT_GRACE_SECONDS,
  DEFAULT_TASK_TIMEOUT_SECONDS,
  MAX_TASK_TIMEOUT_GRACE_SECONDS,
  MAX_TASK_TIMEOUT_SECONDS,
} from "../src/constants.js";
import { readRegistry, resetRegistryTaskTimeout, writeRegistry } from "../src/conversation.js";
import { normalizeTaskTimeouts } from "../src/task-timeouts.js";
import { taskParametersSchema } from "../src/tool/schema.js";

test("task timeout parameters publish bounded positive defaults", () => {
  const properties = taskParametersSchema().properties as Record<string, Record<string, unknown>>;

  assert.equal(properties.timeout_seconds?.type, "number");
  assert.equal(properties.timeout_seconds?.default, DEFAULT_TASK_TIMEOUT_SECONDS);
  assert.equal(properties.timeout_seconds?.exclusiveMinimum, 0);
  assert.equal(properties.timeout_seconds?.maximum, MAX_TASK_TIMEOUT_SECONDS);
  assert.equal(properties.timeout_grace_seconds?.type, "number");
  assert.equal(DEFAULT_TASK_TIMEOUT_GRACE_SECONDS, 5 * 60);
  assert.equal(properties.timeout_grace_seconds?.default, DEFAULT_TASK_TIMEOUT_GRACE_SECONDS);
  assert.equal(properties.timeout_grace_seconds?.exclusiveMinimum, 0);
  assert.equal(properties.timeout_grace_seconds?.maximum, MAX_TASK_TIMEOUT_GRACE_SECONDS);
});

test("task timeout normalization converts custom seconds to milliseconds", () => {
  assert.deepEqual(normalizeTaskTimeouts(2.5, 0.25), {
    timeoutMs: 2500,
    timeoutGraceMs: 250,
  });
  assert.deepEqual(normalizeTaskTimeouts(undefined, undefined), {
    timeoutMs: DEFAULT_TASK_TIMEOUT_SECONDS * 1000,
    timeoutGraceMs: DEFAULT_TASK_TIMEOUT_GRACE_SECONDS * 1000,
  });
});

test("task timeout normalization rejects non-finite, non-positive, and excessive values", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_TASK_TIMEOUT_SECONDS + 1]) {
    assert.throws(() => normalizeTaskTimeouts(value, 1), /timeout_seconds/);
  }
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_TASK_TIMEOUT_GRACE_SECONDS + 1]) {
    assert.throws(() => normalizeTaskTimeouts(1, value), /timeout_grace_seconds/);
  }
});

test("resuming a task persists a fresh timeout window and clears its warning", () => {
  const piDir = mkdtempSync(join(tmpdir(), "pi-task-timeout-"));
  try {
    writeRegistry(piDir, [{
      id: "task-1",
      agentType: "general",
      description: "test",
      sessionName: "task-task-1",
      startedAt: 100,
      timeoutMs: 1_000,
      timeoutGraceMs: 500,
      wrapUpRequestedAt: 1_100,
      handle: { backend: "tmux", resourceId: "%1" },
      backend: "tmux",
      piDir,
      dir: piDir,
    }]);

    resetRegistryTaskTimeout(piDir, "task-1", 2_000, 3_000, 4_000);

    const entry = readRegistry(piDir)[0];
    assert.equal(entry?.startedAt, 2_000);
    assert.equal(entry?.timeoutMs, 3_000);
    assert.equal(entry?.timeoutGraceMs, 4_000);
    assert.equal(entry?.wrapUpRequestedAt, undefined);
  } finally {
    rmSync(piDir, { recursive: true, force: true });
  }
});
