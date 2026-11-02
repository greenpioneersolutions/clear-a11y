import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScanResult } from '@clear-a11y/core';
import type { RepoScanOptions, ScanOptions } from '@clear-a11y/runner';
import type { BrowserInstaller } from '../../src/main/browsers.js';
import { createIpcHandlers, type DialogDeps, type IpcHandlers } from '../../src/main/ipc.js';
import type { ScanFns } from '../../src/main/scans.js';
import {
  createServices,
  type DesktopServices,
  type DesktopServicesOptions,
} from '../../src/main/services.js';
import type { EventChannel } from '../../src/shared/channels.js';
import { sampleResult } from './sample-result.js';

export interface Harness {
  dir: string;
  services: DesktopServices;
  handlers: IpcHandlers;
  events: { channel: EventChannel; data: unknown }[];
  dialogs: DialogDeps & { saved: { name: string; content: string }[]; nextFolder: string | null };
  close(): Promise<void>;
}

/** Stub runner functions: return the sample result (optionally after a delay or a wait). */
export function stubFns(
  opts: { delayMs?: number; result?: (url: string) => ScanResult; fail?: string } = {},
): ScanFns & { calls: (ScanOptions | RepoScanOptions)[] } {
  const calls: (ScanOptions | RepoScanOptions)[] = [];
  const wait = async (signal?: AbortSignal) => {
    if (!opts.delayMs) return;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, opts.delayMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      });
    });
  };
  return {
    calls,
    async scan(o) {
      calls.push(o);
      o.onProgress?.({ done: 0, total: 1, url: o.targets[0] });
      await wait(o.signal);
      if (opts.fail) throw new Error(opts.fail);
      o.onProgress?.({ done: 1, total: 1 });
      return (opts.result ?? sampleResult)(o.targets[0] as string);
    },
    async scanRepo(o) {
      calls.push(o);
      await wait();
      if (opts.fail) throw new Error(opts.fail);
      return { result: (opts.result ?? sampleResult)(`repo:${o.path}`) };
    },
  };
}

export const okInstaller: BrowserInstaller = async (onLine) => {
  onLine('Downloading Chromium 140.0 (playwright build v1228) from https://cdn.playwright.dev/x');
  onLine('|■■■■■■■■                | 50% of 170.2 MiB');
  onLine('|■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 170.2 MiB');
};

export async function createHarness(
  overrides: Partial<DesktopServicesOptions> = {},
): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-desktop-'));
  const events: Harness['events'] = [];
  const saved: { name: string; content: string }[] = [];
  const dialogs: Harness['dialogs'] = {
    saved,
    nextFolder: null,
    async pickFolder() {
      return dialogs.nextFolder;
    },
    async saveText(name, content) {
      saved.push({ name, content });
      return join(dir, name);
    },
  };
  const services = await createServices({
    dataDir: join(dir, 'data'),
    appVersion: '0.0.0-test',
    fns: stubFns(),
    installer: okInstaller,
    executablePath: () => join(dir, 'no-browser', 'chrome'),
    emit: (channel, data) => events.push({ channel, data }),
    env: {},
    heartbeatMs: 200,
    ...overrides,
  });
  return {
    dir,
    services,
    handlers: createIpcHandlers(services, dialogs),
    events,
    dialogs,
    async close() {
      await services.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Polls until `check` returns a value (not undefined/false). */
export async function until<T>(check: () => Promise<T | undefined | false>, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}
