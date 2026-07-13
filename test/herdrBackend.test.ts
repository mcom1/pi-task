import assert from "node:assert/strict";
import test from "node:test";

import { createHerdrTerminalBackend, createSyncHerdrControl } from "../src/subagent/herdr.js";

test("HerdR launch returns a socket-scoped terminal handle", async () => {
  const calls: Array<{ args: string[]; env?: NodeJS.ProcessEnv }> = [];
  const outputs = [
    JSON.stringify({ layout: { panes: [{ pane_id: "w1:p1", rect: { width: 160, height: 40 } }] } }),
    JSON.stringify({ agent: { pane_id: "w1:p2", terminal_id: "term-2" } }),
  ];
  const backend = createHerdrTerminalBackend({
    env: {
      HERDR_ENV: "1",
      HERDR_PANE_ID: "w1:p1",
      HERDR_SOCKET_PATH: "/tmp/herdr.sock",
    },
    run: async (_command, args, options) => {
      calls.push({ args: [...args], env: options?.env });
      return { stdout: outputs.shift() ?? "", stderr: "" };
    },
  });

  const handle = await backend.launch({ cwd: "/repo", command: "pi --session task" });

  assert.deepEqual(handle, {
    backend: "herdr",
    resourceId: "w1:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
  });
  assert.deepEqual(calls[0]?.args, ["pane", "layout", "--pane", "w1:p1"]);
  assert.deepEqual(calls[1]?.args.slice(0, 3), ["agent", "start", "pi-task"]);
  assert.deepEqual(calls[1]?.args.slice(-4), ["--", "sh", "-lc", "pi --session task"]);
  assert.ok(calls[1]?.args.includes("right"));
  assert.equal(calls.length, 2);
});

test("HerdR chooses a downward split for a narrow caller pane", async () => {
  const calls: string[][] = [];
  const outputs = [
    JSON.stringify({ layout: { panes: [{ pane_id: "w1:p1", rect: { width: 88, height: 41 } }] } }),
    JSON.stringify({ agent: { pane_id: "w1:p2", terminal_id: "term-2" } }),
  ];
  const backend = createHerdrTerminalBackend({
    env: {
      HERDR_ENV: "1",
      HERDR_PANE_ID: "w1:p1",
      HERDR_SOCKET_PATH: "/tmp/herdr.sock",
    },
    run: async (_command, args) => {
      calls.push([...args]);
      return { stdout: outputs.shift() ?? "", stderr: "" };
    },
  });

  await backend.launch({ command: "pi", cwd: "/repo" });
  assert.ok(calls[1]?.includes("down"));
});

test("HerdR ownership is checked before reads", async () => {
  const calls: string[][] = [];
  const backend = createHerdrTerminalBackend({
    env: {
      HERDR_ENV: "1",
      HERDR_PANE_ID: "w1:p1",
      HERDR_SOCKET_PATH: "/tmp/herdr.sock",
    },
    run: async (_command, args) => {
      calls.push([...args]);
      return {
        stdout: JSON.stringify({
          pane: { pane_id: "w1:p2", terminal_id: "another-terminal" },
        }),
        stderr: "",
      };
    },
  });

  await assert.rejects(
    backend.readTail(
      {
        backend: "herdr",
        resourceId: "w1:p2",
        socketPath: "/tmp/herdr.sock",
        terminalId: "term-2",
      },
      20,
    ),
    /ownership/i,
  );
  assert.equal(calls.length, 1);
});

test("sync steering accepts HerdR mutation commands with empty stdout", () => {
  const calls: string[][] = [];
  const control = createSyncHerdrControl(
    { HERDR_SOCKET_PATH: "/tmp/herdr.sock" },
    (args) => {
      calls.push([...args]);
      if (args[1] === "get") {
        return JSON.stringify({ pane: { pane_id: "w1:p2", terminal_id: "term-2" } });
      }
      return "";
    },
  );
  const handle = {
    backend: "herdr" as const,
    resourceId: "w1:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
  };

  control.send(handle, "follow up");
  assert.deepEqual(calls, [
    ["pane", "get", "w1:p2"],
    ["pane", "send-text", "w1:p2", "follow up"],
    ["pane", "send-keys", "w1:p2", "enter"],
  ]);
});

test("async steering sends text followed by exactly one delayed Enter", async () => {
  const calls: string[][] = [];
  const backend = createHerdrTerminalBackend({
    env: {
      HERDR_ENV: "1",
      HERDR_PANE_ID: "w1:p1",
      HERDR_SOCKET_PATH: "/tmp/herdr.sock",
    },
    run: async (_command, args) => {
      calls.push([...args]);
      if (args[1] === "get") {
        return {
          stdout: JSON.stringify({ pane: { pane_id: "w1:p2", terminal_id: "term-2" } }),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    },
  });

  await backend.send({
    backend: "herdr",
    resourceId: "w1:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
  }, "follow up");

  assert.deepEqual(calls, [
    ["pane", "get", "w1:p2"],
    ["pane", "send-text", "w1:p2", "follow up"],
    ["pane", "send-keys", "w1:p2", "enter"],
  ]);
});

test("HerdR transport failures are not reported as dead panes", async () => {
  const backend = createHerdrTerminalBackend({
    env: {
      HERDR_ENV: "1",
      HERDR_PANE_ID: "w1:p1",
      HERDR_SOCKET_PATH: "/tmp/herdr.sock",
    },
    run: async () => {
      throw new Error("connection refused");
    },
  });

  await assert.rejects(
    backend.isAlive({
      backend: "herdr",
      resourceId: "w1:p2",
      socketPath: "/tmp/herdr.sock",
      terminalId: "term-2",
    }),
    (error: unknown) => error instanceof Error && error.name === "HerdrUnavailableError",
  );
});
