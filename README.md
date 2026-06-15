# Balance HUD v1.1

> Claude Code 插件 — API 余额实时监控 + 终端 HUD 进度条

![](https://img.shields.io/badge/version-1.1.0-blue)
![](https://img.shields.io/badge/license-MIT-green)

## 功能

- **终端 HUD** — claude-hud 状态栏实时余额进度条（20 格彩色 ANSI，每格 5%）
- **自动刷新** — SessionStart 钩子，Claude Code 启动即后台 15s 轮询
- **低余额预警** — 默认 ≤ ¥5 进度条变黄 + 充值提醒，可通过 `--warn` 自定义
- **自动识别** — 扫描环境变量自动发现 DeepSeek / OpenAI / Anthropic Key
- **独立会话追踪** — 每次启动重置消耗计数

## 快速安装

### Windows

1. 下载 `balance-hud.zip` 和 `install-balance-hud.bat`，放同一目录
2. 双击 `install-balance-hud.bat`，按提示输入 API Key

### macOS / Linux

```bash
unzip balance-hud.zip -d ~/.claude/plugins/
```

然后在 `~/.claude/settings.json` 配置 API Key 和 statusLine（参考 `config.example.json`）。

## HUD 状态栏

**正常余额 ( > ¥5 )：**

```
DeepSeek 余额 ████████████████████░░░░ ¥13.37 | -¥0.93 (6.5%) 12:34:56
```

| 元素 | 颜色 | 说明 |
|------|------|------|
| `DeepSeek 余额` | 蓝色 | 厂商名 + 标签 |
| `████████████████████` | 亮绿 | 剩余余额 |
| `░░░░` | 深绿 | 已消耗 |
| `¥13.37` | 亮绿 | 当前余额 |
| `-¥0.93 (6.5%)` | 红 + 品红 | 已消耗金额/百分比 |
| `12:34:56` | 橙色 | 刷新时间 |

**低余额预警 ( ≤ ¥5 )：**

```
DeepSeek 余额 ██████░░░░░░░░░░░░░░ ¥3.50 | -¥7.53 (68.3%) 12:34:56
⚠️ 余额仅剩 ¥3.50，请及时充值！
```

低余额时进度条和余额数字统一变为**亮黄/深黄**，并追加红色充值提醒。

## 设置预警阈值

```bash
# 余额 ≤ ¥10 时黄色预警
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 10

# 余额 ≤ ¥2 时黄色预警
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 2

# 关闭预警
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 0
```

默认 ¥5，持久保存在 `session_state.json`。

## 进度条

20 格宽，每格 = 5% 消耗。终端宽度 < 100 时自适应缩小（≥60 → 15 格，<60 → 10 格）。

## 数据流

```
SessionStart 钩子 (Claude Code 启动)
     │
     └──→ auto_refresh.mjs (每 15s 查询 DeepSeek API, PID 单实例锁)
              │
              └── 写入 session_state.json
                       │
                       └── hud_balance.mjs (HUD 状态行, < 1ms, 纯读缓存)
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
plugins/balance-hud/
├── .claude-plugin/plugin.json   # 插件元数据
├── hooks/hooks.json             # SessionStart 自动启动（唯一启动源）
├── scripts/
│   ├── auto_refresh.mjs          # 后台守护进程（15s 轮询 + PID 锁 + --warn）
│   └── hud_balance.mjs           # HUD 彩色进度条渲染
├── session_state.json           # 运行时缓存
├── README.md
└── LICENSE
```

## 变更日志

### v1.1.0
- 精简架构：移除 `/balance` 交互命令，只保留 HUD 核心
- PID 单实例锁：`acquireLock()` 防止重复启动
- `--warn` 阈值设置集成到 `auto_refresh.mjs`
- 统一 `plugins/balance-hud/` 单一数据源，移除旧技能目录
- 默认低余额预警阈值 ¥5

### v1.0.0
- 首次发布：余额仪表盘、HUD 进度条、多平台支持、低余额预警

## 许可证

MIT
