import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  countToolUses,
  formatForegroundProgressText,
  readProgress,
} from "../helpers.js";
import { FOREGROUND_PROGRESS_POLL_MS } from "../constants.js";

export type ForegroundProgressPollOptions = {
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

export function flushOnUpdate(
  onUpdate: ForegroundProgressPollOptions["onUpdate"],
  progress: {
    agentType: string;
    toolUses: number;
    durationMs: number;
    outputLines: string[];
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
  const {
    sessionDir,
    sessionName,
    agentType,
    description,
    startedAt,
    onUpdate,
  } = options;

  let lastToolUses = -1;
  let lastOutputKey = "";

  const tick = () => {
    const { toolUses } = countToolUses(sessionDir, sessionName);
    const outputLines = readProgress(sessionDir, sessionName);
    const outputKey = outputLines.join("\n");
    const durationMs = Date.now() - startedAt;
    if (toolUses === lastToolUses && outputKey === lastOutputKey) {
      return;
    }
    lastToolUses = toolUses;
    lastOutputKey = outputKey;
    const progress = {
      agentType,
      description,
      toolUses,
      durationMs,
      outputLines,
    };
    const theme = { fg: (_role: string, text: string) => text } as Theme;
    flushOnUpdate(onUpdate, progress, theme);
  };

  tick();
  const timer = setInterval(tick, FOREGROUND_PROGRESS_POLL_MS);
  return () => clearInterval(timer);
}