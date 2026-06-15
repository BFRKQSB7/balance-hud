#!/usr/bin/env node
/**
 * Auto-refresh balance cache. Queries configured APIs and updates
 * session_state.json without adding history entries.
 *
 * Usage: node auto_refresh.mjs [interval_seconds]
 *   Default interval: 15 seconds
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(__dirname, '..');
const STATE_FILE = resolve(SKILL_DIR, 'session_state.json');
const PID_FILE = resolve(SKILL_DIR, '.auto_refresh_pid');
const INTERVAL_MS = (parseInt(process.argv[2], 10) || 15) * 1000;

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

function acquireLock() {
  try {
    if (existsSync(PID_FILE)) {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (isProcessAlive(oldPid)) {
        // Another instance is already running — exit silently
        process.exit(0);
      }
      // Stale PID file — remove it
      try { unlinkSync(PID_FILE); } catch {}
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

// ── Main loop ──────────────────────────────────────────────
const keys = getKeys();

if (!Object.keys(keys).length) {
  process.stderr.write('[balance-refresh] No API keys configured. Exiting.\n');
  process.exit(0);
}

// Ensure only one instance runs; silently exit if another is alive
acquireLock();

// New session: reset saved state so consumption starts from zero
resetSessionState();

process.stderr.write(`[balance-refresh] Started (every ${INTERVAL_MS / 1000}s, ${Object.keys(keys).join(', ')})\n`);

async function tick() {
  for (const [name, key] of Object.entries(keys)) {
    if (name === 'deepseek') {
      const balance = await checkDeepSeek(key);
      if (balance !== null) {
        refreshState(name, balance);
      }
    }
  }
}

// First tick immediately, then loop
await tick();

// setInterval with async is fine — each tick is independent
setInterval(() => { tick().catch(() => {}); }, INTERVAL_MS);

// Keep the process alive
process.stdin.resume();
