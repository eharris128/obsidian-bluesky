declare const __DEV__: boolean;

class Logger {
    private isDev: boolean;

    constructor() {
        // Check if we're in development mode
        // This will be replaced by esbuild with a boolean value
        this.isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    }

    log(...args: unknown[]): void {
        if (this.isDev) {
            console.log('[Bluesky]', ...args);
        }
    }

    warn(...args: unknown[]): void {
        if (this.isDev) {
            console.warn('[Bluesky]', ...args);
        }
    }

    error(...args: unknown[]): void {
        if (this.isDev) {
            console.error('[Bluesky]', ...args);
        }
    }

    debug(...args: unknown[]): void {
        if (this.isDev) {
            console.debug('[Bluesky]', ...args);
        }
    }

    info(...args: unknown[]): void {
        if (this.isDev) {
            console.info('[Bluesky]', ...args);
        }
    }
}

// Export a singleton instance
export const logger = new Logger();