import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  launchBrowser,
  type BrowserSession,
  type Page,
  type StaticServer,
} from '@clear-a11y/browser';
import { scan, scanRepo } from '@clear-a11y/runner';
import { fixturesReposDir, startFixtureServer } from '@clear-a11y/test-utils';
import type { BrowserContext } from 'playwright';
import { dispatchIpc } from '../src/main/ipc.js';
import type { EventChannel } from '../src/shared/channels.js';
import { bundleScript, serveRenderer } from './support/renderer.js';
import { createHarness, type Harness } from './support/services.js';

/**
 * The built renderer in Playwright Chromium. `window.clearA11y` is the same bridge the preload
 * builds, wired to the REAL IPC dispatcher and services in this Node process (temp data dir,
 * SQLite queue, real runner scanning local fixture pages). Only the Electron shell, the native
 * dialogs and the browser installer are stand-ins.
 */
describe('desktop renderer (integration)', () => {
  let fixtures: StaticServer;
  let ui: StaticServer;
  let session: BrowserSession;
  let context: BrowserContext;
  let page: Page;
  let h: Harness;
  let forward: (channel: EventChannel, data: unknown) => void = () => undefined;
  const requests: string[] = [];
  const pageErrors: string[] = [];
  const fakeChrome = () => join(h.dir, 'browsers', 'chromium-9999', 'chrome');

  beforeAll(async () => {
    fixtures = await startFixtureServer();
    ui = await serveRenderer();
    h = await createHarness({
      fns: { scan, scanRepo },
      emit: (channel, data) => forward(channel, data),
      executablePath: () => fakeChrome(),
      // Stubbed installer: never downloads; "installs" by creating the expected file.
      installer: async (onLine) => {
        onLine(
          'Downloading Chromium 140.0 (playwright build v9999) from https://example.invalid/x',
        );
        onLine('|■■■■■■■■■■■■         |  50% of 170.2 MiB');
        await mkdir(dirname(fakeChrome()), { recursive: true });
        await writeFile(fakeChrome(), '');
        onLine('|■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 170.2 MiB');
      },
    });
    session = await launchBrowser();
    context = await session.browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.exposeBinding(
      '__clearA11yInvoke',
      (_source, channel: unknown, payload: unknown) => dispatchIpc(h.handlers, channel, payload),
    );
    await context.addInitScript({ content: await bundleScript('web-bridge.ts') });
    page = await context.newPage();
    page.on('request', (r) => requests.push(r.url()));
    page.on('pageerror', (e) => pageErrors.push(e.message));
    forward = (channel, data) => {
      void page
        .evaluate(
          ([c, d]) =>
            (
              window as unknown as { __clearA11yEmit(c: unknown, d: unknown): void }
            ).__clearA11yEmit(c, d),
          [channel, data] as const,
        )
        .catch(() => undefined);
    };
    await page.goto(ui.url('index.html'));
  }, 120_000);

  afterAll(async () => {
    await context?.close();
    await session?.close();
    await h?.close();
    await ui?.close();
    await fixtures?.close();
  });

  const heading = () => page.getByRole('heading', { level: 1 });

  it('starts on Targets with one h1, landmarks and the CSP meta tag', async () => {
    await expect.poll(() => heading().textContent()).toBe('Targets');
    expect(await page.locator('h1').count()).toBe(1);
    expect(await page.locator('header').count()).toBe(1);
    expect(await page.getByRole('navigation', { name: 'Pages' }).count()).toBe(1);
    expect(await page.locator('main').count()).toBe(1);
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(await page.getByText('A browser is needed to scan websites').count()).toBe(1);
  });

  it('validates and adds website and folder targets', async () => {
    await page.getByRole('button', { name: 'Add website' }).click();
    await expect
      .poll(() => page.locator('#target-url-error').textContent())
      .toMatch(/Enter a web address/);
    expect(await page.locator('#target-url').evaluate((el) => el === document.activeElement)).toBe(
      true,
    );

    await page.getByLabel('Web address').fill('ftp://example.com/');
    await page.getByRole('button', { name: 'Add website' }).click();
    await expect
      .poll(() => page.locator('#target-url-error').textContent())
      .toBe('Only http:// and https:// addresses can be scanned.');

    for (const p of ['keyboard/focus-order-backward.html', 'keyboard/skip-link-missing.html']) {
      await page.getByLabel('Web address').fill(fixtures.url(p));
      await page.getByRole('button', { name: 'Add website' }).click();
      await expect.poll(() => page.getByText(fixtures.url(p), { exact: true }).count()).toBe(1);
    }

    h.dialogs.nextFolder = join(fixturesReposDir(), 'react-sample');
    await page.getByRole('button', { name: 'Choose folder' }).click();
    await expect
      .poll(() => page.getByLabel('Folder', { exact: true }).inputValue())
      .toBe(h.dialogs.nextFolder);
    await page.getByRole('button', { name: 'Add folder' }).click();
    await expect
      .poll(() => page.getByRole('heading', { name: 'Your targets (3)' }).count())
      .toBe(1);

    await page.getByRole('button', { name: 'Remove react-sample' }).click();
    await expect
      .poll(() => page.getByRole('heading', { name: 'Your targets (2)' }).count())
      .toBe(1);
    expect((await h.services.targets.list()).map((t) => t.kind)).toEqual(['url', 'url']);
  });

  it('runs queue-backed scans with progress and lists them as past scans', async () => {
    await page.getByRole('button', { name: 'Scan all targets' }).click();
    await expect.poll(() => heading().textContent()).toBe('Scans');
    await expect
      .poll(() => page.getByRole('heading', { name: 'Past scans (2)' }).count(), {
        timeout: 150_000,
      })
      .toBe(1);
    expect(await page.locator('.status-succeeded').count()).toBe(2);
    expect(await page.getByText('Nothing is running.').count()).toBe(1);
  }, 180_000);

  it('cancels a scan', async () => {
    const [target] = await h.services.targets.list();
    await page.goto(ui.url('index.html#/targets'));
    await page.getByRole('button', { name: `Scan ${target?.label}` }).click();
    await expect.poll(() => heading().textContent()).toBe('Scans');
    await page.getByRole('button', { name: /^Cancel the scan of/ }).click();
    await expect.poll(() => page.locator('.status-cancelled').count(), { timeout: 30_000 }).toBe(1);
  }, 60_000);

  it('shows the report with tiers, filters, evidence and the sandboxed HTML report', async () => {
    const backward = (await h.services.scans.list()).find(
      (s) => s.status === 'succeeded' && s.target.includes('focus-order-backward'),
    );
    await page.goto(ui.url('index.html#/scans'));
    await page
      .getByRole('link', { name: `Report for ${backward?.label}` })
      .first()
      .click();
    await expect.poll(() => heading().textContent()).toBe('Report');
    // Focus moved to the view heading and the change was announced.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('view-heading');
    await expect
      .poll(() => page.getByRole('status').filter({ hasText: 'Report page' }).count())
      .toBe(1);

    await expect.poll(() => page.locator('.finding').count()).toBeGreaterThan(0);
    const total = await page.locator('.finding').count();
    await page.getByLabel('Show').selectOption('likely');
    const likely = await page.locator('.finding').count();
    expect(likely).toBeLessThanOrEqual(total);
    await expect
      .poll(() => page.locator('.filter-status').textContent())
      .toBe(`Showing ${likely} of ${total} findings.`);
    await page.getByLabel('Show').selectOption('all');
    const toggle = page.locator('.finding .disclosure-button').first();
    expect(await toggle.getAttribute('aria-expanded')).toBe('false');
    await toggle.click();
    expect(await toggle.getAttribute('aria-expanded')).toBe('true');
    await expect.poll(() => page.locator('.finding.open dt').first().textContent()).toBe('WCAG');

    await page.getByRole('button', { name: 'Show the full HTML report' }).click();
    const frame = page.locator('iframe.report-frame');
    expect(await frame.getAttribute('sandbox')).toBe('');
    expect(await frame.getAttribute('title')).toBe('Full HTML report');
    await expect
      .poll(() => frame.contentFrame().getByText('backward jump').first().count(), {
        timeout: 10_000,
      })
      .toBe(1);
    // Sandboxed with no allow-scripts: the report's own script never runs inside the app.
    expect(await frame.contentFrame().locator('#filters:visible').count()).toBe(0);
  });

  it('shows the focus path overlay with the backward jump and its text alternative', async () => {
    await page.getByRole('link', { name: 'Focus path' }).click();
    await expect.poll(() => heading().textContent()).toBe('Focus path');
    await expect.poll(() => page.locator('figure.focus-path').count()).toBe(1);
    expect(await page.locator('.fp-back-label').count()).toBeGreaterThan(0);
    expect(await page.locator('polyline.fp-back').count()).toBeGreaterThan(0);
    expect(await page.locator('.fp-list li').count()).toBeGreaterThan(2);
    expect(await page.locator('.fp-list').textContent()).toContain('backward jump');
    expect(await page.getByRole('img', { name: /Diagram of the focus path/ }).count()).toBe(1);
  });

  it('answers review questions with buttons and keyboard shortcuts and saves them locally', async () => {
    const withQuestions = (await h.services.scans.list()).find(
      (s) => s.status === 'succeeded' && (s.summary?.byTier['needs-review'] ?? 0) > 0,
    );
    expect(withQuestions).toBeDefined();
    await page.goto(ui.url(`index.html#/review/${withQuestions?.id}`));
    await expect.poll(() => heading().textContent()).toBe('Review questions');
    const questions = await h.services.scans
      .result(withQuestions?.id as string)
      .then((r) => r.result.findings.filter((f) => f.tier === 'needs-review'));
    await expect
      .poll(() => page.locator('#review-question').textContent())
      .toBe(questions[0]?.question);

    await page.getByLabel('Note (optional)').fill('Checked with a screen reader.');
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await expect.poll(async () => (await h.services.calibration.list()).length).toBe(1);
    const [first] = await h.services.calibration.list();
    expect(first).toMatchObject({
      findingId: questions[0]?.id,
      answer: 'no',
      note: 'Checked with a screen reader.',
      tierAtTime: 'needs-review',
    });
    // Focus moves to the (next) question so keyboard users can keep going.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('review-question');

    if (questions.length > 1) {
      await page.keyboard.press('Alt+Shift+KeyY');
      await expect.poll(async () => (await h.services.calibration.list()).length).toBe(2);
    }
    // A single character key does nothing (WCAG 2.1.4).
    const before = (await h.services.calibration.list()).length;
    await page.locator('#review-question').press('y');
    expect((await h.services.calibration.list()).length).toBe(before);
  });

  it('saves provider settings as an env var name only and never shows key values', async () => {
    await page.goto(ui.url('index.html#/settings'));
    await expect.poll(() => heading().textContent()).toBe('Settings');
    await expect.poll(() => page.getByLabel('Provider', { exact: true }).inputValue()).toBe('none');
    await page.getByLabel('Provider', { exact: true }).selectOption('anthropic');
    await page.getByLabel('API key environment variable').fill('CLEAR_A11Y_TEST_MISSING_KEY');
    await page.getByRole('button', { name: 'Save provider' }).click();
    await expect
      .poll(() => page.locator('.ok-text', { hasText: 'Provider settings saved.' }).count())
      .toBe(1);
    expect((await h.services.settings.get()).ai).toEqual({
      provider: 'anthropic',
      apiKeyEnv: 'CLEAR_A11Y_TEST_MISSING_KEY',
    });
    expect(await page.locator('.env-status').textContent()).toContain('is not set');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect
      .poll(() => page.getByText(/CLEAR_A11Y_TEST_MISSING_KEY/).count())
      .toBeGreaterThan(1);

    await page.getByLabel('Provider', { exact: true }).selectOption('none');
    await page.getByRole('button', { name: 'Save provider' }).click();
    await expect
      .poll(async () => (await h.services.settings.get()).ai)
      .toEqual({ provider: 'none' });
  });

  it('installs the browser only when asked, with progress (stubbed installer)', async () => {
    expect(await page.getByText('Not installed').count()).toBe(1);
    await page.getByRole('button', { name: 'Install browser' }).click();
    await expect.poll(() => page.getByText('Installed', { exact: true }).count()).toBe(1);
    expect((await h.services.browsers.status()).installed).toBe(true);
  });

  it('navigates from the app menu command and loads nothing from outside', async () => {
    forward('app:command', { type: 'navigate', view: 'scans' });
    await expect.poll(() => heading().textContent()).toBe('Scans');
    expect(requests.every((u) => u.startsWith(ui.origin))).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
