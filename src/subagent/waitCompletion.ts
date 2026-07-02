import {
  getLastAssistantTextFromSessionDir,
  hasAgentFinished,
} from "../session-text.js";
import {
  enrichSubagentFailureMessage,
  sessionJsonlExists,
} from "./failure-diagnostics.js";
import { paneDead, paneExists } from "./tmux.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type TaskCompletionStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export interface TaskCompletionSnapshot {
  status: TaskCompletionStatus;
  content: string;
  source?: "session-jsonl" | "pane" | "timeout" | "signal";
}

export interface WaitForTaskCompletionOptions {
  sessionDir: string;
  sessionName: string;
  paneId?: string;
  artifactsDir?: string;
  taskId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollMs?: number;
  sinceMs?: number;
}

/**
 * v0.1.6: The subagent's final assistant message from the auto-saved
 * persistent JSONL session IS the result. No RESULT.md, no agent instructions
 * to write a file. Completion is gated by the assistant's terminal
 * `stopReason` (not `toolUse`, not streaming text).
 */
function readSessionText(
  sessionDir: string,
  sessionName: string,
  sinceMs?: number,
): string | null {
  if (!hasAgentFinished(sessionDir, sessionName, sinceMs)) return null;
  const text = getLastAssistantTextFromSessionDir(
    sessionDir,
    sessionName,
    sinceMs,
  ).trim();
  return text.length > 0 ? text : null;
}

const POST_PANE_EXIT_FLUSH_MS = 2500;
const POST_PANE_EXIT_RETRY_MS = 2500;

function reportPaneExitFailure(
  options: Pick<
    WaitForTaskCompletionOptions,
    "paneId" | "artifactsDir" | "taskId" | "sessionDir"
  >,
): string {
  const base = "Subagent pane exited without producing a result.";
  if (!options.paneId) return base;
  return enrichSubagentFailureMessage({
    kind: "pane_exit",
    baseMessage: base,
    paneId: options.paneId,
    artifactsDir: options.artifactsDir,
    taskId: options.taskId,
    elapsedMs: 0,
  });
}

export async function checkTaskCompletion(
  options: Omit<WaitForTaskCompletionOptions, "signal" | "timeoutMs" | "pollMs">,
): Promise<TaskCompletionSnapshot> {
  const paneAlive = options.paneId ? paneExists(options.paneId) : false;

  if (options.paneId && !paneAlive) {
    await sleep(POST_PANE_EXIT_FLUSH_MS);
    const firstPass = readSessionText(
      options.sessionDir,
      options.sessionName,
      options.sinceMs,
    );
    if (firstPass) {
      return { status: "completed", content: firstPass, source: "session-jsonl" };
    }
    await sleep(POST_PANE_EXIT_RETRY_MS);
  }

  const sessionResult = readSessionText(
    options.sessionDir,
    options.sessionName,
    options.sinceMs,
  );
  if (sessionResult) {
    return { status: "completed", content: sessionResult, source: "session-jsonl" };
  }

  if (options.paneId && paneExists(options.paneId)) {
    return { status: "running", content: "", source: "pane" };
  }

  return {
    status: "failed",
    content: reportPaneExitFailure(options),
    source: "pane",
  };
}

export async function waitForTaskCompletion(
  options: WaitForTaskCompletionOptions,
): Promise<TaskCompletionSnapshot> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const pollMs = options.pollMs ?? 1000;

  while (Date.now() - started < timeoutMs) {
    if (options.signal?.aborted) {
      const partial = getLastAssistantTextFromSessionDir(
        options.sessionDir,
        options.sessionName,
        options.sinceMs,
      );
      return {
        status: "cancelled",
        content: partial?.trim() || "Task was cancelled.",
        source: "signal",
      };
    }

    const snapshot = await checkTaskCompletion(options);
    if (snapshot.status !== "running") return snapshot;
    await sleep(pollMs);
  }

  const elapsedMs = Date.now() - started;
  const base = `Task timed out after ${Math.round(timeoutMs / 1000)}s without producing a result.`;
  let content = base;
  if (options.paneId && paneDead(options.paneId)) {
    content = enrichSubagentFailureMessage({
      kind: "timeout",
      baseMessage: base,
      paneId: options.paneId,
      artifactsDir: options.artifactsDir,
      taskId: options.taskId,
      elapsedMs,
    });
  } else if (
    options.artifactsDir &&
    options.taskId &&
    !sessionJsonlExists(options.artifactsDir, options.taskId)
  ) {
    content = enrichSubagentFailureMessage({
      kind: "timeout",
      baseMessage: base,
      artifactsDir: options.artifactsDir,
      taskId: options.taskId,
      elapsedMs,
    });
  }

  return {
    status: "timeout",
    content,
    source: "timeout",
  };
}