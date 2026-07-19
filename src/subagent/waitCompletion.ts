import {
  getLastAssistantTextFromSessionDir,
  hasAgentFinished,
} from "../session-text.js";
import { enrichSubagentFailureMessage } from "./failure-diagnostics.js";
import { formatHardTimeoutMessage } from "../task-timeouts.js";
import { readExitSentinel } from "./exitSentinel.js";
import { paneExists } from "./tmux.js";

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
      source?: "session-jsonl" | "pane" | "exit-sentinel" | "timeout" | "signal";
}

export interface WaitForTaskCompletionOptions {
  sessionDir: string;
  sessionName: string;
  paneId?: string;
  artifactsDir?: string;
  taskId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutGraceMs?: number;
  pollMs?: number;
  requestWrapUp?: () => void | Promise<void>;
  getTimeoutDiagnostics?: () => string | Promise<string>;
  sinceMs?: number;
  resourceExists?: () => boolean | Promise<boolean>;
  exitSentinelPath?: string;
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
  const paneAlive = options.resourceExists
    ? await options.resourceExists()
    : options.paneId
      ? paneExists(options.paneId)
      : false;

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

  if (options.exitSentinelPath && options.taskId) {
    const sentinel = readExitSentinel(options.exitSentinelPath, options.taskId);
    if (sentinel) {
      await sleep(250);
      const finalSessionResult = readSessionText(
        options.sessionDir,
        options.sessionName,
        options.sinceMs,
      );
      if (finalSessionResult) {
        return { status: "completed", content: finalSessionResult, source: "session-jsonl" };
      }
      const message = sentinel.exitCode === 0
        ? "Agent process exited without writing a final session result."
        : `Agent process exited with code ${sentinel.exitCode} before writing a final session result.`;
      return { status: "failed", content: message, source: "exit-sentinel" };
    }
  }

  const stillAlive = options.resourceExists
    ? await options.resourceExists()
    : options.paneId
      ? paneExists(options.paneId)
      : false;
  if (options.paneId && stillAlive) {
    return { status: "running", content: "", source: "pane" };
  }

  return {
    status: "failed",
    content: reportPaneExitFailure(options),
    source: "pane",
  };
}

export async function buildHardTimeoutContent(
  options: Pick<WaitForTaskCompletionOptions,
    "sessionDir" | "sessionName" | "sinceMs" | "paneId" | "artifactsDir" | "taskId" | "getTimeoutDiagnostics"
  > & { timeoutMs: number; timeoutGraceMs: number; elapsedMs: number },
): Promise<string> {
  const base = formatHardTimeoutMessage(options.timeoutMs, options.timeoutGraceMs);
  let content = enrichSubagentFailureMessage({
    kind: "timeout",
    baseMessage: base,
    paneId: options.paneId,
    artifactsDir: options.artifactsDir,
    taskId: options.taskId,
    elapsedMs: options.elapsedMs,
  });
  const partial = getLastAssistantTextFromSessionDir(
    options.sessionDir,
    options.sessionName,
    options.sinceMs,
  ).trim();
  if (partial) content += `\n\nLatest partial assistant response:\n${partial}`;
  if (options.getTimeoutDiagnostics) {
    try {
      const diagnostics = (await options.getTimeoutDiagnostics()).trim();
      if (diagnostics) content += `\n\n${diagnostics}`;
    } catch {
      // Timeout reporting must still complete when pane diagnostics fail.
    }
  }
  return content;
}

export async function waitForTaskCompletion(
  options: WaitForTaskCompletionOptions,
): Promise<TaskCompletionSnapshot> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const timeoutGraceMs = options.timeoutGraceMs ?? 2 * 60 * 1000;
  const hardDeadlineMs = timeoutMs + timeoutGraceMs;
  const pollMs = options.pollMs ?? 1000;
  let wrapUpRequested = false;

  while (true) {
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

    const elapsedMs = Date.now() - started;
    if (elapsedMs >= hardDeadlineMs) {
      const content = await buildHardTimeoutContent({
        ...options,
        timeoutMs,
        timeoutGraceMs,
        elapsedMs,
      });
      const finalSnapshot = await checkTaskCompletion(options);
      if (finalSnapshot.status !== "running") return finalSnapshot;
      return {
        status: "timeout",
        content,
        source: "timeout",
      };
    }

    if (elapsedMs >= timeoutMs && !wrapUpRequested) {
      wrapUpRequested = true;
      try {
        await options.requestWrapUp?.();
      } catch {
        // A failed steering attempt does not shorten the grace period.
      }
    }
    await sleep(Math.min(pollMs, Math.max(1, hardDeadlineMs - elapsedMs)));
  }
}