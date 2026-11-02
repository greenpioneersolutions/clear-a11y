import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, scanRepo } from '@clear-a11y/runner';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { chromium } from 'playwright';
import type { EventChannel } from '../shared/channels.js';
import { spawnPlaywrightInstaller } from './browsers.js';
import { createIpcHandlers, registerIpc, type DialogDeps } from './ipc.js';
import { buildMenuTemplate } from './menu.js';
import {
  APP_ENTRY,
  APP_SCHEME,
  appResponseHeaders,
  denyAllPermissions,
  hardenWebContents,
  isAppUrl,
  resolveAppAsset,
  secureWebPreferences,
} from './security.js';
import { createServices, type DesktopServices } from './services.js';

const here = dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = join(here, '..', 'renderer');
const PRELOAD = join(here, '..', 'preload', 'preload.cjs');

let mainWindow: BrowserWindow | undefined;
let services: DesktopServices | undefined;

function send(channel: EventChannel, data: unknown): void {
  const wc: WebContents | undefined = mainWindow?.webContents;
  if (wc && !wc.isDestroyed()) wc.send(channel, data);
}

function serveRenderer(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppAsset(RENDERER_DIR, request.url);
    if (!file) return new Response('Not found', { status: 404 });
    try {
      return new Response(await readFile(file), { headers: appResponseHeaders(file) });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

/** No remote content in the app window: only app assets, inline data and DevTools load. */
function blockRemoteRequests(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      isAppUrl(url) ||
      url.startsWith('data:') ||
      url.startsWith('devtools:') ||
      url === 'about:blank';
    callback({ cancel: !allowed });
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: 'Clear A11Y',
    backgroundColor: '#ffffff',
    webPreferences: secureWebPreferences(PRELOAD),
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(APP_ENTRY);
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = undefined;
  });
  return win;
}

const dialogs: DialogDeps = {
  async pickFolder(title) {
    const options = { title, properties: ['openDirectory' as const] };
    const res = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return res.canceled ? null : (res.filePaths[0] ?? null);
  },
  async saveText(defaultName, content) {
    const options = {
      title: 'Export review answers',
      defaultPath: join(app.getPath('documents'), defaultName),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const res = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (res.canceled || !res.filePath) return null;
    await writeFile(res.filePath, content, 'utf8');
    return res.filePath;
  },
};

export async function startApp(): Promise<void> {
  const require = createRequire(import.meta.url);
  const playwrightCli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');

  denyAllPermissions(session.defaultSession);
  blockRemoteRequests();
  serveRenderer();
  app.on('web-contents-created', (_event, contents) =>
    hardenWebContents(contents, { openExternal: (url) => void shell.openExternal(url) }),
  );

  services = await createServices({
    dataDir: app.getPath('userData'),
    appVersion: app.getVersion(),
    fns: { scan, scanRepo },
    installer: spawnPlaywrightInstaller({
      cliPath: playwrightCli,
      execPath: process.execPath,
      env: process.env,
    }),
    executablePath: () => chromium.executablePath(),
    emit: send,
    electronVersion: process.versions.electron,
    onError: (err) => console.error('[clear-a11y]', (err as Error).message ?? err),
  });

  // Only the app's own top-level page may call the API.
  registerIpc(ipcMain, createIpcHandlers(services, dialogs), (url) => isAppUrl(url));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      // Structurally the same shape; roles are checked by the unit test of buildMenuTemplate.
      buildMenuTemplate((command) => send('app:command', command)) as MenuItemConstructorOptions[],
    ),
  );

  mainWindow = createWindow();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on('activate', () => {
    if (!mainWindow) mainWindow = createWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  let closing = false;
  app.on('before-quit', (event) => {
    if (closing || !services) return;
    closing = true;
    event.preventDefault();
    void services.close().finally(() => app.quit());
  });
}
