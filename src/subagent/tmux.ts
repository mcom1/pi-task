/**
 * Tmux helpers for subagent panes (shared by task extension).
 */

import { execFileSync } from "node:child_process";
import { buildTmuxSplitWindowArgs, chooseTmuxSplitDirection } from "../helpers.js";

export function tmuxCmd(args: string[]): string {
  return execFileSync("tmux", args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function hasTmux(): boolean {
  try {
    execFileSync("tmux", ["-V"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function paneExists(paneId: string): boolean {
  try {
    const out = tmuxCmd(["list-panes", "-a", "-F", "#{pane_id}"]);
    return out.split("\n").includes(paneId);
  } catch {
    return false;
  }
}

export function getCurrentPaneId(): string | null {
  try {
    return tmuxCmd(["display-message", "-p", "#{pane_id}"]);
  } catch {
    return null;
  }
}

export function getCurrentPaneSize(
  targetPane?: string | null,
): { width: number; height: number } | null {
  try {
    const args = ["display-message", "-p", "#{pane_width} #{pane_height}"];
    if (targetPane) args.splice(1, 0, "-t", targetPane);
    const raw = tmuxCmd(args);
    const [widthRaw, heightRaw] = raw.trim().split(/\s+/, 2);
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
  } catch {
    return null;
  }
}

export function splitWindowPane(
  cwd: string,
  command: string,
): { paneId: string; originalPane: string | null } {
  const originalPane = getCurrentPaneId();
  const paneSize = getCurrentPaneSize(originalPane);
  const direction = chooseTmuxSplitDirection(
    paneSize?.width ?? 0,
    paneSize?.height ?? 0,
  );
  const paneId = tmuxCmd(
    buildTmuxSplitWindowArgs(cwd, command, direction, originalPane),
  );
  return { paneId, originalPane };
}

export function killAgentPane(
  paneId: string,
  originalPane: string | null,
): void {
  try {
    tmuxCmd(["kill-pane", "-t", paneId]);
  } catch {
    /* already dead */
  }
  if (originalPane) {
    try {
      tmuxCmd(["select-pane", "-t", originalPane]);
    } catch {
      /* ignore */
    }
  }
}

/** Inject text into a running subagent pane (steer / follow-up). */
export function tmuxSteerPane(paneId: string, message: string): void {
  const bufferName = `pi-task-steer-${process.pid}-${Date.now()}`;
  try {
    execFileSync("tmux", ["load-buffer", "-b", bufferName, "-"], {
      input: message,
      stdio: ["pipe", "pipe", "pipe"],
    });
    tmuxCmd(["paste-buffer", "-b", bufferName, "-t", paneId]);
  } finally {
    try {
      tmuxCmd(["delete-buffer", "-b", bufferName]);
    } catch {
      /* ignore */
    }
  }
  tmuxCmd(["send-keys", "-t", paneId, "Enter"]);
}
