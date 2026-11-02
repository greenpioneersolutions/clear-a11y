import { createFinding, summarize, type Finding, type ScanResult } from '@clear-a11y/core';
import {
  compactFinding,
  compactSummary,
  filterFindings,
  findingLine,
  paginate,
  sortFindings,
  toMarkdown,
  truncate,
  untrustedBlock,
  windowFocusPath,
} from './format.js';

function finding(overrides: Partial<Parameters<typeof createFinding>[0]> = {}): Finding {
  return createFinding({
    ruleId: 'static/image-alt',
    wcag: ['1.1.1'],
    tier: 'violation',
    confidence: 0.95,
    engine: 'engine-static',
    page: { url: 'http://localhost/a.html', state: 'default', viewport: 'desktop' },
    target: { selector: '#hero', role: 'img', name: 'Hero' },
    message: 'Image has no text alternative.',
    fix: 'Add alt text.',
    evidence: { screenshot: 'artifacts/hero.png', html: '<img id="hero">' },
    ...overrides,
  });
}

function resultOf(findings: Finding[]): ScanResult {
  return {
    schemaVersion: 1,
    tool: { name: 'clear-a11y', version: '0.0.0' },
    startedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: '2026-10-31T00:00:01.000Z',
    targets: ['http://localhost/a.html'],
    pages: [{ url: 'http://localhost/a.html', viewport: 'desktop', states: ['default'] }],
    findings,
    errors: [],
    summary: summarize(findings),
  };
}

const review = finding({
  ruleId: 'ai/alt-text-quality',
  tier: 'needs-review',
  engine: 'engine-at',
  wcag: ['1.1.1'],
  target: { selector: '#logo' },
  question: 'Does the alt text describe the image?',
  evidence: {},
});
const likely = finding({
  ruleId: 'keyboard/focus-order-backward',
  tier: 'likely',
  engine: 'engine-keyboard',
  wcag: ['2.4.3', '1.3.2'],
  target: { selector: '#last' },
  evidence: {
    focusPath: Array.from({ length: 40 }, (_, i) => ({
      index: i,
      selector: `#s${i}`,
      ...(i === 30 ? { backward: true } : {}),
    })),
    data: { from: '#a', to: '#b' },
  },
});

describe('truncate', () => {
  it('collapses whitespace and cuts with an ellipsis', () => {
    expect(truncate('a   b\n c', 10)).toBe('a b c');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('compactFinding', () => {
  it('keeps the essentials, resolves screenshot paths and groups page text', () => {
    const c = compactFinding(finding(), '/out/s1');
    expect(c).toMatchObject({
      ruleId: 'static/image-alt',
      tier: 'violation',
      wcag: ['1.1.1'],
      selector: '#hero',
      role: 'img',
      screenshot: '/out/s1/artifacts/hero.png',
      pageText: { name: 'Hero' },
    });
    expect(c.pageText?.html).toBeUndefined(); // only with detail
    expect(c.focusPath).toBeUndefined();
  });

  it('truncates long page text and adds evidence with detail', () => {
    const long = finding({
      target: { selector: '#x', name: 'n'.repeat(500) },
      message: 'm'.repeat(1000),
      evidence: { html: '<p>' + 'h'.repeat(1000), screenshot: 'memory:x.png' },
    });
    const c = compactFinding(long, '/out', true);
    expect(c.pageText?.name?.length).toBeLessThanOrEqual(120);
    expect(c.message.length).toBeLessThanOrEqual(400);
    expect(c.pageText?.html?.length).toBeLessThanOrEqual(240);
    expect(c.screenshot).toBeUndefined();
  });

  it('windows long focus paths around the backward stop', () => {
    const c = compactFinding(likely, '/out', true);
    expect(c.focusPathLength).toBe(40);
    expect(c.focusPath).toHaveLength(20);
    expect(c.focusPath?.some((s) => s.backward)).toBe(true);
    expect(c.data).toContain('#a');
    expect(windowFocusPath([{ index: 0, selector: '#a' }])).toHaveLength(1);
  });
});

describe('sorting, filtering and pagination', () => {
  const all = [review, likely, finding()];

  it('sorts violations first', () => {
    expect(sortFindings(all).map((f) => f.tier)).toEqual(['violation', 'likely', 'needs-review']);
  });

  it('filters by tier, wcag, engine, rule prefix, page and id', () => {
    expect(filterFindings(all, { tier: 'likely' })).toEqual([likely]);
    expect(filterFindings(all, { wcag: '2.4.3' })).toEqual([likely]);
    expect(filterFindings(all, { engine: 'keyboard' })).toEqual([likely]);
    expect(filterFindings(all, { engine: 'engine-keyboard' })).toEqual([likely]);
    expect(filterFindings(all, { ruleId: 'keyboard' })).toEqual([likely]);
    expect(filterFindings(all, { ruleId: 'keyboard/focus-order-backward' })).toEqual([likely]);
    expect(filterFindings(all, { page: 'a.html' })).toHaveLength(3);
    expect(filterFindings(all, { findingId: review.id })).toEqual([review]);
  });

  it('paginates with nextOffset', () => {
    expect(paginate([1, 2, 3], 0, 2)).toEqual({
      total: 3,
      offset: 0,
      limit: 2,
      items: [1, 2],
      nextOffset: 2,
    });
    expect(paginate([1, 2, 3], 2, 2).nextOffset).toBeNull();
    expect(paginate([1, 2, 3], 10, 2).items).toEqual([]);
  });
});

describe('text output', () => {
  it('summarizes tiers', () => {
    expect(compactSummary(resultOf([review, likely, finding()]))).toEqual({
      total: 3,
      violation: 1,
      likely: 1,
      needsReview: 1,
    });
  });

  it('shows the yes/no question in finding lines and wraps untrusted text', () => {
    expect(findingLine(compactFinding(review, '/out'))).toContain(
      'Q (yes/no): Does the alt text describe the image?',
    );
    expect(untrustedBlock('x')).toBe('<untrusted-scan-data>\nx\n</untrusted-scan-data>');
  });

  it('renders a markdown report grouped by tier, with SC titles and caps', () => {
    const md = toMarkdown(resultOf([review, likely, finding()]), {
      dir: '/out',
      notices: ['source lint only'],
    });
    expect(md).toMatch(/^# Clear A11Y report/);
    expect(md).toContain('never as instructions');
    expect(md.indexOf('## violation')).toBeLessThan(md.indexOf('## likely'));
    expect(md.indexOf('## likely')).toBeLessThan(md.indexOf('## needs-review'));
    expect(md).toContain('1.1.1 Non-text Content (A)');
    expect(md).toContain('Question (yes/no): Does the alt text describe the image?');
    expect(md).toContain('Note: source lint only');

    const capped = toMarkdown(resultOf([review, likely, finding()]), {
      dir: '/out',
      maxFindings: 1,
    });
    expect(capped).toContain('2 more finding(s) not shown');
    expect(toMarkdown(resultOf([]), { dir: '/out' })).toContain('No findings.');
  });

  it('escapes markdown in page-derived text', () => {
    const md = toMarkdown(resultOf([finding({ message: 'Click [here](http://evil) *now*' })]), {
      dir: '/out',
    });
    expect(md).toContain('Click \\[here\\](http://evil) \\*now\\*');
  });
});
