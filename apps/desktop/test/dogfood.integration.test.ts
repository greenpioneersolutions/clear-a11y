import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser, type BrowserSession, type StaticServer } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { scan, scanRepo } from '@clear-a11y/runner';
import { fixturesReposDir, startFixtureServer } from '@clear-a11y/test-utils';
import { dispatchIpc } from '../src/main/ipc.js';
import type { ScanRecord, Settings, Target } from '../src/shared/api-types.js';
import type { Snapshot } from './support/static-bridge.js';
import { bundleScript, SCREENSHOT_DIR, serveRenderer } from './support/renderer.js';
import { createHarness, until, type Harness } from './support/services.js';

const PAGES = [
  'keyboard/focus-order-backward.html', // focus path with a backward jump
  'keyboard/skip-link-missing.html', // needs-review question
  'static/img-missing-alt.html', // violation with a screenshot crop
];

async function call<T>(h: Harness, channel: string, payload?: unknown): Promise<T> {
  const res = await dispatchIpc(h.handlers, channel, payload);
  if (!res.ok) throw new Error(`${channel}: ${res.error}`);
  return res.value as T;
}

/**
 * Practice what we test: every view of the desktop UI must pass a full Clear A11Y scan with zero
 * `violation` findings. The built renderer is served with a fake bridge holding real data
 * (targets, finished scans of fixture pages, review questions, settings) and each view is
 * scanned with `scan` from @clear-a11y/runner and every engine.
 */
describe('desktop UI dogfood (integration)', () => {
  let fixtures: StaticServer;
  let ui: StaticServer;
  let h: Harness;
  let session: BrowserSession;
  let bridgedSession: BrowserSession;
  let snapshot: Snapshot;
  let initScripts: string[];
  const scanIdFor: Record<string, string> = {};

  beforeAll(async () => {
    fixtures = await startFixtureServer();
    ui = await serveRenderer();
    h = await createHarness({ fns: { scan, scanRepo } });

    // Real data: scan three fixture pages through the real services.
    const targets: Target[] = [];
    for (const p of PAGES) {
      targets.push(await call<Target>(h, 'targets:add', { kind: 'url', value: fixtures.url(p) }));
    }
    targets.push(
      await call<Target>(h, 'targets:add', {
        kind: 'repo',
        value: join(fixturesReposDir(), 'react-sample'),
      }),
    );
    const started = await call<ScanRecord[]>(h, 'scans:start', {
      targetIds: targets.map((t) => t.id),
    });
    await until(async () => {
      const list = await call<ScanRecord[]>(h, 'scans:list');
      return list.length === started.length && list.every((s) => s.status === 'succeeded');
    }, 200_000);
    const scans = await call<ScanRecord[]>(h, 'scans:list');
    for (const s of scans) {
      const page = PAGES.find((p) => s.target.endsWith(p));
      if (page) scanIdFor[page] = s.id;
    }
    const settings: Settings = {
      ai: { provider: 'anthropic', apiKeyEnv: 'TEAM_ANTHROPIC_KEY' },
      scan: { crawl: false, maxPages: 10 },
      browsers: {},
    };
    const per = async <T>(channel: string) =>
      Object.fromEntries(
        await Promise.all(
          scans.map(async (s) => [s.id, await call<T>(h, channel, { scanId: s.id })] as const),
        ),
      );
    snapshot = {
      info: { ...h.services.info, dataDir: '/Users/you/Library/Application Support/Clear A11Y' },
      targets: await call<Target[]>(h, 'targets:list'),
      scans,
      findings: await per('findings:list'),
      html: await per('report:html'),
      focusPaths: await per('report:focusPaths'),
      review: await per('review:queue'),
      settings,
      providers: await call(h, 'providers:list'),
      env: [
        { name: 'TEAM_ANTHROPIC_KEY', set: false },
        { name: 'ANTHROPIC_API_KEY', set: true },
        { name: 'OPENAI_API_KEY', set: false },
        { name: 'AZURE_OPENAI_API_KEY', set: false },
      ],
      browser: { installed: false, installing: false },
    };
    initScripts = [
      `window.__clearA11ySnapshot = ${JSON.stringify(snapshot)};`,
      await bundleScript('static-bridge.ts'),
    ];

    session = await launchBrowser();
    // The runner opens its own pages: give each one the fake bridge before the app loads.
    bridgedSession = {
      browser: session.browser,
      async newPage(viewport) {
        const opened = await session.newPage(viewport);
        for (const content of initScripts) await opened.context.addInitScript({ content });
        return opened;
      },
      close: async () => undefined,
    };
  }, 240_000);

  afterAll(async () => {
    await session?.close();
    await h?.close();
    await ui?.close();
    await fixtures?.close();
  });

  const views = () => [
    // Deep links without a fragment: engines reload the page between probes with page.goto,
    // which does not reload when only the URL's fragment matches (see docs/decisions-pending/S14.md).
    { name: 'targets', hash: '?view=targets', h1: 'Targets' },
    { name: 'scans', hash: '?view=scans', h1: 'Scans' },
    { name: 'report', hash: `?view=report&scan=${scanIdFor[PAGES[2] as string]}`, h1: 'Report' },
    { name: 'focus', hash: `?view=focus&scan=${scanIdFor[PAGES[0] as string]}`, h1: 'Focus path' },
    {
      name: 'review',
      hash: `?view=review&scan=${scanIdFor[PAGES[1] as string]}`,
      h1: 'Review questions',
    },
    { name: 'settings', hash: '?view=settings', h1: 'Settings' },
  ];

  it('has sample data for every view', () => {
    expect(snapshot.scans.length).toBe(4);
    expect(Object.values(snapshot.focusPaths).flat().length).toBeGreaterThan(0);
    expect(Object.values(snapshot.review).flat().length).toBeGreaterThan(0);
    expect(
      Object.values(snapshot.findings)
        .flat()
        .some((f) => f.screenshotUri),
    ).toBe(true);
  });

  it('renders each view and saves screenshots (light, dark and 320px)', async () => {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const variants = [
      { suffix: '', width: 1280, height: 900, colorScheme: 'light' as const },
      { suffix: '-dark', width: 1280, height: 900, colorScheme: 'dark' as const },
      { suffix: '-320', width: 320, height: 640, colorScheme: 'light' as const },
    ];
    for (const v of variants) {
      const context = await session.browser.newContext({
        viewport: { width: v.width, height: v.height },
        colorScheme: v.colorScheme,
      });
      for (const content of initScripts) await context.addInitScript({ content });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const view of views()) {
        await page.goto(ui.url(`index.html${view.hash}`));
        await page.getByRole('heading', { level: 1, name: view.h1 }).waitFor();
        await page.waitForTimeout(300);
        if (view.name === 'report' && v.suffix === '') {
          await page.locator('.finding .disclosure-button').first().click();
        }
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width, `${view.name}${v.suffix} scrolls sideways`).toBeLessThanOrEqual(v.width);
        await page.screenshot({
          path: join(SCREENSHOT_DIR, `${view.name}${v.suffix}.png`),
          fullPage: true,
        });
      }
      if (v.suffix === '') {
        await page.goto(ui.url(`index.html${views()[2]?.hash}`));
        await page.getByRole('button', { name: 'Show the full HTML report' }).click();
        await page.locator('iframe.report-frame').waitFor();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: join(SCREENSHOT_DIR, 'report-full-html.png'),
          fullPage: true,
        });
      }
      expect(errors).toEqual([]);
      await context.close();
    }
  }, 120_000);

  it('passes a full Clear A11Y scan on every view: zero findings of any tier', async () => {
    const all: Finding[] = [];
    // Debug aids: DOGFOOD_VIEWS=report,settings and DOGFOOD_ONLY=at,visual narrow the run.
    const pick = process.env['DOGFOOD_VIEWS']?.split(',');
    const only = process.env['DOGFOOD_ONLY']?.split(',');
    for (const view of views().filter((v) => !pick || pick.includes(v.name))) {
      const url = ui.url(`index.html${view.hash}`);
      const result = await scan({
        targets: [url],
        session: bridgedSession,
        ...(only ? { only } : {}),
      });
      expect(result.pages[0]?.error, view.name).toBeUndefined();
      all.push(...result.findings);
    }
    const lines = all.map(
      (f) =>
        `${f.tier} ${f.ruleId} [${f.wcag.join(',')}] ${f.page.url.split('?')[1]} (${f.page.state}, ${f.page.viewport}) ${f.target.selector}: ${f.message}` +
        (process.env['DOGFOOD_DEBUG'] ? `\n  ${JSON.stringify(f.evidence.data ?? {})}` : ''),
    );
    // The requirement is zero `violation`s; the UI currently reaches zero findings of any tier,
    // so keep it there.
    expect(lines.filter((l) => l.startsWith('violation'))).toEqual([]);
    expect(lines).toEqual([]);
  }, 600_000);
});
