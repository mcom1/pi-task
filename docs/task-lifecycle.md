# Task lifecycle

## Data flow

Terminal-backed subagents run as separate Pi processes. They do not send results directly to the parent.

```text
child Pi process
  writes session events
    ↓
child session JSONL
  polled by pi-task
    ↓
foreground tool result or background follow-up
    ↓
parent agent
```

The JSONL file is the durable source for progress, completion state, and final output. This allows pi-task to recover background tasks after a parent restart.

## Completion detection

The child does not set completion metadata itself. Pi records the model or runtime outcome as `stopReason` on assistant messages.

| `stopReason` | pi-task state |
|---|---|
| `toolUse` | Running; the child requested a tool and should continue afterward. |
| `stop` | Finished. |
| `endTurn` | Finished. |
| `length` | Finished because generation reached its output limit. |
| `error` | Finished with an error. |
| `aborted` | Finished because the active operation was cancelled. |
| Missing | Running; no terminal assistant message is available yet. |

pi-task reads the last matching assistant `stopReason`. Once it is terminal, the last non-empty assistant text becomes the task result.

A pane exit is not the primary completion signal. If the pane exits first, pi-task waits for pending JSONL writes, checks twice, then reports failure if no terminal result appears.

## Result delivery

### Foreground

With `background: false`, the task tool remains active while pi-task polls the child session. The final assistant text is returned as the normal tool result, so the parent cannot continue until the task finishes.

### Background

With `background: true`, the task tool returns after launch and the parent can continue. pi-task keeps polling the child session. After completion, it injects a follow-up into the parent with `pi.sendMessage()`.

Background delivery is therefore a two-stage process: pi-task pulls the result from JSONL, then pushes a follow-up to the parent. The child itself does not push to the parent.

## Progress display

Every three seconds, pi-task reads the child JSONL and counts tool calls and turns. It also extracts recent tool-call names, arguments, and completion states. The task widget uses this data for rows such as tool-call count, elapsed time, and the latest operation.

Progress polling and result polling read the same session directory but serve different purposes. Progress polling updates the widget; result polling checks terminal `stopReason` and returns the final text.

## XML result envelope

The child prompt asks the subagent to finish with tags such as:

```xml
<status>success</status>
<summary>One-line outcome.</summary>
<findings>Key findings.</findings>
<evidence>Verification and references.</evidence>
<files>Changed files.</files>
```

These tags are not completion markers. `stopReason` controls completion. The XML only lets `parseResultXml()` split the final text into fields for rendering and task metadata. Plain text remains a valid result.

## Timeout completion

At the soft timeout, terminal backends optionally send Escape and then the wrap-up instruction. The child writes its final response to the same JSONL. Normal `stopReason` detection handles that response. If no final result arrives during the grace period, pi-task records a timeout and closes the terminal resource.

## Session lookup

Task history stores the exact JSONL path as `sessionRef` so later `task_id` and `conversation_id` calls can reopen the same Pi session. Resolution starts from the artifact directory persisted with the task, then checks the canonical `artifacts/tasks/sessions` directory and the legacy `artifacts/sessions` directory.
