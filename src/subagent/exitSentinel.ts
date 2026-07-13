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
  sessionPath?: string,
): string {
  const sentinelScript = [
    "const fs=require('node:fs')",
    "const [path,taskId,rawCode]=process.argv.slice(1)",
    "const tmp=path+'.'+process.pid+'.tmp'",
    "const value={schemaVersion:1,taskId,exitCode:Number(rawCode),completedAt:new Date().toISOString()}",
    "fs.writeFileSync(tmp,JSON.stringify(value))",
    "fs.renameSync(tmp,path)",
  ].join(";");
  const watcherScript = [
    "const fs=require('node:fs')",
    "const cp=require('node:child_process')",
    "const [target,paneId]=process.argv.slice(1)",
    "const terminal=new Set(['stop','endTurn','length','error','aborted'])",
    "const hasTerminal=v=>Boolean(v&&typeof v==='object'&&((terminal.has(v.stopReason))||Object.values(v).some(hasTerminal)))",
    "const hasUser=v=>Boolean(v&&typeof v==='object'&&((v.role==='user')||Object.values(v).some(hasUser)))",
    "let lastSize=-1,stable=0",
    "const resolvePath=()=>{const stat=fs.statSync(target);if(!stat.isDirectory())return target;const files=fs.readdirSync(target).filter(name=>name.endsWith('.jsonl')).map(name=>{const path=require('node:path').join(target,name);return{path,mtime:fs.statSync(path).mtimeMs}}).sort((a,b)=>b.mtime-a.mtime);if(!files[0])throw new Error('no session');return files[0].path}",
    "setInterval(()=>{try{const text=fs.readFileSync(resolvePath(),'utf8');const size=Buffer.byteLength(text);let state='active';for(const line of text.split(/\\r?\\n/).filter(Boolean)){try{const value=JSON.parse(line);if(hasUser(value))state='active';if(hasTerminal(value))state='terminal'}catch{}}const done=state==='terminal';stable=done&&size===lastSize?stable+1:0;lastSize=size;if(stable>=2){cp.spawnSync('herdr',['pane','close',paneId],{env:process.env,stdio:'ignore'});process.exit(0)}}catch{}},500)",
  ].join(";");
  const watcher = sessionPath
    ? `node -e ${shellQuote(watcherScript)} ${shellQuote(sessionPath)} "$HERDR_PANE_ID" & watcher_pid=$!; `
    : "watcher_pid=; ";
  return `{ ${watcher}${command}; status=$?; if [ -n "$watcher_pid" ]; then kill "$watcher_pid" 2>/dev/null || true; fi; node -e ${shellQuote(sentinelScript)} ${shellQuote(sentinelPath)} ${shellQuote(taskId)} "$status"; if [ "$status" -eq 0 ]; then herdr pane close "$HERDR_PANE_ID"; else printf '\\n[pi-task] child exited %s\\n' "$status"; fi; }`;
}
