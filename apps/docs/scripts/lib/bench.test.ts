import { getSuccessCriterion } from '@clear-a11y/core';
import { describe, expect, it } from 'vitest';
import {
  delta,
  historyLabel,
  isHistoryFile,
  precision,
  renderBenchmark,
  type BenchmarkFile,
} from './bench.ts';

const result = (over: Partial<BenchmarkFile> = {}): BenchmarkFile => ({
  generatedAt: '2026-11-01T01:00:00.000Z',
  pages: 10,
  correctPatternPages: 4,
  expectedIssues: 8,
  matchedIssues: 6,
  recall: 0.75,
  violation: { total: 5, truePositive: 5, falsePositive: 0, precision: 1 },
  findings: { total: 9, byTier: { violation: 5, likely: 3, 'needs-review': 1 } },
  bySc: {
    '2.4.3': { expected: 2, matched: 2, recall: 1 },
    '1.4.10': { expected: 2, matched: 1, recall: 0.5 },
    '1.1.1': { expected: 4, matched: 3, recall: 0.75 },
  },
  byLayer: {
    visual: { expected: 2, matched: 1, recall: 0.5 },
    static: { expected: 6, matched: 5, recall: 0.833 },
  },
  foundBy: { visual: 1, static: 5 },
  missed: [
    {
      page: 'visual/reflow.html',
      id: 'visual/reflow#1',
      wcag: ['1.4.10'],
      layer: 'visual',
      description: 'Scrolls sideways.',
    },
  ],
  falsePositives: [],
  correctPatternNoise: [],
  ...over,
});

describe('formatting helpers', () => {
  it('handles null precision', () => {
    expect(precision({ truePositive: 0, total: 0, precision: null })).toBe(
      'n/a (no `violation` findings)',
    );
    expect(precision({ truePositive: 63, total: 64, precision: 63 / 64 })).toBe('98.4% (63/64)');
  });

  it('formats deltas in percentage points', () => {
    expect(delta(0.5, undefined)).toBe('–');
    expect(delta(0.5, 0.273)).toBe('+22.7 pts');
    expect(delta(0.464, 0.5)).toBe('−3.6 pts');
    expect(delta(0.974, 0.974)).toBe('±0 pts');
  });

  it('labels history files', () => {
    expect(historyLabel('wave3')).toBe('Wave 3');
    expect(historyLabel('s01-axe-baseline')).toBe('S01 baseline (axe-core only)');
    expect(isHistoryFile('wave12')).toBe(true);
    expect(isHistoryFile('latest')).toBe(false);
    expect(isHistoryFile('s02-keyboard')).toBe(false);
  });
});

describe('renderBenchmark', () => {
  const md = renderBenchmark(
    result({
      repo: {
        repos: 2,
        files: 9,
        expectedIssues: 4,
        matchedIssues: 4,
        recall: 1,
        violation: { total: 0, truePositive: 0, falsePositive: 0, precision: null },
        findings: { total: 5 },
      },
    }),
    [
      {
        name: 'wave2',
        result: result({
          generatedAt: '2026-10-31T23:00:00.000Z',
          recall: 0.97,
          matchedIssues: 65,
          expectedIssues: 67,
        }),
      },
      {
        name: 's01-axe-baseline',
        result: result({
          generatedAt: '2026-10-31T21:00:00.000Z',
          recall: 0.273,
          matchedIssues: 6,
          expectedIssues: 22,
        }),
      },
    ],
    getSuccessCriterion,
  );

  it('renders the summary, layers in engine order and SCs in numeric order', () => {
    expect(md).toContain('| Recall (any tier) | 75.0% (6/8) |');
    expect(md).toContain('| Precision of `violation` | 100.0% (5/5) |');
    expect(md.indexOf('| Static rules (axe-core) |')).toBeLessThan(md.indexOf('| Visual |'));
    const sc = (n: string) => md.indexOf(`[${n} `);
    expect(sc('1.1.1')).toBeLessThan(sc('1.4.10'));
    expect(sc('1.4.10')).toBeLessThan(sc('2.4.3'));
    expect(md).toContain(
      '[1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)',
    );
    expect(md).toContain('- `visual/reflow.html` (1.4.10, Visual): Scrolls sideways.');
  });

  it('renders the repo layer with null precision', () => {
    expect(md).toContain('### Repo layer (source scanning)');
    expect(md).toContain('| Precision of `violation` | n/a (no `violation` findings) |');
  });

  it('orders the progression by date and shows deltas', () => {
    const baseline = md.indexOf('| S01 baseline (axe-core only) | 27.3% (6/22) | – |');
    const wave2 = md.indexOf('| Wave 2 | 97.0% (65/67) | +69.7 pts |');
    expect(baseline).toBeGreaterThan(0);
    expect(wave2).toBeGreaterThan(baseline);
  });
});
