import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface TaskExitSentinel {
  schemaVersion: 1;
  taskId: string;
  exitCode: number;
  completedAt: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function getExitSentinelPath(piDir: string, taskId: string): string {
  return join(piDir, "task-exits", `${taskId}.exit.json`);
}

export function ensureExitSentinelDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function readExitSentinel(path: string, taskId: string): TaskExitSentinel | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<TaskExitSentinel>;
    if (
      value.schemaVersion !== 1 ||
      value.taskId !== taskId ||
      typeof value.exitCode !== "number" ||
      !Number.isInteger(value.exitCode) ||
      typeof value.completedAt !== "string"
    ) return null;
    return value as TaskExitSentinel;
  } catch {
    return null;
  }
}

export function wrapWithHerdrExitSentinel(
  command: string,
  sentinelPath: string,
  taskId: string,
): string {
  const sentinelScript = [
    "const fs=require('node:fs')",
    "const [path,taskId,rawCode]=process.argv.slice(1)",
    "const tmp=path+'.'+process.pid+'.tmp'",
    "const value={schemaVersion:1,taskId,exitCode:Number(rawCode),completedAt:new Date().toISOString()}",
    "fs.writeFileSync(tmp,JSON.stringify(value))",
    "fs.renameSync(tmp,path)",
  ].join(";");
  return `{ ${command}; status=$?; node -e ${shellQuote(sentinelScript)} ${shellQuote(sentinelPath)} ${shellQuote(taskId)} "$status"; if [ "$status" -ne 0 ]; then printf '\\n[pi-task] child exited %s\\n' "$status"; fi; }`;
}
