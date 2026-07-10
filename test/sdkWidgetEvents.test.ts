import assert from "node:assert/strict";
import { test } from "node:test";
import { subscribeToolEvents } from "../src/helpers";
import type { BackgroundTask } from "../src/types";

function createTask(): Pick<BackgroundTask, "toolUses" | "recentCalls"> {
  return { toolUses: 0, recentCalls: [] };
}

function createSession() {
  let listener: ((event: Record<string, unknown>) => void) | undefined;
  let active = false;
  return {
    session: {
      subscribe(callback: (event: Record<string, unknown>) => void) {
        listener = callback;
        active = true;
        return () => {
          active = false;
        };
      },
    },
    emit(event: Record<string, unknown>) {
      if (active) listener?.(event);
    },
  };
}

test("SDK tool events make a foreground task call visible, then complete it", () => {
  const task = createTask();
  const { session, emit } = createSession();
  subscribeToolEvents(session, task);

  emit({
    type: "tool_execution_start",
    toolCallId: "call_1",
    toolName: "read",
    args: { path: "README.md" },
  });
  assert.deepEqual(task, {
    toolUses: 1,
    recentCalls: [{ id: "call_1", name: "read", detail: '{"path":"README.md"}', status: "in_progress" }],
  });

  emit({ type: "tool_execution_end", toolCallId: "call_1", isError: false });
  assert.equal(task.recentCalls[0]?.status, "done");
});

test("SDK tool events keep background task failures visible", () => {
  const task = createTask();
  const { session, emit } = createSession();
  subscribeToolEvents(session, task);

  emit({
    type: "tool_execution_start",
    toolCallId: "call_2",
    toolName: "bash",
    args: { command: "false" },
  });
  emit({ type: "tool_execution_update", toolCallId: "call_2", partialResult: { content: "failed" } });
  assert.equal(task.recentCalls[0]?.detail, '{"command":"false"}');
  emit({ type: "tool_execution_end", toolCallId: "call_2", isError: true });

  assert.equal(task.toolUses, 1);
  assert.equal(task.recentCalls[0]?.status, "error");
});

test("SDK tool calls stay oldest-first so the widget can render the latest call", () => {
  const task = createTask();
  const { session, emit } = createSession();
  subscribeToolEvents(session, task);

  emit({ type: "tool_execution_start", toolCallId: "call_1", toolName: "read", args: {} });
  emit({ type: "tool_execution_start", toolCallId: "call_2", toolName: "bash", args: {} });

  assert.deepEqual(task.recentCalls.map((call) => call.id), ["call_1", "call_2"]);
});

test("disposed SDK subscriptions stop updating the task", () => {
  const task = createTask();
  const { session, emit } = createSession();
  const unsubscribe = subscribeToolEvents(session, task);
  unsubscribe();

  emit({
    type: "tool_execution_start",
    toolCallId: "call_3",
    toolName: "read",
    args: {},
  });

  assert.equal(task.toolUses, 0);
});
