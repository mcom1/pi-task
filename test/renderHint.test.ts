import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

{
  const t = "parenthesized expand hint closes dim paren";
  const src = readFileSync(
    fileURLToPath(new URL("../src/tool/renderTaskResultBody.ts", import.meta.url)),
    "utf8",
  );
  assert.ok(src.includes("parenthesizedExpandHint"), t);
  assert.ok(
    src.includes('theme.fg("dim", ")")'),
    t + " trailing paren dim",
  );
  assert.ok(!src.includes('` (${expandHint})`'), t + " no broken wrapper");
}

{
  const t = "renderCall uses description before live stats";
  const src = readFileSync(
    fileURLToPath(new URL("../src/tool/renderCall.ts", import.meta.url)),
    "utf8",
  );
  assert.ok(src.includes("toolUses === 0 && elapsedMs < 1_000"), t);
  assert.ok(src.includes("renderTaskTitleText"), t);
}

{
  const t = "readProgress uses sessionDir not piDir";
  const helpers = readFileSync(
    fileURLToPath(new URL("../src/helpers.ts", import.meta.url)),
    "utf8",
  );
  assert.ok(helpers.includes("readProgress(\n  sessionDir"), t);
  assert.ok(!helpers.includes("readProgress(piDir"), t);
}

console.log("renderHint.test.ts: all passed");