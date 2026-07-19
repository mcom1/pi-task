import { Type } from "@sinclair/typebox";
import {
  DEFAULT_TASK_TIMEOUT_GRACE_SECONDS,
  DEFAULT_TASK_TIMEOUT_SECONDS,
  MAX_TASK_TIMEOUT_GRACE_SECONDS,
  MAX_TASK_TIMEOUT_SECONDS,
} from "../constants.js";

export function taskParametersSchema() {
  return Type.Object({
    agent_type: Type.String({
      description: "The type of specialist agent to use for this task",
    }),
    prompt: Type.String({
      description:
        "The complete task for the agent to perform. Be detailed and self-contained. Include goal, non-goals, write/read policy, stop condition, and verification recipe.",
    }),
        description: Type.String({
          description: "A short (3-5 word) summary of the task",
        }),
        workspace_group: Type.Optional(Type.String({
          description: "Shared HerdR workspace group. Concurrent tasks with the same value use panes in one workspace.",
        })),

    task_id: Type.Optional(
      Type.String({
        description:
          "Resume an existing background task by id instead of starting a new task.",
      }),
    ),
    conversation_id: Type.Optional(
      Type.String({
        description:
          "Durable specialist conversation id. Reuses .pi/artifacts/task-<id>/sessions when called again.",
      }),
    ),
    background: Type.Optional(
      Type.Boolean({
        description:
          "Run in background (async). You will be notified when it completes. DO NOT sleep, poll, ask the task for status, or duplicate its work while it runs in background.",
        default: true,
      }),
    ),
    timeout_seconds: Type.Optional(Type.Number({
      description: "Soft timeout in seconds for terminal-backed tasks before requesting a final report.",
      default: DEFAULT_TASK_TIMEOUT_SECONDS,
      exclusiveMinimum: 0,
      maximum: MAX_TASK_TIMEOUT_SECONDS,
    })),
    timeout_grace_seconds: Type.Optional(Type.Number({
      description: "Grace period in seconds after the soft timeout before the terminal resource is closed.",
      default: DEFAULT_TASK_TIMEOUT_GRACE_SECONDS,
      exclusiveMinimum: 0,
      maximum: MAX_TASK_TIMEOUT_GRACE_SECONDS,
    })),
  });
}
