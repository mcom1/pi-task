# AGENTS.md

Scope: this repository.

See `README.md` for installation, agent configuration, and user-facing behavior. See `docs/task-lifecycle.md` for result transport and completion semantics. See `TODO.md` for known defects and investigation work.

## Task lifecycle

- The final assistant message in the child session JSONL is the authoritative task result. Do not add a second result-file protocol.
- Terminal timeout order is Escape, wrap-up message, grace period, then resource cleanup. Preserve that ordering and send Escape at most once.
- `timeout_send_escape` is persisted because restored background tasks must keep their original behavior. Legacy entries without the field use `PI_TASK_TIMEOUT_SEND_ESCAPE`.
- Keep tmux and HerdR behavior aligned. SDK tasks remain one-shot and do not support terminal steering or durable resume.
- Completion must be checked again before hard-timeout cleanup because the child can finish while diagnostics are collected.

## Tests

- Add new test files to the explicit `test` script in `package.json`; unlisted files do not run under `npm test`.
- Use transport shims for tmux command ordering and mocked HerdR control calls. Never target the active tmux server in automated tests.

## Before Committing

This repository has no CI, pre-commit configuration, or command runner. Run:

1. `npm test`
2. `npm run typecheck`
3. `git diff --check`

Run `npm run build` when testing the local package through its compiled `dist/` entry point.
