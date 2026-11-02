import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StaticServer } from '@clear-a11y/browser';
import { startFixtureServer } from '@clear-a11y/test-utils';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import { APP_DIR } from './support/renderer.js';

/**
 * Finds the Electron binary WITHOUT downloading it. Since Electron 45, `require('electron')` from
 * Node downloads the binary on first use, so this never calls it: it reads `path.txt` and checks
 * that `dist/<path>` exists.
 */
function electronBinary(): string | undefined {
  try {
    const dir = dirname(
      createRequire(join(APP_DIR, 'package.json')).resolve('electron/package.json'),
    );
    const pathFile = join(dir, 'path.txt');
    if (!existsSync(pathFile)) return undefined;
    const rel = readFileSync(pathFile, 'utf8').trim();
    const bin = process.env['ELECTRON_OVERRIDE_DIST_PATH']
      ? join(process.env['ELECTRON_OVERRIDE_DIST_PATH'], rel)
      : join(dir, 'dist', rel);
    return existsSync(bin) ? bin : undefined;
  } catch {
    return undefined;
  }
}

function skipReason(bin: string | undefined): string | undefined {
  if (!bin) {
    return 'Electron binary not installed (pnpm install never downloads it). Fetch it with `pnpm nx run desktop:fetch-electron`, then run this test again.';
  }
  if (process.platform === 'linux' && !process.env['DISPLAY'] && !process.env['WAYLAND_DISPLAY']) {
    return 'No display on Linux. Run the integration tests under xvfb: `xvfb-run -a pnpm nx run desktop:test-integration`.';
  }
  return undefined;
}

const BIN = electronBinary();
const REASON = skipReason(BIN);
if (REASON) console.warn(`[desktop smoke] skipped: ${REASON}`);

describe.skipIf(Boolean(REASON))('Electron smoke test', () => {
  let app: ElectronApplication;
  let win: Page;
  let dataDir: string;
  let fixtures: StaticServer;

  beforeAll(async () => {
    fixtures = await startFixtureServer();
    dataDir = await mkdtemp(join(tmpdir(), 'clear-a11y-electron-'));
    app = await _electron.launch({
      executablePath: BIN as string,
      args: [APP_DIR],
      env: { ...process.env, CLEAR_A11Y_DESKTOP_DATA_DIR: dataDir } as Record<string, string>,
    });
    win = await app.firstWindow();
    await win.getByRole('heading', { level: 1, name: 'Targets' }).waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await fixtures?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('runs with isolation, the sandbox and no Node in the renderer', async () => {
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      // Not in Electron's typings, but a public runtime method used by security audits.
      return (
        w?.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }
      ).getLastWebPreferences();
    });
    expect(prefs).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true });
    expect(await win.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe(
      'undefined',
    );
    expect(await win.evaluate(() => typeof (globalThis as { process?: unknown }).process)).toBe(
      'undefined',
    );
    expect(win.url()).toMatch(/^clear-a11y:\/\/app\/index\.html/);
  });

  it('blocks navigation away from the app', async () => {
    await win.evaluate(() => {
      window.location.href = 'https://example.com/';
    });
    await win.waitForTimeout(500);
    expect(win.url()).toMatch(/^clear-a11y:\/\/app\//);
  });

  it('adds a target, scans it, opens the report and saves a review answer', async () => {
    const info = await app.evaluate(() => ({ node: process.versions.node }));
    console.log(`[desktop smoke] Electron's Node: ${info.node}`);
    await win.getByLabel('Web address').fill(fixtures.url('keyboard/skip-link-missing.html'));
    await win.getByRole('button', { name: 'Add website' }).click();
    await win.getByRole('button', { name: /^Scan 127\.0\.0\.1/ }).click();
    await win.getByRole('heading', { name: 'Past scans (1)' }).waitFor({ timeout: 150_000 });
    await win.getByRole('link', { name: /^Review questions for/ }).click();
    await win.getByRole('heading', { level: 1, name: 'Review questions' }).waitFor();
    await win.getByRole('button', { name: 'Yes', exact: true }).click();
    await win.getByRole('status').filter({ hasText: 'Saved: Yes' }).waitFor();
    const db = new DatabaseSync(join(dataDir, 'clear-a11y.db'));
    try {
      const rows = db.prepare('SELECT answer, rule_id FROM calibration_answers').all();
      expect(rows).toEqual([expect.objectContaining({ answer: 'yes' })]);
    } finally {
      db.close();
    }
  }, 180_000);
});
