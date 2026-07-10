import { upsertTaskSessionHistory } from "../conversation.js";

export interface SdkBackgroundResult {
  output: string;
  sessionPath?: string | null;
}

export interface SdkBackgroundTaskInput {
  id: string;
  agentType: string;
  description: string;
  sessionName: string;
  startedAt: number;
  piDir: string;
  artifactsDir: string;
  conversationId?: string;
  run: () => Promise<SdkBackgroundResult>;
  onSettled?: () => void;
  now?: () => number;
}

export function startSdkBackgroundTask(input: SdkBackgroundTaskInput): void {
  const now = input.now ?? Date.now;

  upsertTaskSessionHistory(input.piDir, {
    id: input.id,
    agentType: input.agentType,
    description: input.description,
    sessionName: input.sessionName,
    startedAt: input.startedAt,
    piDir: input.piDir,
    dir: input.artifactsDir,
    conversationId: input.conversationId,
    status: "running",
    background: true,
  });

  void input
    .run()
    .then((result) => {
      upsertTaskSessionHistory(input.piDir, {
        id: input.id,
        agentType: input.agentType,
        description: input.description,
        sessionName: input.sessionName,
        startedAt: input.startedAt,
        piDir: input.piDir,
        dir: input.artifactsDir,
        conversationId: input.conversationId,
        sessionRef: result.sessionPath ?? undefined,
        status: "done",
        completedAt: now(),
        background: true,
      });
    })
    .catch(() => {
      upsertTaskSessionHistory(input.piDir, {
        id: input.id,
        agentType: input.agentType,
        description: input.description,
        sessionName: input.sessionName,
        startedAt: input.startedAt,
        piDir: input.piDir,
        dir: input.artifactsDir,
        conversationId: input.conversationId,
        status: "failed",
        completedAt: now(),
        background: true,
      });
    })
    .finally(() => input.onSettled?.());
}

export function formatSdkBackgroundReceipt(id: string): string {
  return [
    `Task ${id} is running in the background.`,
    "OpenPi will keep the task alive while the app-side Pi process is alive and will surface its sub-session when it finishes.",
  ].join("\n");
}
