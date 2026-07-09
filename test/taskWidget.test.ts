import test from "node:test";
import assert from "node:assert/strict";

import { renderTaskWidget } from "../src/task-widget.js";

test("task widget prefixes in-progress spinner with a leading space", () => {
  const lines = renderTaskWidget({
    foregroundTasks: [
      [
        "task-1",
        {
          agentType: "general",
          description: "foreground run",
          startedAt: 0,
          toolUses: 0,
          recentCalls: [],
        },
      ],
    ],
    backgroundTasks: [
      [
        "task-2",
        {
          agentType: "reviewer",
          description: "background run",
          startedAt: 0,
          toolUses: 0,
          recentCalls: [],
        },
      ],
    ],
    foregroundCount: 1,
    backgroundCount: 1,
    width: 120,
    now: 0,
  });

  assert.match(lines[0] ?? "", /^ ⠋ /, "foreground header has leading space before spinner");
  assert.match(lines[2] ?? "", /· 0 tools$/, "background header shows metadata only");
  assert.match(lines[3] ?? "", /  └─  ⠋ waiting$/, "background tool detail uses a tree connector with spinner");
});

test("background widget uses tree connector and collapses older tool calls", () => {
  const lines = renderTaskWidget({
    foregroundTasks: [],
    backgroundTasks: [["task-1", {
      agentType: "general",
      description: "background run",
      startedAt: 0,
      toolUses: 3,
      recentCalls: [
        { name: "read", detail: "a.ts", status: "done" },
        { name: "grep", detail: "pattern", status: "done" },
        { name: "edit", detail: "b.ts", status: "in_progress" },
      ],
    }]],
    foregroundCount: 0,
    backgroundCount: 1,
    width: 120,
    now: 0,
  });

  assert.match(lines[0] ?? "", /· 3 tools$/, "background header stays single metadata line");
  assert.match(lines[1] ?? "", /  └─  ⠋ edit  b\.ts \(\+2 more\)$/, "background detail line shows latest call with collapsed count");
});

test("background latest tool spacing is consistent for done and error states", () => {
  const doneLines = renderTaskWidget({
    foregroundTasks: [],
    backgroundTasks: [["task-1", {
      agentType: "general",
      description: "done run",
      startedAt: 0,
      toolUses: 1,
      recentCalls: [{ name: "read", detail: "a.ts", status: "done" }],
    }]],
    foregroundCount: 0,
    backgroundCount: 1,
    width: 120,
    now: 0,
  });
  const errorLines = renderTaskWidget({
    foregroundTasks: [],
    backgroundTasks: [["task-2", {
      agentType: "general",
      description: "error run",
      startedAt: 0,
      toolUses: 1,
      recentCalls: [{ name: "bash", detail: "fail", status: "error" }],
    }]],
    foregroundCount: 0,
    backgroundCount: 1,
    width: 120,
    now: 0,
  });

  assert.match(doneLines[1] ?? "", /  └─ ✓  read  a\.ts$/, "done status keeps tree layout and two spaces after marker");
  assert.match(errorLines[1] ?? "", /  └─ ✗  bash  fail$/, "error status keeps tree layout and two spaces after marker");
});

test("foreground widget renders a single tree connector for the latest tool call", () => {
  const lines = renderTaskWidget({
    foregroundTasks: [
      [
        "task-1",
        {
          agentType: "general",
          description: "foreground run",
          startedAt: 0,
          toolUses: 3,
          recentCalls: [
            { name: "read", detail: "a.ts", status: "done" },
            { name: "grep", detail: "pattern", status: "done" },
            { name: "edit", detail: "b.ts", status: "in_progress" },
          ],
        },
      ],
    ],
    backgroundTasks: [],
    foregroundCount: 1,
    backgroundCount: 0,
    width: 120,
    now: 0,
  });

  assert.equal(lines.filter((line) => line.includes("└─")).length, 1, "renders only one connector line");
  assert.match(lines[1] ?? "", /└─ .*edit  b\.ts \(\+2 more\)$/, "shows latest call and collapses older ones");
});
