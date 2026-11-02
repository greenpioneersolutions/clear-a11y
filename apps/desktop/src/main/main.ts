/**
 * Electron entry point (ESM). Sets up what must happen before `app.ready` and before Playwright
 * is loaded, then hands over to `app.ts`. Everything testable lives in plain Node modules
 * (services, ipc, security); this file and app.ts are the thin Electron shell.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, protocol } from 'electron';
import { APP_SCHEME } from './security.js';

// Tests (and power users) can point the app at another data folder.
const dataDirOverride = process.env['CLEAR_A11Y_DESKTOP_DATA_DIR'];
if (dataDirOverride) app.setPath('userData', dataDirOverride);

// Playwright reads PLAYWRIGHT_BROWSERS_PATH when it loads, so a browsers folder chosen in Settings
// must be in the environment before app.ts (and with it the runner) is imported.
try {
  const raw = JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')) as {
    browsers?: { path?: unknown };
  };
  const path = raw.browsers?.path;
  if (typeof path === 'string' && path && !process.env['PLAYWRIGHT_BROWSERS_PATH']) {
    process.env['PLAYWRIGHT_BROWSERS_PATH'] = path;
  }
} catch {
  // No settings yet: Playwright uses its default browsers folder.
}

// Every renderer is sandboxed, even ones we did not create explicitly.
app.enableSandbox();

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const { startApp } = await import('./app.js');
  await app.whenReady();
  await startApp();
}
