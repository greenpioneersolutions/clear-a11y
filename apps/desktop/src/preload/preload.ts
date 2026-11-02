/**
 * Sandboxed preload (bundled to CommonJS). Exposes exactly one object, `window.clearA11y`, built
 * from `ipcRenderer.invoke` and `ipcRenderer.on` for the known channels. The renderer never gets
 * `ipcRenderer`, Node, or Electron objects.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { createBridge } from '../shared/bridge.js';
import { EVENT_CHANNELS, isInvokeChannel, type EventChannel } from '../shared/channels.js';

const api = createBridge(
  (channel, payload) => {
    if (!isInvokeChannel(channel)) return Promise.resolve({ ok: false, error: 'Unknown request.' });
    return ipcRenderer.invoke(channel, payload);
  },
  (channel: EventChannel, listener) => {
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) return () => undefined;
    // Never pass the Electron event object to the page.
    const wrapped = (_event: IpcRendererEvent, data: unknown) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
);

contextBridge.exposeInMainWorld('clearA11y', api);
