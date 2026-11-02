import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserInstallProgress } from '../shared/api-types.js';
import {
  BrowserManager,
  friendlyInstallError,
  looksLikeBrowsersFolder,
  parseInstallLine,
  type BrowserInstaller,
} from './browsers.js';

describe('parseInstallLine', () => {
  it('reads Playwright installer output', () => {
    expect(
      parseInstallLine(
        'Downloading Chromium 140.0.7339.16 (playwright build v1228) from https://cdn.playwright.dev/x.zip',
      ),
    ).toEqual({ phase: 'downloading', percent: 0, message: 'Downloading Chromium 140.0.7339.16' });
    expect(parseInstallLine('|■■■■■■■■■■         |  42% of 170.2 MiB')).toEqual({
      phase: 'downloading',
      percent: 42,
      message: 'Downloading: 42% of 170.2 MiB',
    });
    expect(
      parseInstallLine(
        'Chromium 140 downloaded to /Users/me/Library/Caches/ms-playwright/chromium-1228',
      ),
    ).toMatchObject({ phase: 'downloading' });
    expect(parseInstallLine('')).toBeUndefined();
    expect(parseInstallLine('random noise')).toBeUndefined();
  });
});

describe('friendlyInstallError', () => {
  it('explains offline failures in plain words', () => {
    expect(friendlyInstallError(new Error('getaddrinfo ENOTFOUND cdn.playwright.dev'))).toMatch(
      /seems to be offline.*Use an existing browser folder/,
    );
    expect(friendlyInstallError(new Error('EACCES: permission denied'))).toMatch(/no permission/);
    expect(friendlyInstallError(new Error('line 1\nFailed to install chromium'))).toBe(
      'The browser could not be installed: Failed to install chromium',
    );
  });
});

describe('looksLikeBrowsersFolder', () => {
  it('needs a chromium build folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-browsers-'));
    expect(looksLikeBrowsersFolder(dir)).toBe(false);
    await mkdir(join(dir, 'chromium_headless_shell-1228'));
    expect(looksLikeBrowsersFolder(dir)).toBe(true);
    expect(looksLikeBrowsersFolder(join(dir, 'missing'))).toBe(false);
  });
});

describe('BrowserManager', () => {
  const exe = '/cache/ms-playwright/chromium-1228/chrome';

  it('reports status from the executable path', () => {
    const installed = new Set<string>();
    const m = new BrowserManager({
      executablePath: () => exe,
      exists: (p) => installed.has(p),
      installer: async () => undefined,
    });
    expect(m.status()).toEqual({ installed: false, installing: false, executablePath: exe });
    installed.add(exe);
    expect(m.status().installed).toBe(true);
  });

  it('installs with progress, sharing one download between concurrent calls', async () => {
    const installed = new Set<string>();
    let runs = 0;
    const installer: BrowserInstaller = async (onLine) => {
      runs++;
      onLine('|■■■■■     | 50% of 170.2 MiB');
      installed.add(exe);
    };
    const progress: BrowserInstallProgress[] = [];
    const m = new BrowserManager({
      executablePath: () => exe,
      exists: (p) => installed.has(p),
      installer,
      onProgress: (p) => progress.push(p),
    });
    const [a, b] = await Promise.all([m.install(), m.install()]);
    expect(runs).toBe(1);
    expect(a).toEqual(b);
    expect(a.installed).toBe(true);
    expect(progress.map((p) => p.phase)).toEqual(['starting', 'downloading', 'done']);
  });

  it('turns installer failures into a friendly error event and rejection', async () => {
    const progress: BrowserInstallProgress[] = [];
    const m = new BrowserManager({
      executablePath: () => exe,
      exists: () => false,
      installer: async () => {
        throw new Error('getaddrinfo EAI_AGAIN cdn.playwright.dev');
      },
      onProgress: (p) => progress.push(p),
    });
    await expect(m.install()).rejects.toThrow(/offline/);
    expect(progress.at(-1)?.phase).toBe('error');
    expect(m.status().installing).toBe(false);
  });

  it('fails clearly when the download finishes but no browser is found', async () => {
    const m = new BrowserManager({
      executablePath: () => exe,
      exists: () => false,
      installer: async () => undefined,
    });
    await expect(m.install()).rejects.toThrow(/not found/);
  });
});
