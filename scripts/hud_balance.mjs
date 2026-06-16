#!/usr/bin/env node
/**
 * Balance HUD v1.1.2 — Cache reader for claude-hud statusLine.
 *
 * Reads session_state.json (no HTTP, < 1ms) and outputs an ANSI-colored
 * single-line balance display. Designed to be called every statusLine
 * refresh cycle by claude-hud.
 *
 * Output format:
 *   DeepSeek 余额 ¥13.37 | -¥0.93 (6.5%) 20:34:27
 *
 * Low balance (≤ warn threshold): yellow text + red warning banner.
 * Threshold set via: node auto_refresh.mjs --warn <amount>
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const STATE_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'session_state.json');

// ANSI color constants
const BRIGHT_GREEN  = '\x1b[92m';        // Balance text — normal (bright green)
const BRIGHT_YELLOW = '\x1b[93m';        // Balance text — low balance (bright yellow)
const RED           = '\x1b[31m';        // Consumed amount text
const MAGENTA       = '\x1b[95m';        // Percentage text
const BLUE          = '\x1b[94m';        // Provider label (bright blue, matches claude-hud)
const ORANGE        = '\x1b[38;5;208m';  // Refresh time (256-color orange)
const RESET         = '\x1b[0m';         // Reset all ANSI attributes
const DIM           = '\x1b[2m';         // Dim text (separator pipe)

const LABELS = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic' };
const STALE_MS = 30 * 60 * 1000;

// ── Parse local-time timestamps ──────────────────────────────
function parseTs(ts) {
  try {
    const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
    return new Date(iso).getTime();
  } catch { return 0; }
}

// ── Main ─────────────────────────────────────────────────────
try {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  const parts = [];
  const now = Date.now();

  for (const [name, s] of Object.entries(state)) {
    if (!s.last_balance || s.initial_balance == null) continue;

    // Check staleness
    const lastCheck = s.last_check ? parseTs(s.last_check) : 0;
    if (lastCheck && (now - lastCheck > STALE_MS)) continue;

    const consumed = Math.max(0, Math.round((s.initial_balance - s.last_balance) * 10000) / 10000);
    const pct = s.initial_balance > 0 ? (consumed / s.initial_balance * 100) : 0;
    const label = LABELS[name] || name;
    const sym = '¥';
    const currentBalance = s.last_balance.toFixed(2);

    // ── Low-balance threshold ──────────────────────────────────
    // Default ≤ ¥5. Override via: node auto_refresh.mjs --warn <amount>
    const warnThreshold = (state._warn_threshold != null)
      ? parseFloat(state._warn_threshold) : 5.0;
    const isLow = s.last_balance <= warnThreshold;

    // Color scheme: green (normal) → yellow (low balance)
    const balanceColor = isLow ? BRIGHT_YELLOW : BRIGHT_GREEN;

    // Extract HH:MM:SS from last_check timestamp
    const refreshTime = s.last_check ? s.last_check.slice(-8) : '--:--:--';

    // "厂商 余额" blue label → balance number → consumed → pct → time
    parts.push(
      BLUE + label + ' 余额' + RESET + ' ' +
      balanceColor + sym + currentBalance + RESET + ' ' + DIM + '|' + RESET + ' ' +
      RED + '-' + sym + consumed.toFixed(2) + RESET + ' ' +
      MAGENTA + '(' + pct.toFixed(1) + '%)' + RESET + ' ' +
      ORANGE + refreshTime + RESET
    );

    // Low-balance warning banner
    if (isLow) {
      parts.push(RED + '⚠️ 余额仅剩 ' + sym + currentBalance + '，请及时充值！' + RESET);
    }
  }

  if (parts.length > 0) {
    process.stdout.write(parts.join('  ') + '\n');
  }
} catch {
  // No cache or invalid — silent, HUD just won't show balance
}
