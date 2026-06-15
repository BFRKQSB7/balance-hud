#!/usr/bin/env node
/**
 * Balance Watch — Multi-provider API balance checker.
 * Tracks session consumption + history for chart data.
 *
 * Usage:
 *   node check_balance.mjs                         # Detailed dashboard (default)
 *   node check_balance.mjs --json                  # JSON output
 *   node check_balance.mjs --provider deepseek     # Single provider
 *   node check_balance.mjs --no-save               # Don't record to history
 *   node check_balance.mjs --reset                 # Reset session state
 *   node check_balance.mjs --hud                   # Single-line HUD output (cached data only)
 *   node check_balance.mjs --refresh               # Query API + update cache only (no output)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = process.env.BALANCE_WATCH_DIR || resolve(__dirname, '..');
const STATE_FILE = resolve(PLUGIN_DIR, 'session_state.json');

// ═══════════════════════════════════════════════════════════
// Provider handlers
// ═══════════════════════════════════════════════════════════

async function checkDeepSeek(key) {
  try {
    const resp = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` }
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
    }
    const data = await resp.json();
    if (!data.is_available) return { ok: false, error: 'Account not available' };
    const b = (data.balance_infos || [])[0] || {};
    return {
      ok: true, currency: b.currency || 'CNY',
      total_balance: parseFloat(b.total_balance || 0),
      granted_balance: parseFloat(b.granted_balance || 0),
      topped_up_balance: parseFloat(b.topped_up_balance || 0),
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function checkOpenAI(key) {
  try {
    const resp = await fetch('https://api.openai.com/v1/organization/usage/costs?limit=1', {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: true, needs_admin_key: true,
        note: 'OpenAI 未开放余额查询 API；标准 Key 无法访问',
        dashboard_url: 'https://platform.openai.com/settings/organization/billing/overview',
      };
    }
    const data = await resp.json();
    return {
      ok: true,
      note: 'OpenAI 不提供余额 API；以下为近期用量成本',
      dashboard_url: 'https://platform.openai.com/settings/organization/billing/overview',
      raw_data: data,
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function checkAnthropic(key) {
  if (!key.startsWith('sk-ant-admin-')) {
    return {
      ok: true, needs_admin_key: true,
      note: 'Anthropic 余额查询需 Admin Key (sk-ant-admin-...)',
      dashboard_url: 'https://console.anthropic.com/settings/billing',
    };
  }
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const end = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const resp = await fetch(
      `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${start}&ending_at=${end}&group_by[]=workspace_id`,
      { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': key } }
    );
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const data = await resp.json();
    const totalCost = (data.data || []).reduce((s, e) => s + ((e.cost || {}).amount || 0), 0);
    return {
      ok: true, monthly_cost_usd: totalCost, currency: 'USD',
      note: '本月 API 调用成本（Anthropic Admin API）',
      dashboard_url: 'https://console.anthropic.com/settings/billing',
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

const PROVIDERS = { deepseek: checkDeepSeek, openai: checkOpenAI, anthropic: checkAnthropic };

// ═══════════════════════════════════════════════════════════
// State management
// ═══════════════════════════════════════════════════════════

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function timestamp() {
  // Local ISO 8601 (no Z) — parsed as local time by new Date()
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isNewSession(providerState, fullState) {
  // Returns true if the provider's saved state belongs to a previous session
  if (!providerState.session_start) return true;
  if (fullState._session_started_at) {
    // auto_refresh.mjs writes _session_started_at on each startup;
    // if the provider's session_start predates it, we're in a new session
    const sessionStart = parseTimestamp(fullState._session_started_at);
    const providerStart = parseTimestamp(providerState.session_start);
    return providerStart < sessionStart;
  }
  // No auto_refresh marker — only reset if the entire state looks stale
  // (both session_start AND last_check are old, indicating a dead session)
  if (providerState.last_check) {
    const lastCheck = parseTimestamp(providerState.last_check);
    const staleMs = 2 * 60 * 60 * 1000; // 2 hours
    if ((Date.now() - lastCheck) > staleMs) {
      const providerStart = parseTimestamp(providerState.session_start);
      return (Date.now() - providerStart) > staleMs;
    }
  }
  return false;
}

function updateSession(results) {
  const state = loadState();
  const now = timestamp();
  for (const [provider, r] of Object.entries(results)) {
    if (!r.ok || r.total_balance == null) continue;
    if (!state[provider]) state[provider] = {};
    const s = state[provider];
    if (s.initial_balance == null || isNewSession(s, state)) {
      s.initial_balance = r.total_balance;
      s.session_start = now;
      s.history = [];
    }
    s.last_balance = r.total_balance;
    s.last_check = now;
    if (!Array.isArray(s.history)) s.history = [];
    const consumed = Math.round((s.initial_balance - r.total_balance) * 10000) / 10000;
    // Deduplicate: skip if balance unchanged from last entry
    const last = s.history[s.history.length - 1];
    if (!last || last.balance !== r.total_balance) {
      s.history.push({ time: now, balance: r.total_balance, consumed });
    }
  }
  saveState(state);
}

// Refresh only: update last_balance/last_check WITHOUT adding history entries
function refreshState(results) {
  const state = loadState();
  const now = timestamp();
  for (const [provider, r] of Object.entries(results)) {
    if (!r.ok || r.total_balance == null) continue;
    if (!state[provider]) state[provider] = {};
    const s = state[provider];
    if (s.initial_balance == null || isNewSession(s, state)) {
      s.initial_balance = r.total_balance;
      s.session_start = now;
      s.history = [];
    }
    s.last_balance = r.total_balance;
    s.last_check = now;
    // Do NOT push to history — refresh is for HUD cache only
  }
  saveState(state);
}

function attachSessionInfo(results, includeUnconfigured = false) {
  const state = loadState();
  const out = { providers: {} };
  for (const [provider, r] of Object.entries(results)) {
    const entry = { ...r };
    const s = state[provider] || {};
    if (s.initial_balance != null && r.total_balance != null && r.ok) {
      entry.initial_balance = s.initial_balance;
      entry.session_start = s.session_start || 'unknown';
      entry.session_consumed = Math.round((s.initial_balance - r.total_balance) * 10000) / 10000;
      entry.history = s.history || [];
    }
    if (!includeUnconfigured && !r.ok) continue;
    out.providers[provider] = entry;
  }
  out.checked_at = timestamp();
  out.state = state;
  return out;
}

// ═══════════════════════════════════════════════════════════
// Display: Inline dashboard
// ═══════════════════════════════════════════════════════════

function bar(percent, len = 10) {
  const filled = Math.min(Math.round(percent / 100 * len), len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

const PROVIDER_LABELS = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic' };

function formatDetail(results) {
  const lines = [];
  const configured = Object.entries(results.providers || {})
    .filter(([, r]) => r.ok && r.total_balance != null);

  if (!configured.length) return '⚠️ 没有检测到已配置的 API Key。';

  for (const [name, r] of configured) {
    const label = PROVIDER_LABELS[name] || name;
    const sym = (r.currency || 'CNY') === 'USD' ? '$' : '¥';
    const consumed = r.session_consumed || 0;
    const initial = r.initial_balance || r.total_balance;
    const current = r.total_balance;
    const pct = initial > 0 ? (consumed / initial * 100) : 0;
    const remainingPct = Math.max(0, 100 - pct);
    const duration = getDuration(r.session_start || results.checked_at);

    lines.push(`## 💰 ${label} — ${sym}${current.toFixed(2)}`);
    lines.push('');
    lines.push(`${bar(remainingPct, 20)}  **${pct.toFixed(1)}%** 已消耗`);
    lines.push('');

    lines.push('| 当前余额 | 已消耗 | 初始余额 | 会话时长 |');
    lines.push('|----------|--------|----------|----------|');
    lines.push(`| ${sym}${current.toFixed(2)} | -${sym}${consumed.toFixed(2)} (${pct.toFixed(1)}%) | ${sym}${initial.toFixed(2)} | ${duration} |`);
    lines.push('');

    // History trend
    const s = results.state?.[name];
    if (s?.history && s.history.length > 1) {
      lines.push('### 📈 趋势');
      lines.push('');
      const h = s.history;
      const header = h.map(p => (p.time || '').slice(11, 16)).join(' | ');
      const balances = h.map(p => `${sym}${p.balance.toFixed(2)}`).join(' | ');
      lines.push(`| ${header} |`);
      lines.push(`|${h.map(() => '------').join('|')}|`);
      lines.push(`| ${balances} |`);
      lines.push('');
    }
  }

  lines.push(`> *${results.checked_at}*`);
  return lines.join('\n');
}

function getDuration(startStr) {
  try {
    // Handles both old "2026-06-15 11:24:43" and new "2026-06-15T11:24:43"
    const start = new Date(startStr.includes('T') ? startStr : startStr.replace(' ', 'T'));
    const ms = Date.now() - start.getTime();
    if (ms < 0) return '?';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return '<1m';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  } catch { return '?'; }
}

function parseTimestamp(ts) {
  // Parse local-time ISO timestamps (old "Y-M-D H:M:S" or new "Y-M-DTH:M:S")
  // Both are parsed as local time by JS Date when using T separator
  try {
    const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
    return new Date(iso).getTime();
  } catch { return 0; }
}

// ═══════════════════════════════════════════════════════════
// Display: Single-line HUD format (for statusLine)
// ═══════════════════════════════════════════════════════════

function formatHud(results) {
  const parts = [];
  for (const [name, r] of Object.entries(results.providers || {})) {
    if (!r.ok || r.total_balance == null) continue;
    const sym = (r.currency || 'CNY') === 'USD' ? '$' : '¥';
    const consumed = r.session_consumed || 0;
    const initial = r.initial_balance || r.total_balance;
    const current = r.total_balance;
    const pct = initial > 0 ? (consumed / initial * 100) : 0;
    const label = PROVIDER_LABELS[name] || name;
    parts.push(`${label} ${bar(pct, 8)} ${sym}${current.toFixed(2)} | -${sym}${consumed.toFixed(2)} (${pct.toFixed(1)}%)`);
  }
  return parts.join('  ');
}

// ═══════════════════════════════════════════════════════════
// Key discovery
// ═══════════════════════════════════════════════════════════

function getKeys() {
  const keys = {};
  const ds = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '';
  if (ds) keys.deepseek = ds;
  const oa = process.env.OPENAI_API_KEY || process.env.OPENAI_ADMIN_KEY || '';
  if (oa) keys.openai = oa;
  const an = process.env.ANTHROPIC_ADMIN_KEY || process.env.ANTHROPIC_API_KEY || '';
  if (an) keys.anthropic = an;
  return keys;
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')).map(a => a.split('=')[0]));
  const jsonMode = flags.has('--json');
  const noSave = flags.has('--no-save');
  const doReset = flags.has('--reset');
  const hudMode = flags.has('--hud');
  const refreshMode = flags.has('--refresh');

  const provIdx = args.indexOf('--provider');
  const provider = provIdx !== -1 && args[provIdx + 1] ? args[provIdx + 1] : 'all';

  // --warn <amount>: set low-balance warning threshold
  const warnIdx = args.indexOf('--warn');
  if (warnIdx !== -1 && args[warnIdx + 1]) {
    const warnVal = parseFloat(args[warnIdx + 1]);
    if (isNaN(warnVal) || warnVal < 0) {
      console.log('❌ --warn 需要有效的正数金额，例如: --warn 10');
      process.exit(1);
    }
    const state = loadState();
    state._warn_threshold = warnVal;
    saveState(state);
    console.log(`✅ 低余额预警阈值已设为 ¥${warnVal.toFixed(2)}`);
    console.log(`   余额 ≤ ¥${warnVal.toFixed(2)} 时 HUD 进度条将变黄，余额数字变红`);
    process.exit(0);
  }

  // --reset
  if (doReset) {
    saveState({});
    console.log('✅ 会话状态已重置');
    process.exit(0);
  }

  // --hud: read cached state only (no API calls)
  if (hudMode) {
    const state = loadState();
    const results = { providers: {}, checked_at: timestamp(), state };
    for (const [name, s] of Object.entries(state)) {
      if (s.last_balance != null) {
        results.providers[name] = {
          ok: true,
          total_balance: s.last_balance,
          currency: 'CNY',
          initial_balance: s.initial_balance,
          session_start: s.session_start,
          session_consumed: s.initial_balance != null
            ? Math.round((s.initial_balance - s.last_balance) * 10000) / 10000
            : 0,
          history: s.history || [],
        };
      }
    }
    if (Object.keys(results.providers).length === 0) {
      // No cached data; output nothing
      process.exit(0);
    }
    console.log(formatHud(results));
    process.exit(0);
  }

  // --refresh: query APIs and update cache only (no history, no output)
  if (refreshMode) {
    const keys = getKeys();
    if (!Object.keys(keys).length) return;
    const targets = Object.fromEntries(Object.entries(keys).filter(([k]) => k in PROVIDERS));
    const results = {};
    for (const [name, key] of Object.entries(targets)) {
      results[name] = await PROVIDERS[name](key);
    }
    refreshState(results);
    return;
  }

  const keys = getKeys();
  if (!Object.keys(keys).length) {
    console.log('❌ 未检测到任何 API Key！');
    console.log('   设置 DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN');
    console.log('   设置 OPENAI_API_KEY / OPENAI_ADMIN_KEY');
    console.log('   设置 ANTHROPIC_ADMIN_KEY / ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Determine targets
  let targets;
  if (provider === 'all') {
    targets = Object.fromEntries(Object.entries(keys).filter(([k]) => k in PROVIDERS));
  } else {
    if (!keys[provider]) { console.log(`❌ ${provider} 未配置 API Key`); process.exit(1); }
    targets = { [provider]: keys[provider] };
  }

  // Query APIs
  const results = {};
  for (const [name, key] of Object.entries(targets)) {
    results[name] = await PROVIDERS[name](key);
  }

  // Init or update session
  if (!existsSync(STATE_FILE)) {
    updateSession(results);
  } else if (!noSave) {
    updateSession(results);
  }

  const full = attachSessionInfo(results, true);

  if (jsonMode) {
    console.log(JSON.stringify(full, null, 2));
  } else {
    console.log(formatDetail(full));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
