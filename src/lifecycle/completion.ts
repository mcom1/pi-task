import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  findJsonlSessionByName,
  readRegistry,
  upsertTaskSessionHistory,
  writeRegistry,
} from "../conversation.js";
import { parseResultXml } from "../helpers.js";
import { createSyncHerdrControl } from "../subagent/herdr.js";
import { killAgentPane } from "../subagent/tmux.js";
import { ignoreStaleExtensionCtx } from "../stale-ctx.js";
import type { BackgroundTask } from "../types.js";

function closeTaskResource(task: BackgroundTask): void {
  if (task.handle?.backend === "herdr") {
    const herdr = createSyncHerdrControl();
    if (herdr.exists(task.handle)) herdr.close(task.handle);
  } else if (task.paneId) {
    killAgentPane(task.paneId, task.originalPane);
  }
}

export function completeTask(
  pi: ExtensionAPI,
  id: string,
  task: BackgroundTask,
  content: string,
  phase: "done" | "timeout" | "failed",
  piDir: string,
  resourceCloser: (task: BackgroundTask) => void = closeTaskResource,
): void {
  const parsed = parseResultXml(content);
  const durationMs = Date.now() - task.startedAt;
  const completedSessionRef = findJsonlSessionByName(
    piDir,
    task.sessionName,
    task.agentType,
  )?.sessionRef;

  upsertTaskSessionHistory(piDir, {
    id,
    agentType: task.agentType,
    description: task.description,
    sessionName: task.sessionName,
    startedAt: task.startedAt,
    paneId: task.paneId,
    handle: task.handle,
    piDir,
    dir: task.dir,
    conversationId: task.conversationId,
    sessionRef: completedSessionRef,
    status: phase,
    completedAt: Date.now(),
    background: true,
  });

  const entries = readRegistry(piDir).filter((entry) => entry.id !== id);
  writeRegistry(piDir, entries);

  try {
    resourceCloser(task);
  } catch {
    // Completion is already durable. Cleanup is best-effort and restore can retry it.
  }

  const summaryText = parsed.summary?.trim()
    ? parsed.summary.trim()
    : content.replace(/\s+/g, " ").trim().slice(0, 240);

  ignoreStaleExtensionCtx(() =>
    pi.sendMessage(
      {
        customType: "task-complete",
        content: `Background task ${id} (${task.agentType}) ${phase}.\n\n${summaryText}`,
        display: true,
        details: {
          task_id: id,
          agent_type: task.agentType,
          description: task.description,
          phase,
          status: phase,
          result: content,
          summary: parsed.summary,
          findings: parsed.findings,
          evidence: parsed.evidence,
          files: parsed.files,
          caveats: parsed.caveats,
          next_steps: parsed.next_steps,
          confidence: parsed.confidence,
          duration_ms: durationMs,
          tool_uses: task.toolUses,
          turn_count: task.turns,
          background: true,
          structured_result: Boolean(
            parsed.findings ||
              parsed.evidence ||
              parsed.files ||
              parsed.caveats ||
              parsed.next_steps,
          ),
          full_output: parsed.raw.trim() || content.trim(),
        },
      },
      {
        triggerTurn: true,
        deliverAs: "followUp",
      },
    ),
  );
}