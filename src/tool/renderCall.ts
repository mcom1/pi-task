import { Container, Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { formatElapsed } from "../helpers.js";

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

  const agent = theme.fg("toolTitle", agentType);
  const sep = theme.fg("muted", " • ");

  const summary =
    toolUses === 0 && elapsedMs < 1_000 && description
      ? agent +
        sep +
        theme.fg("muted", truncateStickyDescription(description))
      : agent +
        sep +
        theme.fg("text", formatToolCount(toolUses)) +
        sep +
        theme.fg("success", formatElapsed(elapsedMs));

  container.addChild(new Text(summary, 0, 0));

  return container;
}

const STICKY_DESCRIPTION_MAX = 72;

function truncateStickyDescription(text: string): string {
  if (text.length <= STICKY_DESCRIPTION_MAX) return text;
  return `${text.slice(0, STICKY_DESCRIPTION_MAX - 1)}…`;
}

function formatToolCount(n: number): string {
  return n === 1 ? "1 toolcall" : `${n} toolcalls`;
}