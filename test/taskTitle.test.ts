import assert from "node:assert/strict";
import test from "node:test";
import { renderTaskAgentTitle, renderTaskTitleText } from "../src/tool/taskTitle.js";

const theme = {
  fg: (_color: string, text: string) => text,
};

test("task titles prefix the agent name with a gear", () => {
  assert.equal(renderTaskAgentTitle("reviewer", theme as never), "⚙ reviewer");
  assert.equal(
    renderTaskTitleText("reviewer", "Review the current diff", theme as never),
    "⚙ reviewer • Review the current diff",
  );
});

test("task titles retain a fallback label", () => {
  assert.equal(renderTaskAgentTitle("", theme as never), "⚙ task");
});
