import {
  DEFAULT_TASK_TIMEOUT_GRACE_SECONDS,
  DEFAULT_TASK_TIMEOUT_SECONDS,
  MAX_TASK_TIMEOUT_GRACE_SECONDS,
  MAX_TASK_TIMEOUT_SECONDS,
} from "./constants.js";

export const TASK_WRAP_UP_INSTRUCTION = `The task has reached its soft timeout. Stop starting new work and return your final report now. Include completed work, changed files, verification, remaining work, blockers, and blocker reasons.`;

function normalizeSeconds(
  value: unknown,
  defaultValue: number,
  maximum: number,
  parameterName: string,
): number {
  const seconds = value === undefined ? defaultValue : value;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 || seconds > maximum) {
    throw new RangeError(`${parameterName} must be a finite positive number no greater than ${maximum}`);
  }
  return seconds;
}

export function normalizeTaskTimeouts(
  timeoutSeconds: unknown,
  timeoutGraceSeconds: unknown,
): { timeoutMs: number; timeoutGraceMs: number } {
  return {
    timeoutMs: normalizeSeconds(
      timeoutSeconds,
      DEFAULT_TASK_TIMEOUT_SECONDS,
      MAX_TASK_TIMEOUT_SECONDS,
      "timeout_seconds",
    ) * 1_000,
    timeoutGraceMs: normalizeSeconds(
      timeoutGraceSeconds,
      DEFAULT_TASK_TIMEOUT_GRACE_SECONDS,
      MAX_TASK_TIMEOUT_GRACE_SECONDS,
      "timeout_grace_seconds",
    ) * 1_000,
  };
}

function seconds(ms: number): string {
  return String(ms / 1_000);
}

export function formatHardTimeoutMessage(
  timeoutMs: number,
  timeoutGraceMs: number,
): string {
  return `Task reached its hard deadline after a soft timeout of ${seconds(timeoutMs)}s and ${seconds(timeoutGraceMs)}s grace period without producing a final result.`;
}
