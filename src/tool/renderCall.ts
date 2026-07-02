import { Container, Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { formatElapsed } from "../helpers.js";
import { renderTaskTitleText } from "./taskTitle.js";

/** Sticky header only: agent • tools • duration. Tool lines stream via onUpdate content. */
export function renderCall(
  args: Record<string, unknown>,
  theme: Theme,
): InstanceType<typeof Container> {
  const container = new Container();
  const progress = args._taskRunningProgress as
    | {
        agentType?: string;
        toolUses?: number;
        durationMs?: number;
        outputLines?: string[];
      }
    | undefined;

  const agentType =
    progress?.agentType ?? String(args.agent_type ?? "task");
  const description = String(args.description ?? "").trim();
  const toolUses = progress?.toolUses ?? 0;
  const elapsedMs = progress?.durationMs ?? 0;

  const sep = theme.fg("muted", " • ");

  const summary =
    toolUses === 0 && elapsedMs < 1_000 && description
      ? renderTaskTitleText(agentType, description, theme)
      : theme.fg("toolTitle", agentType) +
        sep +
        theme.fg("text", formatToolCount(toolUses)) +
        sep +
        theme.fg("success", formatElapsed(elapsedMs));

  container.addChild(new Text(summary, 0, 0));

  return container;
}

function formatToolCount(n: number): string {
  return n === 1 ? "1 toolcall" : `${n} toolcalls`;
}