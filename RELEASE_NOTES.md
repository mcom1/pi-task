# Release notes

Human-readable release log for `@heyhuynhgiabuu/pi-task`.

## 0.1.1 — 2025

### Fixed

- **`Cannot find package '@earendil-works/pi-tui'`** on `pi install`.
  `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` were
  declared as `peerDependencies` and `devDependencies`, but the dist
  has a runtime `import { Text, truncateToWidth } from
  "@earendil-works/pi-tui"`. With `npm install --omit=dev` (the
  default used by `pi install`), peer deps are recorded but not
  installed into the package's own `node_modules`. They are now
  declared in `dependencies` and pinned to `^0.79.0`.

### What you need to do

Nothing. The next `pi install` (or upgrade) picks up 0.1.1
automatically. If you pinned a specific version, run:

```bash
pi install @heyhuynhgiabuu/pi-task@0.1.1
```

To verify it's working, start pi and look for the
`@heyhuynhgiabuu/pi-task` line in the extension list. There should be
no `Cannot find package` error, and the new `task_*` tools should be
available to the LLM.

### Compatibility

- pi SDK: `>= 0.79.0` (uses the new `@earendil-works/pi-coding-agent`
  scope)
- pi TUI: `>= 0.79.0` (uses `@earendil-works/pi-tui`)
- Node: `>= 20`

### Verified

- `npm run build` succeeds
- `npm test` 1/1 pass
- `tsc --noEmit` clean
- `dist/index.js` references `@earendil-works/pi-tui`

---

## 0.1.0

Initial release.
