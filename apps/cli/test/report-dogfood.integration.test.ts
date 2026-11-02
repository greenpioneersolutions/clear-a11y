import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  launchBrowser,
  startStaticServer,
  type BrowserSession,
  type StaticServer,
} from '@clear-a11y/browser';
import type { ScanResult } from '@clear-a11y/core';
import { scan } from '@clear-a11y/runner';
import { startFixtureServer } from '@clear-a11y/test-utils';
import { run } from '../src/index.js';

const PAGES = [
  'keyboard/focus-order-backward.html', // focus path with a backward jump
  'keyboard/skip-link-missing.html', // needs-review finding (review queue)
  'static/img-missing-alt.html', // violation with a screenshot crop
  'visual/low-contrast.html',
];

/**
 * Practice what we test: the HTML report Clear A11Y writes must itself pass Clear A11Y.
 * Scans a few fixture pages, writes report.html, serves it, and scans it with every engine.
 */
describe('HTML report dogfood (integration)', () => {
  let fixtures: StaticServer;
  let reports: StaticServer;
  let session: BrowserSession;
  let out: string;
  let reportUrl: string;
  let source: ScanResult;

  beforeAll(async () => {
    fixtures = await startFixtureServer();
    out = await mkdtemp(join(tmpdir(), 'clear-a11y-dogfood-'));
    const code = await run(
      ['scan', ...PAGES.map((p) => fixtures.url(p)), '--out', out, '--format', 'json,sarif,html'],
      { out: () => undefined, err: () => undefined, setExitCode: () => undefined },
    );
    expect(code).toBe(1); // the fixtures have violations
    source = JSON.parse(await readFile(join(out, 'report.json'), 'utf-8'));
    reports = await startStaticServer({ root: out });
    reportUrl = reports.url('report.html');
    session = await launchBrowser();
  }, 240_000);

  afterAll(async () => {
    await session?.close();
    await reports?.close();
    await fixtures?.close();
  });

  it('writes a report with a focus path, screenshots and review questions', async () => {
    const html = await readFile(join(out, 'report.html'), 'utf-8');
    expect(source.findings.some((f) => f.evidence.focusPath?.some((s) => s.backward))).toBe(true);
    expect(source.findings.some((f) => f.tier === 'needs-review')).toBe(true);
    expect(html).toContain('backward jump</strong>');
    expect(html).toContain('<fieldset class="question"');
    expect(html).toContain('src="data:image/png;base64,');
    const sarif = JSON.parse(await readFile(join(out, 'report.sarif'), 'utf-8'));
    expect(sarif.runs[0].results).toHaveLength(source.findings.length);
  });

  it('passes a full Clear A11Y scan: zero violation, likely and needs-review findings', async () => {
    const result = await scan({ targets: [reportUrl], session });
    const summary = result.findings.map(
      (f) => `${f.tier} ${f.ruleId} ${f.target.selector}: ${f.message}`,
    );
    expect(result.errors).toEqual([]);
    expect(result.pages[0]?.error).toBeUndefined();
    expect(summary).toEqual([]);
  }, 240_000);

  it('makes no network requests besides the report itself', async () => {
    const opened = await session.newPage({ name: 'desktop', width: 1280, height: 800 });
    try {
      const requests: string[] = [];
      opened.page.on('request', (r) => requests.push(r.url()));
      const errors: string[] = [];
      opened.page.on('pageerror', (e) => errors.push(e.message));
      await opened.page.goto(reportUrl, { waitUntil: 'networkidle' });
      expect(requests).toEqual([reportUrl]);
      expect(errors).toEqual([]);
      const shot = join(out, 'report-full.png');
      await opened.page.screenshot({ path: shot, fullPage: true });
      expect((await stat(shot)).size).toBeGreaterThan(10_000);
    } finally {
      await opened.close();
    }
  });

  it('filters findings and saves and downloads review answers with JavaScript', async () => {
    const opened = await session.newPage({ name: 'desktop', width: 1280, height: 800 });
    const page = opened.page;
    try {
      await page.goto(reportUrl);
      await page.getByLabel('Tier').selectOption('violation');
      const violations = source.findings.filter((f) => f.tier === 'violation').length;
      await expectText(
        page,
        '#filter-status',
        `Showing ${violations} of ${source.findings.length} findings.`,
      );
      expect(await page.locator('article.finding:visible').count()).toBe(violations);

      const first = page.locator('fieldset.question').first();
      const findingId = await first.getAttribute('data-finding-id');
      await first.getByLabel('No').check();
      await expectText(page, '#review-status', 'Saved in this browser.');
      const stored = await page.evaluate(() =>
        Object.entries(localStorage).find(([k]) => k.startsWith('clear-a11y:answers:')),
      );
      expect(JSON.parse(stored?.[1] ?? '{}')).toEqual({ [findingId as string]: 'no' });

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download answers (JSON)' }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('clear-a11y-review-answers.json');
      const exported = JSON.parse(await readFile((await download.path()) as string, 'utf-8'));
      expect(exported.answers).toContainEqual(expect.objectContaining({ findingId, answer: 'no' }));

      // Answers survive a reload.
      await page.reload();
      expect(await page.locator('fieldset.question').first().getByLabel('No').isChecked()).toBe(
        true,
      );
    } finally {
      await opened.close();
    }
  });

  it('is fully readable without JavaScript', async () => {
    const context = await session.browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 640 },
    });
    try {
      const page = await context.newPage();
      await page.goto(reportUrl);
      expect(await page.locator('article.finding:visible').count()).toBe(source.findings.length);
      expect(await page.locator('fieldset.question:visible').count()).toBeGreaterThan(0);
      expect(await page.locator('#filters').isVisible()).toBe(false);
      expect(await page.locator('#download-answers').isVisible()).toBe(false);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(320);
    } finally {
      await context.close();
    }
  });
});

async function expectText(
  page: import('@clear-a11y/browser').Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.waitForFunction(
    ([sel, t]) => document.querySelector(sel as string)?.textContent?.includes(t as string),
    [selector, text],
    { timeout: 5_000 },
  );
}
