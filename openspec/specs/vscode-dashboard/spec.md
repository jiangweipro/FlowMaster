# VSCode Dashboard — Specification

## 1. Requirement

### REQ-1: WebView Panel Registration

The extension SHALL register a VSCode WebView panel titled "FlowMaster Dashboard" accessible via a command palette entry `FlowMaster: Open Dashboard` and a status-bar button.

### REQ-2: Demand List Display (Card View)

The WebView SHALL fetch and display all change demands from `.workflow/state/` directory as visual cards. Each card SHALL show:

- **Demand name** (derived from the YAML filename)
- **Current phase** (one of: `design`, `testcase`, `development`, `delivery`, `closure`)
- **Gate status** for the current phase (one of: `pending`, `passed`, `rejected`)
- **Capability name** (e.g., `vscode-dashboard`)

### REQ-3: Phase Execution via Terminal

Each demand card SHALL contain a "Run" button. When clicked, the extension SHALL:

1. Open a new VSCode terminal (via `window.createTerminal`)
2. Execute the command `claude /openflow:<current-phase>` in that terminal
3. Focus the terminal panel so the user sees execution progress

### REQ-4: Artifact Listing and Opening

Each demand card SHALL list artifacts (output documents) for the current phase. Each artifact SHALL be rendered as a clickable link. When clicked, the extension SHALL open the file in the VSCode editor via the `code -r <file-path>` CLI command.

### REQ-5: Manual Refresh

The WebView SHALL provide a "Refresh" button. When clicked, the extension SHALL re-read all state files from `.workflow/state/` and re-render the entire card list.

### REQ-6: State Data Source

The extension SHALL read demand state exclusively from `.workflow/state/*.yaml` files. Each YAML file SHALL contain at minimum the following fields:

```yaml
capability: <string>
phase: <string>          # design | testcase | development | delivery | closure
gate: <string>           # pending | passed | rejected
artifacts:
  - path: <relative-path>
    label: <display-label>
```

If a YAML file is malformed or missing required fields, the extension SHALL display a warning badge on the affected card and continue loading other cards.

### REQ-7: OpenFlow Skills Integration

The extension SHALL determine the correct `claude /openflow:<phase>` command based on the demand's current phase, mapping as follows:

| Phase | Command |
|---|---|
| `design` | `claude /openflow:design` |
| `testcase` | `claude /openflow:plan` |
| `development` | `claude /openflow:build` |
| `delivery` | `claude /openflow:close` |
| `closure` | (no phase command — card shows "Completed" badge) |

### REQ-8: Error Handling

The extension MUST gracefully handle the following error conditions:

1. `.workflow/state/` directory does not exist — display an empty-state message with a提示 "No demands found. Run `claude /openspec:propose` to create one."
2. A state YAML file is unparseable — skip that file, show a warning badge, and log the error to the VSCode output channel (`FlowMaster`).
3. Terminal creation fails — show a VSCode error notification with the message "Failed to open terminal."
4. `code` CLI is not found — fall back to `workspace.openTextDocument` + `workspace.showTextDocument` API to open the artifact file.

### REQ-9: WebView Styling

The WebView SHALL render with a clean card-based layout using VSCode-native theme variables (`var(--vscode-*)`) so that the dashboard respects the user's current color theme. Cards SHALL use a colored left-border accent to indicate phase:

| Phase | Border Color |
|---|---|
| `design` | `--vscode-debugIcon-startForeground` (blue) |
| `testcase` | `--vscode-editorWarning-foreground` (yellow) |
| `development` | `--vscode-editorError-foreground` (red) |
| `delivery` | `--vscode-terminal-ansiGreen` (green) |
| `closure` | `--vscode-terminal-ansiCyan` (cyan) |

### REQ-10: Gate Status Badge

Each card SHALL display a gate status badge with the following visual treatment:

| Gate Status | Badge Color | Icon |
|---|---|---|
| `passed` | Green | checkmark |
| `rejected` | Red | cross |
| `pending` | Gray / muted | clock |

---

## 2. Scenarios

### SCN-REQ-1: Open Dashboard

**WHEN** the user runs the command `FlowMaster: Open Dashboard` from the command palette  
**THEN** a new WebView panel titled "FlowMaster Dashboard" SHALL appear in the VSCode editor area  
**AND** the extension SHALL immediately scan `.workflow/state/` for YAML files

### SCN-REQ-2: Display Multiple Demands as Cards

**GIVEN** `.workflow/state/` contains files `vscode-dashboard.yaml` and `auth-service.yaml`  
**WHEN** the dashboard panel loads  
**THEN** two cards SHALL be rendered  
**AND** the first card SHALL display "vscode-dashboard" as the demand name  
**AND** the second card SHALL display "auth-service" as the demand name

### SCN-REQ-3: Card Shows Current Phase and Gate

**GIVEN** a state file contains `phase: development` and `gate: pending`  
**WHEN** the card is rendered  
**THEN** the card SHALL show "development" as the current phase  
**AND** the card SHALL show a "pending" gate badge with a gray/clock icon

### SCN-REQ-4: Run Button Executes Phase Command

**GIVEN** a demand card is in phase `design`  
**WHEN** the user clicks the "Run" button on that card  
**THEN** a new VSCode terminal SHALL be created  
**AND** the terminal SHALL execute `claude /openflow:design`  
**AND** the terminal panel SHALL be focused

### SCN-REQ-5: Run Button Maps Phase Correctly

**GIVEN** a demand card is in phase `testcase`  
**WHEN** the user clicks "Run"  
**THEN** the terminal SHALL execute `claude /openflow:plan`

**GIVEN** a demand card is in phase `development`  
**WHEN** the user clicks "Run"  
**THEN** the terminal SHALL execute `claude /openflow:build`

**GIVEN** a demand card is in phase `delivery`  
**WHEN** the user clicks "Run"  
**THEN** the terminal SHALL execute `claude /openflow:close`

### SCN-REQ-6: Closure Phase Shows Completed

**GIVEN** a demand card is in phase `closure`  
**WHEN** the card is rendered  
**THEN** the card SHALL display a "Completed" badge instead of a "Run" button  
**AND** no terminal command SHALL be executed

### SCN-REQ-7: Click Artifact Opens File

**GIVEN** a demand card lists an artifact with `path: "openspec/specs/vscode-dashboard/spec.md"` and `label: "Specification Document"`  
**WHEN** the user clicks the artifact link  
**THEN** the extension SHALL run `code -r openspec/specs/vscode-dashboard/spec.md` in the shell  
**AND** the file SHALL open in the current VSCode window

### SCN-REQ-8: Manual Refresh Updates Cards

**GIVEN** the dashboard is displaying two cards  
**WHEN** the user clicks the "Refresh" button  
**THEN** the extension SHALL re-read all files from `.workflow/state/`  
**AND** the card list SHALL be re-rendered with the latest data

### SCN-REQ-9: Empty State Directory

**GIVEN** the `.workflow/state/` directory does not exist  
**WHEN** the dashboard panel loads or refreshes  
**THEN** the WebView SHALL display the message "No demands found. Run `claude /openspec:propose` to create one."  
**AND** no cards SHALL be rendered

### SCN-REQ-10: Malformed State File

**GIVEN** `.workflow/state/broken.yaml` exists but contains invalid YAML  
**WHEN** the dashboard panel loads  
**THEN** the extension SHALL skip the broken file  
**AND** the extension SHALL log an error to the "FlowMaster" output channel  
**AND** a warning badge SHALL appear at the top of the dashboard indicating "1 file failed to load"

### SCN-REQ-11: Missing Required Fields

**GIVEN** a state file is valid YAML but lacks the `phase` field  
**WHEN** the dashboard panel loads  
**THEN** the extension SHALL display a warning badge on that card  
**AND** the card SHALL show "unknown" as the phase  
**AND** other cards SHALL render normally

### SCN-REQ-12: Multiple Artifacts Per Phase

**GIVEN** a demand card has `artifacts` containing two entries: `spec.md` and `design.md`  
**WHEN** the card is rendered  
**THEN** both artifact links SHALL be displayed in the artifacts section  
**AND** clicking each SHALL open the respective file

### SCN-REQ-13: Terminal Creation Failure

**GIVEN** VSCode's `window.createTerminal` API returns an error  
**WHEN** the user clicks the "Run" button  
**THEN** the extension SHALL display an error notification "Failed to open terminal."  
**AND** no terminal SHALL be created

### SCN-REQ-14: `code` CLI Fallback

**GIVEN** the `code` CLI is not available in the system PATH  
**WHEN** the user clicks an artifact link  
**THEN** the extension SHALL fall back to `workspace.openTextDocument` followed by `workspace.showTextDocument`  
**AND** the file SHALL open in the VSCode editor

### SCN-REQ-15: Theme-Consistent Rendering

**WHEN** the dashboard panel is rendered  
**THEN** all card colors, fonts, and spacing SHALL use `var(--vscode-*)` CSS variables  
**AND** the cards SHALL respect the user's current VSCode color theme (light / dark / high-contrast)

### SCN-REQ-16: Phase Gate Transition Refresh

**GIVEN** a demand card shows gate `pending` with phase `design`  
**WHEN** the user runs the phase externally and gate changes to `passed`  
**AND** the user clicks "Refresh"  
**THEN** the card SHALL update to show gate `passed` with a green checkmark badge

### SCN-REQ-17: Status Bar Button

**WHEN** the extension activates  
**THEN** a status-bar button labeled "FlowMaster" SHALL be added to the VSCode status bar  
**WHEN** the user clicks the status-bar button  
**THEN** the dashboard panel SHALL open (same as command palette)

### SCN-REQ-18: Context Menu Integration

**GIVEN** the user right-clicks inside the editor area  
**WHEN** the context menu appears  
**THEN** an entry "FlowMaster: Open Dashboard" SHALL be available in the menu  
**WHEN** the user clicks that menu entry  
**THEN** the dashboard panel SHALL open

### SCN-REQ-19: Card Left-Border Phase Color

**GIVEN** a demand card is in phase `design`  
**WHEN** the card is rendered  
**THEN** the card SHALL have a left-border using `--vscode-debugIcon-startForeground` (blue)

**GIVEN** a demand card is in phase `development`  
**WHEN** the card is rendered  
**THEN** the card SHALL have a left-border using `--vscode-editorError-foreground` (red)

### SCN-REQ-20: View Column Preference

**GIVEN** the user has configured VSCode to open the dashboard in a specific column (e.g., `vscode.ViewColumn.Two`)  
**WHEN** the dashboard panel opens  
**THEN** the panel SHALL appear in the configured column  
**AND** the extension SHALL remember the last-used column for subsequent opens

### SCN-REQ-21: Artifact Path Resolution

**GIVEN** an artifact has `path: "openspec/specs/vscode-dashboard/spec.md"`  
**WHEN** the extension resolves the path to open the file  
**THEN** the path SHALL be resolved relative to the workspace root  
**AND** the absolute path `{workspaceRoot}/openspec/specs/vscode-dashboard/spec.md` SHALL be used for the `code -r` command and `openTextDocument` fallback

### SCN-REQ-22: Artifact Section Empty State

**GIVEN** a demand state file has no `artifacts` field or an empty artifacts list  
**WHEN** the card is rendered  
**THEN** the artifacts section SHALL display the text "No artifacts for this phase"  
**AND** no clickable links SHALL be shown

### SCN-REQ-23: Concurrent Terminal Sessions

**GIVEN** the user clicks "Run" on two different demand cards  
**WHEN** both terminal executions are started  
**THEN** two separate terminal instances SHALL be created  
**AND** each terminal SHALL show its respective demand name in the terminal title

### SCN-REQ-24: Gate Status Icons Visibility

**WHEN** a card is rendered with gate `passed`  
**THEN** the gate badge SHALL include a checkmark (unicode U+2713) icon

**WHEN** a card is rendered with gate `rejected`  
**THEN** the gate badge SHALL include a cross (unicode U+2717) icon

**WHEN** a card is rendered with gate `pending`  
**THEN** the gate badge SHALL include a clock (unicode U+23F1) icon

### SCN-REQ-25: WebView Post-Message Protocol

**WHEN** the WebView sends a `{ command: "run", demand: "vscode-dashboard" }` message to the extension host  
**THEN** the extension SHALL identify the phase for demand `vscode-dashboard` from cached state  
**AND** execute the corresponding `/openflow:<phase>` command in a new terminal

**WHEN** the WebView sends a `{ command: "openFile", path: "openspec/specs/vscode-dashboard/spec.md" }` message  
**THEN** the extension SHALL resolve the path relative to workspace root  
**AND** open the file via `code -r` or the fallback API

**WHEN** the WebView sends a `{ command: "refresh" }` message  
**THEN** the extension SHALL re-read `.workflow/state/*.yaml` and re-render the WebView HTML