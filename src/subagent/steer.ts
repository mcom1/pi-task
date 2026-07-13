import type { TerminalHandle } from "../types.js";
import { createSyncHerdrControl } from "./herdr.js";
import { paneExists, tmuxSteerPane } from "./tmux.js";

export type SteerResult =
	| { ok: true }
	| { ok: false; reason: "no_pane" | "pane_dead" | "inject_failed" };

/** Send follow-up prompt to a running tmux subagent (background steer). */
export function steerRunningBackgroundTask(
	paneId: string | null | undefined,
	prompt: string,
	handle?: TerminalHandle,
): SteerResult {
	const text = prompt.trim();
	if (!text) return { ok: false, reason: "no_pane" };
	if (handle?.backend === "herdr") {
		try {
			createSyncHerdrControl().send(handle, text);
			return { ok: true };
		} catch {
			return { ok: false, reason: "inject_failed" };
		}
	}
	if (!paneId) return { ok: false, reason: "no_pane" };
	if (!paneExists(paneId)) return { ok: false, reason: "pane_dead" };
	try {
		tmuxSteerPane(paneId, text);
		return { ok: true };
	} catch {
		return { ok: false, reason: "inject_failed" };
	}
}