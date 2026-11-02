import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import type { BrowserInstallProgress, BrowserStatus } from '../shared/api-types.js';

/** Runs the download; calls `onLine` with each output line. Rejects on failure. */
export type BrowserInstaller = (
  onLine: (line: string) => void,
  signal: AbortSignal,
) => Promise<void>;

const PERCENT = /(\d{1,3})%\s+of\s+([\d.]+\s*[KMGT]i?B)/i;
const DOWNLOADING = /^Downloading\s+(.+?)\s+(?:\(playwright build[^)]*\)\s+)?from\s+/i;

/** Turns one line of `playwright install` output into progress, or undefined for noise. */
export function parseInstallLine(line: string): BrowserInstallProgress | undefined {
  const text = line.trim();
  if (!text) return undefined;
  const pct = PERCENT.exec(text);
  if (pct) {
    const percent = Math.min(100, Number(pct[1]));
    return { phase: 'downloading', percent, message: `Downloading: ${percent}% of ${pct[2]}` };
  }
  const dl = DOWNLOADING.exec(text);
  if (dl) return { phase: 'downloading', percent: 0, message: `Downloading ${dl[1]}` };
  if (/downloaded to/i.test(text)) return { phase: 'downloading', message: text };
  return undefined;
}

const OFFLINE =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|getaddrinfo|socket hang up|network|offline|proxy/i;

/** A plain-language error for a failed download. */
export function friendlyInstallError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (OFFLINE.test(raw)) {
    return 'The browser could not be downloaded: this computer seems to be offline or the download server is blocked. Connect to the internet and try again, or choose "Use an existing browser folder" if Playwright browsers are already on this computer (for example copied from another machine).';
  }
  if (/EACCES|EPERM/i.test(raw)) {
    return 'The browser could not be saved: the app has no permission to write to the browsers folder. Choose another folder with "Use an existing browser folder".';
  }
  if (/ENOSPC/i.test(raw)) return 'The browser could not be saved: the disk is full.';
  const last = raw.trim().split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error';
  return `The browser could not be installed: ${last.slice(0, 300)}`;
}

/** True when the folder looks like a Playwright browsers folder (has a chromium build in it). */
export function looksLikeBrowsersFolder(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => /^chromium(_headless_shell)?-\d+$/.test(name));
  } catch {
    return false;
  }
}

/**
 * The installer used by the app: `node <playwright>/cli.js install chromium` in a child process.
 * Inside Electron, `execPath` is the Electron binary, so `ELECTRON_RUN_AS_NODE=1` makes it act as
 * Node. Only ever started by the user pressing "Install browser".
 */
export function spawnPlaywrightInstaller(options: {
  cliPath: string;
  execPath: string;
  env: NodeJS.ProcessEnv;
}): BrowserInstaller {
  return (onLine, signal) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(options.execPath, [options.cliPath, 'install', 'chromium'], {
        env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        signal,
      });
      const tail: string[] = [];
      const feed = (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split(/\r?\n|\r/)) {
          if (!line.trim()) continue;
          tail.push(line);
          if (tail.length > 20) tail.shift();
          onLine(line);
        }
      };
      child.stdout?.on('data', feed);
      child.stderr?.on('data', feed);
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(tail.join('\n') || `installer exited with ${code}`)),
      );
    });
}

export interface BrowserManagerOptions {
  /** Path of Playwright's Chromium (`chromium.executablePath()`). */
  executablePath(): string;
  exists?(path: string): boolean;
  installer: BrowserInstaller;
  onProgress?(progress: BrowserInstallProgress): void;
  /** The browsers folder in use, if the user chose one. */
  browsersPath?(): string | undefined;
}

/** Checks for Playwright's Chromium and installs it on request. */
export class BrowserManager {
  private installing?: Promise<BrowserStatus>;
  private abort?: AbortController;

  constructor(private readonly options: BrowserManagerOptions) {}

  status(): BrowserStatus {
    const exists = this.options.exists ?? existsSync;
    let executablePath: string | undefined;
    try {
      executablePath = this.options.executablePath();
    } catch {
      executablePath = undefined;
    }
    const browsersPath = this.options.browsersPath?.();
    return {
      installed: Boolean(executablePath && exists(executablePath)),
      installing: Boolean(this.installing),
      ...(executablePath ? { executablePath } : {}),
      ...(browsersPath ? { browsersPath } : {}),
    };
  }

  /** Downloads Chromium. Concurrent calls share one download. Resolves with the new status. */
  install(): Promise<BrowserStatus> {
    if (this.installing) return this.installing;
    const emit = (p: BrowserInstallProgress) => this.options.onProgress?.(p);
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.installing = (async () => {
      emit({ phase: 'starting', percent: 0, message: 'Starting the browser download.' });
      try {
        await this.options.installer((line) => {
          const p = parseInstallLine(line);
          if (p) emit(p);
        }, signal);
      } catch (err) {
        const message = friendlyInstallError(err);
        emit({ phase: 'error', message });
        throw new Error(message);
      } finally {
        this.installing = undefined;
      }
      const status = this.status();
      if (!status.installed) {
        const message =
          'The download finished but the browser was not found where Playwright expects it.';
        emit({ phase: 'error', message });
        throw new Error(message);
      }
      emit({ phase: 'done', percent: 100, message: 'The browser is installed.' });
      return status;
    })();
    return this.installing;
  }

  cancel(): void {
    this.abort?.abort();
  }
}
