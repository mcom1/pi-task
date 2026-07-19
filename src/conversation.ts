import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isTerminalHandle, type TerminalHandle } from "./subagent/terminalBackend.js";
import type { RegistryEntry, TaskSessionHistoryEntry } from "./types.js";

const ARTIFACTS_DIR = "artifacts";
const TASK_SESSIONS_REGISTRY = "task-sessions.json";
const TASK_REGISTRY = "task-registry.json";
const TASK_SESSION_HISTORY = "task-session-history.json";

export interface TaskSessionRegistryEntry {
  task_id: string;
  updated_at: string;
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function readJsonFile<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(file: string, value: unknown): void {
  ensureDir(dirname(file));
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function normalizeConversationId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return normalized.length > 0 ? normalized : undefined;
}

function getArtifactDir(piDir: string): string {
  return join(piDir, ARTIFACTS_DIR);
}

function getTaskSessionsRegistryPath(piDir: string): string {
  return join(getArtifactDir(piDir), TASK_SESSIONS_REGISTRY);
}

export function readTaskSessionsRegistry(
  piDir: string,
): Record<string, TaskSessionRegistryEntry> {
  const raw = readJsonFile<Record<string, unknown>>(
    getTaskSessionsRegistryPath(piDir),
    {},
  );
  const out: Record<string, TaskSessionRegistryEntry> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if (typeof record.task_id !== "string") continue;
    out[key] = {
      task_id: record.task_id,
      updated_at:
        typeof record.updated_at === "string"
          ? record.updated_at
          : new Date(0).toISOString(),
    };
  }
  return out;
}

export function writeTaskSessionsRegistry(
  piDir: string,
  registry: Record<string, TaskSessionRegistryEntry>,
): void {
  writeJsonFile(getTaskSessionsRegistryPath(piDir), registry);
}

function getRegistryPath(piDir: string): string {
  return join(piDir, TASK_REGISTRY);
}

export function migrateRegistryEntry(entry: Record<string, unknown> | RegistryEntry): RegistryEntry {
  const migrated: Record<string, unknown> = { ...(entry as unknown as Record<string, unknown>) };
  const legacyPaneId = migrated.paneId;
  const existingHandle = migrated.handle;

  if (!isTerminalHandle(existingHandle)) {
    if (typeof legacyPaneId === "string" && legacyPaneId.length > 0) {
      migrated.handle = { backend: "tmux", resourceId: legacyPaneId } satisfies TerminalHandle;
    } else {
      delete migrated.handle;
    }
  }

  if (isTerminalHandle(migrated.handle)) {
    migrated.backend = migrated.handle.backend;
  }
  delete migrated.paneId;
  return migrated as unknown as RegistryEntry;
}

export function readRegistry(piDir: string): RegistryEntry[] {
  const parsed = readJsonFile<unknown>(getRegistryPath(piDir), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => migrateRegistryEntry(entry));
}

export function writeRegistry(piDir: string, entries: RegistryEntry[]): void {
  writeJsonFile(getRegistryPath(piDir), entries.map((entry) => migrateRegistryEntry(entry)));
}

export function markRegistryWrapUpRequested(
  piDir: string,
  taskId: string,
  wrapUpRequestedAt: number,
): void {
  const entries = readRegistry(piDir);
  const entry = entries.find((candidate) => candidate.id === taskId);
  if (!entry) return;
  entry.wrapUpRequestedAt = wrapUpRequestedAt;
  writeRegistry(piDir, entries);
}

export function resetRegistryTaskTimeout(
  piDir: string,
  taskId: string,
  startedAt: number,
  timeoutMs: number,
  timeoutGraceMs: number,
  timeoutSendEscape: boolean,
): void {
  const entries = readRegistry(piDir);
  const entry = entries.find((candidate) => candidate.id === taskId);
  if (!entry) return;
  entry.startedAt = startedAt;
  entry.timeoutMs = timeoutMs;
  entry.timeoutGraceMs = timeoutGraceMs;
  entry.timeoutSendEscape = timeoutSendEscape;
  delete entry.wrapUpRequestedAt;
  writeRegistry(piDir, entries);
}

function getTaskSessionHistoryPath(piDir: string): string {
  return join(piDir, TASK_SESSION_HISTORY);
}

export function readTaskSessionHistory(piDir: string): TaskSessionHistoryEntry[] {
  const parsed = readJsonFile<unknown>(getTaskSessionHistoryPath(piDir), []);
  return Array.isArray(parsed) ? (parsed as TaskSessionHistoryEntry[]) : [];
}

function writeTaskSessionHistory(
  piDir: string,
  entries: TaskSessionHistoryEntry[],
): void {
  writeJsonFile(getTaskSessionHistoryPath(piDir), entries);
}

export function upsertTaskSessionHistory(
  piDir: string,
  entry: TaskSessionHistoryEntry,
): void {
  const entries = readTaskSessionHistory(piDir);
  const idx = entries.findIndex((existing) => existing.id === entry.id);
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], ...entry };
  } else {
    entries.push(entry);
  }
  writeTaskSessionHistory(piDir, entries);
}

export function findTaskSessionHistory(
  piDir: string,
  taskId: string,
): TaskSessionHistoryEntry | undefined {
  return readTaskSessionHistory(piDir).find((entry) => entry.id === taskId);
}


function sessionFileMatches(file: string, sessionName: string): boolean {
  try {
    const content = readFileSync(file, "utf-8");
    return (
      content.includes(`\"name\":\"${sessionName}\"`) ||
      content.includes(`\"name\": \"${sessionName}\"`)
    );
  } catch {
    return false;
  }
}

export function findJsonlSessionByName(
  piDir: string,
  idOrSessionName: string,
  agentType?: string,
): TaskSessionHistoryEntry | null {
  const history = readTaskSessionHistory(piDir);
  const matchingEntries = history.filter((entry) => {
    if (entry.id !== idOrSessionName && entry.sessionName !== idOrSessionName) return false;
    return !agentType || entry.agentType === agentType;
  });

  for (const historyEntry of matchingEntries) {
    const sessionRoots = [
      join(historyEntry.dir, "sessions"),
      join(getArtifactDir(piDir), "tasks", "sessions"),
      join(getArtifactDir(piDir), "sessions"),
    ];

    for (const sessionsRoot of new Set(sessionRoots)) {
      const taskDir = join(sessionsRoot, historyEntry.id);
      if (!existsSync(taskDir)) continue;

      const sessionRef = readdirSync(taskDir)
        .filter((entry) => entry.endsWith(".jsonl"))
        .map((entry) => join(taskDir, entry))
        .find((file) => sessionFileMatches(file, historyEntry.sessionName));
      if (!sessionRef) continue;

      return {
        ...historyEntry,
        sessionRef,
      };
    }
  }
  return null;
}

export function ensureTaskSessionRef(
  piDir: string,
  entry: TaskSessionHistoryEntry,
): TaskSessionHistoryEntry {
  if (entry.sessionRef && existsSync(entry.sessionRef)) return entry;

  const discovered = findJsonlSessionByName(
    piDir,
    entry.sessionName,
    entry.agentType,
  );
  if (!discovered?.sessionRef) {
    return { ...entry, sessionRef: undefined };
  }

  const resolved = { ...entry, sessionRef: discovered.sessionRef };
  upsertTaskSessionHistory(piDir, resolved);
  return resolved;
}
