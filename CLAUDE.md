# CLAUDE.md

Project memory for working in this repository. Read this before making changes.

## What this is

FlowMaster Dashboard — a VSCode extension (TypeScript, compiled with `tsc` to CommonJS) that provides a WebView UI on top of the **OpenFlow** workflow. OpenFlow is a 7-phase, gate-gated demand lifecycle:

```
design → testcase → development → fix → retest → delivery → closure
```

Each phase produces artifacts under `openspec/` and a report under `.workflow/reports/<change-id>/`, then waits at a **Gate** for human review before the next phase unblocks.

The extension does three things:

1. **Reads** demand state from `.workflow/state/<change-id>.yaml` and renders it in a sidebar (demand list) + main dashboard (phase grid, phase detail, artifacts, gate buttons).
2. **Runs** the corresponding OpenFlow phase by sending text commands to a **VS Code native terminal** (`vscode.window.createTerminal` + `terminal.sendText`). Each demand gets its own terminal, reused across phases.
3. **Writes** gate review decisions directly back into the state YAML file (pass → advance `current_phase` and unblock the next; reject → `revision_needed`).

## Build / test / package

```bash
npm run compile      # tsc -p tsconfig.json (precompile auto-bumps patch version via scripts/bump-version.js)
npm run watch        # tsc --watch
npm run lint         # tsc --noEmit --strict  (typecheck only — no linter configured)
npm test             # vitest run
npm run test:watch   # vitest
npm run package      # compiles then npx vsce package → flowmaster-dashboard-<ver>.vsix
npm run publish      # vsce publish
```

`npm run compile` mutates `package.json` + `package-lock.json` version on every run (precompile hook). Do not be surprised by a dirty tree after compiling.

Strict TS (`"strict": true`), target ES2020, CommonJS, `outDir: dist`, `rootDir: src`. `tests/` and `dist/` are excluded from compilation.

## Architecture

Active runtime path (what `extension.ts` wires up at `activate`):

- **`extension.ts`** — entry point. Registers commands (`flowmaster.openDashboard`, `flowmaster.refresh`, `flowmaster.newDemand`), owns the main `WebviewPanel`, handles all webview messages (`runPhase`, `reviewGate`, `openFile`), and contains the **entire dashboard HTML + CSS + JS inline** in `getHtml()`. This is by far the largest file; the UI lives here as a template string.
- **`sidebarProvider.ts`** — `WebviewViewProvider` for the activity-bar sidebar. Renders the demand list, sends `selectDemand` / `newDemand` / `refresh` back. Also self-contained inline HTML.
- **`stateReader.ts`** — parses `.workflow/state/*.yaml` into `DemandSummary[]`. State path is configurable via `flowmaster.statePath` setting (default `.workflow/state`). Tolerant: skips empty/invalid files with a warning.

### Terminal execution model

The extension uses **VS Code native terminals** (not embedded/spawned processes). Key functions:

- `getDemandTerminal(demandId, cwd)` — creates or reuses a `vscode.Terminal` per demand. Tracks terminals in `demandTerminals` Map. Listens for `onDidCloseTerminal` to clean up and emit `phaseComplete`.
- `runPhase(demandId, phase)` — builds the `claude --dangerously-skip-permissions /openflow:<phase> <demandId>` command and sends it via `terminal.sendText()`.
- `runOpenflowDesign()` — special case for design phase (no demandId arg).

### Message flow

```
webview ──postMessage──► extension.ts handleMessage()
                              │
              ┌───────────────┼────────────────────┐
              ▼               ▼                    
        runPhase()      reviewGate()          
              │               │                    
              ▼               ▼                    
   vscode.window.createTerminal   fs.writeFileSync(state.yaml)
   terminal.sendText(cmd)              │
                              ▼
   onDidCloseTerminal → phaseComplete postMessage
```

### Phase → command mapping

Defined in `extension.ts` (`PHASE_COMMAND_MAP`), mirrored in the inline dashboard JS (`PHASE_COMMANDS`):

| phase | command | note |
|---|---|---|
| design (propose) | `/openflow:design` | no demandId arg |
| testcase | `/openflow:plan` | with demandId |
| development | `/openflow:build` | with demandId |
| fix | `/openflow:fix` | with demandId |
| retest | `/openflow:retest` | with demandId |
| delivery | `/openflow:close` | with demandId |
| closure | — | no command, display only |

All invocations prepend `--dangerously-skip-permissions` (`getSkipPermissionsFlag`). This is intentional — the terminal is meant to run unattended.

**fix and retest are always executable**, even after closure — issues may be discovered post-completion, and new deployment environments may require retesting.

### State file shape (`.workflow/state/<change-id>.yaml`)

```yaml
change: <change-id>
title: "..."
status: active
current_phase: <design|testcase|development|fix|retest|delivery|closure>
phases:
  <phase>:
    status: <in_progress|done|blocked|revision_needed>
    artifacts: [...]
    report: <path|null>
    gate: { status: <pending|passed|rejected>, reviewer, reviewed_at }
    blocked_by: [<phase>.gate]
```

`reviewGate()` in `extension.ts` is the only writer besides the OpenFlow skills themselves — it parses with `yaml`, updates the target phase's `gate.status`, advances `current_phase` on pass, and writes back with `yaml.stringify`. Phase order is hardcoded: `['design','testcase','development','fix','retest','delivery','closure']`.

## OpenFlow skills & commands

The actual workflow logic lives in **skills**, not in this extension. The extension just shells out to `claude /openflow:<phase>`. Skill definitions are in `.claude/skills/openflow-{design,plan,build,close,fix,review,status,retest}/SKILL.md`, with matching slash commands under `.claude/commands/openflow/` and `.claude/commands/opsx/` (OpenSpec experimental variants).

`extension.ts` gates `/openflow:design` behind `ensureOpenflowDesignSkill()` — it checks for `SKILL.md` in either `<root>/.claude/skills/openflow-design/` or `~/.claude/skills/openflow-design/` and bails with a message if missing.

OpenSpec project config: `openspec/config.yaml`. Change artifacts live in `openspec/changes/<id>/`; capability specs in `openspec/specs/<capability>/`.

## Conventions

- **UI language is Chinese** (zh-CN). All user-facing strings, button labels, status text, and error messages are in Chinese. Match this when adding UI.
- **HTML is inline** in `.ts` files as template strings — no separate `media/*.css`/`*.js` for the active panels. CSP is `default-src 'none'` with `'unsafe-inline'` for style/script and `${webview.cspSource}` for resources.
- **VSCode theme variables** (`var(--vscode-*)`) are used throughout for colors — do not hardcode palettes.
- **Escaping**: webview JS has a local `esc()` helper for HTML-escaping user/state-derived strings. Always use it when interpolating state into HTML.
- Commits follow conventional-commit-ish style (`feat:`, `fix:`, `refactor:`, `docs:`).

## Gotchas

- Compiling auto-bumps the version and dirties `package.json`/`package-lock.json` — commit those bumps intentionally or stash.
- The 30-second `setInterval` auto-refresh in `activate` posts `stateUpdated` to the panel every tick while it's open — fine for state, but be aware when debugging message traffic.
- Terminal lifecycle is managed by VS Code. `onDidCloseTerminal` is used to detect when a phase command finishes and emit `phaseComplete` with next-step suggestions.
