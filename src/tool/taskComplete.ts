import { Box, Container, Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  renderTaskResultBody,
  type TaskResultDetails,
} from "./renderTaskResultBody.js";

/**
 * Renderer for background task completion notifications.
 * Same structured sections as foreground task renderResult (Ctrl+O).
 */
export function createTaskCompleteRenderer() {
  return (
    message: { details?: unknown },
    { expanded }: { expanded?: boolean },
    theme: Theme,
  ) => {
    const d = (message.details ?? {}) as TaskResultDetails & {
      agent_type?: string;
      description?: string;
      summary?: string;
      result?: string;
    };
    if (!d.agent_type && !d.description && !d.summary && !d.result) {
      return undefined;
    }

    const root = new Container();
    const agentType = d.agent_type || "";
    const desc = d.description || "";
    const title =
      theme.fg("toolTitle", agentType) +
      (desc
        ? theme.fg("muted", " • ") + theme.fg("muted", desc)
        : "");
    root.addChild(new Text(title, 0, 0));

    const summaryText = (d.summary || "").trim();
    const body = renderTaskResultBody(d, summaryText, { expanded }, theme);
    root.addChild(body);

    if (root.children.length === 0) return undefined;

    const subtleBg = (text: string) => `\x1b[48;2;30;28;44m${text}\x1b[0m`;
    const box = new Box(0, 1, subtleBg);
    for (const child of root.children) {
      box.addChild(child);
    }
    return box;
  };
}