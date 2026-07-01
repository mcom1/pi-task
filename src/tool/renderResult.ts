import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  renderTaskResultBody,
  type TaskResultDetails,
} from "./renderTaskResultBody.js";

export function renderResult(
  result: { content?: Array<{ type?: string; text?: string }>; details?: unknown },
  options: { expanded?: boolean },
  theme: Theme,
  _context: unknown,
) {
  const details = (result.details ?? {}) as TaskResultDetails;
  const firstContent = result.content?.[0];
  const fullText =
    firstContent && "text" in firstContent
      ? (firstContent.text ?? "").trim()
      : "";
  return renderTaskResultBody(details, fullText, options, theme);
}