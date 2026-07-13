import assert from "node:assert/strict";
import test from "node:test";

import { createTmuxTerminalBackend } from "../src/subagent/terminalBackend.js";

test("tmux terminal backend preserves the launch handle contract", async () => {
  const calls: string[][] = [];
  const backend = createTmuxTerminalBackend({
    run: async (_command, args) => {
      calls.push([...args]);
      return { stdout: "%42\n", stderr: "" };
    },
  });

  const handle = await backend.launch({
    cwd: "/repo",
    command: "pi --session task",
  });

  assert.deepEqual(handle, {
    backend: "tmux",
    resourceId: "%42",
  });
  assert.equal(calls.length, 1);
});
