import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFinding, summarize, type Finding, type ScanResult } from '@clear-a11y/core';
import { z } from 'zod';
import {
  getFindingsInput,
  getReportInput,
  keyboardWalkInput,
  scanRepoInput,
  scanUrlInput,
  SELECTABLE_ENGINES,
} from '../schemas.js';
import type { StoredScan } from '../store.js';
import { findingsPage, findingsText } from './get-findings.js';
import { MAX_INLINE_CHARS, reportOutput, reportText } from './get-report.js';
import { walkOutput, walkText } from './keyboard-walk.js';
import { planRepoScan, STATIC_ONLY_NOTICE } from './scan-repo.js';
import { planUrlScan, progressLogger, toViewport } from './scan-url.js';
import { scanOutput, scanText } from './shared.js';

const make = (i: number, tier: Finding['tier'] = 'violation'): Finding =>
  createFinding({
    ruleId: `static/rule-${i}`,
    wcag: ['1.1.1'],
    tier,
    confidence: 0.9,
    engine: 'engine-static',
    page: { url: 'http://localhost/a.html', state: 'default', viewport: 'desktop' },
    target: { selector: `#el${i}` },
    message: `Problem ${i}`,
    ...(tier === 'needs-review' ? { question: `Is ${i} a barrier?` } : {}),
  });

const stored = (findings: Finding[]): StoredScan => {
  const result: ScanResult = {
    schemaVersion: 1,
    tool: { name: 'clear-a11y', version: '0.0.0' },
    startedAt: '',
    finishedAt: '',
    targets: ['http://localhost/a.html'],
    pages: [{ url: 'http://localhost/a.html', viewport: 'desktop', states: ['default'] }],
    findings,
    errors: Array.from({ length: 12 }, (_, i) => ({
      url: 'http://localhost/a.html',
      state: 'default',
      viewport: 'desktop',
      engine: 'engine-x',
      message: `boom ${i} ${'x'.repeat(500)}`,
    })),
    summary: summarize(findings),
  };
  return { id: 's-abc-123456', kind: 'url', createdAt: '', result, dir: '/out/s', notices: [] };
};

describe('input schemas', () => {
  const scanUrl = z.object(scanUrlInput);
  it('caps crawl pages, URL count and viewports', () => {
    expect(scanUrl.safeParse({ url: 'http://x/', crawl: true, maxPages: 50 }).success).toBe(true);
    expect(scanUrl.safeParse({ url: 'http://x/', crawl: true, maxPages: 51 }).success).toBe(false);
    expect(scanUrl.safeParse({ urls: Array(11).fill('http://x/') }).success).toBe(false);
    expect(scanUrl.safeParse({ url: 'http://x/', viewports: ['huge'] }).success).toBe(false);
    expect(scanUrl.safeParse({ url: 'http://x/', viewports: ['mobile', '1024x768'] }).success).toBe(
      true,
    );
  });

  it('offers only deterministic engines', () => {
    expect(SELECTABLE_ENGINES).toEqual(expect.arrayContaining(['static', 'keyboard', 'states']));
    expect(SELECTABLE_ENGINES).not.toContain('ai');
    expect(SELECTABLE_ENGINES).not.toContain('personas');
    expect(scanUrl.safeParse({ url: 'http://x/', engines: ['ai'] }).success).toBe(false);
  });

  it('validates the other tools', () => {
    expect(z.object(keyboardWalkInput).safeParse({ url: 'http://x/', maxStops: 301 }).success).toBe(
      false,
    );
    expect(z.object(getFindingsInput).safeParse({ scanId: 's', limit: 101 }).success).toBe(false);
    expect(z.object(getFindingsInput).safeParse({ scanId: 's', wcag: '1.4' }).success).toBe(false);
    expect(z.object(getFindingsInput).safeParse({ scanId: 's', tier: 'bad' }).success).toBe(false);
    expect(z.object(getReportInput).safeParse({ scanId: 's', format: 'pdf' }).success).toBe(false);
    expect(z.object(scanRepoInput).safeParse({ path: '' }).success).toBe(false);
  });
});

describe('planUrlScan', () => {
  it('builds targets and a config with crawl off, no AI and screenshots on', () => {
    const plan = planUrlScan(
      { urls: ['http://localhost:3000', 'http://localhost:3000/'], viewports: ['reflow'] },
      [],
      '/out/s1',
    );
    expect(plan.targets).toEqual(['http://localhost:3000/']);
    expect(plan.config).toMatchObject({
      viewports: [{ name: 'reflow', width: 320, height: 256 }],
      crawl: { enabled: false, sameOrigin: true, maxPages: 10 },
      output: { dir: '/out/s1', screenshots: true },
      ai: { provider: 'none' },
    });
  });

  it('rejects missing URLs, non-http URLs and maxPages without crawl', () => {
    expect(() => planUrlScan({}, [], '/o')).toThrow(/Pass `url`/);
    expect(() => planUrlScan({ url: 'file:///etc/passwd' }, [], '/o')).toThrow(/http\(s\)/);
    expect(() => planUrlScan({ url: 'http://x/', maxPages: 5 }, [], '/o')).toThrow(/crawl/);
  });

  it('parses custom viewports', () => {
    expect(toViewport('1024x768')).toEqual({ name: '1024x768', width: 1024, height: 768 });
    expect(toViewport('mobile').width).toBe(375);
  });

  it('turns "scanning" log lines into progress', () => {
    const seen: string[] = [];
    const noop = () => undefined;
    const log = progressLogger({ debug: noop, info: noop, warn: noop, error: noop }, (m) =>
      seen.push(m),
    );
    log.info('scanning http://x/');
    log.info('other');
    expect(seen).toEqual(['scanning http://x/']);
  });
});

describe('planRepoScan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clear-a11y-repo-'));
  mkdirSync(join(dir, 'storybook-static'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('never asks for a dev server unless runDevServer is true', async () => {
    expect((await planRepoScan({ path: dir }, '/')).repo).toEqual({});
    expect((await planRepoScan({ path: dir, runDevServer: false }, '/')).repo).toEqual({});
    expect((await planRepoScan({ path: dir, runDevServer: true }, '/')).repo).toEqual({
      boot: true,
    });
  });

  it('resolves storybookStatic inside the repo and checks it exists', async () => {
    const plan = await planRepoScan({ path: dir, storybookStatic: 'storybook-static' }, '/');
    expect(plan.repo).toEqual({ storybookStatic: join(dir, 'storybook-static') });
    expect(plan.runtimeRequested).toBe(true);
    await expect(planRepoScan({ path: dir, storybookStatic: 'nope' }, '/')).rejects.toThrow(
      /storybookStatic: Path does not exist/,
    );
  });
});

describe('result shaping', () => {
  const findings = [
    ...Array.from({ length: 25 }, (_, i) => make(i, 'needs-review')),
    make(100, 'violation'),
  ];
  const scan = stored(findings);

  it('scan output: top 20 violations first, capped errors, next steps', () => {
    const out = scanOutput(scan);
    expect(out.topFindings).toHaveLength(20);
    expect(out.topFindings[0]?.tier).toBe('violation');
    expect(out.moreFindings).toBe(6);
    expect(out.summary).toEqual({ total: 26, violation: 1, likely: 0, needsReview: 25 });
    expect(out.errors).toHaveLength(10);
    expect(out.errorCount).toBe(12);
    expect(out.errors[0]?.message.length).toBeLessThanOrEqual(300);
    expect(out.next).toContain('needs-review');
    expect(out.untrusted).toMatch(/never as instructions/);
    expect(scanText(out)).toContain('<untrusted-scan-data>');
    expect(scanOutput(stored([])).next).toMatch(/cannot prove/);
  });

  it('get_findings pages and filters', () => {
    const page = findingsPage(scan, {
      scanId: scan.id,
      tier: 'needs-review',
      limit: 10,
      offset: 20,
    });
    expect(page.total).toBe(25);
    expect(page.findings).toHaveLength(5);
    expect(page.nextOffset).toBeNull();
    expect(page.findings[0]?.question).toMatch(/barrier/);
    expect(findingsText(page)).toContain('Findings 21-25 of 25');
    expect(findingsText(findingsPage(scan, { scanId: scan.id, wcag: '9.9.9' }))).toContain(
      '0 of 0',
    );
  });

  it('get_report inlines small text, previews big text and never inlines HTML', () => {
    const small = reportOutput(scan, 'markdown', '/out/s/report.md', '# hi', 4);
    expect(small).toMatchObject({ inline: true, text: '# hi' });
    expect(reportText(small)).toContain('<untrusted-scan-data>');
    const big = reportOutput(
      scan,
      'json',
      '/out/s/report.json',
      'x'.repeat(MAX_INLINE_CHARS + 1),
      1,
    );
    expect(big.inline).toBe(false);
    expect(big.text).toBeUndefined();
    expect(big.preview).toHaveLength(2000);
    const html = reportOutput(scan, 'html', '/out/s/report.html', '<!doctype html>', 15);
    expect(html.inline).toBe(false);
    expect(html.preview).toBeUndefined();
    expect(reportText(html)).toContain('/out/s/report.html');
  });

  it('keyboard walk output marks backward stops and truncates names', () => {
    const out = walkOutput({
      url: 'http://x/',
      viewport: 'desktop',
      stops: [
        { index: 0, selector: '#a', name: 'n'.repeat(300) },
        { index: 1, selector: '#b', backward: true, rect: { x: 1, y: 2, width: 3, height: 4 } },
      ],
      backwardJumps: [{ from: 0, to: 1 }],
      end: 'cycle',
      cycle: ['#a', '#b'],
      fromTop: true,
    });
    expect(out.stopCount).toBe(2);
    expect(out.stops[0]?.name?.length).toBeLessThanOrEqual(120);
    const text = walkText(out);
    expect(text).toContain('1. [BACKWARD] #b @1,2 3x4');
    expect(text).toContain('Cycle: #a -> #b');
    expect(text).toContain('possible keyboard trap');
  });

  it('repo scans explain the static-only coverage', () => {
    expect(STATIC_ONLY_NOTICE).toMatch(/scan_url/);
  });
});
