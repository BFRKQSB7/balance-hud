#!/usr/bin/env node
/**
 * Balance HUD v2.0.0 — External usage snapshot writer.
 *
 * Reads session_state.json and writes an external-usage-compatible JSON
 * snapshot that the HUD engine (dist/index.js) reads via
 * display.externalUsagePath config.
 *
 * This bridges the balance monitoring daemon (auto_refresh.mjs) with
 * the claude-hud rendering engine, so balance info appears in the HUD.
 *
 * Usage:
 *   node balance_snapshot.mjs
 *
 * Called by auto_refresh.mjs after each balance refresh tick.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..');
const STATE_FILE = resolve(PLUGIN_DIR, 'session_state.json');
const SNAPSHOT_FILE = resolve(PLUGIN_DIR, 'balance_usage.json');

const LABELS = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic' };
const STALE_MS = 30 * 60 * 1000;

function parseTs(ts) {
  try {
    const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
    return new Date(iso).getTime();
  } catch { return 0; }
}

try {
  if (!existsSync(STATE_FILE)) {
    // No state yet — write empty snapshot
    writeSnapshot(null);
    process.exit(0);
  }

  const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  const now = Date.now();
  const balanceParts = [];

  for (const [name, s] of Object.entries(state)) {
    if (!s.last_balance || s.initial_balance == null) continue;

    const lastCheck = s.last_check ? parseTs(s.last_check) : 0;
    if (lastCheck && (now - lastCheck > STALE_MS)) continue;

    const consumed = Math.max(0, Math.round((s.initial_balance - s.last_balance) * 10000) / 10000);
    const pct = s.initial_balance > 0 ? (consumed / s.initial_balance * 100) : 0;
    const label = LABELS[name] || name;
    const currentBalance = s.last_balance.toFixed(2);
    const refreshTime = s.last_check ? s.last_check.slice(-8) : '--:--:--';

    balanceParts.push(
      `${label} ¥${currentBalance} | -¥${consumed.toFixed(2)} (${pct.toFixed(1)}%) ${refreshTime}`
    );
  }

  const balanceLabel = balanceParts.length > 0 ? balanceParts.join('  ') : null;
  writeSnapshot(balanceLabel);
} catch {
  // Silent — snapshot just won't be written
}

function writeSnapshot(balanceLabel) {
  const snapshot = {
    updated_at: new Date().toISOString(),
    five_hour: { used_percentage: null, resets_at: null },
    seven_day: { used_percentage: null, resets_at: null },
    ...(balanceLabel != null && { balance_label: balanceLabel }),
  };

  try {
    mkdirSync(PLUGIN_DIR, { recursive: true });
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch { /* ignore */ }
}
