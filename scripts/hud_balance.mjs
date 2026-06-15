#!/usr/bin/env node
/**
 * Balance HUD v1.1 — Cache reader for claude-hud statusLine.
 *
 * Reads session_state.json (no HTTP, < 1ms) and outputs an ANSI-colored
 * single-line balance progress bar. Designed to be called every statusLine
 * refresh cycle by claude-hud.
 *
 * Output format:
 *   DeepSeek 余额 ████████████████████░░░░ ¥13.37 | -¥0.93 (6.5%) 20:34:27
 *
 * Adaptive bar: ≥100 cols → 20 chars (5%/char), ≥60 → 15, <60 → 10.
 *
 * Normal (balance > warn threshold, default ¥5):
 *   Bright green █ = remaining, dark green ░ = consumed
 *
 * Low balance (≤ warn threshold):
 *   Bright yellow █ = remaining, dark yellow ░ = consumed
 *   Red warning banner appended: ⚠️ 余额仅剩 ¥X.XX，请及时充值！
 *
 * Threshold set via: node auto_refresh.mjs --warn <amount>
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const STATE_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'session_state.json');

// ANSI color constants
const GREEN         = '\x1b[32m';        // Consumed bar fill — normal (dark green ░)
const BRIGHT_GREEN  = '\x1b[92m';        // Remaining bar fill — normal (bright green █)
const YELLOW        = '\x1b[33m';        // Consumed bar fill — low balance (dark yellow ░)
const BRIGHT_YELLOW = '\x1b[93m';        // Remaining bar fill — low balance (bright yellow █)
const RED           = '\x1b[31m';        // Consumed amount text; balance number when low
const MAGENTA       = '\x1b[95m';        // Percentage text
const BLUE          = '\x1b[94m';        // Provider label (bright blue, matches claude-hud)
const CYAN          = '\x1b[96m';        // "余额" label (light cyan-blue)
const ORANGE        = '\x1b[38;5;208m';  // Refresh time (256-color orange)
const RESET         = '\x1b[0m';         // Reset all ANSI attributes
const DIM           = '\x1b[2m';         // Dim text (separator pipe)

const LABELS = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic' };
const STALE_MS = 30 * 60 * 1000;

// ── Adaptive bar width (5% per character) ───────────────────────
function getBarWidth() {
  const cols = parseInt(process.env.COLUMNS, 10);
  if (Number.isFinite(cols)) {
    if (cols >= 100) return 20;  // 20 chars = 5% each
    if (cols >= 60) return 15;   // 15 chars ≈ 6.7% each
    return 10;                    // 10 chars = 10% each (narrow terminal)
  }
  return 20; // default
}

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
  const barW = getBarWidth();

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

    // ── Progress bar (5% consumed = 1 empty char at barW=20) ────
    const charsPerPct = barW / 100;  // chars per 1% consumed
    const empty = Math.min(Math.round(pct * charsPerPct), barW);
    const filled = barW - empty;

    // Color scheme: green (normal) → yellow (low balance)
    const fillColor  = isLow ? BRIGHT_YELLOW : BRIGHT_GREEN;
    const emptyColor = isLow ? YELLOW : GREEN;
    const balanceColor = isLow ? BRIGHT_YELLOW : BRIGHT_GREEN;

    const barStr = fillColor + '█'.repeat(filled) + emptyColor + '░'.repeat(empty) + RESET;

    // Extract HH:MM:SS from last_check timestamp
    const refreshTime = s.last_check ? s.last_check.slice(-8) : '--:--:--';

    // "厂商 余额" blue label → bar → balance number → consumed → pct → time
    parts.push(
      BLUE + label + ' 余额' + RESET + ' ' +
      barStr + ' ' +
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
