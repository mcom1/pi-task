import { existsSync } from "node:fs";
import {
  readRegistry,
  upsertTaskSessionHistory,
  writeRegistry,
} from "../conversation.js";
import { hasAgentFinished } from "../session-text.js";
import { killAgentPane, paneExists } from "../subagent/tmux.js";
import type { BackgroundTask } from "../types.js";

export function restoreActiveBackgroundTasks(
  piDir: string,
  backgroundTasks: Map<string, BackgroundTask>,
): void {
  const registry = readRegistry(piDir);
  const staleIds: string[] = [];

  for (const entry of registry) {
    if (!existsSync(entry.dir)) {
      staleIds.push(entry.id);
      continue;
    }

    const sessionFinished = hasAgentFinished(
      entry.dir,
      entry.sessionName,
      entry.startedAt,
    );
    const paneAlive = entry.paneId ? paneExists(entry.paneId) : false;

    if (sessionFinished) {
      upsertTaskSessionHistory(piDir, {
        id: entry.id,
        status: "done",
        background: true,
        agentType: entry.agentType,
        description: entry.description,
        sessionName: entry.sessionName,
        startedAt: entry.startedAt,
        piDir: entry.piDir,
        dir: entry.dir,
        paneId: entry.paneId,
        completedAt: Date.now(),
      });
      if (paneAlive && entry.paneId) {
        killAgentPane(entry.paneId, null);
      }
      staleIds.push(entry.id);
      continue;
    }

    if (!paneAlive) {
      upsertTaskSessionHistory(piDir, {
        id: entry.id,
        status: "failed",
        background: true,
        agentType: entry.agentType,
        description: entry.description,
        sessionName: entry.sessionName,
        startedAt: entry.startedAt,
        piDir: entry.piDir,
        dir: entry.dir,
        paneId: entry.paneId,
        completedAt: Date.now(),
      });
      staleIds.push(entry.id);
      continue;
    }

    backgroundTasks.set(entry.id, {
      dir: entry.dir,
      agentType: entry.agentType,
      sessionName: entry.sessionName,
      paneId: entry.paneId,
      originalPane: null,
      description: entry.description,
      startedAt: entry.startedAt,
      toolUses: 0,
      turns: 0,
      conversationId: entry.conversationId,
      recentCalls: [],
    });
  }

  if (staleIds.length) {
    writeRegistry(
      piDir,
      registry.filter((entry) => !staleIds.includes(entry.id)),
    );
  }
}
