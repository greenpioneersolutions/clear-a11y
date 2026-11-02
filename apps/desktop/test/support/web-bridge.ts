/**
 * Browser-side stand-in for the preload, used by the renderer integration tests. Builds
 * `window.clearA11y` with the same `createBridge` the preload uses, but the transport is a
 * Playwright binding (`window.__clearA11yInvoke`) that calls the real IPC dispatcher in Node.
 * Main -> renderer events arrive through `window.__clearA11yEmit`.
 */
import type { IpcEnvelope } from '../../src/shared/api-types.js';
import { createBridge } from '../../src/shared/bridge.js';

type Listener = (data: unknown) => void;

interface TestWindow {
  clearA11y: unknown;
  __clearA11yInvoke(channel: string, payload: unknown): Promise<IpcEnvelope<unknown>>;
  __clearA11yEmit(channel: string, data: unknown): void;
}

const w = window as unknown as TestWindow;
const listeners = new Map<string, Set<Listener>>();

w.__clearA11yEmit = (channel, data) => {
  for (const l of listeners.get(channel) ?? []) l(data);
};

w.clearA11y = createBridge(
  (channel, payload) => w.__clearA11yInvoke(channel, payload),
  (channel, listener) => {
    const set = listeners.get(channel) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(channel, set);
    return () => {
      set.delete(listener);
    };
  },
);
