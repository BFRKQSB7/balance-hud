import { readStdin, getUsageFromStdin } from "./stdin.js";
import { parseTranscript } from "./transcript.js";
import { render } from "./render/index.js";
import { countConfigs } from "./config-reader.js";
import { getGitStatus } from "./git.js";
import { loadConfig } from "./config.js";
import { parseExtraCmdArg, runExtraCmd } from "./extra-cmd.js";
import { getClaudeCodeVersion } from "./version.js";
import { getMemoryUsage } from "./memory.js";
import { resolveEffortLevel } from "./effort.js";
import { applyContextWindowFallback } from "./context-cache.js";
import { getUsageFromExternalSnapshot, writeExternalUsageSnapshot } from "./external-usage.js";
import { setLanguage, t } from "./i18n/index.js";
export { getUsageFromExternalSnapshot, writeExternalUsageSnapshot } from "./external-usage.js";
import { fileURLToPath } from "node:url";
import { realpathSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
/**
 * Returns true when the HUD is disabled for this invocation via the
 * CLAUDE_HUD_DISABLE environment variable. Any non-blank value other than an
 * explicit negative (`0`, `false`, `off`, `no`, case-insensitive) disables the
 * HUD, so users can launch sessions without it (`CLAUDE_HUD_DISABLE=1 claude`)
 * while keeping the statusLine entry in settings.json intact.
 */
export function isHudDisabled(env = process.env) {
    const value = (env.BALANCE_HUD_DISABLE || env.CLAUDE_HUD_DISABLE)?.trim().toLowerCase();
    if (value === undefined || value === "") {
        return false;
    }
    return value !== "0" && value !== "false" && value !== "off" && value !== "no";
}
export async function main(overrides = {}) {
    if (isHudDisabled()) {
        // Print nothing so Claude Code renders an empty statusline, and skip all
        // work (stdin parse, transcript scan, git) for the ~300ms polling loop.
        return;
    }
    const deps = {
        readStdin,
        getUsageFromStdin,
        getUsageFromExternalSnapshot,
        writeExternalUsageSnapshot,
        parseTranscript,
        countConfigs,
        getGitStatus,
        loadConfig,
        parseExtraCmdArg,
        runExtraCmd,
        getClaudeCodeVersion,
        getMemoryUsage,
        applyContextWindowFallback,
        render,
        now: () => Date.now(),
        log: console.log,
        ...overrides,
    };
    try {
        const stdin = await deps.readStdin();
        if (!stdin) {
            // Running without stdin - this happens during setup verification
            const config = await deps.loadConfig();
            setLanguage(config.language);
            const isMacOS = process.platform === "darwin";
            deps.log(t("init.initializing"));
            if (isMacOS) {
                deps.log(t("init.macosNote"));
            }
            return;
        }
        const transcriptPath = stdin.transcript_path ?? "";
        const transcript = await deps.parseTranscript(transcriptPath);
        deps.applyContextWindowFallback(stdin, {}, transcript.sessionName, {
            lastCompactBoundaryAt: transcript.lastCompactBoundaryAt,
            lastCompactPostTokens: transcript.lastCompactPostTokens,
        });
        const { claudeMdCount, rulesCount, mcpCount, hooksCount, outputStyle } = await deps.countConfigs(stdin.cwd);
        const config = await deps.loadConfig();
        setLanguage(config.language);
        const gitStatus = config.gitStatus.enabled
            ? await deps.getGitStatus(stdin.cwd)
            : null;
        let usageData = null;
        const shouldReadUsage = config.display.showUsage !== false;
        const shouldWriteUsage = Boolean(config.display.externalUsageWritePath);
        const stdinUsage = shouldReadUsage || shouldWriteUsage
            ? deps.getUsageFromStdin(stdin)
            : null;
        if (shouldWriteUsage && stdinUsage) {
            deps.writeExternalUsageSnapshot(config, stdinUsage, deps.now());
        }
        // ── Auto-detect balance snapshot from plugin directory ────
        // This allows balance-hud to show API balance AND usage quotas without
        // manual externalUsagePath configuration. The auto_refresh daemon writes
        // balance_usage.json next to the plugin root.
        const autoUsage = tryLoadAutoSnapshot(config, deps);

        if (shouldReadUsage) {
            usageData = stdinUsage;
            if (!usageData) {
                usageData = deps.getUsageFromExternalSnapshot(config, deps.now());
            }
            else if (config.display.externalUsagePath) {
                const ext = deps.getUsageFromExternalSnapshot(config, deps.now());
                if (ext != null) {
                    usageData = {
                        ...usageData,
                        ...(ext.balanceLabel != null && { balanceLabel: ext.balanceLabel }),
                        // If stdin did not provide sevenDay (e.g. third-party clients like the
                        // Claudian Obsidian plugin that only surface five_hour), fall back to the
                        // external snapshot so the weekly limit still shows in the HUD.
                        ...(usageData.sevenDay == null && ext.sevenDay != null && {
                            sevenDay: ext.sevenDay,
                            sevenDayResetAt: ext.sevenDayResetAt ?? null,
                        }),
                    };
                }
            }
            // ── Auto-detect balance snapshot (no externalUsagePath configured) ──
            if (autoUsage) {
                if (usageData) {
                    if (usageData.balanceLabel == null && autoUsage.balanceLabel != null) {
                        usageData = { ...usageData, balanceLabel: autoUsage.balanceLabel };
                    }
                    if (usageData.fiveHour == null && autoUsage.fiveHour != null) {
                        usageData = { ...usageData, fiveHour: autoUsage.fiveHour, fiveHourResetAt: autoUsage.fiveHourResetAt ?? null };
                    }
                    if (usageData.sevenDay == null && autoUsage.sevenDay != null) {
                        usageData = { ...usageData, sevenDay: autoUsage.sevenDay, sevenDayResetAt: autoUsage.sevenDayResetAt ?? null };
                    }
                }
                else {
                    usageData = autoUsage;
                }
            }
        }
        const extraCmd = deps.parseExtraCmdArg();
        const extraLabel = extraCmd ? await deps.runExtraCmd(extraCmd) : null;
        const sessionDuration = formatSessionDuration(transcript.sessionStart, deps.now);
        const claudeCodeVersion = config.display.showClaudeCodeVersion
            ? await deps.getClaudeCodeVersion()
            : undefined;
        const effortInfo = config.display.showEffortLevel
            ? resolveEffortLevel(stdin.effort)
            : null;
        const memoryUsage = config.display.showMemoryUsage && config.lineLayout === "expanded"
            ? await deps.getMemoryUsage()
            : null;
        const ctx = {
            stdin,
            transcript,
            claudeMdCount,
            rulesCount,
            mcpCount,
            hooksCount,
            sessionDuration,
            gitStatus,
            usageData,
            memoryUsage,
            config,
            extraLabel,
            outputStyle,
            claudeCodeVersion,
            effortLevel: effortInfo?.level,
            effortSymbol: effortInfo?.symbol,
        };
        deps.render(ctx);
    }
    catch (error) {
        deps.log("[balance-hud] Error:", error instanceof Error ? error.message : "Unknown error");
    }
}
/**
 * True when the current environment is genuinely pointing at DeepSeek, i.e. a
 * balance snapshot should be considered. Mirrors auto_refresh's getKeys():
 * an explicit DEEPSEEK_API_KEY always counts; ANTHROPIC_AUTH_TOKEN only counts
 * when the base URL contains "deepseek". A third-party relay (e.g. ccswitch →
 * OpenCode Go) must never surface a DeepSeek balance row — even if a lingering
 * daemon from a previous DeepSeek session keeps writing a fresh snapshot.
 */
function isDeepSeekEnv(env = process.env) {
    if (env.DEEPSEEK_API_KEY?.trim()) {
        return true;
    }
    const baseUrl = (env.ANTHROPIC_BASE_URL || env.ANTHROPIC_API_BASE_URL || '').toLowerCase();
    const token = env.ANTHROPIC_AUTH_TOKEN?.trim() || '';
    return Boolean(token && baseUrl.includes('deepseek'));
}
/**
 * Try to load the full usage snapshot from the plugin's balance_usage.json.
 * The auto_refresh daemon writes this file after each DeepSeek API poll.
 * Returns a usage object { fiveHour, sevenDay, fiveHourResetAt, sevenDayResetAt, balanceLabel }
 * or null if not available / stale.
 */
function tryLoadAutoSnapshot(config, deps) {
    try {
        // If externalUsagePath is explicitly set, skip auto-detection
        if (config.display.externalUsagePath) return null;
        // Never surface a balance snapshot in a non-DeepSeek session.
        if (!isDeepSeekEnv()) return null;
        // Resolve plugin root: dist/index.js → ../balance_usage.json
        const distDir = dirname(fileURLToPath(import.meta.url));
        const pluginRoot = join(distDir, '..');
        return deps.getUsageFromExternalSnapshot(
            { ...config, display: { ...config.display, externalUsagePath: join(pluginRoot, 'balance_usage.json') } },
            deps.now()
        );
    } catch {
        return null;
    }
}

export function formatSessionDuration(sessionStart, now = () => Date.now()) {
    if (!sessionStart) {
        return "";
    }
    const ms = now() - sessionStart.getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1)
        return "<1m";
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
}
const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a, b) => {
    try {
        return realpathSync(a) === realpathSync(b);
    }
    catch {
        return a === b;
    }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
    void main();
}
//# sourceMappingURL=index.js.map