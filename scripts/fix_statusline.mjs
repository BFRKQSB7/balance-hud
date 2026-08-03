#!/usr/bin/env node
/**
 * Balance HUD — statusLine 守卫
 *
 * ccswitch (代理切换工具) 重写 ~/.claude/settings.json 时会丢弃 statusLine 键,
 * 导致 HUD 不显示。此脚本幂等地把 statusLine 补回,保留其余所有设置。
 *
 * 用法:
 *   node fix_statusline.mjs           一次性修复
 *   node fix_statusline.mjs --watch   每 2s 轮询,statusLine 缺失时立即补回 (常驻)
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

// Derive everything from this script's own location so it works on any machine,
// regardless of username, install directory, or marketplace cache layout:
//   <configDir>/plugins/balance-hud/scripts/fix_statusline.mjs           (direct install)
//   <configDir>/plugins/cache/<marketplace>/balance-hud/<ver>/scripts/…   (marketplace install)
// The statusline.mjs wrapper lives at the plugin root, one level above scripts/.
const SETTINGS = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json')
  : path.join(os.homedir(), '.claude', 'settings.json');
const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WRAPPER = path.join(PLUGIN_ROOT, 'statusline.mjs').replace(/\\/g, '/');
const COMMAND = `node "${WRAPPER}"`;
const DESIRED = { statusLine: { type: 'command', command: COMMAND } };

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Returns true if the file changed (statusLine was missing/incorrect and got
 * restored), false if already fine or left untouched.
 */
function ensureStatusLine() {
  if (!existsSync(SETTINGS)) {
    writeFileSync(SETTINGS, JSON.stringify(DESIRED, null, 2), 'utf8');
    return true;
  }
  const current = readJson(SETTINGS);
  if (!current) {
    return false; // invalid JSON — don't overwrite, user must fix manually
  }
  // Only restore a MISSING statusLine. If the user has configured a different
  // statusline command, leave it untouched — the guard's job is to undo
  // ccswitch stripping the key, not to override deliberate choices.
  if (current.statusLine) {
    return false;
  }
  try {
    copyFileSync(SETTINGS, `${SETTINGS}.bak.${Date.now()}`);
  } catch {
    /* backup best-effort */
  }
  const next = { ...current, ...DESIRED };
  writeFileSync(SETTINGS, JSON.stringify(next, null, 2), 'utf8');
  return true;
}

const watchMode = process.argv.includes('--watch');
if (watchMode) {
  try { ensureStatusLine(); } catch { /* ignore */ }
  // Primary: react immediately to file changes (ccswitch rewrites settings.json).
  // Fallback: poll every 2s in case the watcher misses a rapid overwrite.
  let timer = null;
  const onChange = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try { ensureStatusLine(); } catch { /* ignore */ }
    }, 300);
  };
  try {
    watch(SETTINGS, onChange);
  } catch {
    /* fall back to polling only */
  }
  setInterval(() => {
    try { ensureStatusLine(); } catch { /* ignore */ }
  }, 2000);
  process.stdin.resume();
} else {
  const changed = ensureStatusLine();
  process.exit(changed ? 0 : 0);
}
