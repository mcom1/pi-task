import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readRegistry,
  readTaskSessionHistory,
  upsertTaskSessionHistory,
  writeRegistry,
} from "../src/conversation.js";
import { completeTask } from "../src/lifecycle/completion.js";
import type { BackgroundTask } from "../src/types.js";

test("completion is persisted and removed from the registry before pane cleanup", () => {
  const piDir = mkdtempSync(join(tmpdir(), "pi-task-completion-"));
  const artifactsDir = join(piDir, "artifacts", "tasks");
  const sessionDir = join(artifactsDir, "sessions", "task-1");
  mkdirSync(sessionDir, { recursive: true });
  const sessionRef = join(
    sessionDir,
    "2026-07-19T16-57-20-294Z_019f7b4f-92a6-7839-b41b-6af681524251.jsonl",
  );
  writeFileSync(
    sessionRef,
    `${JSON.stringify({ type: "session_info", name: "task-task-1" })}\n`,
  );
  const task: BackgroundTask = {
    dir: artifactsDir,
    agentType: "general",
    sessionName: "task-task-1",
    paneId: "w1:p2",
    originalPane: null,
    description: "completion ordering",
    startedAt: Date.now() - 1000,
    toolUses: 0,
    turns: 0,
  };
  const registryEntry = {
    id: "task-1",
    agentType: "general",
    description: task.description,
    sessionName: task.sessionName,
    startedAt: task.startedAt,
    paneId: task.paneId,
    piDir,
    dir: task.dir,
  };
  writeRegistry(piDir, [registryEntry]);
  upsertTaskSessionHistory(piDir, {
    ...registryEntry,
    status: "running",
    background: true,
  });

  let cleanupObservedDurableState = false;
  let notificationSent = false;
  const pi = {
    sendMessage: () => {
      notificationSent = true;
    },
  };

  completeTask(
    pi as never,
    "task-1",
    task,
    "<task_result><summary>done</summary></task_result>",
    "done",
    piDir,
    () => {
      cleanupObservedDurableState = readRegistry(piDir).length === 0
        && readTaskSessionHistory(piDir).some((entry) => entry.id === "task-1" && entry.status === "done");
      throw new Error("simulated cleanup failure");
    },
  );

  assert.equal(cleanupObservedDurableState, true);
  assert.equal(notificationSent, true);
  assert.equal(readRegistry(piDir).length, 0);
  assert.equal(readTaskSessionHistory(piDir)[0]?.sessionRef, sessionRef);
});
