import assert from "node:assert/strict";
import test from "node:test";

import {
  PI_SHOW_DIFFS_CHILD_ENV,
  PI_SHOW_DIFFS_PARENT_ENV,
  buildTerminalChildEnvPrefix,
} from "../src/subagent/childEnv.js";

test("terminal child environment maps valid pi-show-diffs parent state", () => {
  assert.equal(
    buildTerminalChildEnvPrefix({ [PI_SHOW_DIFFS_PARENT_ENV]: "1" }),
    `PI_TASK_TOOL_DISABLED=1 ${PI_SHOW_DIFFS_CHILD_ENV}=1`,
  );
  assert.equal(
    buildTerminalChildEnvPrefix({ [PI_SHOW_DIFFS_PARENT_ENV]: "0" }),
    `PI_TASK_TOOL_DISABLED=1 ${PI_SHOW_DIFFS_CHILD_ENV}=0`,
  );
});

test("terminal child environment omits absent or invalid pi-show-diffs state", () => {
  assert.equal(buildTerminalChildEnvPrefix({}), "PI_TASK_TOOL_DISABLED=1");
  assert.equal(
    buildTerminalChildEnvPrefix({ [PI_SHOW_DIFFS_PARENT_ENV]: "true" }),
    "PI_TASK_TOOL_DISABLED=1",
  );
});
