export const PI_SHOW_DIFFS_PARENT_ENV = "PI_TASK_CHILD_PI_SHOW_DIFFS_AUTO_APPROVE";
export const PI_SHOW_DIFFS_CHILD_ENV = "PI_SHOW_DIFFS_AUTO_APPROVE";

export function buildTerminalChildEnvPrefix(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const assignments = ["PI_TASK_TOOL_DISABLED=1"];
  const autoApprove = env[PI_SHOW_DIFFS_PARENT_ENV];
  if (autoApprove === "1" || autoApprove === "0") {
    assignments.push(`${PI_SHOW_DIFFS_CHILD_ENV}=${autoApprove}`);
  }
  return assignments.join(" ");
}
