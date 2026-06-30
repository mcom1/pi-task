import { join } from "node:path";

/*
  Background polling logic for task completion.
  This module encapsulates the interval-based checking of background tasks.

  Disposal contract:
  - `startBackgroundPolling` returns a `stopPolling` function.
  - Calling it sets an internal `disposed` flag AND clears the interval.
  - A scheduled-but-not-yet-started tick sees the flag at the top of the
    IIFE and returns immediately, so it never touches the captured `pi`.
  - This closes the race where a tick scheduled before `session_shutdown`
    fires after the runtime is torn down and triggers
    "This extension ctx is stale after session replacement or reload."
 */

export interface PollingDeps {
  backgroundTasks: Map<string, any>;
  checkTaskCompletion: (opts: any) => Promise<any>;
  killAgentPane: (paneId: string | undefined, originalPane: string | null) => void;
  clearTaskWidgetIfIdle: () => void;
  completeTask: (
    pi: any,
    id: string,
    task: any,
    content: string,
    phase: "done" | "timeout" | "failed",
    piDir: string,
  ) => void;
  TASK_TIMEOUT_MS: number;
  MAX_POLL_ERRORS: number;
  piDir: string;
  pi: any;
}

let checkInFlight = false;

export function startBackgroundPolling(
  deps: PollingDeps,
  intervalMs: number,
): () => void {
  const {
    backgroundTasks,
    checkTaskCompletion,
    killAgentPane,
    clearTaskWidgetIfIdle,
    completeTask,
    TASK_TIMEOUT_MS,
    MAX_POLL_ERRORS,
    piDir,
    pi,
  } = deps;

  let disposed = false;

  const handle = setInterval(async () => {
    if (disposed) return;
    if (checkInFlight) return;
    if (backgroundTasks.size === 0) {
      clearTaskWidgetIfIdle();
      return;
    }

    checkInFlight = true;
    try {
      const now = Date.now();
      const ids = Array.from(backgroundTasks.keys());

      for (const id of ids) {
        const task = backgroundTasks.get(id);
        if (!task) continue;

        if (now - task.startedAt > TASK_TIMEOUT_MS) {
          killAgentPane(task.paneId, task.originalPane);
          backgroundTasks.delete(id);
          clearTaskWidgetIfIdle();
          completeTask(
            pi,
            id,
            task,
            "Task timed out after 30 minutes",
            "timeout",
            piDir,
          );
          continue;
        }

        let snapshot: any;
        try {
          snapshot = await checkTaskCompletion({
            sessionDir: join(task.dir, "sessions", id),
            sessionName: task.sessionName,
            paneId: task.paneId,
            sinceMs: task.startedAt,
          });
        } catch (err) {
          task.pollErrors = (task.pollErrors ?? 0) + 1;
          if (task.pollErrors >= MAX_POLL_ERRORS) {
            killAgentPane(task.paneId, task.originalPane);
            backgroundTasks.delete(id);
            clearTaskWidgetIfIdle();
            const message = err instanceof Error ? err.message : String(err);
            completeTask(
              pi,
              id,
              task,
              `Task ${id} polling failed ${task.pollErrors}x; last error: ${message}`,
              "failed",
              piDir
            );
          }
          continue;
        }

        task.pollErrors = 0;

        if (snapshot.status === "running") {
          continue;
        }

        const phase = snapshot.status === "completed" ? "done" : "failed";
        backgroundTasks.delete(id);
        clearTaskWidgetIfIdle();
        completeTask(pi, id, task, snapshot.content, phase, piDir);
      }
    } finally {
      checkInFlight = false;
    }
  }, intervalMs);

  return () => {
    if (disposed) return;
    disposed = true;
    clearInterval(handle);
  };
}
