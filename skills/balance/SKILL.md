---
name: balance
description: >
  Real-time API balance monitoring with per-session consumption tracking.
  Use /balance to view a rich dashboard with progress bars, session usage,
  and historical trends. Supports DeepSeek, OpenAI, and Anthropic.
user-invocable: true
---

# Balance HUD — API 余额监控

实时查询 API 账户余额，追踪当前会话消耗，终端 HUD 进度条。

## 触发方式

| 用户输入 | 行为 |
|----------|------|
| `/balance` | 详细仪表盘（余额进度条、会话消耗、历史趋势） |
| `/balance deepseek` | 只查询 DeepSeek |
| `/balance openai` | 只查询 OpenAI |
| `/balance anthropic` | 只查询 Anthropic |
| `/balance --reset` | 重置会话状态 |
| `/balance --warn 10` | 设置低余额预警阈值（默认 ¥5） |

## 执行流程

### 余额查询 `/balance`

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/check_balance.mjs --json
```

用 `--json` 获取结构化数据后，渲染为 Markdown 仪表盘：

```
## 💰 DeepSeek — ¥12.21
███████████████████░  **4.5%** 已消耗
| 当前余额 | 已消耗 | 初始余额 | 会话时长 |
|----------|--------|----------|----------|
| ¥12.21 | -¥0.58 (4.5%) | ¥12.79 | 26m |
```

### HUD 状态栏

终端底部自动显示余额进度条（需配合 claude-hud 插件）：

```
DeepSeek █████████░ 余额 ¥12.16 | -¥0.63 (4.9%) 20:34:27
```

## 支持的平台

| 平台 | 余额查询 | 实时刷新 | 备注 |
|------|----------|----------|------|
| DeepSeek | ✅ | ✅ 每 15s | 公开余额 API |
| OpenAI | ⚠️ | ❌ | 无余额 API；Admin Key 可查成本 |
| Anthropic | ⚠️ | ❌ | 需 Admin Key（sk-ant-admin- 前缀） |

## 环境变量

| 变量 | 平台 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek（优先） |
| `ANTHROPIC_AUTH_TOKEN` | DeepSeek（回退） |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_ADMIN_KEY` | Anthropic（Admin Key） |

## 低余额预警

余额 ≤ 阈值（默认 ¥5）时，HUD 进度条自动切换为黄色，余额数字变红，并显示充值提醒：

```
DeepSeek █░░░░░░░░░░░░░░░░░░░ 余额 ¥3.50 | -¥9.29 (72.6%) 20:34:27
⚠️ 余额仅剩 ¥3.50，请及时充值！
```

自定义阈值：

```bash
# 设置为 ¥10 预警
/balance --warn 10

# 设置为 ¥2 预警
/balance --warn 2
```

阈值存储在 `session_state.json` 的 `_warn_threshold` 字段中，持久有效。

## 命令参考

```bash
# 完整仪表盘（JSON → Agent 渲染 Markdown）
node ${CLAUDE_PLUGIN_ROOT}/scripts/check_balance.mjs --json

# 单个 provider
node ${CLAUDE_PLUGIN_ROOT}/scripts/check_balance.mjs --provider deepseek

# HUD 状态行（缓存数据，无 HTTP）
node ${CLAUDE_PLUGIN_ROOT}/scripts/hud_balance.mjs

# 后台自动刷新（由 SessionStart 钩子自动启动）
node ${CLAUDE_PLUGIN_ROOT}/scripts/auto_refresh.mjs

# 重置会话状态
node ${CLAUDE_PLUGIN_ROOT}/scripts/check_balance.mjs --reset
```
