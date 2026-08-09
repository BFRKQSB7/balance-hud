# Balance HUD v2.2.2

[**中文简体**](./../README.md) | **English**

> A full-featured Claude Code plugin — live HUD status line + API balance monitoring
>
> **Built on [claude-hud](https://github.com/jarrodwatts/claude-hud) by [Jarrod Watts](https://github.com/jarrodwatts) (MIT)**

> ✅ **Commands verified**: `/balance-hud:setup` / `:configure` / `:debug` / `:language` tested on Windows + Git Bash. If a command is missing, register the plugin first (see Method 2 — use a forward-slash path) and report the issue.

Balance HUD merges **claude-hud** (full-featured terminal HUD) with **balance-hud** (API balance monitoring) into one standalone plugin.

> 💡 **API-agnostic**: the HUD works with any API (DeepSeek / Anthropic official / OpenAI-compatible). Only the **DeepSeek balance row** depends on the DeepSeek API — with non-DeepSeek APIs that row auto-hides for a clean claude-hud look.

## Features

### 🖥️ HUD status line (from claude-hud v0.6.0 + balance-hud enhancements)
- **Context health** — live context-usage progress bar with green/yellow/red levels; shows window size `76% (152k/1M)` (`display.contextValue: "both"`)
- **Reasoning effort** — current effort on the model line `◑ high` (`display.showEffortLevel`)
- **Cache effect** — session cache-hit ratio progress bar, high=green / low=red (`display.showCacheEffect`)
- **Usage tracking** — 5h/7d usage limits with reset countdown
- **Tool activity** — running tools (Edit/Read/Grep…), completion counts
- **Agent status** — running sub-agents, model, description, elapsed time
- **Todo progress** — task-list completion
- **Git status** — branch name, dirty state, ahead/behind counts
- **Session info** — session duration, config counts (CLAUDE.md, rules, MCP, hooks)
- **First-line reorder** — `projectLineOrder` reorders first-line segments (model/project/sessionName/…), expanded layout
- **Full paths** — `pathLevels: "full"` shows the full working directory (Windows/UNC/POSIX)
- **Multilingual** — English / Simplified Chinese / Traditional Chinese (`/balance-hud:language`)
- **Highly configurable** — layout, colors, element ordering, merged lines

### 💰 API balance monitoring (from balance-hud v1.1.3, DeepSeek only)
- **Live DeepSeek balance** — 15s polling, real-time balance + consumption tracking
- **Low-balance warning** — default ≤¥5 yellow + red top-up alert, threshold configurable
- **Per-session consumption** — counter resets each launch (PID preemptive lock)
- **Auto-start** — SessionStart hook runs in background (async, non-blocking)

## Quick install

### Method 1: plugin marketplace (recommended)

In Claude Code:

```
/plugin marketplace add BFRKQSB7/balance-hud
/plugin install balance-hud@balance-hud
/balance-hud:setup
```

`/balance-hud:setup` auto-detects platform + shell + runtime, configures statusLine and verifies the HUD.

### Method 2: manual extraction

> ⚠️ **Plugin registration required**: extracting + configuring statusLine alone only shows the HUD — **slash commands (`/balance-hud:*`) will NOT appear**. Register the local plugin in Claude Code for commands to work (see step 2).

Download `balance-hud-v2.2.2.zip` from [Releases](https://github.com/BFRKQSB7/balance-hud/releases):

```bash
# macOS / Linux
unzip "balance-hud-v2.2.2.zip" -d ~/.claude/plugins/

# Windows (PowerShell)
Expand-Archive "balance-hud-v2.2.2.zip" -DestinationPath "$env:USERPROFILE\.claude\plugins\"
```

**Step 1**: configure statusLine in `~/.claude/settings.json` (HUD display):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/balance-hud/dist/index.js"
  }
}
```

**Step 2**: register the plugin (**required for slash commands**). In the Claude Code input box:

```
/plugin marketplace add ~/.claude/plugins/balance-hud
/plugin install balance-hud
```

- The path **must use forward slashes** (backslashes are escaped and break marketplace lookup).
- If asked for a marketplace name, enter `balance-hud-local`.
- **Fully restart Claude Code**; you should see `balance-hud:setup / configure / debug / language` under `/`.
- Registration **copies** the plugin to `~/.claude/plugins/cache/` and registers commands; it does not touch your `statusLine`.

### Method 3: interactive setup

If installed via marketplace, just run `/balance-hud:setup` — it auto-detects platform, shell, runtime path, configures statusLine and verifies the HUD.

## Configuration

Edit `~/.claude/plugins/balance-hud/config.json`, or run `/balance-hud:configure` for interactive setup.

```json
{
  "language": "zh-Hans",
  "lineLayout": "expanded",
  "display": {
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showDuration": true,
    "showConfigCounts": true
  }
}
```

### Low-balance threshold

```bash
# warn when balance ≤ ¥10
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 10

# warn when balance ≤ ¥2
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 2

# disable warning
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 0
```

Default threshold ¥5, persisted in `session_state.json`.

### Disable HUD

```bash
# temporarily (this session)
BALANCE_HUD_DISABLE=1 claude

# legacy env var
CLAUDE_HUD_DISABLE=1 claude
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `DEEPSEEK_API_KEY` | DeepSeek API key (highest priority) |
| `ANTHROPIC_AUTH_TOKEN` | DeepSeek fallback key (bundled with Claude Code) |
| `OPENAI_API_KEY` | OpenAI API key |
| `BALANCE_HUD_DISABLE` | Set to 1 to disable the HUD |
| `CLAUDE_HUD_DISABLE` | Legacy disable var |
| `BALANCE_HUD_ALLOW_EXTRA_CMD` | Allow custom command labels |
| `DEBUG` | Set to `balance-hud` or `*` for debug logs |

## Commands

| Command | Description |
|---------|-------------|
| `/balance-hud:setup` | Auto-detect environment, configure statusLine |
| `/balance-hud:configure` | Interactive HUD config (layout, toggles, colors) |
| `/balance-hud:language` | Switch HUD label language (EN / zh-Hans / zh-Hant) |
| `/balance-hud:debug` | Diagnose HUD wiring, balance daemon, model parsing; simulate render |

## License

Built on open-source projects under the MIT License:

| Project | Author | License | Description |
|---------|--------|---------|-------------|
| [claude-hud](https://github.com/jarrodwatts/claude-hud) | Jarrod Watts | MIT | Full HUD rendering engine (v0.6.0) |
| balance-hud | NYRO | MIT | API balance monitoring + derivative work |

Full license text in [LICENSE](LICENSE). Third-party code list in [NOTICE.md](NOTICE.md).

Changelog (Chinese): see the Chinese section above or the [Releases](https://github.com/BFRKQSB7/balance-hud/releases) page.
