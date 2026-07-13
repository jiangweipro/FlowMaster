# Code Review Report: FlowMaster VSCode Extension

**Review date:** 2026-07-09
**Scope:** All 8 source files — extension.ts, panel.ts, stateReader.ts, terminalRunner.ts, fileOpener.ts, media/script.js, media/style.css, tests/stateReader.test.ts

---

## Critical Findings

### C1. Stored XSS in WebView via unescaped phase/gate values (media/script.js)

**File:** `F:\project\FlowMaster\media\script.js`
**Lines:** 169, 186, 188

The `renderCard()` function builds HTML via template literals assigned to `innerHTML`. While most fields are sanitized through `escapeHtml()`, two fields come from the state YAML file and are injected unescaped:

```js
// Line 169 — phase used directly without escapeHtml()
<span class="badge badge-phase">${PHASE_LABELS[phase] || phase}</span>

// Line 186 — phase used directly without escapeHtml()
${isRunning ? 'Running...' : '▶ Run ' + (PHASE_LABELS[phase] || phase)}

// Line 188 — both phase and gate used without escapeHtml()
<span class="phase-label">Phase: ${phase} | Gate: ${gate}</span>
```

When `phase` is not a key in `PHASE_LABELS` (e.g., a custom or malformed phase value), the raw value falls through. If a state file contains a value like `phase: <img src=x onerror=alert(1)>`, this XSS payload executes when the card renders.

**Fix:** Wrap all dynamic values in `escapeHtml()`, including `phase` and `gate` in line 188 and the fallback branches on lines 169/186.

### C2. Command injection in FileOpener.tryOpenWithCodeCli (src/fileOpener.ts)

**File:** `F:\project\FlowMaster\src\fileOpener.ts`
**Line:** 64

```typescript
exec(`code -r "${absolutePath}"`, (err) => { ... });
```

The `absolutePath` is interpolated into a shell command string. On Unix/macOS (where `child_process.exec` invokes `/bin/sh -c`), double-quoted strings still interpret `$()`, backticks, and `${}`. A file path containing shell metacharacters—for example a file named `foo$(id).md` or a path with backticks—would execute the embedded command.

While the path originates from a user-controlled state file (self-XSS scenario), this is still a command injection vulnerability. On Windows, cmd.exe does not interpret `$()` or backticks, but the `%VAR%` expansion syntax is still active.

**Fix:** Use `child_process.execFile` (not `exec`) to avoid shell interpretation, or use `vscode.env.openExternal`/`vscode.commands.executeCommand('vscode.open')` as a primary path instead of shelling out to `code`.

### C3. Cryptographically weak CSP nonce (src/panel.ts)

**File:** `F:\project\FlowMaster\src\panel.ts`
**Lines:** 171-178

```typescript
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 64; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
```

Uses `Math.random()` for CSP nonce generation, which is predictable (not cryptographically secure). An attacker who can predict nonces could bypass the CSP.

**Fix:** Use Node.js `crypto.randomBytes()`:
```typescript
import * as crypto from 'crypto';
function getNonce(): string {
  return crypto.randomBytes(32).toString('base64');
}
```

---

## High Severity

### H1. Synchronous I/O blocks extension host thread (src/stateReader.ts, src/fileOpener.ts)

**Files:** `stateReader.ts` lines 49, 53, 59; `fileOpener.ts` line 21

All file system operations use sync APIs (`fs.existsSync`, `fs.readdirSync`, `fs.readFileSync`). VSCode extensions share a single extension host thread; blocking it with I/O causes UI jank and degrades the user experience for the entire editor.

**Fix:** Use `fs.promises` (async variants) throughout.

### H2. Stale FlowMasterPanel singleton causes silent no-op after user closes tab (src/extension.ts)

**File:** `F:\project\FlowMaster\src\extension.ts`
**Lines:** 4, 16-22

When the user closes the WebView panel, `panel.ts` line 58 (`onDidDispose`) sets `this.panel = undefined`, but the module-level `flowMasterPanel` variable (line 4) still references the `FlowMasterPanel` object. The `flowmaster.refresh` command checks `if (flowMasterPanel)` (true), then calls `flowMasterPanel.refresh()` which immediately returns due to `if (!this.panel) return;`. The user clicks Refresh and sees nothing happen.

The `openDashboard` command works correctly (it calls `createOrShow()` which re-creates the WebView), but `refresh` does not.

**Fix:** Option A — Wire the panel's `onDidDispose` to also clear the module-level variable. Option B — In `refresh()` after the guard check, automatically call `createOrShow()` if `this.panel` is undefined.

### H3. Terminal reuse ignores stale working directory (src/terminalRunner.ts)

**File:** `F:\project\FlowMaster\src\terminalRunner.ts`
**Lines:** 24-25, 53-54

When `terminalReuse` is `true` and a terminal exists for a demand ID, the code reuses it without sending a `cd` command. If the user has navigated the terminal to a different directory (e.g., by running commands manually), the phase command runs in the wrong directory:

```typescript
if (reuse && this.terminals.has(demandId)) {
  terminal = this.terminals.get(demandId);
  // No cd sent — terminal might be in a different directory
}
```

**Fix:** Always send the `cd` command, even when reusing a terminal. Alternatively, create a fresh terminal each time and only reuse when `terminalReuse` is explicitly set and the user understands the trade-off.

### H4. Closure phase shows user-facing error instead of graceful UX (src/terminalRunner.ts)

**File:** `F:\project\FlowMaster\src\terminalRunner.ts`
**Lines:** 3-9, 15-19

The phase-command map has `closure: ''`. When a demand reaches closure, clicking "Run" calls `terminalRunner.runPhase(demandId, 'closure')`, which checks `if (!command)` and displays `showErrorMessage('[FlowMaster] No command mapped for phase: closure')`. The user sees an error dialog for a normal terminal state.

**Fix:** Handle the closure case explicitly in `handleMessage` (panel.ts) by either disabling the run button or showing an informational message instead of an error.

---

## Medium Severity

### M1. No runtime validation of webview message payload types (src/panel.ts)

**File:** `F:\project\FlowMaster\src\panel.ts`
**Lines:** 99-100, 112, 120

Payload fields are cast with `as string` without type guards:

```typescript
const demandId = message.payload?.demandId as string;
const phase = message.payload?.phase as string;
const filePath = message.payload?.path as string;
```

If the webview sends `{ command: 'runPhase', payload: { demandId: 12345, phase: null } }`, the casts succeed at compile time but at runtime `phase` is `null` (falsy) and `demandId` is a number. The check `if (demandId && phase)` would reject `phase = null`, but `demandId = 12345` (truthy number) would pass through as a string to `terminalRunner.runPhase()`.

**Fix:** Add `typeof` guards: `if (typeof demandId === 'string' && typeof phase === 'string')`.

### M2. Double initial state load on panel creation (src/panel.ts + media/script.js)

**File:** `panel.ts` lines 64-67, `script.js` lines 248-249

When AutoRefresh is enabled, `createOrShow()` calls `this.refresh()` after creating the panel. Simultaneously, `script.js` onload posts a `refreshState` message. Both trigger `stateReader.readAllStates()`, causing two back-to-back YAML directory scans on every Dashboard open.

**Fix:** Let one side handle initial load. Either set AutoRefresh but skip the WebView's initial `postMessage`, or remove AutoRefresh and always rely on the WebView's initial load message.

### M3. `error` message command in Message interface never handled in WebView (src/panel.ts + media/script.js)

**File:** `panel.ts` line 9, `script.js`

The `Message` interface includes `'error'` as a valid command, and `panel.ts` line 82 sends errors with `command: 'stateUpdated'` (not `'error'`). The `'error'` command is never used. If it were, the WebView's message handler (script.js line 48-57) has no case for it and would silently ignore it.

**Fix:** Either remove `'error'` from the interface, or implement the handler in the WebView.

### M4. Test suite does not test StateReader or FileOpener classes (tests/stateReader.test.ts)

The test file is named `stateReader.test.ts` but it:
- Tests the `yaml` library's `parse` function directly (not the `StateReader` class)
- Tests `path.join` / `path.isAbsolute` behavior (not the `FileOpener` class)
- Tests the command-map lookup table (not the `TerminalRunner` class)
- Uses `require('yaml')` instead of `import { parse }` (inconsistent with production code)

The `StateReader.readAllStates()`, `StateReader.readState()`, `FileOpener.openFile()`, and `TerminalRunner.runPhase()` methods are completely untested where they interact with VSCode APIs.

**Fix:** Use `vi.mock('vscode')` to mock the VSCode API and write tests that exercise the actual class methods.

---

## Low Severity

### L1. Non-null assertion `this.panel!` in getHtmlForWebview (src/panel.ts)

**File:** `F:\project\FlowMaster\src\panel.ts`
**Line:** 139

```typescript
const webview = this.panel!.webview;
```

If `getHtmlForWebview` were ever called when `this.panel` is undefined, this would throw. Currently it's only called right after setting `this.panel`, but the assertion masks the TypeScript warning.

**Fix:** Pass the already-verified `this.panel` as a parameter to `getHtmlForWebview()`.

### L2. Workspace root not refreshed when workspace folders change (src/stateReader.ts, src/fileOpener.ts)

**File:** `stateReader.ts` lines 40-44, `fileOpener.ts` lines 9-13

Both classes compute `workspaceRoot` once in the constructor. If the user opens a new workspace folder or changes the workspace, the root is stale until the extension is reloaded.

**Fix:** Fetch `vscode.workspace.workspaceFolders` lazily on each read/open call.

### L3. Double dispose call on deactivation (src/extension.ts)

**File:** `F:\project\FlowMaster\src\extension.ts`
**Lines:** 35-40, 45-49

The `deactivate()` function and the `context.subscriptions` dispose handler both call `flowMasterPanel?.dispose()`. The second call is a no-op (panel is already cleared), but this pattern indicates confusion about ownership.

**Fix:** Remove the `context.subscriptions` dispose handler and rely solely on `deactivate()`.

### L4. `handleStateUpdated` continues rendering after error (media/script.js)

**File:** `F:\project\FlowMaster\media\script.js`
**Lines:** 68-81

When `payload.error` is set, `showError()` is called but execution continues to process `payload.demands` and render cards. The user sees both an error banner and potentially stale/partial card data, which is confusing.

**Fix:** Add `return;` after `showError(payload.error)` when the error is fatal enough that demand data should not be rendered.

### L5. Body high-contrast class names may be incorrect (media/style.css)

**File:** `F:\project\FlowMaster\media\style.css`
**Lines:** 337-346

The CSS selectors use `body.hc-black` / `body.hc-light` for high-contrast overrides. VSCode's actual body class names for high-contrast themes are `vscode-high-contrast` and `vscode-high-contrast-light`. These selectors will never match.

**Fix:** Change to `body.vscode-high-contrast` / `body.vscode-high-contrast-light`.

### L6. Missing keyboard focus indicators (media/style.css)

Interactive elements (`.btn`, `.artifact-item`) have hover styles but no `:focus-visible` styles. Users navigating via keyboard have no visual cue for focus state.

**Fix:** Add `:focus-visible` equivalents for all interactive element hover styles.

### L7. YAML parse cast assumes static structure (src/stateReader.ts)

**File:** `F:\project\FlowMaster\src\stateReader.ts`
**Line:** 65

```typescript
const parsed = parse(content) as DemandState;
```

The `as DemandState` cast is a type assertion that provides no runtime safety. Malformed YAML with unexpected field types (e.g., `change` as a number, `phases` as an array) passes the `parsed.change` truthiness check by duck-typing.

**Fix:** Add explicit field type validation after parsing, or use a schema validator (e.g., zod or yup) to validate the parsed object structure.

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| Critical | 3 | XSS (script.js), Command injection (fileOpener.ts), Weak CSP nonce (panel.ts) |
| High | 4 | Sync I/O blocking, Stale singleton after panel close, Terminal reuse bug, Closure phase UX |
| Medium | 4 | Missing payload validation, Double initial load, Orphaned error command, Incomplete test coverage |
| Low | 7 | Non-null assertion, Stale workspace root, Double dispose, Error + render overlap, Wrong HC class names, Missing focus styles, Unsafe YAML cast |

**Total: 18 findings** — 3 critical, 4 high, 4 medium, 7 low.

The most impactful issues are the XSS and command injection vulnerabilities (C1, C2), the weak CSP nonce (C3), and the synchronous I/O anti-pattern (H1) which is pervasive across the codebase. The test suite (M4) needs significant expansion to cover the actual extension logic rather than isolated library calls.