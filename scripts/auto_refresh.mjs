#!/usr/bin/env node
/**
 * Balance HUD v2.1.0 — Background refresh daemon.
 *
 * Queries DeepSeek API every N seconds and writes last_balance/last_check
 * to session_state.json for the HUD renderer (hud_balance.mjs) to read.
 * No history entries — this is cache-only refresh.
 *
 * PID preemptive lock: new session kills old daemon and takes over.
 * On startup, resets session state so consumption starts from zero.
 *
 * Usage:
 *   node auto_refresh.mjs [seconds]   Start daemon (default 15s)
 *   node auto_refresh.mjs --warn N    Set low-balance warning threshold (default ¥5)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..');
const STATE_FILE = resolve(PLUGIN_DIR, 'session_state.json');
const PID_FILE = resolve(PLUGIN_DIR, '.auto_refresh_pid');
const args = process.argv.slice(2);
const INTERVAL_MS = (parseInt(args.find(a => !a.startsWith('--')), 10) || 15) * 1000;

// ── --warn <amount>: set low-balance warning threshold ─────
const warnIdx = args.indexOf('--warn');
if (warnIdx !== -1 && args[warnIdx + 1] != null) {
  const warnVal = parseFloat(args[warnIdx + 1]);
  if (isNaN(warnVal) || warnVal < 0) {
    process.stderr.write('❌ --warn 需要有效的正数金额，例如: --warn 10\n');
    process.exit(1);
  }
  let state = {};
  try { state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch {}
  state._warn_threshold = warnVal;
  mkdirSync(resolve(__dirname, '..'), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  process.stderr.write(`✅ 低余额预警阈值已设为 ¥${warnVal.toFixed(2)}\n`);
  process.stderr.write(`   余额 ≤ ¥${warnVal.toFixed(2)} 时 HUD 进度条变黄 + 充值提醒\n`);
  process.exit(0);
}

// ── Singleton guard ─────────────────────────────────────────
function isProcessAlive(pid) {
  try {
    // process.kill(pid, 0) works on both Windows & Unix in Node 18+
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock() {
  try {
    if (existsSync(PID_FILE)) {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (isProcessAlive(oldPid)) {
        // Previous session's daemon survived — kill it so new session starts fresh
        try { process.kill(oldPid, 'SIGTERM'); } catch {}
        try { unlinkSync(PID_FILE); } catch {}
        // Brief yield to let OS reap the old process
        await new Promise(r => setTimeout(r, 200));
      } else {
        // Stale PID file — remove it
        try { unlinkSync(PID_FILE); } catch {}
      }
    }
    writeFileSync(PID_FILE, String(process.pid), 'utf-8');
    // Clean PID file on exit
    process.on('exit', () => { try { unlinkSync(PID_FILE); } catch {} });
    process.on('SIGINT', () => { process.exit(0); });
    process.on('SIGTERM', () => { process.exit(0); });
    return true;
  } catch (e) {
    process.stderr.write(`[balance-refresh] Lock failed: ${e.message}\n`);
    process.exit(1);
  }
}

// ── Key discovery ──────────────────────────────────────────
function getKeys() {
  const keys = {};
  const ds = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '';
  if (ds) keys.deepseek = ds;
  return keys; // Only DeepSeek supports real-time balance; OpenAI/Anthropic need admin keys
}

// ── API call ───────────────────────────────────────────────
async function checkDeepSeek(key) {
  try {
    const resp = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.is_available) return null;
    const b = (data.balance_infos || [])[0] || {};
    return parseFloat(b.total_balance || 0);
  } catch { return null; }
}

// ── Session lifecycle ──────────────────────────────────────
function now() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function resetSessionState() {
  // Clear provider state so this session starts fresh.
  // auto_refresh runs per-session (dies when Claude Code exits),
  // so startup always means a new session.
  try {
    let state = {};
    try { state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { /* new file */ }
    for (const [key, s] of Object.entries(state)) {
      if (key.startsWith('_')) continue;
      if (typeof s === 'object' && s !== null && 'last_balance' in s) {
        delete s.initial_balance;
        delete s.session_start;
        s.history = [];
      }
    }
    state._session_started_at = now();
    mkdirSync(resolve(__dirname, '..'), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

function refreshState(provider, balance) {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    if (!state[provider]) state[provider] = {};
    const s = state[provider];
    if (s.initial_balance == null) {
      s.initial_balance = balance;
      s.session_start = now();
      s.history = [];
    }
    s.last_balance = balance;
    s.last_check = now();
    // No history push — this is cache-only refresh
    mkdirSync(resolve(__dirname, '..'), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

// ── Empty snapshot (non-DeepSeek session) ──────────────────
function writeEmptyBalanceSnapshot() {
  const SNAPSHOT_FILE = resolve(PLUGIN_DIR, 'balance_usage.json');
  try {
    const snapshot = {
      updated_at: new Date().toISOString(),
      five_hour: { used_percentage: null, resets_at: null },
      seven_day: { used_percentage: null, resets_at: null },
    };
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

// ── Main loop ──────────────────────────────────────────────
const keys = getKeys();

if (!Object.keys(keys).length) {
  // Non-DeepSeek session (no DeepSeek keys configured). Still take over the
  // PID lock — this kills any previous session's daemon that might keep
  // polling DeepSeek — then clear the balance snapshot. Otherwise a stale
  // DeepSeek balance row would linger in the HUD for up to the freshness
  // window after switching APIs. The HUD itself renders normally for any API;
  // only the balance row disappears.
  await acquireLock();
  resetSessionState();
  writeEmptyBalanceSnapshot();
  process.stderr.write('[balance-refresh] No API keys configured. Exiting.\n');
  process.exit(0);
}

// Ensure only one instance runs; kill old session daemon if still alive
await acquireLock();

// New session: reset saved state so consumption starts from zero
resetSessionState();

process.stderr.write(`[balance-refresh] Started (every ${INTERVAL_MS / 1000}s, ${Object.keys(keys).join(', ')})\n`);

function writeBalanceSnapshot() {
  // Write external-usage snapshot for HUD engine to read via externalUsagePath.
  // Called after each tick so the HUD always has fresh balance data.
  // ANSI colors match hud_balance.mjs v1.1.3:
  //   BLUE label, BRIGHT_GREEN balance (YELLOW if low), DIM separators,
  //   RED consumed, BRIGHT_MAGENTA pct, ORANGE time.
  const SNAPSHOT_FILE = resolve(PLUGIN_DIR, 'balance_usage.json');
  const LABELS = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic' };
  const STALE_MS = 30 * 60 * 1000;
  // ANSI constants matching v1.1.3 hud_balance.mjs
  const B_BLUE    = '\x1b[94m';        // Provider label
  const B_GREEN   = '\x1b[92m';        // Balance (normal)
  const B_YELLOW  = '\x1b[93m';        // Balance (low)
  const B_RED     = '\x1b[31m';        // Consumed amount
  const B_MAGENTA = '\x1b[95m';        // Percentage
  const B_ORANGE  = '\x1b[38;5;208m';  // Refresh time
  const B_DIM     = '\x1b[2m';         // Separators
  const B_RESET   = '\x1b[0m';
  try {
    let state = {};
    try { state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return; }
    const nowTs = Date.now();
    const warnThreshold = (state._warn_threshold != null)
      ? parseFloat(state._warn_threshold) : 5.0;
    const parts = [];
    let lastConsumed = null, lastPct = null, lastRefreshTime = null, lastIsLow = false;
    for (const [name, s] of Object.entries(state)) {
      if (!s.last_balance || s.initial_balance == null) continue;
      const lastCheck = s.last_check ? new Date(s.last_check.includes('T') ? s.last_check : s.last_check.replace(' ', 'T')).getTime() : 0;
      if (lastCheck && (nowTs - lastCheck > STALE_MS)) continue;
      const consumed = Math.max(0, Math.round((s.initial_balance - s.last_balance) * 10000) / 10000);
      const pct = s.initial_balance > 0 ? (consumed / s.initial_balance * 100) : 0;
      const label = LABELS[name] || name;
      const refreshTime = s.last_check ? s.last_check.slice(-8) : '--:--:--';
      const isLow = s.last_balance <= warnThreshold;
      const balColor = isLow ? B_YELLOW : B_GREEN;
      // Capture structured consumed data for HUD usage renderer
      lastConsumed = consumed;
      lastPct = pct;
      lastRefreshTime = refreshTime;
      lastIsLow = isLow;
      parts.push(
        B_BLUE + label + ' 余额' + B_RESET + ' ' +
        balColor + '¥' + s.last_balance.toFixed(2) + B_RESET + ' ' + B_DIM + '|' + B_RESET + ' ' +
        B_RED + '-¥' + consumed.toFixed(2) + B_RESET + ' ' +
        B_MAGENTA + '(' + pct.toFixed(1) + '%)' + B_RESET + ' ' +
        B_ORANGE + refreshTime + B_RESET
      );
      // Low-balance warning banner
      if (isLow) {
        parts.push(B_RED + '⚠️ 余额仅剩 ¥' + s.last_balance.toFixed(2) + '，请及时充值！' + B_RESET);
      }
    }
    const snapshot = {
      updated_at: new Date().toISOString(),
      five_hour: { used_percentage: null, resets_at: null },
      seven_day: { used_percentage: null, resets_at: null },
      ...(parts.length > 0 && { balance_label: parts.join('  ') }),
      ...(lastConsumed != null && { balance_consumed: lastConsumed }),
      ...(lastPct != null && { balance_pct: lastPct }),
      ...(lastRefreshTime != null && { balance_time: lastRefreshTime }),
      ...(lastIsLow && { balance_is_low: true }),
    };
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

async function tick() {
  for (const [name, key] of Object.entries(keys)) {
    if (name === 'deepseek') {
      const balance = await checkDeepSeek(key);
      if (balance !== null) {
        refreshState(name, balance);
      }
    }
  }
  writeBalanceSnapshot();
}

// First tick immediately, then loop
await tick();

// setInterval with async is fine — each tick is independent
setInterval(() => { tick().catch(() => {}); }, INTERVAL_MS);

// Keep the process alive
process.stdin.resume();
