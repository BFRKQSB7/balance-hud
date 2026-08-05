---
description: Diagnose balance-hud — wiring, provider, model name, balance snapshot, daemon and watchdog state, plus a simulated statusline render
allowed-tools: Bash, Read, Write
---

# Diagnose Balance HUD

Run the self-diagnostic that mirrors exactly what Claude Code invokes on every
statusline refresh, then fix whatever it flags.

## Step 1: Run diagnostics

```bash
node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/balance-hud/scripts/hud_debug.mjs"
```

The report covers:

| Section | What it verifies |
|---------|------------------|
| Provider 分类 | official Anthropic / DeepSeek / local proxy (ccswitch) / relay |
| `isDeepSeekEnv` | whether the DeepSeek balance row should appear at all |
| statusLine 接线 | `statusLine` present in `settings.json` and its target file exists |
| 插件 | version + all required files present |
| HUD 配置 | `config.json` parses (else defaults) |
| 余额快照 | `balance_usage.json` freshness + whether it should display |
| 余额 daemon | `auto_refresh` running? stale pid file? |
| statusLine 看门狗 | `fix_statusline --watch` running + startup item present |
| 模拟渲染 | end-to-end render with a synthetic statusline stdin payload |

## Step 2: Interpret ✗ (problem) lines

Fix each reported problem in order of impact:

1. **`statusLine.command` missing** — `settings.json` was rewritten (e.g. by
   ccswitch) and the statusline was dropped, so Claude Code never invokes the
   HUD. Run the guard once:
   ```bash
   node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/balance-hud/scripts/fix_statusline.mjs"
   ```
   If the watchdog (`fix_statusline --watch`) is not running either, it will
   recur. Start it (Windows startup item is at
   `%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\balance-hud-statusline.vbs`).

2. **statusLine target ✗ 不存在** — the command points at a file that no longer
   exists (e.g. plugin was reinstalled to a different path). Re-run
   `/balance-hud:setup` or correct `statusLine.command` in `settings.json`.

3. **模型显示角色名而非真实模型** — only relevant on third-party relays
   (OpenCode Go etc.). The HUD resolves the real model via
   `ANTHROPIC_DEFAULT_<ROLE>_MODEL_NAME` env vars; if the report shows the role
   (`claude-sonnet-4-6`) instead of the real model, confirm the env mapping is
   set for that role and that `dist/stdin.js` `resolveEnvModelAlias` is present.

4. **余额 daemon 未运行 (DeepSeek 环境)** — the SessionStart hook didn't start
   `auto_refresh`, so the balance row will go stale and hide after the 5-minute
   freshness window. Verify the plugin is enabled (`/plugin` list) or start it
   manually: `node "<plugin>/scripts/auto_refresh.mjs"`.

5. **看门狗 ✗ 未运行** — ccswitch rewrites to `settings.json` will drop
   `statusLine` again. Start the watchdog (see item 1) and confirm the startup
   item exists.

6. **模拟渲染 ✗ 失败** — the HUD engine errors on a synthetic payload. Reproduce
   by piping the payload manually:
   ```bash
   echo '<payload>' | node "<plugin>/dist/index.js"
   ```
   Capture the error output and fix, or report it.

## Step 3: Verify

Re-run Step 1 — the report should have no `✗` lines (or only expected ones for
the current provider). For a quick check use `--short`:

```bash
node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/balance-hud/scripts/hud_debug.mjs" --short
```

Expected when healthy on a third-party relay:
`statusline:OK | model:deepseek-v4-flash | balance:off | issues:0`

## Notes

- The diagnostic is read-only: it never modifies `settings.json`, config, or the
  snapshot. Fixes are applied explicitly per Step 2.
- A stale **pid file** (`✗ pid 文件残留`) is harmless — the next daemon start
  removes it — but can be deleted manually.
