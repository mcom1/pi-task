import assert from "node:assert/strict";
import test from "node:test";

import { createHerdrTerminalBackend, createSyncHerdrControl } from "../src/subagent/herdr.js";

test("HerdR launch creates an isolated workspace and returns its agent pane", async () => {
  const calls: Array<{ args: string[]; env?: NodeJS.ProcessEnv }> = [];
  const outputs = [
    JSON.stringify({ workspace: { workspace_id: "w2" }, root_pane: { pane_id: "w2:p1" } }),
    JSON.stringify({ agent: { pane_id: "w2:p2", terminal_id: "term-2" } }),
    "",
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
    resourceId: "w2:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
    workspaceId: "w2",
  });
  assert.deepEqual(calls[0]?.args, ["workspace", "create", "--cwd", "/repo", "--label", "pi-task", "--no-focus"]);
  assert.deepEqual(calls[1]?.args.slice(0, 7), ["agent", "start", "pi-task", "--workspace", "w2", "--cwd", "/repo"]);
  assert.deepEqual(calls[1]?.args.slice(-4), ["--", "sh", "-lc", "pi --session task"]);
  assert.deepEqual(calls[2]?.args, ["pane", "close", "w2:p1"]);
  assert.ok(calls[1]?.args.includes("--no-focus"));
  assert.ok(!calls[1]?.args.includes("--split"));
  assert.equal(calls.length, 3);
});

test("parallel HerdR launches serialize workspace and agent creation", async () => {
  let activeStarts = 0;
  let maxActiveStarts = 0;
  let nextId = 1;
  const run = async (_command: string, args: readonly string[]) => {
    const id = nextId;
    if (args[0] === "workspace") {
      return {
        stdout: JSON.stringify({ workspace: { workspace_id: `w${id}` }, root_pane: { pane_id: `w${id}:p1` } }),
        stderr: "",
      };
    }
    if (args[0] === "pane") return { stdout: "", stderr: "" };
    activeStarts += 1;
    maxActiveStarts = Math.max(maxActiveStarts, activeStarts);
    await new Promise((resolve) => setTimeout(resolve, 20));
    nextId += 1;
    activeStarts -= 1;
    return {
      stdout: JSON.stringify({ agent: { pane_id: `w${id}:p2`, terminal_id: `term-${id}` } }),
      stderr: "",
    };
  };
  const env = {
    HERDR_ENV: "1",
    HERDR_PANE_ID: "w1:p1",
    HERDR_SOCKET_PATH: "/tmp/herdr.sock",
  };
  const first = createHerdrTerminalBackend({ env, run });
  const second = createHerdrTerminalBackend({ env, run });

  const handles = await Promise.all([
    first.launch({ command: "pi first", cwd: "/repo" }),
    second.launch({ command: "pi second", cwd: "/repo" }),
  ]);

  assert.equal(maxActiveStarts, 1);
  assert.equal(new Set(handles.map((handle) => handle.terminalId)).size, 2);
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

test("HerdR cleanup closes the task workspace without requiring a live agent pane", async () => {
  const calls: string[][] = [];
  const backend = createHerdrTerminalBackend({
    env: { HERDR_ENV: "1", HERDR_SOCKET_PATH: "/tmp/herdr.sock" },
    run: async (_command, args) => {
      calls.push([...args]);
      return { stdout: "", stderr: "" };
    },
  });

  await backend.close({
    backend: "herdr",
    resourceId: "w2:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
    workspaceId: "w2",
  });

  assert.deepEqual(calls, [["workspace", "close", "w2"]]);
});

test("HerdR cleanup after restart closes only an untracked grouped task pane", async () => {
  const calls: string[][] = [];
  const backend = createHerdrTerminalBackend({
    env: { HERDR_ENV: "1", HERDR_SOCKET_PATH: "/tmp/herdr.sock" },
    run: async (_command, args) => {
      calls.push([...args]);
      return { stdout: "", stderr: "" };
    },
  });

  await backend.close({
    backend: "herdr",
    resourceId: "w2:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
    workspaceId: "w2",
    workspaceGroup: "parallel-retry",
  });

  assert.deepEqual(calls, [["pane", "close", "w2:p2"]]);
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

test("sync cleanup closes a task-owned HerdR workspace without a live pane", () => {
  const calls: string[][] = [];
  const control = createSyncHerdrControl(
    { HERDR_SOCKET_PATH: "/tmp/herdr.sock" },
    (args) => {
      calls.push([...args]);
      return "";
    },
  );

  control.close({
    backend: "herdr",
    resourceId: "w2:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
    workspaceId: "w2",
  });

  assert.deepEqual(calls, [["workspace", "close", "w2"]]);
});

test("sync cleanup after restart closes only an untracked grouped task pane", () => {
  const calls: string[][] = [];
  const control = createSyncHerdrControl(
    { HERDR_SOCKET_PATH: "/tmp/herdr.sock" },
    (args) => {
      calls.push([...args]);
      return "";
    },
  );

  control.close({
    backend: "herdr",
    resourceId: "w2:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
    workspaceId: "w2",
    workspaceGroup: "parallel-retry",
  });

  assert.deepEqual(calls, [["pane", "close", "w2:p2"]]);
});

test("sync cleanup ignores an already-closed HerdR workspace", () => {
  const control = createSyncHerdrControl(
    { HERDR_SOCKET_PATH: "/tmp/herdr.sock" },
    () => { throw new Error("workspace_not_found"); },
  );

  assert.doesNotThrow(() => control.close({
    backend: "herdr",
    resourceId: "w2:p2",
    socketPath: "/tmp/herdr.sock",
    terminalId: "term-2",
    workspaceId: "w2",
  }));
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
