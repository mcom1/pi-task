import { paneExists, tmuxSteerPane } from "./tmux.js";

export type SteerResult =
	| { ok: true }
	| { ok: false; reason: "no_pane" | "pane_dead" | "inject_failed" };

/** OpenCode-style `background.extend`: send follow-up prompt to a running tmux subagent. */
export function steerRunningBackgroundTask(
	paneId: string | null | undefined,
	prompt: string,
): SteerResult {
	const text = prompt.trim();
	if (!paneId || !text) return { ok: false, reason: "no_pane" };
	if (!paneExists(paneId)) return { ok: false, reason: "pane_dead" };
	try {
		tmuxSteerPane(paneId, text);
		return { ok: true };
	} catch {
		return { ok: false, reason: "inject_failed" };
	}
}