# CLAUDE.md

Project memory for working in this repository. Read this before making changes.

## What this is

FlowMaster Dashboard — a VSCode extension (TypeScript, compiled with `tsc` to CommonJS) that provides a WebView UI on top of the **OpenFlow** workflow. OpenFlow is a 5-phase, gate-gated demand lifecycle:

```
design → testcase → development → delivery → closure
```

Each phase produces artifacts under `openspec/` and a report under `.workflow/reports/<change-id>/`, then waits at a **Gate** for human review before the next phase unblocks.

The extension does three things:

1. **Reads** demand state from `.workflow/state/<change-id>.yaml` and renders it in a sidebar (demand list) + main dashboard (phase grid, phase detail, artifacts, gate buttons).
2. **Runs** the corresponding OpenFlow phase by spawning `claude --dangerously-skip-permissions /openflow:<phase> <change-id>` in a child process, streaming stdout/stderr into an inline terminal in the dashboard.
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

- **`extension.ts`** — entry point. Registers commands (`flowmaster.openDashboard`, `flowmaster.refresh`, `flowmaster.newDemand`), owns the main `WebviewPanel`, handles all webview messages (`runPhase`, `reviewGate`, `openFile`, `terminalInput`/`resize`/`switchTerminal`), and contains the **entire dashboard HTML + CSS + JS inline** in `getHtml()`. This is by far the largest file; the UI lives here as a template string.
- **`sidebarProvider.ts`** — `WebviewViewProvider` for the activity-bar sidebar. Renders the demand list, sends `selectDemand` / `newDemand` / `refresh` back. Also self-contained inline HTML.
- **`stateReader.ts`** — parses `.workflow/state/*.yaml` into `DemandSummary[]`. State path is configurable via `flowmaster.statePath` setting (default `.workflow/state`). Tolerant: skips empty/invalid files with a warning.
- **`processManager.ts`** — wraps `child_process.spawn`, keyed by `demandId`. Maintains `Map<demandId, ChildProcess>` plus per-demand output buffers (capped at 10000 chunks), data/exit/error listener registries. On Windows uses `shell: true` + `taskkill /pid /t /f` for tree-kill; on Unix `SIGTERM` then `SIGKILL` after 3s.
- **`terminalBridge.ts`** — subscribes to `ProcessManager` streams and forwards them as `terminalOutput`/`terminalExit`/`terminalError`/`terminalStart` postMessages to the webview. Owns the attach/detach lifecycle with stored callback refs.
- **`fileOpener.ts`** — opens artifact files via `code -r` (no shell), falls back to `vscode.workspace.openTextDocument`.

**Legacy / not wired into the active path** (kept but not imported by `extension.ts`): `panel.ts` (older standalone dashboard panel) and `terminalRunner.ts` (older phase-runner class). `extension.ts` reimplements `runPhase` inline instead of using `TerminalRunner`. Be careful editing these — verify they aren't being re-activated before deleting. The `xterm` / `xterm-addon-*` deps in `package.json` are leftover from a now-replaced xterm.js terminal; the inline terminal is plain-text (`<pre>` + `textContent`).

### Message flow

```
webview ──postMessage──► extension.ts handleMessage()
                              │
              ┌───────────────┼────────────────────┐
              ▼               ▼                    ▼
        runPhase()      reviewGate()          terminalBridge.write/resize
              │               │                    │
              ▼               │                    ▼
   terminalBridge.startProcess   │          ProcessManager.write → stdin
              │               │
              ▼               ▼
   ProcessManager.spawn     fs.writeFileSync(state.yaml)
              │                    │
              ▼                    ▼
   stdout/stderr ──► TerminalBridge.emit ──► panel.webview.postMessage
```

The main panel uses a **ready handshake**: webview posts `ready` once its script boots, only then does the extension send `stateUpdated`. `pendingDemandSelection` bridges a selection that arrived before the panel was ready.

### Phase → command mapping

Defined in both `extension.ts` (`PHASE_COMMAND_MAP`) and mirrored in `terminalRunner.ts` and the inline dashboard JS (`PHASE_COMMANDS`):

| phase | command | note |
|---|---|---|
| design (propose) | `/openflow:design` | no demandId arg |
| testcase | `/openflow:plan` | with demandId |
| development | `/openflow:build` | with demandId |
| delivery (closure) | `/openflow:close` | with demandId |
| closure | — | terminal, no-op |

All invocations prepend `--dangerously-skip-permissions` (`getSkipPermissionsFlag`). This is intentional — the embedded terminal is meant to run unattended.

### State file shape (`.workflow/state/<change-id>.yaml`)

```yaml
change: <change-id>
title: "..."
status: active
current_phase: <design|testcase|development|delivery|closure>
phases:
  <phase>:
    status: <in_progress|done|blocked|revision_needed>
    artifacts: [...]
    report: <path|null>
    gate: { status: <pending|passed|rejected>, reviewer, reviewed_at }
    blocked_by: [<phase>.gate]
```

`reviewGate()` in `extension.ts` is the only writer besides the OpenFlow skills themselves — it parses with `yaml`, updates the target phase's `gate.status`, advances `current_phase` on pass, and writes back with `yaml.stringify`. Phase order is hardcoded: `['design','testcase','development','delivery','closure']`.

## OpenFlow skills & commands

The actual workflow logic lives in **skills**, not in this extension. The extension just shells out to `claude /openflow:<phase>`. Skill definitions are in `.claude/skills/openflow-{design,plan,build,close,fix,review,status}/SKILL.md`, with matching slash commands under `.claude/commands/openflow/` and `.claude/commands/opsx/` (OpenSpec experimental variants).

`extension.ts` gates `/openflow:design` behind `ensureOpenflowDesignSkill()` — it checks for `SKILL.md` in either `<root>/.claude/skills/openflow-design/` or `~/.claude/skills/openflow-design/` and bails with a message if missing.

**build ↔ fix ↔ retest 职责分离**：`openflow-build` 只做一次统一修复（汇总失败用例 → 统一改 → 重编译替换 → 重跑失败用例；仍失败则标记失败回滚），循环修复（≤5 次）在 `openflow-fix`。fix 仍依赖 change-id，接纳两种问题来源——AT 失败用例（从 `at-exec-report.md` / 状态 `test_results.cases` 筛 `result: failed`，列编号清单供用户选部分/全部）和人工输入问题（对话描述，不一定对应 AT 用例），用 `trigger` 字段（`at-failure` / `manual`）区分。`openflow-retest` 是可选的非主流程阶段：列出全部用例 → 选部分/全部重跑（不重编译，用当前已部署代码）→ 更新 `test_results.cases` 与 `retests[]` 轮次日志 + 产出 `retest-report-<n>.md`；出现 pass→fail 回归则提示回 fix。fix 和 retest 都不在扩展的 `PHASE_COMMAND_MAP` 中，由人工手动 `/openflow:fix` / `/openflow:retest <change-id>` 调用。典型流：build → (fix) → [retest] → close。

OpenSpec project config: `openspec/config.yaml`. Change artifacts live in `openspec/changes/<id>/`; capability specs in `openspec/specs/<capability>/`.

## Conventions

- **UI language is Chinese** (zh-CN). All user-facing strings, button labels, status text, and error messages are in Chinese. Match this when adding UI.
- **HTML is inline** in `.ts` files as template strings — no separate `media/*.css`/`*.js` for the active panels (despite some state files listing them as artifacts). CSP is `default-src 'none'` with `'unsafe-inline'` for style/script and `${webview.cspSource}` for resources.
- **VSCode theme variables** (`var(--vscode-*)`) are used throughout for colors — do not hardcode palettes.
- **Escaping**: webview JS has a local `esc()` helper for HTML-escaping user/state-derived strings. Always use it when interpolating state into HTML.
- Commits follow conventional-commit-ish style (`feat:`, `fix:`, `refactor:`, `docs:`). The repo's recent history is heavy on `docs:` entries that update a memory log.

## Gotchas

- Compiling auto-bumps the version and dirties `package.json`/`package-lock.json` — commit those bumps intentionally or stash.
- `panel.ts` + `terminalRunner.ts` duplicate logic that `extension.ts` reimplements inline. If you change phase-command mapping or spawn behavior, update `extension.ts` (the live path); the duplicates are stale.
- The 30-second `setInterval` auto-refresh in `activate` posts `stateUpdated` to the panel every tick while it's open — fine for state, but be aware when debugging message traffic.
- On Windows, `ProcessManager` spawns with `shell: true`; args pass through cmd.exe. Phase commands come from a hardcoded map (no user input), so injection risk is low, but keep it that way.
