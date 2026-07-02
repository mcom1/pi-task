import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  enrichSubagentFailureMessage,
  sessionDirForTask,
} from "../src/subagent/failure-diagnostics.js";

describe("failure-diagnostics", () => {
  it("sessionDirForTask", () => {
    expect(sessionDirForTask("/artifacts", "abc-1")).toBe(
      join("/artifacts", "sessions", "abc-1"),
    );
  });

  it("enrichSubagentFailureMessage includes session dir and hint when no jsonl", () => {
    const text = enrichSubagentFailureMessage({
      kind: "pane_exit",
      baseMessage: "Subagent pane exited without producing a result.",
      artifactsDir: "/tmp/artifacts",
      taskId: "task-99",
      elapsedMs: 12_000,
    });
    expect(text).toContain("Subagent pane exited");
    expect(text).toContain("Session dir:");
    expect(text).toContain("sessions/task-99");
    expect(text).toContain("Session JSONL: missing");
    expect(text).toContain("PI_TASK_CHILD_NO_EXTENSIONS");
  });
});