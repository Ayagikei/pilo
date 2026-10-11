# Pi workspace enhancements (A + B + C)

Branch: `feat/pi-workspace-enhancements`

Base: `109c0216da1af11390a5529fd56e67b51bcf2bdc`.

## Implemented behavior

### A. Model picker

Desktop uses a searchable Popover; touch uses a bottom sheet. The shared list has a compact refresh button, name/ID/provider search with case-insensitive AND matching, explicit Scoped/All filters, counts, empty states, and thinking-level controls. Scope preferences are per project in browser storage and never written into Pi settings. Search and range changes do not probe Pi, change the selected model, or change the quick-cycle set. Identity always includes provider and model ID. An explicit Scoped filter never silently falls back to All.

The project catalog remains a snapshot of the existing Pi probe. Remote active sessions merge missing scoped/thinking metadata from the host cache into the live available-model list, without resurrecting unavailable cached models. This is not an implementation of continuously synchronized, extension-mutated live model scopes.

### B. Discover and import projects

Use Add Project on a desktop connection, or the discovery button beside the project picker in a Remote WebUI draft. Choose Scan, filter the results, select eligible directories, and import explicitly. Manual directory selection remains available on desktop.

The server reads session headers, never reverse-decodes directory names or parses conversation bodies. Discovery aggregates by verified target-environment cwd, includes session counts and most recent session file modification time, and identifies missing/inaccessible paths. Limits are explicit: 64 KiB per header, 100,000 session files, 2,000 candidate projects, 10,000 directories, a 15-second cooperative scan budget, and 40 detailed warnings. Exceeding a limit or skipping malformed/unreadable data marks the report incomplete. These are safety bounds, not paginated exhaustive discovery; there is no continuation cursor yet. A blocking filesystem operation can still outlast a cooperative time budget.

Import is limited to 200 selected projects per request. It rescans and revalidates on the target, rejects arbitrary paths not found in the report, skips existing project IDs, and returns added/skipped/failed results. It records projects without opening chats or starting Pi probes. Imported projects have `lastOpenedAtMs=0`; automatic catalog/server prewarming skips them until explicitly opened.

Remote discovery/import routes are inside the existing authenticated API router. Connection choices contain only ID/name, not SSH credentials or private-key paths. No new generic remote filesystem write endpoint is exposed.

**Server compatibility:** rebuild and deploy the matching branch version of `pilo-server`. The `session.discover` response now contains a report instead of raw headers. New desktop code can read older bounded header responses but marks them incomplete/unverified and refuses batch import. An old desktop is not expected to consume the new server response. Custom session roots outside the existing Pi agent-directory resolution are not discovered in this version.

### C. Extension UI and commands

`setStatus`, text-array `setWidget` (above/below editor), and `setTitle` are displayed through a shared per-session store. The title is shown in the UI and applied to `document.title`; this does not change the persisted Pi session name or directly set the native OS window title. Widgets render text, never raw HTML, and have display bounds.

Standard select/confirm/input/editor requests use a shared queue. Deadlines begin when received, including requests behind other dialogs. Expired requests are removed. Duplicate IDs do not extend deadlines; resolved IDs are remembered within a bounded per-WebView window. Old-generation events are rejected, and process shutdown clears transient UI. The legacy runtime may reuse generation numbers after recreating a process; an ordered starting event after shutdown resets the UI lifetime.

Dialogs support long-list search, original option values/duplicate labels, keyboard navigation, Chinese IME-safe input submission, and Ctrl/Cmd+Enter for multiline editing. Response validation and a local in-flight guard prevent duplicate clicks from producing duplicate responses. Transport failures are not automatically retried. The pre-existing startup MCP approval/restart workaround is preserved separately; it is not governed by the standard stale-process/timeout queue.

**Remote response fix:** `extension_ui_response` retains the original Pi request ID and bypasses the ordinary RPC correlation ID and response timeout. This message is a reply to an extension request, not a new RPC command that receives an acknowledgment.

Command suggestions now use a shared expiring cache with in-flight deduplication, generation-safe invalidation, a manual refresh button, and fresh command-name lookup before slash-command dispatch. Standard notifications and editor text continue to use the existing handlers.

## Deliberate boundaries / review notes

This branch does not emulate arbitrary terminal components, `ctx.ui.custom()`, terminal keyboard hooks, custom TUI renderers, or terminal-only header/footer/editor APIs. Agent-side hooks still execute in Pi; Pilo does not duplicate their business logic.

The UI store is ephemeral and per WebView, not an authoritative server-side approval ledger. It does not guarantee cross-device exactly-once replies or restore all status/widget/pending state after a full reload or an event replay gap. Background events are captured for later session selection, but sidebar-wide waiting badges are not included. A production-strength multi-device approval coordinator and persistent UI snapshot protocol require follow-up work.

## Validation performed

The five new dependency-free Node test files were executed together on Node 22: **28 tests passed, 0 failed**. They cover model filters, cached metadata merging, project selection rules, extension state/expiry/replay guards, and command-cache behavior. New Rust scanner/import-decoding tests have been written but have not been executed in this environment.

A full dependency install, TypeScript project build, React integration tests, Rust check/test/clippy, and desktop/WSL/SSH/Remote WebUI end-to-end validation were **not** completed. This environment could not resolve dependency hosts and did not have Rust or the repository formatters installed. Formatting/lint status is therefore not verified; run the formatters and full checks before merging. This branch is a development implementation, not a validated release.

## Local validation commands

```sh
pnpm install --frozen-lockfile
pnpm format
cargo fmt --all
pnpm check
pnpm test:workspace
pnpm test:unit
pnpm build
cargo check --workspace --all-targets --all-features
cargo test --workspace --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
pnpm server:build
pnpm tauri dev
```

The dependency-free tests can also be run without installing packages:

```sh
node --experimental-strip-types --test tests/pi-model-filter.test.ts tests/pi-model-metadata.test.ts tests/project-discovery.test.ts tests/pi-extension-ui-state.test.ts tests/pi-command-cache.test.ts
```

## Manual acceptance matrix

Test both desktop mouse and mobile touch: picker focus/IME/escape, Scoped order zero, unavailable cached models, project-specific range memory, refresh failure with the old list still visible, and no model changes while filtering.

Test Local/WSL/SSH: empty history, more than 500 sessions in one project, missing/inaccessible projects, Unicode/spaces/hyphens/worktrees, damaged/oversized headers, scan interruption, partial reports, duplicate import, partial import failure, and no Pi process starts when importing.

Test Pi extensions: replace/clear status and widget keys, above/below placement, title reset, text escaping, sequential/concurrent dialogs, expiry while queued, reject/cancel behavior, double clicks, process restart, switching between sessions, command cache refresh/failure, and WebUI confirmation preserving its Pi request ID.
