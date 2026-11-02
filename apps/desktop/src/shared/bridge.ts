import type {
  AppCommand,
  BrowserInstallProgress,
  ClearA11yApi,
  IpcEnvelope,
  ScanRecord,
  Unsubscribe,
} from './api-types.js';
import type { EventChannel, InvokeChannel } from './channels.js';

/** Sends one request to main and resolves with its envelope. */
export type Invoke = (channel: InvokeChannel, payload?: unknown) => Promise<IpcEnvelope<unknown>>;
/** Subscribes to a main -> renderer event; returns the unsubscribe function. */
export type Subscribe = (channel: EventChannel, listener: (data: unknown) => void) => Unsubscribe;

/**
 * Builds `window.clearA11y` from two transport functions. The preload passes `ipcRenderer`-based
 * ones; tests pass a Playwright binding. Nothing else (no `ipcRenderer`, no Node) is exposed.
 */
export function createBridge(invoke: Invoke, subscribe: Subscribe): ClearA11yApi {
  async function call<T>(channel: InvokeChannel, payload?: unknown): Promise<T> {
    const res = await invoke(channel, payload);
    if (!res || typeof res !== 'object' || !('ok' in res)) {
      throw new Error('The app returned an unexpected response.');
    }
    if (!res.ok) throw new Error(res.error);
    return res.value as T;
  }
  const on =
    <T>(channel: EventChannel) =>
    (listener: (data: T) => void): Unsubscribe => {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      return subscribe(channel, (data) => listener(data as T));
    };

  return {
    app: {
      info: () => call('app:info'),
      onCommand: on<AppCommand>('app:command'),
    },
    targets: {
      list: () => call('targets:list'),
      add: (input) => call('targets:add', input),
      remove: (id) => call('targets:remove', { id }),
      pickFolder: () => call('targets:pickFolder'),
    },
    scans: {
      start: (targetIds) => call('scans:start', { targetIds }),
      cancel: (id) => call('scans:cancel', { id }),
      list: () => call('scans:list'),
      get: (id) => call('scans:get', { id }),
      onProgress: on<ScanRecord>('scans:progress'),
    },
    findings: {
      list: (scanId, filter) => call('findings:list', { scanId, ...(filter ?? {}) }),
    },
    report: {
      html: (scanId) => call('report:html', { scanId }),
      focusPaths: (scanId) => call('report:focusPaths', { scanId }),
    },
    review: {
      queue: (scanId) => call('review:queue', { scanId }),
      answer: (input) => call('review:answer', input),
      export: () => call('review:export'),
    },
    settings: {
      get: () => call('settings:get'),
      set: (patch) => call('settings:set', patch),
    },
    providers: {
      list: () => call('providers:list'),
      envStatus: (names) => call('providers:envStatus', { names }),
      test: () => call('providers:test'),
    },
    browsers: {
      status: () => call('browsers:status'),
      install: () => call('browsers:install'),
      useFolder: () => call('browsers:useFolder'),
      onProgress: on<BrowserInstallProgress>('browsers:progress'),
    },
  };
}
