import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSdkBackgroundTask } from "../src/subagent/sdkBackground.js";

async function eventually(assertion: () => void): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 500) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assertion();
}

{
  const root = mkdtempSync(join(tmpdir(), "pi-task-sdk-bg-"));
  try {
    const piDir = join(root, ".pi");
    const artifactsDir = join(piDir, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    const sessionPath = join(root, "sub-session.jsonl");

    startSdkBackgroundTask({
      id: "m123abc-def0",
      agentType: "general",
      description: "Do work",
      sessionName: "task-m123abc-def0-general",
      startedAt: 100,
      piDir,
      artifactsDir,
      conversationId: "research",
      now: () => 200,
      run: async () => ({ output: "done", sessionPath }),
    });

    await eventually(() => {
      const history = JSON.parse(
        readFileSync(join(piDir, "task-session-history.json"), "utf8"),
      );
      assert.equal(history[0].status, "done");
      assert.equal(history[0].background, true);
      assert.equal(history[0].sessionRef, sessionPath);
      assert.equal(history[0].completedAt, 200);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
