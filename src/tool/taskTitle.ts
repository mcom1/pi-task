import type { Theme } from "@earendil-works/pi-coding-agent";

const TASK_TITLE_DESCRIPTION_MAX = 72;

export function renderTaskAgentTitle(agentType: string, theme: Theme): string {
  return theme.fg("toolTitle", `⚙ ${agentType || "task"}`);
}

export function renderTaskTitleText(
  agentType: string,
  description: string,
  theme: Theme,
): string {
  const agent = renderTaskAgentTitle(agentType, theme);
  const desc = description.trim();
  if (!desc) return agent;
  return (
    agent +
    theme.fg("muted", " • ") +
    theme.fg("muted", truncateTaskTitleDescription(desc))
  );
}

function truncateTaskTitleDescription(text: string): string {
  if (text.length <= TASK_TITLE_DESCRIPTION_MAX) return text;
  return `${text.slice(0, TASK_TITLE_DESCRIPTION_MAX - 1)}…`;
}
