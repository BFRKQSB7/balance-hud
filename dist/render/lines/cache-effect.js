import { BRIGHT_BLUE, RESET, cacheEffectBar, getCacheEffectColor } from '../colors.js';
import { getAdaptiveBarWidth } from '../../utils/terminal.js';
import { t } from '../../i18n/index.js';

// Cache effect is "good when high" — the color scale inverts the context one.
const CACHE_THRESHOLDS = { good: 85, warn: 60 };

export function renderCacheEffectLine(ctx) {
    const display = ctx.config?.display;
    if (display?.showCacheEffect !== true) {
        return null;
    }
    const tokens = ctx.transcript.sessionTokens;
    if (!tokens) {
        return null;
    }
    const cache = (tokens.cacheCreationTokens ?? 0) + (tokens.cacheReadTokens ?? 0);
    const input = tokens.inputTokens ?? 0;
    const total = cache + input;
    if (total <= 0) {
        return null;
    }
    const pct = Math.min(100, Math.max(0, Math.round((cache / total) * 100)));
    const colors = ctx.config?.colors;
    const labelText = `${BRIGHT_BLUE}${t('label.cacheEffect')}${RESET}`;
    const value = `${getCacheEffectColor(pct, colors, CACHE_THRESHOLDS)}${pct}%${RESET}`;
    return `${labelText} ${cacheEffectBar(pct, getAdaptiveBarWidth(), colors, CACHE_THRESHOLDS)} ${value}`;
}
//# sourceMappingURL=cache-effect.js.map
