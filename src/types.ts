import type { ToolCallRecord } from "./helpers.js";
import type { TerminalHandle, TerminalBackendKind } from "./subagent/terminalBackend.js";
export type { TerminalHandle, HerdrTerminalHandle } from "./subagent/terminalBackend.js";

export type ExecutionBackend = "sdk" | TerminalBackendKind;

export interface BackgroundTask {
  dir: string;
  agentType: string;
  sessionName: string;
  /** Legacy tmux field retained while old in-memory callers are migrated. */
  paneId?: string;
  handle?: TerminalHandle;
  exitSentinelPath?: string;
  backend?: ExecutionBackend;
  originalPane: string | null;
  description: string;
  startedAt: number;
  toolUses: number;
  turns: number;
  conversationId?: string;
  /** Most recent tool calls (capped), updated every COUNT_POLL_MS. */
  recentCalls: ToolCallRecord[];
  /** Consecutive completion-poll failures; reset to 0 on a successful poll. */
  pollErrors?: number;
  status?: "running" | "done" | "cancelled" | "aborted" | "failed" | "timeout";
  phase?: string;
  result?: string;
  completedAt?: number;
}

/** Serializable subset for active task registry persistence. */
export interface RegistryEntry {
  id: string;
  agentType: string;
  description: string;
  sessionName: string;
  startedAt: number;
  handle?: TerminalHandle;
  /** Legacy persisted field accepted by migration only. */
  paneId?: string;
  backend?: TerminalBackendKind;
  piDir: string;
  dir: string;
  conversationId?: string;
  sessionRef?: string;
}

/** Durable task→session mapping used for resume after task completion. */
export interface TaskSessionHistoryEntry extends RegistryEntry {
  status: "running" | "done" | "cancelled" | "aborted" | "failed" | "timeout";
  completedAt?: number;
  background: boolean;
}

/** Details attached to tool result for rendering. */
export interface TaskDetails {
  task_id: string;
  agent_type: string;
  description: string;
  conversation_id?: string;
  phase: "running" | "done" | "timeout" | "aborted" | "failed";
  status?: string;
  summary?: string;
  findings?: string;
  evidence?: string;
  confidence?: string;
  duration_ms?: number;
  turn_count?: number;
  tool_uses?: number;
  background?: boolean;
  backend?: ExecutionBackend;
  tmux_session?: string;
}
