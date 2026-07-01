#!/usr/bin/env python3
from pathlib import Path

ROOT = Path("/Users/huynhgiabuu/dev/projects/pi-task")

# --- completion.ts ---
comp = (ROOT / "src/lifecycle/completion.ts").read_text()
if "formatTaskEnvelope" not in comp:
    comp = comp.replace(
        'import { parseResultXml } from "../helpers.js";',
        'import { formatTaskEnvelope, parseResultXml } from "../helpers.js";',
    )
needle = 'customType: "task-complete",\n\t\t\t\t\tcontent: `Background task'
if needle in comp:
    start = comp.index('\t\tignoreStaleExtensionCtx(() =>\n\t\t\tpi.sendMessage(\n\t\t\t\t{\n\t\t\t\t\tcustomType: "task-complete",')
    end = comp.index('details: {', start)
    # find closing of content backtick
    sub = comp[start:end]
    if "formatTaskEnvelope" not in sub:
        replacement = '''\t\tconst envelope = formatTaskEnvelope({
\t\t\ttaskId: id,
\t\t\tstate: phase === "done" ? "completed" : "error",
\t\t\tsummary:
\t\t\t\tphase === "done"
\t\t\t\t\t? `Background task completed: ${task.description}`
\t\t\t\t\t: `Background task ${phase}: ${task.description}`,
\t\t\ttext: content,
\t\t});
\t\tignoreStaleExtensionCtx(() =>
\t\t\tpi.sendMessage(
\t\t\t\t{
\t\t\t\t\tcustomType: "task-complete",
\t\t\t\t\tcontent: envelope,
\t\t\t\t\t'''
        # replace from ignoreStale through content line ending with `,
        import re
        pat = re.compile(
            r"\t\tignoreStaleExtensionCtx\(\(\) =>\s*\n\t\t\tpi\.sendMessage\(\s*\n\t\t\t\t\{\s*\n\t\t\t\t\tcustomType: \"task-complete\",\s*\n\t\t\t\t\tcontent: `[^`]*`,\s*\n\t\t\t\t\t",
            re.DOTALL,
        )
        comp, n = pat.subn(replacement, comp, count=1)
        if n != 1:
            raise SystemExit(f"completion regex failed n={n}")
(ROOT / "src/lifecycle/completion.ts").write_text(comp)

# --- index.ts ---
idx = (ROOT / "src/index.ts").read_text()
if "subagent/steer.js" not in idx:
    idx = idx.replace(
        'import {\n  hasTmux,',
        'import { steerRunningBackgroundTask } from "./subagent/steer.js";\nimport {\n  hasTmux,',
    )
if "formatTaskEnvelope," not in idx:
    idx = idx.replace(
        "  formatBackgroundReceipt,\n  parseResultXml,",
        "  formatBackgroundReceipt,\n  formatTaskEnvelope,\n  parseResultXml,",
    )

idx = idx.replace(
    'text: `Task "${params.task_id}" artifact directory no longer exists: ${entry.dir}`,',
    'text: `Task "${params.task_id}" sessions root missing: ${entry.dir}`,',
)

steer_block = '''            const followUp = prompt.trim();
            if (followUp && entry.paneId && paneExists(entry.paneId)) {
              const steer = steerRunningBackgroundTask(entry.paneId, followUp);
              if (steer.ok) {
                const text = formatTaskEnvelope({
                  taskId: entry.id,
                  state: "running",
                  summary: "Background task updated",
                  text: [
                    "Additional context sent to the running background task.",
                    "The task is still working in the background. You will be notified automatically when it finishes.",
                    "DO NOT sleep, poll, ask the task for status, or duplicate this task's work.",
                  ].join("\\n"),
                });
                return {
                  content: [{ type: "text" as const, text }],
                  details: {
                    task_id: entry.id,
                    agent_type: entry.agentType,
                    description: params.description || entry.description,
                    background: true,
                    phase: "running",
                    status: "running",
                    extended: true,
                  },
                };
              }
            }

'''
marker = "            // Resume: reuse the existing session name; runtime files are"
if marker in idx and "Background task updated" not in idx:
    idx = idx.replace(marker, steer_block + marker, 1)

idx = idx.replace(
    'text: `Resumed task "${params.task_id}". The subagent is running in background and will notify on completion.`,',
    'text: formatTaskEnvelope({\n                    taskId: id,\n                    state: "running",\n                    summary: "Background task running",\n                    text: `Resumed task "${params.task_id}". The subagent is running in background and will notify on completion.`,\n                  }),',
)

if 'const fgText = formatTaskEnvelope' not in idx:
    idx = idx.replace(
        'content: [{ type: "text", text: resultText }],',
        'content: [{ type: "text", text: formatTaskEnvelope({ taskId, state: "completed", text: resultText }) }],',
        1,
    )

(ROOT / "src/index.ts").write_text(idx)
print("patched")