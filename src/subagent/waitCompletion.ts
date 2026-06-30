import {
  getLastAssistantTextFromSessionDir,
  hasAgentFinished,
} from "../session-text.js";
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
  source?: "session-jsonl" | "pane" | "timeout" | "signal";
}

export interface WaitForTaskCompletionOptions {
  sessionDir: string;
  sessionName: string;
  paneId?: string;
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

/**
 * Time to wait for the JSONL to flush after the pane exits before we
 * accept "no terminal message" as a real failure. 500ms (the previous
 * default) was too tight — pi's session autosave buffers writes and the
 * final stopReason often lands 1-3s after the assistant stops streaming.
 * If it's still not there after this window, retry once before falling
 * back to "failed".
 */
const POST_PANE_EXIT_FLUSH_MS = 2500
const POST_PANE_EXIT_RETRY_MS = 2500

export async function checkTaskCompletion(
  options: Omit<WaitForTaskCompletionOptions, "signal" | "timeoutMs" | "pollMs">,
): Promise<TaskCompletionSnapshot> {
  const paneAlive = options.paneId ? paneExists(options.paneId) : false

  // If the pane has exited, give pi time to flush the final JSONL entry.
  // Retry once because the first flush window is sometimes not enough —
  // pi's session autosave buffers writes and the final stopReason can
  // land a couple of seconds after the assistant stops streaming.
  if (options.paneId && !paneAlive) {
    await sleep(POST_PANE_EXIT_FLUSH_MS)
    const firstPass = readSessionText(
      options.sessionDir,
      options.sessionName,
      options.sinceMs,
    )
    if (firstPass) {
      return { status: "completed", content: firstPass, source: "session-jsonl" }
    }
    await sleep(POST_PANE_EXIT_RETRY_MS)
  }

  // Session JSONL is the single authoritative completion source.
  const sessionResult = readSessionText(
    options.sessionDir,
    options.sessionName,
    options.sinceMs,
  )
  if (sessionResult) {
    return { status: "completed", content: sessionResult, source: "session-jsonl" }
  }

  // No terminal assistant message yet. If the pane is alive, keep waiting.
  if (options.paneId && paneExists(options.paneId)) {
    return { status: "running", content: "", source: "pane" }
  }

  return {
    status: "failed",
    content: "Subagent pane exited without producing a result.",
  }
}

export async function waitForTaskCompletion(
  options: WaitForTaskCompletionOptions,
): Promise<TaskCompletionSnapshot> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const pollMs = options.pollMs ?? 1000;

  while (Date.now() - started < timeoutMs) {
    if (options.signal?.aborted) {
      // On signal abort (e.g. parent session reload while a foreground
      // task was in flight), return whatever the subagent already wrote
      // to the JSONL — even if it was mid-streaming (stopReason: toolUse)
      // and the agent never formally "finished". Better to send partial
      // output than to lose everything to the cancel.
      const partial = getLastAssistantTextFromSessionDir(
        options.sessionDir,
        options.sessionName,
        options.sinceMs,
      )
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

  return {
    status: "timeout",
    content: `Task timed out after ${Math.round(timeoutMs / 1000)}s without producing a result.`,
    source: "timeout",
  };
}
