import { createTaskCompleteRenderer } from "../dist/tool/taskComplete.js";

const theme = { fg: (_k, t) => t, bg: (_k, t) => t };
const r = createTaskCompleteRenderer();
const comp = r(
  {
    details: {
      agent_type: "scout",
      description: "test",
      summary: "done",
      tool_uses: 1,
      duration_ms: 100,
    },
  },
  { expanded: false },
  theme,
);
const lines = comp.render(80);
if (!Array.isArray(lines)) throw new Error("expected string[]");
console.log("ok", lines.length, "lines");