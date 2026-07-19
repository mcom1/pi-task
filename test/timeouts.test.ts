import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { tmuxSteerPane } from "../src/subagent/tmux.js";
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
  assert.equal(properties.timeout_send_escape?.type, "boolean");
  assert.equal(properties.timeout_send_escape?.default, true);
});

test("task timeout normalization converts custom seconds to milliseconds", () => {
  assert.deepEqual(normalizeTaskTimeouts(2.5, 0.25, undefined, {}), {
    timeoutMs: 2500,
    timeoutGraceMs: 250,
    timeoutSendEscape: true,
  });
  assert.deepEqual(normalizeTaskTimeouts(undefined, undefined, undefined, {}), {
    timeoutMs: DEFAULT_TASK_TIMEOUT_SECONDS * 1000,
    timeoutGraceMs: DEFAULT_TASK_TIMEOUT_GRACE_SECONDS * 1000,
    timeoutSendEscape: true,
  });
});

test("task timeout Escape setting reads the environment and accepts a per-task override", () => {
  assert.equal(normalizeTaskTimeouts(1, 1, undefined, { PI_TASK_TIMEOUT_SEND_ESCAPE: "0" }).timeoutSendEscape, false);
  assert.equal(normalizeTaskTimeouts(1, 1, undefined, { PI_TASK_TIMEOUT_SEND_ESCAPE: "1" }).timeoutSendEscape, true);
  assert.equal(normalizeTaskTimeouts(1, 1, true, { PI_TASK_TIMEOUT_SEND_ESCAPE: "0" }).timeoutSendEscape, true);
  assert.equal(normalizeTaskTimeouts(1, 1, false, { PI_TASK_TIMEOUT_SEND_ESCAPE: "1" }).timeoutSendEscape, false);
});

test("task timeout Escape setting rejects invalid environment values", () => {
  assert.throws(
    () => normalizeTaskTimeouts(1, 1, undefined, { PI_TASK_TIMEOUT_SEND_ESCAPE: "yes" }),
    /PI_TASK_TIMEOUT_SEND_ESCAPE.*0 or 1/,
  );
});

test("task timeout normalization rejects non-finite, non-positive, and excessive values", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_TASK_TIMEOUT_SECONDS + 1]) {
    assert.throws(() => normalizeTaskTimeouts(value, 1), /timeout_seconds/);
  }
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_TASK_TIMEOUT_GRACE_SECONDS + 1]) {
    assert.throws(() => normalizeTaskTimeouts(1, value), /timeout_grace_seconds/);
  }
});

test("tmux steering sends Escape once before wrap-up text and keeps Enter separate", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-task-tmux-timeout-"));
  const tmux = join(dir, "tmux");
  const log = join(dir, "tmux.log");
  const previousPath = process.env.PATH;
  const previousLog = process.env.PI_TASK_TMUX_LOG;
  try {
    writeFileSync(tmux, "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$PI_TASK_TMUX_LOG\"\ncat >/dev/null 2>/dev/null || true\n");
    chmodSync(tmux, 0o755);
    process.env.PATH = `${dir}:${previousPath ?? ""}`;
    process.env.PI_TASK_TMUX_LOG = log;

    tmuxSteerPane("%1", "wrap up", { sendEscape: true });
    const enabled = readFileSync(log, "utf8").trim().split("\n");
    assert.match(enabled[0] ?? "", /^send-keys -t %1 Escape$/);
    assert.match(enabled[1] ?? "", /^load-buffer /);
    assert.match(enabled[2] ?? "", /^paste-buffer /);
    assert.match(enabled.at(-1) ?? "", /^send-keys -t %1 Enter$/);
    assert.equal(enabled.filter((line) => / Escape$/.test(line)).length, 1);

    writeFileSync(log, "");
    tmuxSteerPane("%1", "wrap up");
    const disabled = readFileSync(log, "utf8").trim().split("\n");
    assert.match(disabled[0] ?? "", /^load-buffer /);
    assert.equal(disabled.some((line) => / Escape$/.test(line)), false);
    assert.match(disabled.at(-1) ?? "", /^send-keys -t %1 Enter$/);
  } finally {
    process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.PI_TASK_TMUX_LOG;
    else process.env.PI_TASK_TMUX_LOG = previousLog;
    rmSync(dir, { recursive: true, force: true });
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
      timeoutSendEscape: true,
      wrapUpRequestedAt: 1_100,
      handle: { backend: "tmux", resourceId: "%1" },
      backend: "tmux",
      piDir,
      dir: piDir,
    }]);

    resetRegistryTaskTimeout(piDir, "task-1", 2_000, 3_000, 4_000, false);

    const entry = readRegistry(piDir)[0];
    assert.equal(entry?.startedAt, 2_000);
    assert.equal(entry?.timeoutMs, 3_000);
    assert.equal(entry?.timeoutGraceMs, 4_000);
    assert.equal(entry?.timeoutSendEscape, false);
    assert.equal(entry?.wrapUpRequestedAt, undefined);
  } finally {
    rmSync(piDir, { recursive: true, force: true });
  }
});
