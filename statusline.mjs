import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Claude Code pipes the subprocess stdout, so process.stdout.columns is
// unavailable at runtime. Prefer inherited COLUMNS, else fall back to 120.
// The - 4 accounts for Claude Code's input area padding.
const envColumns = Number.parseInt(process.env.COLUMNS ?? '', 10);
const width = Number.isFinite(envColumns) && envColumns > 0 ? envColumns : 120;
process.env.COLUMNS = String(Math.max(1, width - 4));

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

// Prefer the direct install path (unzip -d ~/.claude/plugins/), then fall back
// to scanning the marketplace cache for the latest balance-hud version.
const directEntry = path.join(claudeDir, 'plugins', 'balance-hud', 'dist', 'index.js');

function versionParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  return match ? match.slice(1, 4).map(Number) : null;
}

function findLatestCached() {
  const cacheDir = path.join(claudeDir, 'plugins', 'cache');
  const candidates = [];
  try {
    for (const marketplace of fs.readdirSync(cacheDir, { withFileTypes: true })) {
      if (!marketplace.isDirectory()) continue;
      const pluginRoot = path.join(cacheDir, marketplace.name, 'balance-hud');
      let versions = [];
      try {
        versions = fs.readdirSync(pluginRoot, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const version of versions) {
        if (!version.isDirectory()) continue;
        const parts = versionParts(version.name);
        if (!parts) continue;
        const dir = path.join(pluginRoot, version.name);
        if (fs.existsSync(path.join(dir, 'dist', 'index.js'))) {
          candidates.push({ dir, parts });
        }
      }
    }
  } catch {
    return null;
  }
  candidates.sort((a, b) => a.parts[0] - b.parts[0] || a.parts[1] - b.parts[1] || a.parts[2] - b.parts[2]);
  return candidates.at(-1)?.dir ?? null;
}

let entry = fs.existsSync(directEntry) ? directEntry : null;
if (!entry) {
  const cachedDir = findLatestCached();
  if (cachedDir) entry = path.join(cachedDir, 'dist', 'index.js');
}
if (!entry) process.exit(0);

const hud = await import(pathToFileURL(entry).href);
if (typeof hud.main === 'function') {
  await hud.main();
}
