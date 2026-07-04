import { isLimitReached } from "../../types.js";
import { shouldHideUsage } from "../../stdin.js";
import { critical, label, getQuotaColor, quotaBar, RESET } from "../colors.js";
import { getAdaptiveBarWidth } from "../../utils/terminal.js";
import { t } from "../../i18n/index.js";

import { formatResetTime } from "../format-reset-time.js";
const FIVE_HOUR_WINDOW_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export function renderUsageLine(ctx, alignLabels = false) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    if (display?.showUsage === false) {
        return null;
    }
    if (!ctx.usageData) {
        return null;
    }
    if (shouldHideUsage(ctx.stdin)) {
        return null;
    }
    const usageLabel = '';
    const hasWindowData = ctx.usageData.fiveHour !== null || ctx.usageData.sevenDay !== null;
    if (!hasWindowData) {
        // No API window data — show DeepSeek balance consumed info instead
        if (ctx.usageData.balanceConsumed != null || ctx.usageData.balancePct != null) {
            return renderBalanceConsumed(ctx);
        }
        return null;
    }
    const timeFormat = normalizeTimeFormat(display?.timeFormat);
    const showResetLabel = display?.showResetLabel ?? true;
    const resetsKey = limitResetTimeFormat(timeFormat) === 'absolute' ? "format.resets" : "format.resetsIn";
    const usageCompact = display?.usageCompact ?? false;
    const usageValueMode = display?.usageValue ?? 'percent';
    if (isLimitReached(ctx.usageData)) {
        const limitTimeFormat = limitResetTimeFormat(timeFormat);
        const resetTime = ctx.usageData.fiveHour === 100
            ? formatResetTime(ctx.usageData.fiveHourResetAt, limitTimeFormat)
            : formatResetTime(ctx.usageData.sevenDayResetAt, limitTimeFormat);
        if (usageCompact) {
            return critical(`⚠ Limit${resetTime ? ` (${resetTime})` : ""}`, colors);
        }
        const resetSuffix = resetTime
            ? showResetLabel
                ? ` (${t(resetsKey)} ${resetTime})`
                : ` (${resetTime})`
            : "";
        return critical(`⚠ ${t("status.limitReached")}${resetSuffix}`, colors);
    }
    const threshold = display?.usageThreshold ?? 0;
    const fiveHour = ctx.usageData.fiveHour;
    const sevenDay = ctx.usageData.sevenDay;
    const effectiveUsage = Math.max(fiveHour ?? 0, sevenDay ?? 0);
    if (effectiveUsage < threshold) {
        return null;
    }
    const sevenDayThreshold = display?.sevenDayThreshold ?? 80;
    if (usageCompact) {
        const fiveHourPart = fiveHour !== null
            ? formatCompactWindowPart("5h", fiveHour, ctx.usageData.fiveHourResetAt, FIVE_HOUR_WINDOW_MS, timeFormat, colors, usageValueMode)
            : null;
        const sevenDayPart = (sevenDay !== null && (fiveHour === null || sevenDay >= sevenDayThreshold))
            ? formatCompactWindowPart("7d", sevenDay, ctx.usageData.sevenDayResetAt, SEVEN_DAY_WINDOW_MS, timeFormat, colors, usageValueMode)
            : null;
        if (fiveHourPart && sevenDayPart) {
            return `${fiveHourPart} | ${sevenDayPart}`;
        }
        const compactLine = fiveHourPart ?? sevenDayPart;
        return compactLine ? compactLine : null;
    }
    const usageBarEnabled = display?.usageBarEnabled ?? true;
    const barWidth = getAdaptiveBarWidth();
    if (fiveHour === null && sevenDay !== null) {
        const weeklyOnlyPart = formatUsageWindowPart({
            percent: sevenDay,
            resetAt: ctx.usageData.sevenDayResetAt,
            windowMs: SEVEN_DAY_WINDOW_MS,
            colors,
            usageBarEnabled,
            barWidth,
            timeFormat,
            showResetLabel,
            usageValueMode,
        });
        return weeklyOnlyPart;
    }
    const fiveHourPart = formatUsageWindowPart({
        percent: fiveHour,
        resetAt: ctx.usageData.fiveHourResetAt,
        windowMs: FIVE_HOUR_WINDOW_MS,
        colors,
        usageBarEnabled,
        barWidth,
        timeFormat,
        showResetLabel,
        usageValueMode,
    });
    if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
        const sevenDayPart = formatUsageWindowPart({
            percent: sevenDay,
            resetAt: ctx.usageData.sevenDayResetAt,
            windowMs: SEVEN_DAY_WINDOW_MS,
            colors,
            usageBarEnabled,
            barWidth,
            timeFormat,
            showResetLabel,
            usageValueMode,
        });
        return `${fiveHourPart} | ${sevenDayPart}`;
    }
    return fiveHourPart;
}
export function renderBalanceLine(ctx) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    if (display?.showUsage === false) {
        return null;
    }
    if (!ctx.usageData?.balanceLabel) {
        return null;
    }
    if (shouldHideUsage(ctx.stdin)) {
        return null;
    }
    return ctx.usageData.balanceLabel;
}
// ANSI constants matching v1.1.3 hud_balance.mjs consumed display
const B_RED = '\x1b[31m';
const B_MAGENTA = '\x1b[95m';
const B_ORANGE = '\x1b[38;5;208m';
const B_RESET = '\x1b[0m';
function renderBalanceConsumed(ctx) {
    // Render DeepSeek balance consumed as v1.1.3-style line:
    //   RED -¥0.93  MAGENTA (6.5%)  ORANGE 20:34:27
    const d = ctx.usageData;
    const parts = [];
    if (d.balanceConsumed != null && d.balanceConsumed > 0) {
        parts.push(B_RED + '-¥' + d.balanceConsumed.toFixed(2) + B_RESET);
    }
    if (d.balancePct != null) {
        parts.push(B_MAGENTA + '(' + d.balancePct.toFixed(1) + '%)' + B_RESET);
    }
    if (d.balanceTime) {
        parts.push(B_ORANGE + d.balanceTime + B_RESET);
    }
    return parts.length > 0 ? parts.join(' ') : null;
}
function formatCompactWindowPart(windowLabel, percent, resetAt, windowMs, timeFormat, colors, usageValueMode = 'percent') {
    const usageDisplay = formatUsagePercent(percent, colors, usageValueMode);
    const reset = formatWindowTime(resetAt, windowMs, timeFormat);
    return reset
        ? `${usageDisplay} ${label(`(${reset})`, colors)}`
        : usageDisplay;
}
function formatUsagePercent(percent, colors, mode = 'percent') {
    if (percent === null) {
        return label("--", colors);
    }
    const color = getQuotaColor(percent, colors);
    const displayPercent = mode === 'remaining' ? Math.max(0, 100 - percent) : percent;
    return `${color}${displayPercent}%${RESET}`;
}
function formatUsageWindowPart({ percent, resetAt, windowMs, colors, usageBarEnabled, barWidth, timeFormat = 'relative', showResetLabel, usageValueMode = 'percent', }) {
    const usageDisplay = formatUsagePercent(percent, colors, usageValueMode);
    const reset = formatWindowTime(resetAt, windowMs, timeFormat);
    const showResetWording = timeFormat !== 'elapsed' && timeFormat !== 'elapsedAndAbsolute';
    const resetsKey = timeFormat === 'absolute' ? "format.resets" : "format.resetsIn";
    const resetSuffix = reset
        ? showResetLabel && showResetWording
            ? `(${t(resetsKey)} ${reset})`
            : `(${reset})`
        : "";
    if (usageBarEnabled) {
        return resetSuffix
            ? `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay} ${resetSuffix}`
            : `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay}`;
    }
    return resetSuffix
        ? `${usageDisplay} ${resetSuffix}`
        : usageDisplay;
}
function normalizeTimeFormat(value) {
    if (value === 'absolute'
        || value === 'both'
        || value === 'elapsed'
        || value === 'elapsedAndAbsolute') {
        return value;
    }
    return 'relative';
}
function limitResetTimeFormat(timeFormat) {
    if (timeFormat === 'elapsedAndAbsolute') {
        return 'absolute';
    }
    if (timeFormat === 'elapsed') {
        return 'relative';
    }
    return timeFormat;
}
function formatWindowTime(resetAt, windowMs, timeFormat) {
    if (timeFormat === 'elapsed') {
        return formatElapsedWindow(resetAt, windowMs);
    }
    if (timeFormat === 'elapsedAndAbsolute') {
        const elapsed = formatElapsedWindow(resetAt, windowMs);
        const absolute = formatResetTime(resetAt, 'absolute');
        if (elapsed && absolute) {
            return `${elapsed}, ${absolute}`;
        }
        return elapsed || absolute;
    }
    return formatResetTime(resetAt, timeFormat);
}
function formatElapsedWindow(resetAt, windowMs) {
    if (!resetAt) {
        return '';
    }
    const windowStart = resetAt.getTime() - windowMs;
    const rawElapsed = ((Date.now() - windowStart) / windowMs) * 100;
    const elapsed = Math.max(0, Math.min(100, Math.round(rawElapsed)));
    return `${elapsed}% elapsed`;
}
//# sourceMappingURL=usage.js.map