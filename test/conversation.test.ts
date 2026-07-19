import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ensureTaskSessionRef,
  findJsonlSessionByName,
  readTaskSessionHistory,
  upsertTaskSessionHistory,
} from "../src/conversation.js";

function writeSession(taskDir: string, sessionName: string): string {
  mkdirSync(taskDir, { recursive: true });
  const sessionRef = join(
    taskDir,
    "2026-07-19T16-57-20-294Z_019f7b4f-92a6-7839-b41b-6af681524251.jsonl",
  );
  writeFileSync(
    sessionRef,
    `${JSON.stringify({ type: "session_info", name: sessionName })}\n`,
    "utf-8",
  );
  return sessionRef;
}

test("resolves a timestamped Pi session from the persisted task artifact directory", () => {
  const piDir = mkdtempSync(join(tmpdir(), "pi-task-conversation-"));
  const artifactsDir = join(piDir, "artifacts", "tasks");
  const taskId = "task-123";
  const sessionName = `task-${taskId}`;
  const sessionRef = writeSession(join(artifactsDir, "sessions", taskId), sessionName);

  upsertTaskSessionHistory(piDir, {
    id: taskId,
    agentType: "general",
    description: "resume session",
    sessionName,
    startedAt: Date.now(),
    piDir,
    dir: artifactsDir,
    status: "done",
    background: true,
  });

  assert.equal(
    findJsonlSessionByName(piDir, taskId, "general")?.sessionRef,
    sessionRef,
  );
  assert.equal(
    findJsonlSessionByName(piDir, sessionName, "general")?.sessionRef,
    sessionRef,
  );
});

test("backfills the exact session path into durable history", () => {
  const piDir = mkdtempSync(join(tmpdir(), "pi-task-conversation-backfill-"));
  const artifactsDir = join(piDir, "artifacts", "tasks");
  const taskId = "task-backfill";
  const sessionName = `task-${taskId}`;
  const sessionRef = writeSession(join(artifactsDir, "sessions", taskId), sessionName);
  const entry = {
    id: taskId,
    agentType: "general",
    description: "backfill session",
    sessionName,
    startedAt: Date.now(),
    piDir,
    dir: artifactsDir,
    status: "done" as const,
    background: true,
  };
  upsertTaskSessionHistory(piDir, entry);

  assert.equal(ensureTaskSessionRef(piDir, entry).sessionRef, sessionRef);
  assert.equal(readTaskSessionHistory(piDir)[0]?.sessionRef, sessionRef);
});

test("retains compatibility with the legacy artifacts sessions directory", () => {
  const piDir = mkdtempSync(join(tmpdir(), "pi-task-conversation-legacy-"));
  const artifactsDir = join(piDir, "artifacts");
  const taskId = "task-legacy";
  const sessionName = `task-${taskId}`;
  const sessionRef = writeSession(join(artifactsDir, "sessions", taskId), sessionName);

  upsertTaskSessionHistory(piDir, {
    id: taskId,
    agentType: "general",
    description: "legacy resume",
    sessionName,
    startedAt: Date.now(),
    piDir,
    dir: artifactsDir,
    status: "done",
    background: true,
  });

  assert.equal(
    findJsonlSessionByName(piDir, taskId, "general")?.sessionRef,
    sessionRef,
  );
});
