# TODO

## Fix task session resolution

The child does not stream its final result directly to the parent. Terminal-backed tasks write normal Pi session JSONL while running. The parent polls that file, waits for a terminal assistant `stopReason`, extracts the last assistant text, and then returns it through the foreground tool result or a background `pi.sendMessage()` follow-up.

The XML shown before exit comes from `TASK_RESULT_XML_INSTRUCTIONS`. It asks the child to wrap its final message in tags such as `<summary>`, `<findings>`, and `<evidence>`. `parseResultXml()` uses those tags for structured rendering; plain text remains valid.

Current defect:

- Sessions are created under `artifacts/tasks/sessions/<task-id>/<timestamp>_<uuid>.jsonl`.
- `findJsonlSessionByName()` searches `artifacts/sessions`, so completed history entries can miss `sessionRef`.
- A later `task_id` resume then reports that the session JSONL cannot be resolved even though the file exists.
- Parent agents may guess `<task-id>.jsonl`, but Pi names the file with a timestamp and session UUID.

Required work:

- Resolve sessions from the task's persisted artifact directory instead of rebuilding a different root path.
- Store the exact JSONL path when the child session becomes available.
- Cover foreground, background, restored, and durable-conversation resume paths.
- Add a regression test using Pi's timestamp-and-UUID filename shape.
- Update README storage paths after the implementation chooses one canonical layout.

## Evaluate completion notification transport

Keep JSONL as the durable source because it survives parent restarts and separate tmux processes. Investigate an event-driven completion notification so the parent does not depend only on polling.

Compare:

- filesystem watching with polling fallback
- an atomic completion sentinel containing the exact session path
- a local socket or pipe from the child wrapper

Any push mechanism must tolerate parent restarts, duplicate delivery, notification loss, and a result written just before process exit. JSONL remains the recovery path.

## Cover live terminal integrations

- Add a live tmux test for Escape, wrap-up text, Enter ordering, and final-result retrieval.
- Add a live HerdR test when a HerdR test server is available. Current tests mock its command API.
- Record behavior for custom `ctx.ui.custom` dialogs that ignore or remap Escape.

## Fix the standard typecheck command

`npm run typecheck` can fail while resolving an implicit `dompurify` type library. The explicit `npx tsc --noEmit --types node` check passes. Make the package script reliable without requiring the workaround in `AGENTS.md`.
