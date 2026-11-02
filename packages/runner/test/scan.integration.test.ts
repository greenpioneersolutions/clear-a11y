import { readFileSync } from 'node:fs';
import type { Engine } from '@clear-a11y/browser';
import { createFinding } from '@clear-a11y/core';
import {
  expectFinding,
  expectNoFinding,
  fixtureHarness,
  fixturesExpectedDir,
  fixturesPersonasFile,
  fixturesSiteDir,
} from '@clear-a11y/test-utils';
import { runFixtureBenchmark, scan } from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

describe('scan (integration)', () => {
  it('runs the static engine and returns a canonical result', async () => {
    const url = new URL('static/img-missing-alt.html', await harness.baseUrl()).href;
    const result = await scan({ targets: [url], config: { output: { screenshots: false } } });
    expect(result.schemaVersion).toBe(1);
    expect(result.pages).toEqual([
      { url, viewport: 'desktop', states: ['default'], title: 'Product page: image without alt' },
    ]);
    expectFinding(result.findings, { ruleId: 'static/image-alt', selector: '#hero' });
    expect(result.summary.byTier['violation']).toBeGreaterThan(0);
  });

  it('gives mutating engines a fresh page per state and records engine errors', async () => {
    const url = new URL('blank.html', await harness.baseUrl()).href;
    const seen: string[] = [];
    const mutating: Engine = {
      name: 'engine-test',
      async run(ctx) {
        seen.push(
          `${ctx.state}:${await ctx.page.evaluate(() => document.body.dataset['touched'] ?? 'fresh')}`,
        );
        await ctx.page.evaluate(() => (document.body.dataset['touched'] = 'yes'));
        return [
          createFinding({
            // Per-state rule id: identical rule + selector in a state would be deduped against default.
            ruleId: `test/${ctx.state}`,
            wcag: ['4.1.2'],
            tier: 'likely',
            confidence: 0.6,
            engine: 'engine-test',
            page: { url: ctx.url, state: ctx.state },
            target: { selector: 'body' },
            message: 'test',
          }),
        ];
      },
    };
    const broken: Engine = {
      name: 'engine-broken',
      mutatesPage: false,
      run: async () => Promise.reject(new Error('kaboom')),
    };
    const result = await scan({
      targets: [url],
      engines: [mutating, broken],
      discoverStates: async () => [
        {
          id: 'menu:open',
          meta: {
            kind: 'menu',
            replay: async (p) => void (await p.evaluate(() => (document.title = 'menu'))),
          },
        },
      ],
    });
    expect(seen).toEqual(['default:fresh', 'menu:open:fresh']);
    expect(result.findings.map((f) => f.page.state).sort()).toEqual(['default', 'menu:open']);
    expect(result.errors.map((e) => `${e.engine}:${e.state}:${e.message}`)).toEqual([
      'engine-broken:default:kaboom',
      'engine-broken:menu:open:kaboom',
    ]);
  });

  it('drops needs-review findings that another engine verified as passes (ADR 0003)', async () => {
    const url = new URL('blank.html', await harness.baseUrl()).href;
    const review = (engine: string, selector: string, tier: 'needs-review' | 'likely') =>
      createFinding({
        ruleId: `${engine}/contrast`,
        wcag: ['1.4.3'],
        tier,
        confidence: 0.5,
        engine,
        page: { url },
        target: { selector },
        message: 'Background could not be determined.',
        ...(tier === 'needs-review' ? { question: 'Enough contrast?' } : {}),
      });
    const reviewer: Engine = {
      name: 'engine-reviewer',
      mutatesPage: false,
      run: async () => [
        review('engine-reviewer', 'h2', 'needs-review'),
        review('engine-reviewer', 'h3', 'likely'),
        review('engine-reviewer', 'p', 'needs-review'),
      ],
    };
    const measurer: Engine = {
      name: 'engine-measurer',
      async run(ctx) {
        for (const selector of ['h2', 'h3'])
          ctx.recordPass?.({ ruleId: 'measurer/contrast', wcag: ['1.4.3'], selector });
        return [];
      },
    };
    const judge: Engine = {
      name: 'ai-judges',
      mutatesPage: false,
      async run(ctx) {
        ctx.recordPass?.({ ruleId: 'ai/contrast', wcag: ['1.4.3'], selector: 'p' });
        return [];
      },
    };
    const result = await scan({
      targets: [url],
      engines: [reviewer, measurer, judge],
      states: false,
    });
    // h2: needs-review + deterministic pass -> resolved. h3: likely is never dropped.
    // p: only an AI pass -> kept.
    expect(result.findings.map((f) => `${f.target.selector} ${f.tier}`).sort()).toEqual([
      'h3 likely',
      'p needs-review',
    ]);
    expect(result.summary.resolved).toBe(1);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved?.[0]?.finding.target.selector).toBe('h2');
    expect(result.resolved?.[0]?.resolvedBy).toMatchObject({
      engine: 'engine-measurer',
      ruleId: 'measurer/contrast',
      page: { url, state: 'default', viewport: 'desktop' },
    });
  });

  it('benchmarks a fixture subset end to end', async () => {
    const r = await runFixtureBenchmark({
      siteDir: fixturesSiteDir(),
      expectedDir: fixturesExpectedDir(),
      filter: 'static/',
      only: ['static'],
    });
    expect(r.pages).toBe(7);
    // axe accepts a placeholder as a label; that issue belongs to the at layer.
    expect(r.missed.map((m) => m.id)).toEqual(['static/form-missing-label#1']);
    expect(r.violation.precision).toBe(1);
  });

  it('runs persona tasks through the registry; findings are never violations', async () => {
    const personas = JSON.parse(readFileSync(fixturesPersonasFile(), 'utf-8')) as Record<
      string,
      unknown
    >;
    const base = await harness.baseUrl();
    const result = await scan({
      targets: [
        new URL('persona/checkout-keyboard-blocked.html', base).href,
        new URL('persona/checkout-keyboard-ok.html', base).href,
      ],
      only: ['personas'],
      config: { personas, output: { screenshots: false } },
    });
    const f = expectFinding(result.findings, { ruleId: 'persona/task-blocked', selector: '#pay' });
    expect(f).toMatchObject({ engine: 'persona-keyboard-only', tier: 'likely', wcag: ['2.1.1'] });
    expect(f.page.url).toContain('checkout-keyboard-blocked.html');
    expect(result.findings.filter((x) => x.page.url.includes('-ok.html'))).toEqual([]);
    expect(result.findings.every((x) => x.tier !== 'violation')).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('benchmarks the persona layer with fixtures/personas.json', async () => {
    const personas = JSON.parse(readFileSync(fixturesPersonasFile(), 'utf-8')) as Record<
      string,
      unknown
    >;
    const r = await runFixtureBenchmark({
      siteDir: fixturesSiteDir(),
      expectedDir: fixturesExpectedDir(),
      filter: 'persona/',
      only: ['personas'],
      personas,
    });
    expect(r.byLayer['persona']).toMatchObject({ expected: 3, matched: 3 });
    expect(r.correctPatternNoise).toEqual([]);
    expect(r.violation.total).toBe(0);
  });
});

const finding = (ruleId: string, state: string, url: string, selector = 'body') =>
  createFinding({
    ruleId,
    wcag: ['4.1.2'],
    tier: 'violation',
    confidence: 0.9,
    engine: 'engine-test',
    page: { url, state },
    target: { selector },
    message: 'test',
  });

describe('state pipeline (integration)', () => {
  it('finds a barrier that only exists inside an opened menu, in that state only', async () => {
    const url = new URL('states/menu-hidden-link-no-name.html', await harness.baseUrl()).href;
    const result = await scan({ targets: [url], config: { output: { screenshots: false } } });
    expect(result.pages[0]?.states).toEqual(['default', 'menu:open#site-menu']);
    const link = expectFinding(result.findings, {
      ruleId: 'static/link-name',
      selector: '#menu-account',
    });
    expect(link.page.state).toBe('menu:open#site-menu');
    expect(
      result.findings.filter(
        (f) => f.page.state === 'default' && f.target.selector === '#menu-account',
      ),
    ).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('runs engine-states in the default state, where it finds unassociated form errors', async () => {
    const url = new URL('states/form-errors.html', await harness.baseUrl()).href;
    const result = await scan({ targets: [url], config: { output: { screenshots: false } } });
    expect(result.pages[0]?.states).toEqual([
      'default',
      'form-empty#signup',
      'form-invalid#signup',
    ]);
    const f = expectFinding(result.findings, {
      ruleId: 'states/error-not-associated',
      selector: '#email',
    });
    expect(f.tier).toBe('violation');
  });

  it('passes state and stateMeta to every engine except the explorer, on a fresh replayed page', async () => {
    const url = new URL('states/modal-focus.html', await harness.baseUrl()).href;
    const seen: string[] = [];
    const recorder = (name: string, mutatesPage: boolean): Engine => ({
      name,
      mutatesPage,
      async run(ctx) {
        const open = await ctx.page.locator('#settings-dialog').isVisible();
        seen.push(
          `${name} ${ctx.state} ${ctx.stateMeta?.kind} ${ctx.stateMeta?.triggerSelector ?? '-'} ${open}`,
        );
        return [
          finding('test/same', ctx.state, ctx.url),
          finding(`test/${ctx.state}`, ctx.state, ctx.url),
        ];
      },
    });
    const result = await scan({
      targets: [url],
      engines: [
        recorder('engine-reader', false),
        recorder('engine-writer', true),
        recorder('engine-states', true),
      ],
    });
    expect(seen).toEqual([
      'engine-reader default default - false',
      'engine-writer default default - false',
      'engine-states default default - false',
      'engine-reader dialog:open#settings-dialog dialog #open-settings true',
      'engine-writer dialog:open#settings-dialog dialog #open-settings true',
    ]);
    // Same rule + selector as in the default state: dropped from the state run.
    expect(result.findings.map((f) => `${f.ruleId} ${f.page.state}`).sort()).toEqual([
      'test/default default',
      'test/dialog:open#settings-dialog dialog:open#settings-dialog',
      'test/same default',
    ]);
  });

  it('skips states that do not verify after replay, and records why', async () => {
    const url = new URL('blank.html', await harness.baseUrl()).href;
    const result = await scan({
      targets: [url],
      engines: [{ name: 'engine-noop', mutatesPage: false, run: async () => [] }],
      discoverStates: async () => [
        { id: 'menu:open#ghost', meta: { kind: 'menu' }, verify: async () => false },
      ],
    });
    expect(result.pages[0]?.states).toEqual(['default']);
    expect(result.errors.map((e) => `${e.engine} ${e.state} ${e.message}`)).toEqual([
      'runner menu:open#ghost could not replay state: state did not verify after replay',
    ]);
  });

  it('can skip state discovery', async () => {
    const url = new URL('states/menu-hidden-link-no-name.html', await harness.baseUrl()).href;
    const result = await scan({
      targets: [url],
      states: false,
      config: { output: { screenshots: false } },
    });
    expect(result.pages[0]?.states).toEqual(['default']);
    expectNoFinding(result.findings, { selector: '#menu-account' });
    const off = await scan({
      targets: [url],
      config: { engines: { states: false }, output: { screenshots: false } },
    });
    expect(off.pages[0]?.states).toEqual(['default']);
  });

  it('reports progress per page and stops between pages when aborted', async () => {
    const base = await harness.baseUrl();
    const urls = ['blank.html', 'static/ok.html'].map((p) => new URL(p, base).href);
    const progress: unknown[] = [];
    await scan({
      targets: urls,
      engines: [],
      states: false,
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toEqual([
      { done: 0, total: 2, url: urls[0] },
      { done: 1, total: 2, url: urls[1] },
      { done: 2, total: 2 },
    ]);
    const controller = new AbortController();
    await expect(
      scan({
        targets: urls,
        engines: [],
        states: false,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.done === 0) controller.abort();
        },
      }),
    ).rejects.toThrow();
  });
});
