const KNOWN_SYMBOLS = {
    low: '○',
    medium: '◔',
    high: '◑',
    xhigh: '◕',
    max: '●',
};
/**
 * Resolve the current session's effort level.
 *
 * Resolution order (matches `extractEffortString` below):
 * 1. stdin.effort as non-empty string — original PR #471 future-proofed path.
 * 2. stdin.effort as object with string `level` — Claude Code 2.1.115+ schema
 *    (e.g., `{ "level": "max" }`).
 * 3. null.
 *
 * Non-matching inputs (numbers, booleans, arrays, objects without a string
 * `level`) return null rather than crashing.
 */
export function resolveEffortLevel(stdinEffort) {
    const fromStdin = extractEffortString(stdinEffort);
    return fromStdin ? formatEffort(fromStdin) : null;
}
function extractEffortString(value) {
    if (typeof value === 'string') {
        return value.length > 0 ? value : null;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const level = value.level;
        if (typeof level === 'string' && level.length > 0) {
            return level;
        }
    }
    return null;
}
function formatEffort(level) {
    const normalized = level.toLowerCase().trim();
    const symbol = KNOWN_SYMBOLS[normalized] ?? '';
    return { level: normalized, symbol };
}
//# sourceMappingURL=effort.js.map
