import { createFinding, type ExpectedPage, type Finding } from '@clear-a11y/core';
import {
  benchmarkToMarkdown,
  pagePathOf,
  runBenchmark,
  scoreBenchmark,
  selectorsMatch,
} from './index.js';

const BASE = 'http://127.0.0.1:4000/';

const finding = (
  page: string,
  selector: string,
  wcag: string[],
  tier: Finding['tier'] = 'violation',
  engine = 'engine-static',
) =>
  createFinding({
    ruleId: `${engine.replace('engine-', '')}/rule`,
    wcag,
    tier,
    confidence: 0.9,
    engine,
    page: { url: BASE + page },
    target: { selector },
    message: 'msg',
    ...(tier === 'needs-review' ? { question: 'q?' } : {}),
  });

const expected: ExpectedPage[] = [
  {
    page: 'static/img.html',
    title: 'img',
    correctPattern: false,
    issues: [
      { id: 'img#1', wcag: ['1.1.1'], selector: '#hero', layer: 'static', description: 'no alt' },
    ],
  },
  {
    page: 'keyboard/order.html',
    title: 'order',
    correctPattern: false,
    issues: [
      {
        id: 'order#1',
        wcag: ['2.4.3'],
        selector: '#last-name | #country',
        layer: 'keyboard',
        description: 'backward',
      },
      {
        id: 'order#2',
        wcag: ['2.4.7', '2.4.11'],
        selector: '#submit',
        layer: 'keyboard',
        description: 'no focus ring',
      },
    ],
  },
  { page: 'static/ok.html', title: 'ok', correctPattern: true, issues: [] },
];

describe('selectorsMatch', () => {
  it('matches exact, nested and alternative selectors', () => {
    expect(selectorsMatch('#hero', '#hero')).toBe(true);
    expect(selectorsMatch('main > img#hero', '#hero')).toBe(true);
    expect(selectorsMatch('#country', '#last-name | #country')).toBe(true);
    expect(selectorsMatch('anything', '*')).toBe(true);
    expect(selectorsMatch('html', 'html')).toBe(true);
  });

  it('does not match prefixes of other ids or tag names inside words', () => {
    expect(selectorsMatch('#hero-title', '#hero')).toBe(false);
    expect(selectorsMatch('main', 'a')).toBe(false);
    expect(selectorsMatch('nav > a', 'a')).toBe(true);
  });
});

describe('pagePathOf', () => {
  it('maps URLs to fixture paths', () => {
    expect(pagePathOf(`${BASE}static/img.html`, BASE)).toBe('static/img.html');
    expect(pagePathOf(`${BASE}static/img.html?x=1#y`, 'http://127.0.0.1:4000')).toBe(
      'static/img.html',
    );
  });
});

describe('scoreBenchmark', () => {
  it('computes recall, violation precision, per-SC and per-layer numbers', () => {
    const findings = new Map<string, Finding[]>([
      [
        'static/img.html',
        [
          finding('static/img.html', 'img#hero', ['1.1.1']),
          finding('static/img.html', '#other', ['1.4.3']),
        ],
      ],
      [
        'keyboard/order.html',
        [finding('keyboard/order.html', '#country', ['2.4.3'], 'likely', 'engine-keyboard')],
      ],
      ['static/ok.html', [finding('static/ok.html', 'p', ['1.4.3'], 'needs-review')]],
    ]);
    const r = scoreBenchmark(expected, findings, { now: new Date(0) });
    expect(r.expectedIssues).toBe(3);
    expect(r.matchedIssues).toBe(2);
    expect(r.recall).toBe(0.667);
    expect(r.violation).toEqual({ total: 2, truePositive: 1, falsePositive: 1, precision: 0.5 });
    expect(r.bySc['2.4.7']).toEqual({ expected: 1, matched: 0, recall: 0 });
    expect(r.byLayer['keyboard']).toEqual({ expected: 2, matched: 1, recall: 0.5 });
    expect(r.foundBy).toEqual({ keyboard: 1, static: 1 });
    expect(r.missed.map((m) => m.id)).toEqual(['order#2']);
    expect(r.correctPatternNoise).toHaveLength(1);
    expect(r.findings.byTier).toEqual({ violation: 2, likely: 1, 'needs-review': 1 });
  });

  it('reports null precision with no violations and zero recall with no findings', () => {
    const r = scoreBenchmark(expected, new Map());
    expect(r.recall).toBe(0);
    expect(r.violation.precision).toBeNull();
  });

  it('renders markdown with the headline numbers', () => {
    const md = benchmarkToMarkdown(
      scoreBenchmark(expected, new Map(), { label: 'empty', now: new Date(0) }),
    );
    expect(md).toContain('# Clear A11Y benchmark: empty');
    expect(md).toContain('| Recall (any tier) | 0.0% (0/3) |');
    expect(md).toContain('| 2.4.3 | Focus Order | 0.0% | 0/1 |');
    expect(md).toContain('## Missed issues');
  });
});

describe('runBenchmark', () => {
  it('scans every expected page via the scanner', async () => {
    const scanned: string[] = [];
    const r = await runBenchmark({
      expected,
      baseUrl: BASE,
      scan: async (url) => {
        scanned.push(url);
        return url.endsWith('static/img.html')
          ? [finding('static/img.html', '#hero', ['1.1.1'])]
          : [];
      },
    });
    expect(scanned.sort()).toEqual([
      `${BASE}keyboard/order.html`,
      `${BASE}static/img.html`,
      `${BASE}static/ok.html`,
    ]);
    expect(r.matchedIssues).toBe(1);
    expect(r.violation.precision).toBe(1);
  });
});
