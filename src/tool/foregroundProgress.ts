import { COUNT_POLL_MS, FOREGROUND_PROGRESS_MAX_TOOL_LINES } from "../constants.js";
import {
  formatToolCallsSummaryBlock,
  readRecentToolCalls,
  renderTaskStatusSummary,
} from "../helpers.js";

export type ForegroundProgressDetails = {
  _taskRunningProgress?: {
    summary: string;
    lines: string;
    toolUses: number;
    elapsedMs: number;
  };
};

export function pollForegroundProgress(input: {
  piDir: string;
  sessionDir: string;
  sessionName: string;
  agentType: string;
  description: string;
  startedAt: number;
}): ForegroundProgressDetails {
  const { recent: recentToolCalls, toolUses } = readRecentToolCalls(
    input.sessionDir,
    FOREGROUND_PROGRESS_MAX_TOOL_LINES,
    input.sessionName,
  );
  const elapsedMs = Date.now() - input.startedAt;
  const summary = renderTaskStatusSummary({
    agentType: input.agentType,
    description: input.description,
    toolUses,
    elapsedMs,
  });
  return {
    _taskRunningProgress: {
      summary,
      lines: formatToolCallsSummaryBlock(recentToolCalls, FOREGROUND_PROGRESS_MAX_TOOL_LINES),
      toolUses,
      elapsedMs,
    },
  };
}

export function formatForegroundProgressText(
  progress: NonNullable<ForegroundProgressDetails["_taskRunningProgress"]>,
): string {
  return progress.lines ? `${progress.summary}\n${progress.lines}` : progress.summary;
}

export function startForegroundProgressPolling(input: {
  piDir: string;
  sessionDir: string;
  sessionName: string;
  agentType: string;
  description: string;
  startedAt: number;
  onUpdate: ((update: { content: { type: "text"; text: string }[]; details: ForegroundProgressDetails }) => void) | undefined;
}): () => void {
  if (!input.onUpdate) return () => {};
  const tick = () => {
    const details = pollForegroundProgress({
      piDir: input.piDir,
      sessionDir: input.sessionDir,
      sessionName: input.sessionName,
      agentType: input.agentType,
      description: input.description,
      startedAt: input.startedAt,
    });
    const p = details._taskRunningProgress;
    if (!p) return;
    input.onUpdate!({
      content: [{ type: "text", text: "" }],
      details,
    });
  };
  tick();
  const id = setInterval(tick, COUNT_POLL_MS);
  return () => clearInterval(id);
}