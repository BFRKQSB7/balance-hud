#!/usr/bin/env node
/**
 * balance-hud diagnostics.
 *
 * Prints a structured report of the environment, statusLine wiring, config,
 * balance snapshot, daemon/watchdog state, and a simulated statusline render —
 * mirroring what Claude Code invokes — so wiring bugs surface without waiting
 * for a live session.
 *
 * Usage:
 *   node hud_debug.mjs          full diagnostic report
 *   node hud_debug.mjs --short  one-line summary (for scripting)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const DATA_DIR = path.join(CLAUDE_DIR, 'plugins', 'balance-hud');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const SNAPSHOT_PATH = path.join(DATA_DIR, 'balance_usage.json');
const PID_FILE = path.join(DATA_DIR, '.auto_refresh_pid');
const SHORT = process.argv.includes('--short');

const R = [];
function push(s) { R.push(s); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function redact(s) {
  if (!s) return '(none)';
  return s.length > 12 ? s.slice(0, 4) + '…' + s.slice(-4) : '(set)';
}
function classifyProvider(env) {
  const base = (env.ANTHROPIC_BASE_URL || env.ANTHROPIC_API_BASE_URL || '').trim();
  if (!base) return '官方 Anthropic (无 base URL)';
  if (/api\.anthropic\.com/i.test(base)) return '官方 Anthropic';
  if (/deepseek/i.test(base)) return 'DeepSeek 官方';
  if (/^https?:\/\/(localhost|127\.0\.0\.1|::1)/i.test(base)) return '本地代理 (ccswitch 等)';
  return '第三方中转: ' + base;
}
function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function roleFromModelId(id) {
  const m = /^claude-(opus|sonnet|haiku|fable)-/i.exec(id || '');
  return m ? m[1].toUpperCase() : null;
}

// ── Simulated statusline render (same code path Claude Code invokes) ────
function simulateRender() {
  const settings = readJson(SETTINGS_PATH) || {};
  const role = ['opus', 'sonnet', 'haiku', 'fable'].find(r =>
    (settings.env || {})[`ANTHROPIC_DEFAULT_${r.toUpperCase()}_MODEL`]);
  const id = (settings.env || {})[`ANTHROPIC_DEFAULT_${(role || 'sonnet').toUpperCase()}_MODEL`]
    || `claude-${role || 'sonnet'}-4-6[1M]`;
  const payload = JSON.stringify({
    cwd: process.cwd(),
    transcript_path: '',
    model: { id, display_name: '' },
    context_window: { context_window_size: 1000000, current_usage: { input_tokens: 5120, cache_read_input_tokens: 102400, output_tokens: 512 } },
    rate_limits: null,
  });
  const res = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'dist', 'index.js')], {
    input: payload, encoding: 'utf8', env: process.env, timeout: 15000,
  });
  if (res.error) return { ok: false, error: res.error.message };
  if (res.status !== 0) return { ok: false, error: `exit ${res.status}: ${res.stderr}` };
  const out = res.stdout.replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '').replace(/\x1B\[[0-9;]*m/g, '');
  const lines = out.split('\n').map(s => s.trim()).filter(Boolean);
  return { ok: lines.length > 0, lines };
}

// ── Main ────────────────────────────────────────────────────────────────
const env = process.env;
const settings = readJson(SETTINGS_PATH);
const config = readJson(CONFIG_PATH);
const snapshot = readJson(SNAPSHOT_PATH);

// 1. Runtime
push(`## 运行时`);
push(`node ${process.version} | ${process.platform} | OSTYPE=${env.OSTYPE || '(未设)'}`);

// 2. Provider / env
push(`\n## Provider 分类`);
push(classifyProvider(env));
const base = (env.ANTHROPIC_BASE_URL || env.ANTHROPIC_API_BASE_URL || '').toLowerCase();
const isDeepseekEnv = Boolean(env.DEEPSEEK_API_KEY?.trim())
  || (Boolean(env.ANTHROPIC_AUTH_TOKEN?.trim()) && base.includes('deepseek'));
push(`isDeepSeekEnv (余额是否应显示): ${isDeepseekEnv ? '是' : '否'}`);
push(`ANTHROPIC_AUTH_TOKEN: ${redact(env.ANTHROPIC_AUTH_TOKEN)}`);
push(`DEEPSEEK_API_KEY: ${redact(env.DEEPSEEK_API_KEY)}`);
const modelNames = Object.entries(env)
  .filter(([k]) => /^ANTHROPIC_DEFAULT_[A-Z]+_MODEL_NAME$/.test(k))
  .map(([k, v]) => `${k.replace(/^ANTHROPIC_DEFAULT_|_MODEL_NAME$/g, '')}=${v}`);
if (modelNames.length) push(`模型重映射: ${modelNames.join(', ')}`);
else push(`模型重映射: (无 — 官方 API 或未重映射)`);

// 3. statusLine wiring
push(`\n## statusLine 接线`);
if (!settings) {
  push(`✗ settings.json 缺失或损坏 (${SETTINGS_PATH})`);
} else {
  const cmd = settings.statusLine && settings.statusLine.command;
  if (!cmd) push(`✗ settings.json 里没有 statusLine — HUD 不会被调用! (看门狗应已自动补回)`);
  else {
    push(`✓ statusLine.command 存在`);
    const m = cmd.match(/["']([^"']+statusline[^"']*)["']/) || cmd.match(/["']([^"']+dist[\\/]index\.js[^"']*)["']/);
    const target = m ? m[1].replace(/\//g, path.sep) : null;
    push(target ? `  目标: ${target} ${fs.existsSync(target) ? '✓ 存在' : '✗ 不存在!'}` : `  命令: ${cmd}`);
  }
}

// 4. Plugin files / version
push(`\n## 插件`);
const pkg = readJson(path.join(PLUGIN_ROOT, 'package.json'));
push(`版本: ${(pkg && pkg.version) || '(未知)'}`);
for (const f of ['dist/index.js', 'statusline.mjs', 'scripts/auto_refresh.mjs', 'scripts/fix_statusline.mjs']) {
  push(`${fs.existsSync(path.join(PLUGIN_ROOT, f)) ? '✓' : '✗'} ${f}`);
}

// 5. HUD config
push(`\n## HUD 配置`);
push(config ? `✓ config.json 有效 (language=${config.language}, layout=${config.lineLayout})`
            : `✗ config.json 缺失或损坏 — 将使用默认配置`);

// 6. Balance snapshot
push(`\n## 余额快照 (balance_usage.json)`);
if (!snapshot) {
  push(`✗ 缺失或损坏`);
} else {
  const updated = snapshot.updated_at ? new Date(snapshot.updated_at).getTime() : null;
  const ageMin = updated ? Math.round((Date.now() - updated) / 60000) : null;
  push(`updated_at: ${snapshot.updated_at || '(无)'} ${ageMin !== null ? `(${ageMin} 分钟前)` : ''}`);
  push(`有余额标签: ${snapshot.balance_label ? '是' : '否'}`);
  push(`当前应显示余额: ${isDeepseekEnv && snapshot.balance_label && ageMin !== null && ageMin < 5 ? '是' : '否'}`);
}

// 7. Daemon
push(`\n## 余额 daemon (auto_refresh)`);
let daemonPid = null;
try { daemonPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10) || null; } catch { /* none */ }
if (daemonPid && isProcessAlive(daemonPid)) push(`✓ 运行中 (PID ${daemonPid})`);
else if (daemonPid) push(`✗ pid 文件残留 (PID ${daemonPid} 已死)`);
else push(`○ 未运行 ${isDeepseekEnv ? '— DeepSeek 环境下余额将变旧隐藏' : '(非 DeepSeek 环境,正常)'}`);

// 8. Watchdog
push(`\n## statusLine 看门狗 (fix_statusline)`);
const wd = spawnSync('powershell', ['-NoProfile', '-Command',
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'fix_statusline' } | Select-Object -First 1 -ExpandProperty ProcessId"],
  { encoding: 'utf8', timeout: 8000 }).stdout.trim();
if (wd) push(`✓ 运行中 (PID ${wd})`);
else push(`✗ 未运行 — ccswitch 重写 settings.json 后 statusLine 不会自动补回!`);
const startup = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows',
  'Start Menu', 'Programs', 'Startup', 'balance-hud-statusline.vbs');
push(`${fs.existsSync(startup) ? '✓' : '✗'} 启动项 ${fs.existsSync(startup) ? '' : '(缺失,重启后看门狗不自启)'}`);

// 9. Simulated render
push(`\n## 模拟渲染 (和 Claude Code 调用相同路径)`);
const render = simulateRender();
if (render.ok) {
  push(`✓ 渲染正常,输出 ${render.lines.length} 行:`);
  for (const l of render.lines.slice(0, 4)) push(`  ${l}`);
} else {
  push(`✗ 渲染失败: ${render.error}`);
}

// ── Short summary ──────────────────────────────────────────────────────
if (SHORT) {
  const problems = R.filter(l => l.startsWith('✗'));
  const statusLineOk = R.some(l => l.includes('statusLine.command 存在'));
  const modelLine = render.ok && render.lines[0] || '';
  const model = modelLine.replace(/^\[([^\]]+)\].*$/, '$1');
  console.log([statusLineOk ? 'statusline:OK' : 'statusline:BROKEN',
    `model:${model}`,
    isDeepseekEnv ? 'balance:on' : 'balance:off',
    problems.length ? `issues:${problems.length}` : 'issues:0'].join(' | '));
  process.exit(0);
}
console.log(R.join('\n'));
