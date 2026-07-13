import assert from "node:assert/strict";
import test from "node:test";

import { migrateRegistryEntry } from "../src/conversation.js";

test("legacy paneId entries migrate to a discriminated tmux handle", () => {
  const migrated = migrateRegistryEntry({
    id: "task-1",
    agentType: "worker",
    description: "legacy task",
    sessionName: "task-1",
    startedAt: 1,
    paneId: "%42",
    piDir: "/repo/.pi",
    dir: "/repo",
  });

  assert.deepEqual(migrated.handle, {
    backend: "tmux",
    resourceId: "%42",
  });
  assert.equal(migrated.paneId, undefined);
});
