import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentsFromDir, parseBool } from "../src/helpers.js";

{
  const t = "parseBool";
  assert.equal(parseBool(true), true, t);
  assert.equal(parseBool(false), false, t);
  assert.equal(parseBool("true"), true, t);
  assert.equal(parseBool("yes"), true, t);
  assert.equal(parseBool("false"), false, t);
  assert.equal(parseBool(undefined), undefined, t);
}

{
  const t = "loadAgentsFromDir parses hidden proactive readonly";
  const root = mkdtempSync(join(tmpdir(), "task-fm-"));
  try {
    const dir = join(root, "agents");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "meta.md"),
      `---
description: Meta agent
hidden: true
proactive: yes
readonly: true
---
Body.`,
    );
    writeFileSync(
      join(dir, "skip.md"),
      `---
model: foo
---
No description.`,
    );

    const agents = loadAgentsFromDir(dir, "bundled");
    assert.equal(agents.length, 1, t + " count");
    const a = agents[0]!;
    assert.equal(a.name, "meta", t);
    assert.equal(a.hidden, true, t + " hidden");
    assert.equal(a.proactive, true, t + " proactive");
    assert.equal(a.readonly, true, t + " readonly");
    assert.ok(
      a.disallowedTools?.includes("write") &&
        a.disallowedTools.includes("harness"),
      t + " readonly deny list",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("frontmatter.test.ts: all passed");