import { Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ForegroundProgressDetails } from "./foregroundProgress.js";

type TaskArgs = {
  agent_type: string;
  description: string;
  background?: boolean;
};

function readProgress(
  partialResult: unknown,
): ForegroundProgressDetails["_taskRunningProgress"] | undefined {
  if (!partialResult || typeof partialResult !== "object") return undefined;
  const o = partialResult as Record<string, unknown>;
  const details = o.details as ForegroundProgressDetails | undefined;
  if (details?._taskRunningProgress) return details._taskRunningProgress;
  return (o as ForegroundProgressDetails)._taskRunningProgress;
}

/** Sticky call header: collapsed summary; Ctrl+O expands foreground tool details. */
export function renderCall(
  args: TaskArgs,
  theme: Theme,
  context: unknown,
): InstanceType<typeof Text> {
  const toolContext = context as { expanded?: boolean; partialResult?: unknown };
  const progress = readProgress(toolContext.partialResult);
  if (progress) {
    const hint = toolContext.expanded
      ? "ctrl+o to collapse"
      : "ctrl+o to expand";
    const lines =
      toolContext.expanded && progress.lines ? `\n${progress.lines}` : "";
    return new Text(
      theme.fg("toolTitle", `${progress.summary}${lines}\n  ${hint}`),
      0,
      0,
    );
  }
  return new Text(
    theme.fg("toolTitle", `${args.agent_type} - ${args.description}`),
    0,
    0,
  );
}