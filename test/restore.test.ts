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
  it("marks completed registry entries done and removes them from registry", () => {
    const piDir = makePiDir();
    const taskDir = join(piDir, "artifacts", "sessions", "task-1");
    writeSession(taskDir, "task-task-1", "stop");
    writeJson(join(piDir, "task-registry.json"), [
      {
        id: "task-1",
        dir: taskDir,
        sessionName: "task-task-1",
        startedAt: Date.now() - 1000,
        paneId: "%missing",
        agentType: "scout",
        description: "done task",
        background: true,
      },
    ]);
    writeJson(join(piDir, "task-session-history.json"), [
      { id: "task-1", status: "running", startedAt: Date.now() - 1000 },
    ]);

    const backgroundTasks = new Map();
    restoreActiveBackgroundTasks(piDir, backgroundTasks);

    assert.equal(backgroundTasks.size, 0);
    assert.deepEqual(readJson<unknown[]>(join(piDir, "task-registry.json")), []);
    const history = readJson<Array<{ id: string; status: string }>>(
      join(piDir, "task-session-history.json"),
    );
    assert.equal(history[0]?.status, "done");
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
});
