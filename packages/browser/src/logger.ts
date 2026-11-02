import type { Logger } from './types.js';

const noop = (): void => undefined;
export const silentLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

export function consoleLogger(level: 'debug' | 'info' | 'warn' | 'error' = 'info'): Logger {
  const order = ['debug', 'info', 'warn', 'error'] as const;
  const min = order.indexOf(level);
  const log =
    (lvl: (typeof order)[number]) => (message: string, data?: Record<string, unknown>) => {
      if (order.indexOf(lvl) < min) return;
      const line = data ? `${message} ${JSON.stringify(data)}` : message;
      // Logs go to stderr so stdout stays clean for machine-readable output.
      process.stderr.write(`[clear-a11y] ${lvl}: ${line}\n`);
    };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}
