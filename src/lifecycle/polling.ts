import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TASK_WRAP_UP_INSTRUCTION } from "../task-timeouts.js";
import {
  buildHardTimeoutContent,
  type TaskCompletionSnapshot,
} from "../subagent/waitCompletion.js";
import type { BackgroundTask } from "../types.js";
import { completeTask } from "./completion.js";

export interface BackgroundPollingDeps {
  backgroundTasks: Map<string, BackgroundTask>;
  checkTaskCompletion: (options: {
    sessionDir: string;
    sessionName: string;
    paneId?: string;
    artifactsDir?: string;
    taskId?: string;
    sinceMs?: number;
    resourceExists?: () => boolean | Promise<boolean>;
    exitSentinelPath?: string;
  }) => Promise<TaskCompletionSnapshot>;
  resourceExists?: (task: BackgroundTask) => boolean | Promise<boolean>;
  requestWrapUp?: (task: BackgroundTask, instruction: string, sendEscape: boolean) => unknown | Promise<unknown>;
  persistWrapUpRequested?: (id: string, requestedAt: number) => void | Promise<void>;
  getTimeoutDiagnostics?: (task: BackgroundTask) => string | Promise<string>;
  closeTask?: (task: BackgroundTask) => void | Promise<void>;
  killAgentPane: (paneId: string, originalPane: string | null) => void;
  clearTaskWidgetIfIdle: () => void;
  completeTask: typeof completeTask;
  TASK_TIMEOUT_MS: number;
  TASK_TIMEOUT_GRACE_MS: number;
  MAX_POLL_ERRORS: number;
  piDir: string;
  pi: ExtensionAPI;
}

export function startBackgroundPolling(
  deps: BackgroundPollingDeps,
  pollMs: number,
): () => void {
  let stopped = false;
  let inFlight = false;
  const pollErrors = new Map<string, number>();

  const finish = (
    id: string,
    task: BackgroundTask,
    content: string,
    phase: "done" | "timeout" | "failed",
  ) => {
    deps.completeTask(deps.pi, id, task, content, phase, deps.piDir);
    deps.backgroundTasks.delete(id);
    deps.clearTaskWidgetIfIdle();
    pollErrors.delete(id);
  };

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;

    try {
      for (const [id, task] of deps.backgroundTasks) {
        if (task.backend === "sdk") continue;
        try {
          const sessionDir = join(task.dir, "sessions", id);
          const snapshot = await deps.checkTaskCompletion({
            sessionDir,
            sessionName: task.sessionName,
            paneId: task.paneId,
            artifactsDir: task.dir,
            taskId: id,
            sinceMs: task.startedAt,
            resourceExists: deps.resourceExists ? () => deps.resourceExists!(task) : undefined,
            exitSentinelPath: task.exitSentinelPath,
          });

          if (stopped) return;
          if (snapshot.status === "completed") {
            finish(id, task, snapshot.content, "done");
            continue;
          }
          if (snapshot.status === "failed" || snapshot.status === "timeout") {
            finish(id, task, snapshot.content, snapshot.status === "timeout" ? "timeout" : "failed");
            continue;
          }

          const timeoutMs = task.timeoutMs ?? deps.TASK_TIMEOUT_MS;
          const timeoutGraceMs = task.timeoutGraceMs ?? deps.TASK_TIMEOUT_GRACE_MS;
          const now = Date.now();
          const elapsedMs = now - task.startedAt;

          if (elapsedMs >= timeoutMs && !task.wrapUpRequestedAt) {
            task.wrapUpRequestedAt = now;
            await deps.persistWrapUpRequested?.(id, now);
            try {
              await deps.requestWrapUp?.(
                task,
                TASK_WRAP_UP_INSTRUCTION,
                task.timeoutSendEscape ?? true,
              );
            } catch {
              // Keep polling through grace even when steering fails.
            }
            continue;
          }

          const hardDeadline = (task.wrapUpRequestedAt ?? task.startedAt + timeoutMs) + timeoutGraceMs;
          if (now >= hardDeadline) {
            const content = await buildHardTimeoutContent({
              sessionDir,
              sessionName: task.sessionName,
              sinceMs: task.startedAt,
              paneId: task.handle?.backend === "herdr" ? undefined : task.paneId,
              artifactsDir: task.dir,
              taskId: id,
              timeoutMs,
              timeoutGraceMs,
              elapsedMs,
              getTimeoutDiagnostics: deps.getTimeoutDiagnostics
                ? () => deps.getTimeoutDiagnostics!(task)
                : undefined,
            });
            const finalSnapshot = await deps.checkTaskCompletion({
              sessionDir,
              sessionName: task.sessionName,
              paneId: task.paneId,
              artifactsDir: task.dir,
              taskId: id,
              sinceMs: task.startedAt,
              resourceExists: deps.resourceExists ? () => deps.resourceExists!(task) : undefined,
              exitSentinelPath: task.exitSentinelPath,
            });
            if (finalSnapshot.status === "completed") {
              finish(id, task, finalSnapshot.content, "done");
            } else if (finalSnapshot.status === "failed") {
              finish(id, task, finalSnapshot.content, "failed");
            } else {
              finish(id, task, content, "timeout");
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === "HerdrUnavailableError") continue;
          const count = (pollErrors.get(id) ?? 0) + 1;
          pollErrors.set(id, count);
          if (count >= deps.MAX_POLL_ERRORS) {
            finish(
              id,
              task,
              `Background task polling failed: ${error instanceof Error ? error.message : String(error)}`,
              "failed",
            );
          }
        }
      }
    } finally {
      inFlight = false;
    }
  };

  const interval = setInterval(() => { void tick(); }, pollMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
