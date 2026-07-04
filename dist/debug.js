// Shared debug logging utility
// Enable via: DEBUG=balance-hud or DEBUG=*
const DEBUG = process.env.DEBUG?.includes('balance-hud') || process.env.DEBUG === '*';
/**
 * Create a namespaced debug logger
 * @param namespace - Tag for log messages (e.g., 'config', 'usage')
 */
export function createDebug(namespace) {
    return function debug(msg, ...args) {
        if (DEBUG) {
            console.error(`[balance-hud:${namespace}] ${msg}`, ...args);
        }
    };
}
//# sourceMappingURL=debug.js.map