import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import type { HerdrTerminalHandle } from "../types.js";
import {
  createDefaultCommandRunner,
  type CommandRunner,
  type TerminalBackend,
  type TerminalLaunchInput,
} from "./terminalBackend.js";

interface HerdrPane {
  pane_id: string;
  terminal_id: string;
  tab_id?: string;
}

interface HerdrResponse<T> {
  result?: T;
}

let launchQueue: Promise<void> = Promise.resolve();

async function serializeLaunch<T>(operation: () => Promise<T>): Promise<T> {
  const previous = launchQueue;
  let release!: () => void;
  launchQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

interface HerdrLayout {
  layout?: {
    panes?: Array<{
      pane_id?: string;
      rect?: { width?: number; height?: number };
    }>;
  };
}

function decode<T>(stdout: string, operation: string): T {
  try {
    const parsed = JSON.parse(stdout) as T | HerdrResponse<T>;
    if (parsed && typeof parsed === "object" && "result" in parsed) {
      return (parsed as HerdrResponse<T>).result as T;
    }
    return parsed as T;
  } catch (error) {
    throw new Error(`HerdR ${operation} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function paneFrom(value: unknown): HerdrPane {
  const candidate = value as { pane?: Partial<HerdrPane>; agent?: Partial<HerdrPane> };
  const pane = candidate.pane ?? candidate.agent;
  if (typeof pane?.pane_id !== "string" || typeof pane.terminal_id !== "string") {
    throw new Error("HerdR response did not include pane_id and terminal_id");
  }
  return pane as HerdrPane;
}

function parentTabFrom(value: unknown): string {
  const pane = paneFrom(value);
  if (typeof pane.tab_id !== "string" || !pane.tab_id) {
    throw new Error("HerdR parent pane response did not include tab_id");
  }
  return pane.tab_id;
}

function splitDirectionFromLayout(
  layout: HerdrLayout,
  paneId: string,
): "right" | "down" | undefined {
  const rect = layout.layout?.panes?.find((pane) => pane.pane_id === paneId)?.rect;
  const dimensions = [rect?.width, rect?.height];
  if (!dimensions.every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  const [width, height] = dimensions as [number, number];
  if (height <= 0) return undefined;
  return width / height >= 2.5 ? "right" : "down";
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function requireHerdrHandle(handle: Parameters<TerminalBackend["isAlive"]>[0]): HerdrTerminalHandle {
  if (handle.backend !== "herdr") throw new Error("HerdR backend cannot control a non-HerdR handle");
  return handle;
}

export interface HerdrTerminalBackendOptions {
  run?: CommandRunner["run"];
  env?: NodeJS.ProcessEnv;
}

export function createHerdrTerminalBackend(
  options: HerdrTerminalBackendOptions = {},
): TerminalBackend {
  const env = options.env ?? process.env;
  const runner = options.run ?? createDefaultCommandRunner().run;
  const socketPath = env.HERDR_SOCKET_PATH;
  const run = (args: readonly string[]) => runner("herdr", args, {
    env: { ...env, HERDR_SOCKET_PATH: socketPath },
  });

  const chooseSplitDirection = async (
    requested: TerminalLaunchInput["direction"],
  ): Promise<"right" | "down"> => {
    if (requested) return requested;
    try {
      const response = await run(["pane", "layout", "--pane", env.HERDR_PANE_ID as string]);
      const layout = decode<HerdrLayout>(response.stdout, "pane layout");
      return splitDirectionFromLayout(layout, env.HERDR_PANE_ID as string) ?? "right";
    } catch {
      // Layout inspection is advisory; launch remains available on older HerdR versions.
    }
    return "right";
  };

  const resolveParentTab = async (): Promise<string> => {
    const response = await run(["pane", "get", env.HERDR_PANE_ID as string]);
    return parentTabFrom(decode(response.stdout, "parent pane get"));
  };

  const verifyOwnership = async (rawHandle: Parameters<TerminalBackend["isAlive"]>[0]): Promise<HerdrTerminalHandle> => {
    const handle = requireHerdrHandle(rawHandle);
    if (!socketPath || handle.socketPath !== socketPath) {
      throw new Error("HerdR ownership mismatch: session socket changed");
    }
    const response = await run(["pane", "get", handle.resourceId]);
    const current = paneFrom(decode(response.stdout, "pane get"));
    if (current.terminal_id !== handle.terminalId) {
      throw new Error("HerdR ownership mismatch: terminal changed");
    }
    return handle;
  };

  return {
    kind: "herdr",

    async available() {
      if (env.HERDR_ENV !== "1" || !env.HERDR_PANE_ID || !socketPath || !isAbsolute(socketPath)) return false;
      try {
        await run(["status", "server"]);
        await resolveParentTab();
        return true;
      } catch {
        return false;
      }
    },

    async launch(input: TerminalLaunchInput) {
      return serializeLaunch(async () => {
        if (env.HERDR_ENV !== "1" || !env.HERDR_PANE_ID || !socketPath || !isAbsolute(socketPath)) {
          throw new Error("HerdR backend requires Pi to run inside an active HerdR pane");
        }
        const parentTab = await resolveParentTab();
        const direction = await chooseSplitDirection(input.direction);
        const response = await run([
          "agent", "start", input.label ?? "pi-task",
          "--cwd", input.cwd,
          "--tab", parentTab,
          "--split", direction,
          "--no-focus",
          "--", "sh", "-lc", input.command,
        ]);
        const created = paneFrom(decode(response.stdout, "agent start"));
        return {
          backend: "herdr" as const,
          resourceId: created.pane_id,
          socketPath,
          terminalId: created.terminal_id,
        };
      });
    },

    async isAlive(handle) {
      try {
        await verifyOwnership(handle);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/ownership mismatch|not[_ -]?found/i.test(message)) return false;
        const unavailable = new Error(`HerdR control unavailable: ${message}`);
        unavailable.name = "HerdrUnavailableError";
        throw unavailable;
      }
    },

    async send(handle, message) {
      const owned = await verifyOwnership(handle);
      await run(["pane", "send-text", owned.resourceId, message]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await run(["pane", "send-keys", owned.resourceId, "enter"]);
    },

    async readTail(handle, lines) {
      const owned = await verifyOwnership(handle);
      const response = await run([
        "pane", "read", owned.resourceId,
        "--source", "recent-unwrapped",
        "--lines", String(Math.max(1, Math.floor(lines))),
      ]);
      try {
        const result = decode<{ text?: string; output?: string }>(response.stdout, "pane read");
        return result.text ?? result.output ?? response.stdout;
      } catch {
        return response.stdout;
      }
    },

    async close(handle) {
      const owned = await verifyOwnership(handle);
      await run(["pane", "close", owned.resourceId]);
    },
  };
}

export function createDefaultHerdrTerminalBackend(env: NodeJS.ProcessEnv = process.env): TerminalBackend {
  return createHerdrTerminalBackend({ env });
}

function syncRun(args: readonly string[], socketPath: string): string {
  return execFileSync("herdr", args, {
    encoding: "utf8",
    env: { ...process.env, HERDR_SOCKET_PATH: socketPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function createSyncHerdrControl(
  env: NodeJS.ProcessEnv = process.env,
  run: (args: readonly string[], socketPath: string) => string = syncRun,
) {
  return {
    exists(handle: HerdrTerminalHandle): boolean {
      if (!env.HERDR_SOCKET_PATH || env.HERDR_SOCKET_PATH !== handle.socketPath) return false;
      try {
        return paneFrom(decode(run(["pane", "get", handle.resourceId], handle.socketPath), "pane get")).terminal_id === handle.terminalId;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/not[_ -]?found/i.test(message)) return false;
        const unavailable = new Error(`HerdR control unavailable: ${message}`);
        unavailable.name = "HerdrUnavailableError";
        throw unavailable;
      }
    },
    send(handle: HerdrTerminalHandle, message: string): void {
      if (!this.exists(handle)) throw new Error("HerdR ownership mismatch");
      run(["pane", "send-text", handle.resourceId, message], handle.socketPath);
      sleepSync(300);
      run(["pane", "send-keys", handle.resourceId, "enter"], handle.socketPath);
    },
    close(handle: HerdrTerminalHandle): void {
      if (!this.exists(handle)) throw new Error("HerdR ownership mismatch");
      run(["pane", "close", handle.resourceId], handle.socketPath);
    },
  };
}
