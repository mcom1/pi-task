import type { Theme } from "@earendil-works/pi-coding-agent";
import { countToolUses, formatForegroundProgressText } from "../helpers.js";
import { FOREGROUND_PROGRESS_POLL_MS } from "../constants.js";

export type ForegroundProgressPollOptions = {
  taskId: string;
  sessionDir: string;
  sessionName: string;
  agentType: string;
  description: string;
  startedAt: number;
  onUpdate: (update: {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  }) => void;
};

function flushOnUpdate(
  onUpdate: ForegroundProgressPollOptions["onUpdate"],
  progress: {
    taskId: string;
    sessionPath: string;
    agentType: string;
    toolUses: number;
    durationMs: number;
  },
  theme: Theme,
): void {
  const text = formatForegroundProgressText(progress, theme);
  onUpdate({
    content: text ? [{ type: "text", text }] : [],
    details: {
      _taskRunningProgress: progress,
    },
  });
}

export function startForegroundProgressPolling(
  options: ForegroundProgressPollOptions,
): () => void {
  const { taskId, sessionDir, sessionName, agentType, startedAt, onUpdate } = options;

  let lastToolUses = -1;
  const push = () => {
    const { toolUses } = countToolUses(sessionDir, sessionName);
    const durationMs = Date.now() - startedAt;
    if (toolUses === lastToolUses) return;
    lastToolUses = toolUses;

    const progress = {
      taskId,
      sessionPath: `${sessionDir}/${sessionName}.jsonl`,
      agentType,
      toolUses,
      durationMs,
    };
    const theme = { fg: (_role: string, text: string) => text } as Theme;
    flushOnUpdate(onUpdate, progress, theme);
  };

  push();
  const timer = setInterval(push, FOREGROUND_PROGRESS_POLL_MS);
  return () => clearInterval(timer);
}
