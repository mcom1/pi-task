import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const indexPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src/index.ts");
let t = readFileSync(indexPath, "utf8");

if (!t.includes("Unknown task_id")) {
  console.log("Already fixed");
  process.exit(0);
}

t = t.replace(
  /const artifactsDir = join\(piDir, "artifacts"\);/,
  'const artifactsDir = join(piDir, "artifacts", "tasks");',
);

const old = `        if (!entry) {
          return {
            content: [
              {
                type: "text" as const,
                text: \`Unknown task_id: "\${params.task_id}". No active or completed task session with that ID/session name was found.\`,
              },
            ],
            details: {
              phase: "failed" as const,
              error: \`Unknown task_id: \${params.task_id}\`,
            },
            isError: true,
          };
        }
        if (!existsSync(entry.dir)) {`;

const neu = `        if (!entry) {
          params = { ...params, task_id: undefined };
          id = \`\${Date.now().toString(36)}-\${randomUUID().slice(0, 4)}\`;
          sessionName = conversationId ?? \`task-\${id}\`;
        } else {
        if (!existsSync(entry.dir)) {`;

if (!t.includes(old)) {
  console.error("Old block not found");
  process.exit(1);
}
t = t.replace(old, neu);

// Close else before the closing of task_id branch (before `} else {` new id)
const closeNeedle = `        if (!resumeSessionRef) {
          return {
            content: [
              {
                type: "text" as const,
                text: \`Task "\${params.task_id}" was found, but its session JSONL file could not be resolved. Cannot resume without a --session file path.\`,
              },
            ],
            details: {
              phase: "failed" as const,
              error: "Task session file missing",
            },
            isError: true,
          };
        }
       } else {
         id = \`\${Date.now().toString(36)}-\${randomUUID().slice(0, 4)}\`;`;

const closeRepl = `        if (!resumeSessionRef) {
          return {
            content: [
              {
                type: "text" as const,
                text: \`Task "\${params.task_id}" was found, but its session JSONL file could not be resolved. Cannot resume without a --session file path.\`,
              },
            ],
            details: {
              phase: "failed" as const,
              error: "Task session file missing",
            },
            isError: true,
          };
        }
        }
       } else {
         id = \`\${Date.now().toString(36)}-\${randomUUID().slice(0, 4)}\`;`;

if (!t.includes(closeNeedle)) {
  console.error("Close needle not found");
  process.exit(1);
}
t = t.replace(closeNeedle, closeRepl);

writeFileSync(indexPath, t);
console.log("fixed");