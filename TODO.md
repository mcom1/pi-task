# TODO

## Evaluate completion notification transport

JSONL remains the durable result source because it survives parent restarts and separate tmux processes. Compare an event-driven completion notification against the current polling loop:

- filesystem watching with polling fallback
- an atomic completion sentinel containing the exact session path
- a local socket or pipe from the child wrapper

Any replacement must handle parent restarts, duplicate delivery, notification loss, and a result written before process exit. Keep JSONL as the recovery path.

## Cover live terminal integrations

- Add an isolated live tmux test for Escape, wrap-up text, Enter ordering, and final-result retrieval. Current transport tests verify command ordering through shims.
- Add a live HerdR test when a HerdR test server is available. Current tests mock its command API.
- Record behavior for custom `ctx.ui.custom` dialogs that ignore or remap Escape.
