import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { restoreActiveBackgroundTasks } from "../src/lifecycle/restore.ts";

function makePiDir() {
  return mkdtempSync(join(tmpdir(), "pi-task-restore-"));
}

function writeJson(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2));
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function writeSession(dir: string, sessionName: string, stopReason?: string) {
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const content = [
    { type: "session_info", timestamp: now, name: sessionName },
    {
      type: "message",
      timestamp: now,
      message: {
        role: "assistant",
        stopReason,
        content: [{ type: "text", text: "done" }],
      },
    },
  ];
  writeFileSync(join(dir, "session.jsonl"), content.map((entry) => JSON.stringify(entry)).join("\n"));
}

describe("restoreActiveBackgroundTasks", () => {
  it("marks completed canonical registry entries done and persists their exact session path", () => {
    const piDir = makePiDir();
    const artifactsDir = join(piDir, "artifacts", "tasks");
    const taskDir = join(artifactsDir, "sessions", "task-1");
    writeSession(taskDir, "task-task-1", "stop");
    const sessionRef = join(taskDir, "session.jsonl");
    const startedAt = Date.now() - 1000;
    const entry = {
      id: "task-1",
      dir: artifactsDir,
      sessionName: "task-task-1",
      startedAt,
      paneId: "%missing",
      agentType: "scout",
      description: "done task",
      background: true,
      piDir,
    };
    writeJson(join(piDir, "task-registry.json"), [entry]);
    writeJson(join(piDir, "task-session-history.json"), [
      { ...entry, status: "running" },
    ]);

    const backgroundTasks = new Map();
    restoreActiveBackgroundTasks(piDir, backgroundTasks);

    assert.equal(backgroundTasks.size, 0);
    assert.deepEqual(readJson<unknown[]>(join(piDir, "task-registry.json")), []);
    const history = readJson<Array<{ id: string; status: string; sessionRef?: string }>>(
      join(piDir, "task-session-history.json"),
    );
    assert.equal(history[0]?.status, "done");
    assert.equal(history[0]?.sessionRef, sessionRef);
  });

  it("preserves durable records during a temporary backend outage", () => {
    const piDir = makePiDir();
    const taskDir = join(piDir, "artifacts", "sessions", "task-herdr");
    writeSession(taskDir, "task-task-herdr");
    const entry = {
      id: "task-herdr",
      dir: taskDir,
      sessionName: "task-task-herdr",
      startedAt: Date.now() - 1000,
      paneId: "w1:p2",
      handle: {
        backend: "herdr",
        resourceId: "w1:p2",
        socketPath: "/tmp/herdr.sock",
        terminalId: "term-2",
      },
      agentType: "scout",
      description: "temporarily unreachable",
      background: true,
    };
    writeJson(join(piDir, "task-registry.json"), [entry]);

    const backgroundTasks = new Map();
    restoreActiveBackgroundTasks(piDir, backgroundTasks, () => {
      const error = new Error("connection refused");
      error.name = "HerdrUnavailableError";
      throw error;
    });

    assert.equal(backgroundTasks.size, 0);
    assert.equal(readJson<Array<{ id: string }>>(join(piDir, "task-registry.json"))[0]?.id, "task-herdr");
  });

  it("restores custom timeout deadlines and warning state", () => {
    const piDir = makePiDir();
    const taskDir = join(piDir, "artifacts", "sessions", "task-timeout");
    writeSession(taskDir, "task-task-timeout");
    writeJson(join(piDir, "task-registry.json"), [{
      id: "task-timeout",
      dir: taskDir,
      sessionName: "task-task-timeout",
      startedAt: Date.now() - 1000,
      handle: { backend: "tmux", resourceId: "%7" },
      agentType: "general",
      description: "restore timeout state",
      timeoutMs: 2500,
      timeoutGraceMs: 750,
      timeoutSendEscape: false,
      wrapUpRequestedAt: 1234,
    }]);

    const backgroundTasks = new Map();
    restoreActiveBackgroundTasks(piDir, backgroundTasks, () => true);

    assert.equal(backgroundTasks.get("task-timeout")?.timeoutMs, 2500);
    assert.equal(backgroundTasks.get("task-timeout")?.timeoutGraceMs, 750);
    assert.equal(backgroundTasks.get("task-timeout")?.timeoutSendEscape, false);
    assert.equal(backgroundTasks.get("task-timeout")?.wrapUpRequestedAt, 1234);
  });

  it("uses timeout escape environment configuration for legacy entries", () => {
    const piDir = makePiDir();
    const entries = [
      { id: "legacy", timeoutSendEscape: undefined },
      { id: "explicit-true", timeoutSendEscape: true },
      { id: "explicit-false", timeoutSendEscape: false },
    ].map(({ id, timeoutSendEscape }) => {
      const taskDir = join(piDir, "artifacts", "sessions", id);
      writeSession(taskDir, `task-${id}`);
      return {
        id,
        dir: taskDir,
        sessionName: `task-${id}`,
        startedAt: Date.now() - 1000,
        handle: { backend: "tmux", resourceId: `%${id}` },
        agentType: "general",
        description: `restore ${id}`,
        ...(timeoutSendEscape === undefined ? {} : { timeoutSendEscape }),
      };
    });
    writeJson(join(piDir, "task-registry.json"), entries);

    const previous = process.env.PI_TASK_TIMEOUT_SEND_ESCAPE;
    process.env.PI_TASK_TIMEOUT_SEND_ESCAPE = "0";
    try {
      const backgroundTasks = new Map();
      restoreActiveBackgroundTasks(piDir, backgroundTasks, () => true);

      assert.equal(backgroundTasks.get("legacy")?.timeoutSendEscape, false);
      assert.equal(backgroundTasks.get("explicit-true")?.timeoutSendEscape, true);
      assert.equal(backgroundTasks.get("explicit-false")?.timeoutSendEscape, false);
    } finally {
      if (previous === undefined) delete process.env.PI_TASK_TIMEOUT_SEND_ESCAPE;
      else process.env.PI_TASK_TIMEOUT_SEND_ESCAPE = previous;
    }
  });

  it("marks non-terminal entries failed when their pane is gone", () => {
    const piDir = makePiDir();
    const taskDir = join(piDir, "artifacts", "sessions", "task-2");
    writeSession(taskDir, "task-task-2");
    writeJson(join(piDir, "task-registry.json"), [
      {
        id: "task-2",
        dir: taskDir,
        sessionName: "task-task-2",
        startedAt: Date.now() - 1000,
        paneId: "%missing",
        agentType: "scout",
        description: "lost task",
        background: true,
      },
    ]);
    writeJson(join(piDir, "task-session-history.json"), [
      { id: "task-2", status: "running", startedAt: Date.now() - 1000 },
    ]);

    const backgroundTasks = new Map();
    restoreActiveBackgroundTasks(piDir, backgroundTasks);

    assert.equal(backgroundTasks.size, 0);
    assert.deepEqual(readJson<unknown[]>(join(piDir, "task-registry.json")), []);
    const history = readJson<Array<{ id: string; status: string }>>(
      join(piDir, "task-session-history.json"),
    );
    assert.equal(history[0]?.status, "failed");
  });

  it("continues restoring when cleanup of a dead grouped HerdR pane fails", () => {
    const piDir = makePiDir();
    const taskDir = join(piDir, "artifacts", "sessions", "task-herdr-dead");
    writeSession(taskDir, "task-task-herdr-dead");
    writeJson(join(piDir, "task-registry.json"), [
      {
        id: "task-herdr-dead",
        dir: taskDir,
        sessionName: "task-task-herdr-dead",
        startedAt: Date.now() - 1000,
        paneId: "w1:p2",
        handle: {
          backend: "herdr",
          resourceId: "w1:p2",
          socketPath: "/tmp/herdr.sock",
          terminalId: "term-2",
          workspaceId: "w1",
          workspaceGroup: "parallel-retry",
        },
        agentType: "scout",
        description: "dead grouped task",
        background: true,
      },
    ]);

    assert.doesNotThrow(() => {
      restoreActiveBackgroundTasks(
        piDir,
        new Map(),
        () => false,
        () => {
          throw new Error("workspace_not_found");
        },
      );
    });

    assert.deepEqual(readJson<unknown[]>(join(piDir, "task-registry.json")), []);
    const history = readJson<Array<{ id: string; status: string }>>(
      join(piDir, "task-session-history.json"),
    );
    assert.equal(history[0]?.status, "failed");
  });
});
