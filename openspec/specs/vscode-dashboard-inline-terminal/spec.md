# VSCode Dashboard Inline Terminal — Specification

## 1. Requirements

### REQ-1: Split Layout with Draggable Divider

The WebView SHALL render a vertical split layout with the card list area in the upper half and a terminal area in the lower half. A draggable divider SHALL separate the two halves. The default split ratio SHALL be 60% upper / 40% lower.

### REQ-2: xterm.js Terminal Rendering

The lower half of the WebView SHALL use xterm.js to render a fully functional terminal. The terminal SHALL support ANSI escape sequences, standard shell colors, and Unicode characters. The terminal SHALL be initialized with the `xterm-addon-fit` and `xterm-addon-web-links` addons.

### REQ-3: Command Execution via child_process.spawn

When the user clicks the "Run" button on a demand card, the WebView SHALL send a `runPhase` message to the Extension Host. The Extension Host SHALL use `child_process.spawn` (not `window.createTerminal`) to execute the command `claude /openflow:<phase> <change-id>`. The spawned process's stdout and stderr SHALL be captured and forwarded to the WebView as terminal output data.

### REQ-4: Per-Demand Terminal Sessions

Each demand (change) SHALL have its own independent terminal session and child process. When the user clicks "Run" on a card for the first time, a new child process SHALL be spawned for that demand. Subsequent clicks on the same card's "Run" button SHALL re-use the same terminal session (killing any existing process first) and spawn a new process.

### REQ-5: Terminal Switching on Card Selection

When the user clicks on a different demand card (or its "Run" button), the terminal area in the lower half SHALL switch to display the terminal session corresponding to that demand. If the newly selected demand has no active terminal session, the terminal area SHALL display a placeholder message "Click 'Run' to start execution for this demand."

### REQ-6: Terminal Resize (xterm-addon-fit)

The terminal SHALL support dynamic resize via the `xterm-addon-fit` addon. When the draggable divider is dragged to change the split ratio, or when the overall WebView panel is resized, the `fit.fit()` function SHALL be called to adjust the terminal's columns and rows. The new `cols` and `rows` values SHALL be sent to the Extension Host via a `terminalResize` message so the child process's PTY size can be updated.

### REQ-7: Process Exit Auto-Cleanup

When a spawned child process exits (either normally or abnormally), the Extension Host SHALL send a `terminalExit` message to the WebView. The WebView SHALL display the exit code in the terminal area and release the terminal session resources. The terminal SHALL remain visible with the final output so the user can review it.

### REQ-8: Error Handling

The extension MUST gracefully handle the following error conditions:

1. **Process start failure** — If `child_process.spawn` fails (e.g., `claude` command not found), the Extension Host SHALL send a `terminalError` message to the WebView. The WebView SHALL display the error message in the terminal area in red text.
2. **Process abnormal exit** — If the child process exits with a non-zero exit code, the `terminalExit` message SHALL include the exit code. The WebView SHALL display "Process exited with code <N>" in yellow text.
3. **xterm rendering failure** — If `xterm.js` fails to initialize (e.g., DOM element not found), the WebView SHALL display a fallback text area "Terminal failed to initialize" in the lower half.
4. **spawn command not found** — If the `claude` binary is not found in PATH, the Extension Host SHALL catch the `ENOENT` error from `spawn` and send a `terminalError` with message "Command 'claude' not found. Please ensure Claude Code is installed and in your PATH."

### REQ-9: Message Protocol Extensions

The WebView-to-Host message protocol SHALL include the following new messages in addition to the existing `refreshState`, `runPhase`, `openFile`, and `openFolder` messages:

| Message Direction | Message Type | Payload | Description |
|---|---|---|---|
| Host -> WebView | `terminalOutput` | `{ changeId: string, data: string }` | Terminal output data (stdout/stderr) |
| WebView -> Host | `terminalResize` | `{ changeId: string, cols: number, rows: number }` | Terminal window resize event |
| Host -> WebView | `terminalExit` | `{ changeId: string, code: number \| null }` | Process exit event |
| Host -> WebView | `terminalError` | `{ changeId: string, message: string }` | Terminal error message |
| WebView -> Host | `switchTerminal` | `{ changeId: string }` | Request to switch terminal view to a specific demand |

### REQ-10: Configuration Items

The extension SHALL register the following VSCode configuration items under the `flowmaster` namespace:

| Configuration Key | Type | Default | Description |
|---|---|---|---|
| `flowmaster.terminal.fontSize` | `number` | `14` | Font size for the inline terminal (px) |
| `flowmaster.terminal.scrollback` | `number` | `1000` | Maximum number of lines to keep in the terminal scrollback buffer |
| `flowmaster.terminal.fontFamily` | `string` | `"Consolas, 'Courier New', monospace"` | Font family for the inline terminal |
| `flowmaster.terminal.defaultShell` | `string` | `""` | Shell to use for the child process (empty string uses system default) |
| `flowmaster.terminal.splitRatio` | `number` | `0.6` | Default split ratio (0.0 = all cards, 1.0 = all terminal) |

### REQ-11: Terminal Session Map

The Extension Host SHALL maintain a `Map<changeId, TerminalSession>` in memory where `TerminalSession` contains:

```typescript
interface TerminalSession {
  childProcess: ChildProcess | null;
  terminalBuffer: string[];           // accumulated output buffer
  isRunning: boolean;
  changeId: string;
  cols: number;
  rows: number;
}
```

When a demand card is clicked and its session exists, the Extension Host SHALL send the full `terminalBuffer` to the WebView so the terminal can replay the output history.

### REQ-12: Dependency Additions

The `package.json` of the vscode-dashboard extension SHALL add the following npm dependencies:

- `xterm` (^5.3.0) — Core terminal emulator
- `xterm-addon-fit` (^0.8.0) — Auto-fit terminal to container size
- `xterm-addon-web-links` (^0.9.0) — URL detection and clickable links in terminal

### REQ-13: Split Divider Interaction

The draggable divider SHALL support the following interactions:

1. **Mouse drag** — User can click and drag the divider vertically to adjust the split ratio
2. **Minimum sizes** — The upper card area SHALL have a minimum height of 100px, and the lower terminal area SHALL have a minimum height of 80px
3. **Cursor change** — When hovering over the divider, the cursor SHALL change to `row-resize`
4. **Visual feedback** — The divider SHALL be a 4px horizontal bar with a contrasting color (using `--vscode-settings-headerForeground` or similar theme variable) and a visible hover state

### REQ-14: Terminal Theme Integration

The xterm.js terminal SHALL use VSCode theme variables for its color scheme. The terminal SHALL read the following CSS variables from the WebView and apply them to the xterm theme:

- `--vscode-terminal-background` — Terminal background color
- `--vscode-terminal-foreground` — Terminal foreground/text color
- `--vscode-terminalCursor-foreground` — Cursor color
- `--vscode-terminal-ansiBlack` through `--vscode-terminal-ansiBrightWhite` — ANSI color palette

If any of these variables are not available, the terminal SHALL fall back to xterm's default theme.

### REQ-15: Multiple Terminal Buffering

When the user switches between demand cards, the Extension Host SHALL NOT discard the terminal buffer for inactive sessions. Each session's output buffer SHALL be preserved in memory. When the user switches back to a previously viewed session, the full buffer SHALL be replayed to the xterm terminal so the user sees the complete history.

---

## 2. Scenarios

### SCN-REQ-1: Default Split Layout Ratio

**GIVEN** the dashboard WebView panel opens for the first time  
**WHEN** the WebView finishes rendering  
**THEN** the upper card list area SHALL occupy 60% of the vertical space  
**AND** the lower terminal area SHALL occupy 40% of the vertical space  
**AND** a 4px draggable divider SHALL be visible between the two areas  
**AND** the divider SHALL have a `row-resize` cursor on hover

### SCN-REQ-2: Drag Divider to Adjust Split Ratio

**GIVEN** the dashboard WebView is rendered with the default 60/40 split  
**WHEN** the user clicks and drags the divider upward by 100 pixels  
**THEN** the upper card area SHALL shrink by 100 pixels  
**AND** the lower terminal area SHALL grow by 100 pixels  
**AND** the terminal SHALL call `fit.fit()` to recalculate columns and rows  
**AND** the WebView SHALL send a `terminalResize` message with the new `cols` and `rows` for the active terminal session

### SCN-REQ-3: Drag Divider Below Minimum Size

**GIVEN** the dashboard WebView is rendered  
**WHEN** the user drags the divider so that the terminal area is less than 80px in height  
**THEN** the divider SHALL stop at the point where the terminal area is exactly 80px  
**AND** the terminal area SHALL NOT be hidden or collapsed

**GIVEN** the dashboard WebView is rendered  
**WHEN** the user drags the divider so that the card area is less than 100px in height  
**THEN** the divider SHALL stop at the point where the card area is exactly 100px  
**AND** the card area SHALL NOT be hidden or collapsed

### SCN-REQ-4: Click Run Shows Terminal Output

**GIVEN** a demand card in phase `design` exists in the card list  
**AND** the lower terminal area shows the placeholder message "Click 'Run' to start execution for this demand."  
**WHEN** the user clicks the "Run" button on that card  
**THEN** the WebView SHALL send a `runPhase` message with `{ changeId: "vscode-dashboard-inline-terminal", phase: "design" }` to the Extension Host  
**AND** the Extension Host SHALL spawn a child process via `child_process.spawn("claude", ["/openflow:design", "vscode-dashboard-inline-terminal"])`  
**AND** the terminal area SHALL clear and start displaying output from the spawned process  
**AND** the card's "Run" button SHALL be disabled and show "Running..."

### SCN-REQ-5: Terminal Output Streams to WebView

**GIVEN** a child process is running for demand `vscode-dashboard-inline-terminal`  
**WHEN** the process writes "Starting design phase..." to stdout  
**THEN** the Extension Host SHALL send a `terminalOutput` message with `{ changeId: "vscode-dashboard-inline-terminal", data: "Starting design phase..." }`  
**AND** the WebView SHALL write "Starting design phase..." to the xterm terminal  
**AND** the text SHALL appear in the terminal at the correct cursor position

### SCN-REQ-6: Switch Card Switches Terminal

**GIVEN** demand card A has an active terminal session with output "Output from A"  
**AND** demand card B has an active terminal session with output "Output from B"  
**WHEN** the user clicks on card B (or its "Run" button)  
**THEN** the terminal area SHALL clear and display "Output from B"  
**AND** the terminal SHALL show the full accumulated output buffer for card B

**WHEN** the user clicks on card A again  
**THEN** the terminal area SHALL clear and display "Output from A"  
**AND** the full output history for card A SHALL be replayed

### SCN-REQ-7: Switch to Card Without Active Session

**GIVEN** demand card A has an active terminal session  
**AND** demand card C has never had a "Run" button clicked  
**WHEN** the user clicks on card C  
**THEN** the terminal area SHALL display the placeholder message "Click 'Run' to start execution for this demand."  
**AND** no terminal session SHALL be created for card C until the user clicks "Run"

### SCN-REQ-8: Terminal Resize on Panel Resize

**GIVEN** the dashboard WebView is rendered with an active terminal session  
**WHEN** the user resizes the VSCode panel (e.g., dragging the sidebar or editor group boundary)  
**THEN** the WebView SHALL call `fit.fit()` on the xterm instance  
**AND** the WebView SHALL send a `terminalResize` message with updated `{ cols, rows }` to the Extension Host  
**AND** the Extension Host SHALL update the child process's PTY size (if applicable) to match the new dimensions

### SCN-REQ-9: Terminal Resize on Divider Drag

**GIVEN** a terminal session is active and displaying output  
**WHEN** the user drags the divider to change the split ratio  
**THEN** `fit.fit()` SHALL be called immediately after the drag completes  
**AND** a `terminalResize` message SHALL be sent with the new `cols` and `rows`  
**AND** the terminal font size SHALL remain unchanged (only the viewport dimensions change)

### SCN-REQ-10: Process Exit Auto-Cleanup

**GIVEN** a child process is running for demand `vscode-dashboard-inline-terminal`  
**WHEN** the process exits with exit code 0  
**THEN** the Extension Host SHALL send a `terminalExit` message with `{ changeId: "vscode-dashboard-inline-terminal", code: 0 }`  
**AND** the WebView SHALL display "Process exited with code 0" in the terminal area  
**AND** the card's "Run" button SHALL be re-enabled  
**AND** the terminal session SHALL remain in the session map for replay

### SCN-REQ-11: Process Abnormal Exit

**GIVEN** a child process is running for demand `vscode-dashboard-inline-terminal`  
**WHEN** the process exits with exit code 1  
**THEN** the Extension Host SHALL send a `terminalExit` message with `{ changeId: "vscode-dashboard-inline-terminal", code: 1 }`  
**AND** the WebView SHALL display "Process exited with code 1" in yellow text  
**AND** the card's "Run" button SHALL be re-enabled  
**AND** the terminal SHALL retain all output produced before the abnormal exit

### SCN-REQ-12: Process Start Failure (Command Not Found)

**GIVEN** the `claude` command is not installed or not in PATH  
**WHEN** the user clicks the "Run" button on a demand card  
**THEN** the Extension Host SHALL catch the `ENOENT` error from `child_process.spawn`  
**AND** the Extension Host SHALL send a `terminalError` message with `{ changeId: "...", message: "Command 'claude' not found. Please ensure Claude Code is installed and in your PATH." }`  
**AND** the WebView SHALL display the error message in red text in the terminal area  
**AND** the card's "Run" button SHALL be re-enabled

### SCN-REQ-13: xterm Rendering Failure

**GIVEN** the WebView DOM is in an unexpected state (e.g., the terminal container element is missing)  
**WHEN** the WebView attempts to initialize xterm.js  
**AND** xterm initialization throws an error  
**THEN** the WebView SHALL display the fallback text "Terminal failed to initialize" in the lower half  
**AND** the WebView SHALL send an `error` message to the Extension Host with the initialization error details

### SCN-REQ-14: Configuration Item — Font Size

**GIVEN** the user has set `flowmaster.terminal.fontSize` to `18` in VSCode settings  
**WHEN** the dashboard WebView panel loads  
**THEN** the xterm terminal SHALL render with font size 18px  
**AND** all subsequent terminal output SHALL use font size 18px

**GIVEN** the terminal is already rendered with font size 14  
**WHEN** the user changes `flowmaster.terminal.fontSize` from `14` to `20`  
**AND** the user clicks the "Refresh" button on the dashboard  
**THEN** the xterm terminal SHALL render with font size 20px after the refresh

### SCN-REQ-15: Configuration Item — Scrollback

**GIVEN** the user has set `flowmaster.terminal.scrollback` to `5000` in VSCode settings  
**WHEN** the dashboard WebView panel loads  
**THEN** the xterm terminal SHALL be initialized with a scrollback buffer of 5000 lines  
**AND** the terminal SHALL allow scrolling up to 5000 lines of history

### SCN-REQ-16: Configuration Item — Split Ratio

**GIVEN** the user has set `flowmaster.terminal.splitRatio` to `0.5` in VSCode settings  
**WHEN** the dashboard WebView panel loads  
**THEN** the upper card area SHALL occupy 50% of the vertical space  
**AND** the lower terminal area SHALL occupy 50% of the vertical space

### SCN-REQ-17: Multiple Sessions — Independent Processes

**GIVEN** the user clicks "Run" on demand card A  
**AND** a child process is spawned for card A  
**WHEN** the user clicks "Run" on demand card B (without stopping card A's process)  
**THEN** a second child process SHALL be spawned for card B  
**AND** process A and process B SHALL run independently  
**AND** the terminal area SHALL display the output of card B (the currently selected card)  
**AND** card A's process SHALL continue running in the background

### SCN-REQ-18: Re-Run on Same Card Kills Previous Process

**GIVEN** demand card A has a running child process  
**WHEN** the user clicks the "Run" button on card A again  
**THEN** the existing child process for card A SHALL be killed (SIGTERM)  
**AND** a new child process SHALL be spawned for card A  
**AND** the terminal area SHALL clear and start displaying output from the new process  
**AND** the terminal buffer for card A SHALL be reset to empty

### SCN-REQ-19: Terminal Theme Matches VSCode Theme

**GIVEN** the user has a dark VSCode theme with `terminal.background: #1e1e1e`  
**WHEN** the dashboard WebView panel loads  
**THEN** the xterm terminal background SHALL be `#1e1e1e`  
**AND** the xterm terminal foreground SHALL match the `terminal.foreground` color from the theme  
**AND** ANSI color codes SHALL match the theme's ANSI color palette

**GIVEN** the user switches from a dark theme to a light theme  
**WHEN** the dashboard is refreshed (or the WebView is reopened)  
**THEN** the xterm terminal SHALL use the light theme's colors

### SCN-REQ-20: WebView Panel Resize Triggers Fit

**GIVEN** the dashboard is shown in a VSCode editor tab  
**WHEN** the user drags the editor tab to a different panel (e.g., from a narrow side panel to the main editor area)  
**THEN** the WebView SHALL detect the resize  
**AND** `fit.fit()` SHALL be called to adjust the terminal dimensions  
**AND** a `terminalResize` message SHALL be sent with the updated `cols` and `rows`

### SCN-REQ-21: Web Links in Terminal Output

**GIVEN** a child process outputs a URL such as `https://github.com/user/repo`  
**WHEN** the output appears in the xterm terminal  
**THEN** the URL SHALL be rendered as a clickable link  
**AND** when the user clicks the link, it SHALL open in the default browser (via VSCode's `vscode.env.openExternal`)

### SCN-REQ-22: Terminal Buffer Preservation on Phase Completion

**GIVEN** demand card A has completed execution with output "Phase complete"  
**WHEN** the user switches to card B and runs a new phase  
**THEN** card A's terminal buffer SHALL be preserved in memory  
**WHEN** the user switches back to card A  
**THEN** the terminal SHALL display "Phase complete" and all prior output from card A's session

### SCN-REQ-23: WebView Lifecycle — Panel Hidden and Revealed

**GIVEN** the dashboard WebView panel is open with an active terminal session  
**WHEN** the user switches to another VSCode tab (dashboard panel is hidden)  
**THEN** the child process SHALL continue running in the background  
**AND** the terminal output buffer SHALL continue accumulating

**WHEN** the user switches back to the dashboard tab  
**THEN** the terminal SHALL replay all buffered output that was accumulated while hidden  
**AND** the terminal SHALL display the current state

### SCN-REQ-24: Error — Spawn Command Not Found

**GIVEN** the `claude` binary is not installed  
**WHEN** the user clicks "Run" on a demand card  
**THEN** the Extension Host SHALL receive an `ENOENT` error from `child_process.spawn`  
**AND** the Extension Host SHALL NOT crash or throw an unhandled exception  
**AND** a `terminalError` message SHALL be sent to the WebView  
**AND** the WebView SHALL display the error in red text  
**AND** the card's "Run" button SHALL be re-enabled

### SCN-REQ-25: Configuration — Default Shell Override

**GIVEN** the user has set `flowmaster.terminal.defaultShell` to `"powershell.exe"`  
**WHEN** the user clicks "Run" on a demand card  
**THEN** the Extension Host SHALL spawn the child process with `shell: "powershell.exe"`  
**AND** the command execution SHALL succeed within the PowerShell environment