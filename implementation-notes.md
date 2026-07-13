# Implementation Notes

## HerdR backend — 2026-07-13

### Deviations

- The first implementation agents timed out after establishing the terminal-backend RED tests. The implementation was completed and verified directly from that partial state.
- HerdR uses CLI wrappers rather than a raw socket client. This follows HerdR's recommendation for orchestration and keeps the initial integration small.
- Initial live smoke was blocked outside HerdR. After restarting Pi inside HerdR 0.7.3, end-to-end launch, durable resume/steering, completion, and orphan-pane cleanup were verified. The smoke exposed runtime timing and CLI-output issues that unit tests did not reproduce.
- Temporary HerdR transport failures remain recoverable instead of being classified as dead panes. Durable records are preserved until the same socket and terminal identity can be validated again.

### Discoveries

- HerdR pane IDs are session-local. Safe control requires the persisted absolute socket path and terminal identity before reading, steering, or closing a pane.
- HerdR's shell can outlive the delegated Pi process. An atomic task-owned exit sentinel distinguishes child exit from shell liveness; a valid Pi JSONL terminal result always takes precedence.
- HerdR `done` and `idle` depend on attention/focus. They are not used as task-result authority.
- Durable resume must deliver the new prompt after reattaching to an already-running task; reattachment alone is not a completed resume operation. HerdR needed a 300 ms gap between `pane run` and a confirming Enter so Pi queues the prompt during an active turn.
- Long wrapper commands must start through `herdr agent start -- sh -lc ...`; sending them into a fresh shell with `pane run` allowed immediate steering to corrupt the still-buffered command.
- HerdR mutation commands can succeed with empty stdout. Only JSON-producing inspection commands should be decoded.
- An autonomous child-side JSONL watcher was removed after live testing showed it could close the HerdR pane before the parent task runner consumed completion, leaving an orphaned in-memory widget entry. Normal cleanup is parent-owned: the wrapper records child exit, while pi-task polling records completion and then closes the pane. Restart restoration handles parent termination.
- The existing code treats all five terminal stop reasons (`stop`, `endTurn`, `length`, `error`, `aborted`) as completed. This integration preserves that behavior.
