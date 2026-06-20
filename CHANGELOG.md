# Changelog

## v0.1.0 - Initial release

Initial public release of `@heyhuynhgiabuu/pi-task`.

### Added

- `task` tool for delegating work to specialized Pi subagents.
- Foreground tasks that return results directly to the current parent turn.
- Background tasks with task widget progress and automatic parent follow-up on completion.
- Tmux backend for observable subagent panes.
- SDK fallback when tmux is unavailable.
- Bundled starter agents: `scout`, `explore`, `planner`, `reviewer`, `vision`, and `worker`.
- Project/user agent override support via `.pi/agents/*.md` and `~/.pi/agents/*.md`.
- Agent frontmatter support for `model`, `thinking`, `tools`, and `disallowed_tools`.
- Tool allowlist filtering against tools registered in the parent Pi session.
- Clean TUI widget with spinner header and per-tool status rows.

### Notes

- `srcwalk` is not required. Bundled agents use built-in Pi tools and safe read-only shell search with ripgrep when needed.
- Treat delegated subagent results as untrusted until artifacts/files are reviewed and verified.
