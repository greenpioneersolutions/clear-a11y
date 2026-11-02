import { isAbsolute, join, resolve } from 'node:path';
import {
  consoleLogger,
  launchBrowser,
  type BrowserSession,
  type Logger,
} from '@clear-a11y/browser';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { parseAllowedOrigins } from './safety.js';
import { ScanStore } from './store.js';

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export interface ServerOptions {
  /** Base directory for scan artifacts and reports. Default `<cwd>/.clear-a11y/mcp`. */
  outDir?: string;
  /** Scans kept in memory. Default 20. */
  maxScans?: number;
  /** Origin allowlist patterns (see parseAllowedOrigins). Empty: any http(s) origin. */
  allowedOrigins?: string;
  /** Working directory that relative repo paths resolve against. */
  cwd?: string;
  /** Logger (must write to stderr: stdout is the protocol channel). */
  log?: Logger;
  /** Browser launcher (tests). */
  launch?: () => Promise<BrowserSession>;
}

export interface ServerContext {
  store: ScanStore;
  outDir: string;
  cwd: string;
  allowed: RegExp[];
  log: Logger;
  /** Shared browser, launched on first use and reused across tool calls. */
  session(): Promise<BrowserSession>;
  close(): Promise<void>;
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** Reads options from the environment (CLEAR_A11Y_* variables), then applies explicit ones. */
export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): ServerOptions {
  const max = Number(env['CLEAR_A11Y_MCP_MAX_SCANS']);
  const level = env['CLEAR_A11Y_LOG_LEVEL'] as (typeof LOG_LEVELS)[number] | undefined;
  return {
    ...(env['CLEAR_A11Y_MCP_OUT_DIR'] ? { outDir: env['CLEAR_A11Y_MCP_OUT_DIR'] } : {}),
    ...(Number.isInteger(max) && max > 0 ? { maxScans: max } : {}),
    ...(env['CLEAR_A11Y_ALLOWED_ORIGINS']
      ? { allowedOrigins: env['CLEAR_A11Y_ALLOWED_ORIGINS'] }
      : {}),
    log: consoleLogger(level && LOG_LEVELS.includes(level) ? level : 'warn'),
  };
}

export function createContext(options: ServerOptions = {}): ServerContext {
  const cwd = options.cwd ?? process.cwd();
  const outDir = options.outDir
    ? isAbsolute(options.outDir)
      ? options.outDir
      : resolve(cwd, options.outDir)
    : join(cwd, '.clear-a11y', 'mcp');
  const launch = options.launch ?? (() => launchBrowser());
  let browser: Promise<BrowserSession> | undefined;
  return {
    store: new ScanStore(options.maxScans ?? 20),
    outDir,
    cwd,
    allowed: parseAllowedOrigins(options.allowedOrigins),
    log: options.log ?? consoleLogger('warn'),
    session() {
      if (!browser) {
        const launching: Promise<BrowserSession> = launch().then(
          (session) => {
            // If the browser crashes or is closed, launch a new one on the next tool call.
            session.browser?.on?.('disconnected', () => {
              if (browser === launching) browser = undefined;
            });
            return session;
          },
          (err: unknown) => {
            browser = undefined;
            throw err;
          },
        );
        browser = launching;
      }
      return browser;
    },
    async close() {
      const b = browser;
      browser = undefined;
      if (b) await (await b).close().catch(() => undefined);
    },
  };
}

/** Sends MCP progress notifications when the client asked for them (supplied a progress token). */
export function progressReporter(extra: ToolExtra | undefined) {
  const token = extra?._meta?.progressToken;
  let progress = 0;
  return (message: string, total?: number) => {
    if (token === undefined || !extra) return;
    progress++;
    extra
      .sendNotification({
        method: 'notifications/progress',
        params: { progressToken: token, progress, ...(total ? { total } : {}), message },
      })
      .catch(() => undefined);
  };
}
