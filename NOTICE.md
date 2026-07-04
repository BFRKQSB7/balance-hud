# NOTICE — Third-Party Code

This project includes code from the following third-party open source projects.

---

## claude-hud

- **Repository**: <https://github.com/jarrodwatts/claude-hud>
- **Author**: Jarrod Watts
- **License**: MIT
- **Copyright**: Copyright (c) 2026 Jarrod Watts
- **Version Used**: v0.3.0

### Files Adapted

The entire HUD rendering engine in `dist/` is adapted from claude-hud. Key components:

| Directory / File | Description |
|---|---|
| `dist/render/` | HUD rendering pipeline (layout, colors, ANSI, wrapping) |
| `dist/render/lines/` | Individual line renderers (identity, project, usage, git, agents, tools, todos) |
| `dist/render/session-line.js` | Compact single-line mode |
| `dist/config.js` | Configuration loading and validation |
| `dist/config-reader.js` | Config file discovery and merging |
| `dist/stdin.js` | stdin JSON parsing |
| `dist/transcript.js` | Session transcript JSONL parsing |
| `dist/context-cache.js` | Context percentage caching |
| `dist/i18n/` | Internationalization (en, zh-Hans, zh) |
| `dist/utils/` | Terminal, truncation, sanitize utilities |
| `dist/version.js` | Claude Code version detection |
| `dist/git.js` | Git status parsing |
| `dist/speed-tracker.js` | Response speed tracking |
| `commands/setup.md` | Plugin setup command |
| `commands/configure.md` | Interactive configuration command |
| `.claude-plugin/plugin.json` | Plugin metadata structure |
| `hooks/hooks.json` | Hook definitions |

### Modifications

The balance-hud project adds the following on top of claude-hud:

- **API Balance Monitoring**: `scripts/auto_refresh.mjs`, `scripts/hud_balance.mjs`, `scripts/balance_snapshot.mjs` — DeepSeek/OpenAI/Anthropic balance polling and ANSI display
- **Balance Integration**: `dist/external-usage.js` — balance snapshot loading into HUD context
- **Balance Rendering**: `renderBalanceLine()` in `dist/render/lines/usage.js` — balance label rendering
- **Usage Decoupling**: Usage line separated from Context line; Balance + Usage placed after DeepSeek balance
- **Color Adjustments**: Context bar safe-zone changed from bright blue to bright green
- **Bug Fix**: `MAX_BALANCE_LABEL_LENGTH` 50 → 512 (ANSI escape sequences are invisible width but occupy `string.length`)

---

## Full License Texts

See [LICENSE](LICENSE) for the MIT License covering this project, which includes the original claude-hud copyright.
