# Balance HUD v2.2.1

> Claude Code 全功能插件 — 实时 HUD 状态栏 + API 余额监控
>
> **基于 [claude-hud](https://github.com/jarrodwatts/claude-hud) by [Jarrod Watts](https://github.com/jarrodwatts) (MIT) 开发**

![](https://img.shields.io/badge/version-2.2.1-blue)
![](https://img.shields.io/badge/license-MIT-green)
![](https://img.shields.io/badge/based%20on-claude--hud%20v0.6.0-orange)

> ✅ **命令已实测**：`/balance-hud:setup` / `:configure` / `:debug` / `:language` 四个斜杠命令已在 Windows + Git Bash 完成实测。若命令不可用，请先按「方式二」注册插件（含正斜杠路径），并反馈问题。

Balance HUD 将 **claude-hud** (全功能终端 HUD 状态栏) 与 **balance-hud** (API 余额实时监控) 整合为一个独立运行的插件。

> 💡 **与 API 无关**：HUD 状态栏在任意 API 下均可用（DeepSeek / Anthropic 官方 / OpenAI 兼容等）。仅 **DeepSeek 余额行** 依赖 DeepSeek API — 使用非 DeepSeek API 时该行整行自动隐藏，呈现纯净的 claude-hud 状态栏。

## 功能

### 🖥️ HUD 状态栏 (来自 claude-hud v0.6.0 + balance-hud 增强)
- **上下文健康度** — 实时上下文使用率进度条，绿/黄/红三级预警；可显示窗口大小 `76% (152k/1M)` (`display.contextValue: "both"`)
- **推理力度** — 模型行显示当前 reasoning effort `◑ high` (`display.showEffortLevel`)
- **缓存效果** — 会话缓存命中占比进度条，高命中=绿、低命中=红 (`display.showCacheEffect`)
- **用量监控** — 5小时/7天用量限制显示，含重置倒计时
- **工具活动追踪** — 当前运行的 Tools (Edit/Read/Grep 等)，完成计数
- **Agent 状态** — 子 Agent 运行状态、模型、描述、耗时
- **Todo 进度** — 任务列表完成进度显示
- **Git 状态** — 分支名、脏状态、ahead/behind 提交数
- **会话信息** — 会话时长、配置计数 (CLAUDE.md, rules, MCP, hooks)
- **首行重排** — `projectLineOrder` 自定义首行各段顺序（model/project/sessionName/…），展开式首行生效
- **完整路径** — `pathLevels: "full"` 显示完整工作目录（Windows/UNC/POSIX 均兼容）
- **多语言** — 英文 / 简体中文 / 繁体中文 切换（`/balance-hud:language`）
- **高度可配** — 布局、颜色、元素排序、合并行等全部可自定义

### 💰 API 余额监控 (来自 balance-hud v1.1.3, 仅 DeepSeek)
- **DeepSeek 实时余额** — 15s 自动轮询，实时余额 + 消耗追踪
- **低余额预警** — 默认 ≤ ¥5 黄色提醒 + 红色充值警告，阈值可配
- **会话独立消耗** — 每次启动重置计数 (PID 抢占式锁)
- **自动启动** — SessionStart 钩子，Claude Code 启动即后台运行 (async 不阻塞)

## 快速安装

### 方式一：插件市场安装 (推荐)

在 Claude Code 中运行：

```
/plugin marketplace add BFRKQSB7/balance-hud
/plugin install balance-hud@balance-hud
/balance-hud:setup
```

`/balance-hud:setup` 自动检测平台 + Shell + 运行时，配置 statusLine 并验证 HUD。

### 方式二：手动解压安装

> ⚠️ **必须注册插件**：仅解压 + 配置 statusLine 只能显示 HUD，**斜杠命令（`/balance-hud:*`）不会出现**。要让命令生效，必须在 Claude Code 里把本地插件注册进插件系统（见步骤 2）。

从 [Releases](https://github.com/BFRKQSB7/balance-hud/releases) 下载 `balance-hud-v2.2.1.zip`：

```bash
# macOS / Linux
unzip "balance-hud-v2.2.1.zip" -d ~/.claude/plugins/

# Windows (PowerShell)
Expand-Archive "balance-hud-v2.2.1.zip" -DestinationPath "$env:USERPROFILE\.claude\plugins\"
```

**步骤 1**：在 `~/.claude/settings.json` 中配置 statusLine（HUD 显示）：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/balance-hud/dist/index.js"
  }
}
```

**步骤 2**：注册插件（**斜杠命令必需**）。在 Claude Code 输入框运行：

```
/plugin marketplace add C:/Users/NYRO/.claude/plugins/balance-hud
/plugin install balance-hud
```

- 路径**必须用正斜杠**（反斜杠会被转义导致 marketplace 找不到）。
- 若提示输入 marketplace 名称，填 `balance-hud-local`。
- 完成后**完全重启 Claude Code**，输入 `/` 应能看到 `balance-hud:setup / configure / debug / language`。
- 该注册会**复制**插件到 `~/.claude/plugins/cache/` 并登记命令；不会改动你的 `statusLine`。

### 方式三：交互式设置命令

如果插件已通过 marketplace 安装，直接运行 `/balance-hud:setup` — 自动检测平台、Shell、运行时路径，配置 statusLine 并验证 HUD。

## HUD 状态栏预览

### 默认展开布局 (3行)

```
[Opus] │ my-project git:(main*)
Context ████████░░  76% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
DeepSeek ¥13.37 | -¥0.93 (6.5%) 12:34:56
```

### 紧凑布局 (1行)

```
[Opus] ████████░░ 76% | my-project git:(main*) | 5h: 25% | ⏱️ 5m │ DeepSeek ¥13.37
```

### 低余额预警

```
[Opus] │ my-project git:(main*)
Context ██████░░░░ 55% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
⚠️ DeepSeek ¥3.50 | -¥7.53 (68.3%) — 请及时充值！
```

### 非 DeepSeek API (claude-hud 外观)

使用非 DeepSeek API（如 Anthropic 官方、OpenAI 兼容等）时，DeepSeek 余额行整行隐藏，HUD 呈现纯净的 claude-hud 状态栏：

```
[Opus] │ my-project git:(main*)
Context ████████░░  76%
Usage ██░░░░░░░░ 25% (1h 30m / 5h)
```

## 配置

### 基础配置

编辑 `~/.claude/plugins/balance-hud/config.json`，或运行 `/balance-hud:configure` 进入交互式配置。

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

### 低余额预警阈值

```bash
# 余额 ≤ ¥10 时预警
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 10

# 余额 ≤ ¥2 时预警
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 2

# 关闭预警
node ~/.claude/plugins/balance-hud/scripts/auto_refresh.mjs --warn 0
```

默认阈值 ¥5，持久保存在 `session_state.json`。

### 禁用 HUD

```bash
# 临时禁用 (本次会话)
BALANCE_HUD_DISABLE=1 claude

# 或兼容旧环境变量
CLAUDE_HUD_DISABLE=1 claude
```

## 数据流

```
SessionStart 钩子 (Claude Code 启动)
     │
     ├──→ auto_refresh.mjs (后台进程, 每 15s 查询 DeepSeek API)
     │         │
     │         ├── 有 DeepSeek Key → 轮询余额 → 写入 balance_usage.json (含余额行)
     │         └── 无 DeepSeek Key (非 DeepSeek API) → 杀旧守护进程 + 清空余额快照 → 退出
     │
     └──→ Claude Code 每 ~300ms 调用 statusLine
               │
               └──→ dist/index.js (HUD 引擎, 与 API 无关)
                         │
                         ├── stdin JSON (模型, 上下文, Token)
                         ├── transcript JSONL (工具, Agent, Todo)
                         ├── config 文件 (MCP, rules, hooks)
                         ├── balance_usage.json (余额标签, 自动检测; 无余额数据则隐藏余额行)
                         │
                         └──→ stdout → 多行 HUD 状态栏
```

非 DeepSeek API 会话：`auto_refresh.mjs` 无 DeepSeek Key 时接管 PID 锁（杀掉上个 DeepSeek 会话残留的守护进程）并清空余额快照，确保余额行立即消失，HUD 其余部分不受影响。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key (优先级最高) |
| `ANTHROPIC_AUTH_TOKEN` | DeepSeek 回退 Key (Claude Code 自带) |
| `OPENAI_API_KEY` | OpenAI API Key |
| `BALANCE_HUD_DISABLE` | 设为 1 禁用 HUD |
| `CLAUDE_HUD_DISABLE` | 兼容旧版禁用变量 |
| `BALANCE_HUD_ALLOW_EXTRA_CMD` | 允许自定义命令标签 |
| `DEBUG` | 设为 `balance-hud` 或 `*` 开启调试日志 |

## 文件结构

```
plugins/balance-hud/
├── .claude-plugin/
│   ├── plugin.json              # 插件元数据
│   └── marketplace.json         # 市场条目
├── hooks/
│   └── hooks.json               # SessionStart 自动启动守护进程
├── dist/                        # HUD 引擎 (编译后的 JS)
│   ├── index.js                 # 入口点
│   ├── config.js                # 配置加载/验证
│   ├── stdin.js                 # stdin JSON 解析
│   ├── transcript.js            # 会话 JSONL 解析
│   ├── render/                  # 渲染管线
│   │   ├── index.js             # 主渲染协调器
│   │   ├── session-line.js      # 紧凑模式单行
│   │   ├── tools-line.js        # 工具活动
│   │   ├── agents-line.js       # Agent 状态
│   │   ├── todos-line.js        # Todo 进度
│   │   └── lines/               # 各行渲染器
│   ├── i18n/                    # 国际化 (en, zh-Hans, zh)
│   ├── utils/                   # 工具函数
│   └── ...
├── scripts/
│   ├── auto_refresh.mjs         # 余额刷新守护进程 (15s 轮询 + PID 锁 + --warn)
│   ├── hud_balance.mjs          # 余额 HUD 渲染 (ANSI 彩色, 独立可用)
│   └── balance_snapshot.mjs     # 余额快照生成器
├── commands/
│   ├── setup.md                 # /balance-hud:setup 安装配置命令
│   └── configure.md             # /balance-hud:configure 交互式配置命令
├── config.json                  # 默认 HUD 配置
├── session_state.json           # 余额运行时缓存
├── balance_usage.json           # HUD 余额快照 (自动生成)
├── README.md
└── LICENSE
```

## 命令

| 命令 | 说明 |
|------|------|
| `/balance-hud:setup` | 自动检测环境，配置 statusLine |
| `/balance-hud:configure` | 交互式 HUD 配置 (布局、功能开关、颜色等) |
| `/balance-hud:language` | 一键切换 HUD 标签语言 (英文 / 简体中文 / 繁体中文) |
| `/balance-hud:debug` | 诊断 HUD 接线、余额守护进程、模型解析、模拟渲染 |

## 颜色说明 (余额行)

| 元素 | 颜色 | 说明 |
|------|------|------|
| `DeepSeek` | 蓝色 | 厂商标签 |
| `¥13.37` | 亮绿 / 亮黄 | 当前余额 (低余额变黄) |
| `-¥0.93` | 红色 | 已消耗金额 |
| `(6.5%)` | 品红 | 消耗百分比 |
| `12:34:56` | 橙色 | 刷新时间 |

## 变更日志

### v2.2.1
- **修复**：数据文件路径分叉 — `balance_usage.json` / `session_state.json` / `.auto_refresh_pid` 统一到稳定目录 `~/.claude/plugins/balance-hud/`（与 `config.json` 一致）。此前 marketplace 安装后引擎/守护进程跑 cache 副本、诊断与 `--warn` 脚本跑直接副本，读写两份不同数据，导致余额阈值设置和诊断结果与 HUD 实际显示失配
- **修复**：`commands/debug.md` 硬编码 `C:/Users/NYRO/...` 绝对路径 → 可移植的 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` 形式
- **测试**：四个斜杠命令（`/balance-hud:setup` / `:configure` / `:debug` / `:language`）完成实测

### v2.2.0 (预览版)
- **新增**：上下文窗口大小显示 — `display.contextValue: "both"` → `76% (152k/1M)`
- **新增**：推理力度显示 — `display.showEffortLevel` → 模型行 `◑ high`（跟随上游 v0.6.0：移除 ps 父进程回退，仅从 stdin 读取）
- **新增**：缓存效果行 — `display.showCacheEffect` → 会话缓存命中占比，高命中=绿 (`Cache Effect ██████████ 98%`)
- **新增**：繁体中文 — `language: "zh-Hant" | "zh-TW"`（与英文/简体中文并列）
- **新增**：`pathLevels: "full"` — 显示完整工作目录（Windows/UNC/POSIX 兼容，移植上游 v0.6.0 `formatProjectPath`）
- **新增**：`projectLineOrder` — 首行各段重排（model/project/advisor/sessionName/version/extra/duration/cost/speed），展开式首行生效
- **新增**：语言切换命令 `/balance-hud:language`；`/balance-hud:debug` 命令收录进 README
- **修复**：i18n 类型补 `label.cacheEffect` key
- **文档**：手动安装必须注册插件（`/plugin marketplace add` + `/plugin install`）才能使用斜杠命令
- ⚠️ **预览说明**：插件注册后的斜杠命令尚未实测

### v2.1.0
- **新增**：HUD 状态栏与 API 无关 — 任意 API (DeepSeek / Anthropic 官方 / OpenAI 兼容) 下均正常显示，非 DeepSeek 时余额行整行隐藏 (claude-hud 外观)
- **修复**：非 DeepSeek 会话 (无 DeepSeek Key) 自动接管 PID 锁并清空余额快照，防止残留的 DeepSeek 余额行显示
- **优化**：用量行补回 `Usage` / `用量` 标签 (修复 expanded 布局用量行无标签问题)

### v2.0.0
- **整合**：claude-hud v0.3.0 全功能 HUD 引擎 + balance-hud v1.1.3 余额监控
- **新增**：全功能终端 HUD 状态栏 (上下文、工具、Agent、Todo、Git、用量)
- **新增**：多语言支持 (英文/中文)
- **新增**：交互式配置命令 `/balance-hud:configure`
- **新增**：余额数据自动集成到 HUD 状态栏
- **保留**：SessionStart 自动启动余额监控守护进程
- **保留**：低余额预警 (≤ ¥5 黄色 + 红色提醒)
- **保留**：PID 抢占式锁 (新会话自动杀旧进程)

### v1.1.3 (balance-hud)
- Windows 兼容性修复
- `"async": true` 原生支持

### v1.1.0 (balance-hud)
- 精简架构，PID 单实例锁
- `--warn` 阈值设置

## 许可证

本项目基于以下开源项目构建，遵循 MIT License：

| 项目 | 作者 | 许可证 | 说明 |
|------|------|--------|------|
| [claude-hud](https://github.com/jarrodwatts/claude-hud) | Jarrod Watts | MIT | 全功能 HUD 渲染引擎 (v0.6.0) |
| balance-hud | NYRO | MIT | API 余额监控 + 二次开发 |

完整许可证文本见 [LICENSE](LICENSE)。第三方代码清单见 [NOTICE.md](NOTICE.md)。

## 致谢

- **[claude-hud](https://github.com/jarrodwatts/claude-hud)** by [Jarrod Watts](https://github.com/jarrodwatts) — 全功能终端 HUD 状态栏引擎。本项目的 HUD 渲染管线（`dist/render/`、`dist/config.js`、国际化等）基于 claude-hud v0.6.0 开发。
- **[Claude Code](https://claude.ai/code)** by Anthropic — 插件平台与 statusLine API
