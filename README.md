# Balance HUD

> Claude Code 插件 — API 余额实时监控 + 终端 HUD 进度条

![](https://img.shields.io/badge/version-1.0.0-blue)
![](https://img.shields.io/badge/license-MIT-green)
![](https://img.shields.io/badge/platform-Claude%20Code-orange)

## 功能

- **`/balance` 仪表盘** — Markdown 渲染：进度条、会话消耗、历史趋势
- **终端 HUD** — claude-hud 状态栏实时余额进度条（彩色 ANSI）
- **自动识别** — 扫描环境变量自动发现 DeepSeek / OpenAI / Anthropic Key
- **自动启动** — SessionStart 钩子，Claude Code 启动即后台刷新
- **独立会话** — 每个会话单独追踪消耗，新会话自动归零
- **低余额预警** — 默认 ≤ ¥5 进度条与余额数字变黄，显示充值提醒
- **自定义阈值** — `/balance --warn 10` 自由设置预警线

## 快速安装

### Windows 一键安装

1. 下载 `balance-hud.zip` 和 `install-balance-hud.bat`
2. 放到同一目录，双击 `install-balance-hud.bat`
3. 按提示输入 API Key，完成

### macOS / Linux 手动安装

```bash
# 解压到插件目录
unzip balance-hud.zip -d ~/.claude/plugins/

# 配置 API Key (settings.json)
{
  "env": {
    "DEEPSEEK_API_KEY": "sk-your-key"
  }
}

# 配置 claude-hud 状态栏
{
  "colors": { "label": "brightBlue" },
  "statusLine": {
    "command": "node /你的路径/.claude/plugins/balance-hud/scripts/hud_balance.mjs"
  }
}
```

## 使用

| 命令 | 效果 |
|------|------|
| `/balance` | 详细仪表盘 |
| `/balance deepseek` | 只查 DeepSeek |
| `/balance --reset` | 重置会话消耗 |
| `/balance --warn 10` | 余额 ≤ ¥10 时预警 |
| `/balance --warn 0` | 关闭预警 |

## HUD 状态栏

**正常余额：**

```
DeepSeek 余额 ████████████████████ ¥12.00 | -¥0.00 (0.0%) 12:34:56
```

| 元素 | 颜色 | 说明 |
|------|------|------|
| `DeepSeek 余额` | 蓝色 | 厂商名 + 余额标签 |
| `████████████████████` | 亮绿 | 剩余余额（每格 = 5%） |
| `¥12.00` | 亮绿 | 当前余额 |
| `-¥0.00 (0.0%)` | 红色 + 品红 | 已消耗 |
| `12:34:56` | 橙色 | 刷新时间 |

**低余额预警（≤ ¥5）：**

```
DeepSeek 余额 ██████░░░░░░░░░░░░░░ ¥3.50 | -¥7.53 (68.3%) 12:34:56
⚠️ 余额仅剩 ¥3.50，请及时充值！
```

低余额时进度条和余额数字统一变为**亮黄/深黄**。

## 数据流

```
SessionStart 钩子 (Claude Code 启动)
     │
     └──→ auto_refresh.mjs (每 15s 查询 API)
              │
              └── 写入缓存 ──→ session_state.json
                                 │
               ┌─────────────────┼─────────────────┐
               ↓                                    ↓
        hud_balance.mjs                    check_balance.mjs
        (HUD 状态行, < 1ms)               (/balance 仪表盘)
```

## 环境变量

| 变量 | 平台 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek | API Key（优先） |
| `ANTHROPIC_AUTH_TOKEN` | DeepSeek | 回退（Claude Code 自带） |
| `OPENAI_API_KEY` | OpenAI | 标准 Key |
| `ANTHROPIC_ADMIN_KEY` | Anthropic | Admin Key（`sk-ant-admin-` 前缀） |

## 文件结构

```
balance-hud/
├── .claude-plugin/plugin.json   # 插件元数据
├── skills/balance/SKILL.md      # /balance 命令定义
├── hooks/hooks.json             # SessionStart 自动启动
├── scripts/
│   ├── check_balance.mjs        # 余额查询 + Markdown 仪表盘
│   ├── hud_balance.mjs          # HUD 彩色进度条
│   └── auto_refresh.mjs         # 后台 15s 自动刷新
├── README.md
├── LICENSE
├── session_state.json           # 运行时缓存（自动生成）
└── config.example.json          # claude-hud 配置示例
```

## 许可证

MIT
