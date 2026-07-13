import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readRegistry,
  readTaskSessionHistory,
  writeRegistry,
} from "../src/conversation.js";
import { completeTask } from "../src/lifecycle/completion.js";
import type { BackgroundTask } from "../src/types.js";

test("completion is persisted and removed from the registry before pane cleanup", () => {
  const piDir = mkdtempSync(join(tmpdir(), "pi-task-completion-"));
  const task: BackgroundTask = {
    dir: join(piDir, "artifacts", "tasks", "task-1"),
    agentType: "general",
    sessionName: "task-task-1",
    paneId: "w1:p2",
    originalPane: null,
    description: "completion ordering",
    startedAt: Date.now() - 1000,
    toolUses: 0,
    turns: 0,
  };
  writeRegistry(piDir, [{
    id: "task-1",
    agentType: "general",
    description: task.description,
    sessionName: task.sessionName,
    startedAt: task.startedAt,
    paneId: task.paneId,
    piDir,
    dir: task.dir,
  }]);

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
});
