# FlowMaster Dashboard

A VS Code extension that provides a visual workflow dashboard for the **OpenFlow** demand lifecycle — from design to delivery.

## Features

- **Visual Phase Grid** — Track all 7 phases (design → testcase → development → fix → retest → delivery → closure) at a glance with status indicators and gate review badges.
- **Side Activity Bar** — Browse all demands, create new ones, and jump to any demand's dashboard.
- **One-Click Phase Execution** — Run OpenFlow phase commands (`claude /openflow:<phase>`) directly in VS Code's integrated terminal with a single click.
- **Gate Review** — Approve or reject phase gates without leaving the editor.
- **Artifact Browser** — Click to open any phase's output documents (design, test guides, reports, etc.).
- **Next-Step Suggestions** — After each phase completes, get context-aware recommendations for what to run next.
- **Auto-Refresh** — State changes are picked up automatically every 30 seconds.

## Requirements

- [Claude CLI](https://claude.ai) must be installed and available on `PATH` (used for executing OpenFlow phase commands).
- OpenFlow skills must be installed under `.claude/skills/openflow-*/` in your workspace or home directory.

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `flowmaster.statePath` | `.workflow/state` | Relative path from workspace root to the OpenFlow state directory |
| `flowmaster.autoRefresh` | `true` | Automatically refresh state when dashboard opens |

## Getting Started

1. Install the extension.
2. Open a workspace with OpenFlow workflow files (`.workflow/state/*.yaml`).
3. Click the FlowMaster icon in the activity bar.
4. Select a demand or create a new one.
5. Click **Execute** on any phase to run the corresponding OpenFlow command.

## License

[MIT](LICENSE)
