import { Container, Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { keyHint, keyText, rawKeyHint } from "@earendil-works/pi-coding-agent";
import { formatMs } from "../helpers.js";

export type TaskResultDetails = {
  agent_type?: string;
  description?: string;
  phase?: string;
  tool_uses?: number;
  duration_ms?: number;
  background?: boolean;
  summary?: string;
  findings?: string;
  evidence?: string;
  files?: string;
  caveats?: string;
  next_steps?: string;
  structured_result?: boolean;
  full_output?: string;
};

/** Shared collapsed/expanded body for task tool results and task-complete notifications. */
export function renderTaskResultBody(
  details: TaskResultDetails,
  contentSummaryText: string,
  options: { expanded?: boolean },
  theme: Theme,
): InstanceType<typeof Container> {
  const tight = Boolean(details.background);
  const stats: string[] = [];
  if (typeof details.tool_uses === "number" && details.tool_uses > 0) {
    stats.push(
      theme.fg(
        "muted",
        `${details.tool_uses} toolcall${details.tool_uses === 1 ? "" : "s"}`,
      ),
    );
  }
  if (typeof details.duration_ms === "number" && details.duration_ms > 0) {
    stats.push(theme.fg("muted", formatMs(details.duration_ms)));
  }

  const summaryLine = (details.summary ?? contentSummaryText).trim();
  const preview = summaryLine.slice(0, 120);
  const expandHint = expandCollapseHint("to expand");
  const collapseHint = expandCollapseHint("to collapse");
  const structured = hasStructuredTaskDetails(details);
  const plainBody = (details.full_output ?? contentSummaryText).trim();
  const multilinePlain = !structured && plainBody.includes("\n");

  const container = new Container();

  if (stats.length) {
    const statsText = stats.join(theme.fg("dim", " • "));
    container.addChild(new Text(` ${statsText}`, 0, 0));
  }

  if (options.expanded) {
    if (structured) {
      appendBlock(container, theme, "Summary", details.summary ?? summaryLine, tight);
      appendBlock(container, theme, "Findings", details.findings, tight);
      appendBlock(container, theme, "Evidence", details.evidence, tight);
      appendBlock(container, theme, "Files", details.files, tight);
      appendBlock(container, theme, "Caveats", details.caveats, tight);
      appendBlock(container, theme, "Next steps", details.next_steps, tight);
    } else if (plainBody) {
      for (const line of plainBody.split("\n")) {
        container.addChild(new Text(prefixResultLine(line, tight), 0, 0));
      }
    }
    container.addChild(
      new Text(theme.fg("dim", ` (${collapseHint})`), 0, 0),
    );
  } else {
    if (multilinePlain) {
      for (const line of plainBody.split("\n")) {
        container.addChild(
          new Text(theme.fg("dim", prefixResultLine(line, tight)), 0, 0),
        );
      }
    } else if (preview) {
      const branchPreview = preview.startsWith("⎿")
        ? preview
        : `⎿ ${preview}`;
      const previewText =
        (tight ? " " : "") +
        prefixResultLine(branchPreview, tight) +
        (summaryLine.length > 120 ? theme.fg("dim", "…") : "");
      container.addChild(new Text(previewText, 0, 0));
    }
    if (
      summaryLine.length > 120 ||
      structured ||
      multilinePlain ||
      (details.full_output ?? "").length > summaryLine.length
    ) {
      container.addChild(
        new Text(theme.fg("dim", ` (${expandHint})`), 0, 0),
      );
    }
  }

  return container;
}

function hasStructuredTaskDetails(details: TaskResultDetails): boolean {
  if (!details.structured_result) return false;
  return Boolean(
    details.findings ||
      details.evidence ||
      details.files ||
      details.caveats ||
      details.next_steps,
  );
}

function appendBlock(
  container: InstanceType<typeof Container>,
  theme: Theme,
  label: string,
  body: string | undefined,
  tight: boolean,
) {
  const text = (body ?? "").trim();
  if (!text) return;
  container.addChild(
    new Text(theme.fg("toolTitle", ` ${label}`), 0, 0),
  );
  for (const line of text.split("\n")) {
    container.addChild(new Text(prefixResultLine(line, tight), 0, 0));
  }
}

function expandCollapseHint(action: "to expand" | "to collapse") {
  return keyText("app.tools.expand").trim()
    ? keyHint("app.tools.expand", action)
    : rawKeyHint("ctrl+o", action);
}

function prefixResultLine(line: string, _tight: boolean): string {
  const trimmed = line.trimEnd();
  if (trimmed.startsWith("⎿")) {
    return trimmed;
  }
  return ` ${trimmed.trimStart()}`;
}