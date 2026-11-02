import { join } from 'node:path';
import type { FetchLike } from '@clear-a11y/ai';
import { createMemoryQueue, createSqliteQueue, type ScanJobResult } from '@clear-a11y/queue';
import type { AppInfo } from '../shared/api-types.js';
import type { EventChannel } from '../shared/channels.js';
import { BrowserManager, type BrowserInstaller } from './browsers.js';
import {
  createJsonCalibrationStore,
  createSqliteCalibrationStore,
  type CalibrationStore,
} from './calibration.js';
import { ResultStore } from './result-store.js';
import { ScanService, type DesktopJobPayload, type DesktopQueue, type ScanFns } from './scans.js';
import { SettingsStore, toScanConfig } from './settings.js';
import { TargetStore } from './targets.js';

/** Where the app keeps its data (Electron: `app.getPath('userData')`). */
export function dataPaths(dataDir: string) {
  return {
    dataDir,
    db: join(dataDir, 'clear-a11y.db'),
    targets: join(dataDir, 'targets.json'),
    settings: join(dataDir, 'settings.json'),
    calibrationJson: join(dataDir, 'calibration.json'),
    scans: join(dataDir, 'scans'),
  };
}

export interface DesktopServicesOptions {
  dataDir: string;
  appVersion: string;
  fns: ScanFns;
  installer: BrowserInstaller;
  /** Playwright's Chromium path (`chromium.executablePath()`). */
  executablePath(): string;
  exists?(path: string): boolean;
  /** Sends a main -> renderer event. */
  emit(channel: EventChannel, data: unknown): void;
  env?: Record<string, string | undefined>;
  /** Only used by "Test connection" (tests inject a fake). */
  fetch?: FetchLike;
  /** `auto` tries node:sqlite and falls back to memory; `memory` forces the fallback. */
  storage?: 'auto' | 'memory';
  /** Start the scan worker right away (default true). */
  startWorker?: boolean;
  electronVersion?: string;
  heartbeatMs?: number;
  onError?(err: unknown): void;
}

export interface DesktopServices {
  info: AppInfo;
  paths: ReturnType<typeof dataPaths>;
  appVersion: string;
  env: Record<string, string | undefined>;
  fetch?: FetchLike;
  targets: TargetStore;
  settings: SettingsStore;
  scans: ScanService;
  calibration: CalibrationStore;
  browsers: BrowserManager;
  close(): Promise<void>;
}

async function openStorage(
  paths: ReturnType<typeof dataPaths>,
  mode: 'auto' | 'memory',
  onError?: (err: unknown) => void,
): Promise<{ queue: DesktopQueue; calibration: CalibrationStore }> {
  if (mode === 'auto') {
    try {
      const queue = await createSqliteQueue<DesktopJobPayload, ScanJobResult>({
        path: paths.db,
        name: 'desktop-scans',
      });
      const calibration = await createSqliteCalibrationStore(paths.db);
      return { queue, calibration };
    } catch (err) {
      // node:sqlite missing (or the file can't be opened): keep working with the fallbacks.
      onError?.(err);
    }
  }
  return {
    queue: createMemoryQueue<DesktopJobPayload, ScanJobResult>(),
    calibration: createJsonCalibrationStore(paths.calibrationJson),
  };
}

/** Builds every main-process service. Plain Node: no Electron import, so it unit-tests anywhere. */
export async function createServices(o: DesktopServicesOptions): Promise<DesktopServices> {
  const paths = dataPaths(o.dataDir);
  const env = o.env ?? process.env;
  const targets = new TargetStore(paths.targets);
  const settings = new SettingsStore(paths.settings);
  const { queue, calibration } = await openStorage(paths, o.storage ?? 'auto', o.onError);
  const scans = new ScanService({
    queue,
    store: new ResultStore(paths.scans),
    fns: o.fns,
    configFor: async () => toScanConfig(await settings.get()),
    onChange: (record) => o.emit('scans:progress', record),
    toolVersion: o.appVersion,
    ...(o.heartbeatMs ? { heartbeatMs: o.heartbeatMs } : {}),
    ...(o.onError ? { onError: o.onError } : {}),
  });
  const browsers = new BrowserManager({
    executablePath: o.executablePath,
    ...(o.exists ? { exists: o.exists } : {}),
    installer: o.installer,
    onProgress: (p) => o.emit('browsers:progress', p),
    browsersPath: () => env['PLAYWRIGHT_BROWSERS_PATH'] || undefined,
  });
  if (o.startWorker !== false) scans.startWorker();
  const info: AppInfo = {
    version: o.appVersion,
    platform: process.platform,
    storage: queue.kind === 'sqlite' ? 'sqlite' : 'memory',
    dataDir: paths.dataDir,
    nodeVersion: process.versions.node,
    ...(o.electronVersion ? { electronVersion: o.electronVersion } : {}),
  };
  return {
    info,
    paths,
    appVersion: o.appVersion,
    env,
    ...(o.fetch ? { fetch: o.fetch } : {}),
    targets,
    settings,
    scans,
    calibration,
    browsers,
    async close() {
      browsers.cancel();
      await scans.close();
      await calibration.close();
    },
  };
}
