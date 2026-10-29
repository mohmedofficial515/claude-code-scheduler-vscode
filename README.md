# Claude Code Scheduler for VS Code

**Schedule Claude Code tasks without leaving your editor. A compact control panel for [Claude Code Scheduler](https://github.com/mohmedofficial515/claude-code-scheduler), right inside VS Code.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![VS Code 1.94+](https://img.shields.io/badge/VS%20Code-1.94%2B-007ACC.svg)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078D6.svg)
![UI: Arabic RTL](https://img.shields.io/badge/UI-Arabic%20(RTL)-2EA44F.svg)

This extension puts a scheduling panel next to Claude Code. From the panel you can pick when your task should run, edit the task itself, start or stop the background watcher, and follow a live countdown and log. It does not change Claude Code's chat in any way.

The interface is written in **Arabic** with a full **right-to-left** layout.

---

## Features

- **One-click access.** A clock button sits in the Claude Code editor toolbar, with a permanent status-bar entry and a Command Palette command as alternatives.
- **Two scheduling modes:**
  - **On usage-window reset:** run the task each time your 5-hour usage window renews, using the exact reset time reported by Claude Code.
  - **At a specific date and time:** a native date/time picker, with repeat options for once, hourly, daily, weekly, or every *N* hours.
- **Built-in task editor.** Write or change the task in the panel. It is saved to the scheduler's `task.md`.
- **Live status.** Shows a running/stopped badge, the next scheduled run, a second-by-second countdown, and the tail of today's log, refreshed automatically.
- **Instant control.** *Save & Start* applies the new settings and restarts the watcher immediately, and *Stop* terminates it at once.
- **No build step.** Plain JavaScript, so you can run it straight from source.

## Requirements

- Windows 10 or 11
- VS Code 1.94 or later
- The [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) VS Code extension, signed in
- A local clone of **[claude-code-scheduler](https://github.com/mohmedofficial515/claude-code-scheduler)**. This extension is its front end and performs no scheduling of its own.

## Getting started

### 1. Clone both repositories

```powershell
git clone https://github.com/mohmedofficial515/claude-code-scheduler.git
git clone https://github.com/mohmedofficial515/claude-code-scheduler-vscode.git
```

Configure `projectDir` in `claude-code-scheduler\config.json` as described in the [scheduler's README](https://github.com/mohmedofficial515/claude-code-scheduler#configuration).

### 2. Run the extension

**From source (development mode):**

1. Open the `claude-code-scheduler-vscode` folder in VS Code.
2. Press <kbd>F5</kbd>. An *Extension Development Host* window opens with the extension loaded.

**As a packaged extension:**

```powershell
npm install -g @vscode/vsce
cd claude-code-scheduler-vscode
vsce package
code --install-extension .\claude-code-scheduler-vscode-0.2.0.vsix
```

### 3. Point it at the scheduler

Open **Settings** and set **`claudeCompanion.schedulerDir`** to the folder where you cloned `claude-code-scheduler`, for example `C:\tools\claude-code-scheduler`.

## Opening the panel

All three entry points open the same panel beside the active editor:

| Entry point | Where |
|---|---|
| **Clock button** | Editor toolbar of the Claude Code tab, shown when Claude Code is open as an editor tab (its default layout). |
| **Status bar** | **⏰ جدولة كلود** on the right side of the status bar. Always visible. |
| **Command Palette** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, then search for **Claude Code Scheduler**. |

## Panel overview

| Section | What it does |
|---|---|
| **Status** | Running/stopped badge, active mode, next scheduled run, and a live countdown. |
| **Schedule type** | Choose *on usage-window reset* or *specific date and time*, with a repeat interval. |
| **Task** | Edit the prompt Claude Code will receive. It is saved to `task.md` and re-read before every run. |
| **Actions** | **Save & Start**, **Stop**, **Open task in editor**, **Open Claude chat**, and **Refresh**. |
| **Log** | The last 40 lines of the scheduler's log for today. |

## Settings

| Setting | Description |
|---|---|
| `claudeCompanion.schedulerDir` | Folder containing `claude-code-scheduler` (`run-watcher.ps1`, `config.json`, `task.md`). |

## How it works

The extension has no background process of its own. It works directly with the scheduler folder:

- **Configuration:** reads and writes `config.json` (`mode` and `schedule`) and `task.md`.
- **Start:** launches `start-watcher.ps1` in a hidden PowerShell process.
- **Stop:** terminates the watcher using the PID it records in `watcher.pid`, with no waiting period.
- **Status:** checks whether that PID is alive, and reads the next run time from the scheduler's daily log.

## Notes

- VS Code does not allow one extension to place UI *inside* another extension's webview. That is why the clock button lives in the editor toolbar around the Claude Code tab, the closest permitted location. If you use Claude Code in the sidebar, open the panel from the status bar or the Command Palette instead.
- By default the scheduler runs Claude Code with `--dangerously-skip-permissions`. Read the scheduler's [security considerations](https://github.com/mohmedofficial515/claude-code-scheduler#security-considerations) before you start it.

## License

Released under the [MIT License](LICENSE).

---

<sub>This is an independent community project. It is not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.</sub>
