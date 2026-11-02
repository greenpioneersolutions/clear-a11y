import { compareSc, layerOf, type ExpectedPage, type Finding, type Tier } from '@clear-a11y/core';
import { findingMatchesIssue } from './match.js';
import type { BenchmarkResult, Ratio } from './types.js';

const ratio = (expected: number, matched: number): Ratio => ({
  expected,
  matched,
  recall: expected === 0 ? 1 : round(matched / expected),
});

export const round = (n: number) => Math.round(n * 1000) / 1000;

function sortKeys<T>(
  obj: Record<string, T>,
  cmp?: (a: string, b: string) => number,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => (cmp ? cmp(a, b) : a.localeCompare(b))),
  );
}

/**
 * Scores findings against human-auditor ground truth.
 * `findingsByPage` is keyed by fixture page path (e.g. "keyboard/trap.html").
 */
export function scoreBenchmark(
  expected: readonly ExpectedPage[],
  findingsByPage: ReadonlyMap<string, readonly Finding[]>,
  options: { label?: string; now?: Date } = {},
): BenchmarkResult {
  const bySc: Record<string, { e: number; m: number }> = {};
  const byLayer: Record<string, { e: number; m: number }> = {};
  const foundBy: Record<string, number> = {};
  const byTier: Record<Tier, number> = { violation: 0, likely: 0, 'needs-review': 0 };
  const missed: BenchmarkResult['missed'] = [];
  const falsePositives: BenchmarkResult['falsePositives'] = [];
  const noise: BenchmarkResult['correctPatternNoise'] = [];
  let expectedIssues = 0;
  let matchedIssues = 0;
  let vTotal = 0;
  let vTp = 0;
  let total = 0;

  for (const page of expected) {
    const findings = findingsByPage.get(page.page) ?? [];
    total += findings.length;

    for (const f of findings) {
      byTier[f.tier]++;
      const matchesSome = page.issues.some((issue) => findingMatchesIssue(f, issue));
      if (page.correctPattern)
        noise.push({
          page: page.page,
          ruleId: f.ruleId,
          selector: f.target.selector,
          tier: f.tier,
        });
      if (f.tier === 'violation') {
        vTotal++;
        if (matchesSome) vTp++;
        else
          falsePositives.push({
            page: page.page,
            ruleId: f.ruleId,
            selector: f.target.selector,
            tier: f.tier,
            message: f.message,
          });
      }
    }

    for (const issue of page.issues) {
      expectedIssues++;
      const sc = issue.wcag[0] as string;
      bySc[sc] ??= { e: 0, m: 0 };
      byLayer[issue.layer] ??= { e: 0, m: 0 };
      bySc[sc].e++;
      byLayer[issue.layer].e++;
      const hits = findings.filter((f) => findingMatchesIssue(f, issue));
      if (hits.length) {
        matchedIssues++;
        bySc[sc].m++;
        byLayer[issue.layer].m++;
        for (const layer of new Set(hits.map((h) => layerOf(h.engine))))
          foundBy[layer] = (foundBy[layer] ?? 0) + 1;
      } else {
        missed.push({
          page: page.page,
          id: issue.id,
          wcag: issue.wcag,
          layer: issue.layer,
          description: issue.description,
        });
      }
    }
  }

  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    ...(options.label ? { label: options.label } : {}),
    pages: expected.length,
    correctPatternPages: expected.filter((p) => p.correctPattern).length,
    expectedIssues,
    matchedIssues,
    recall: expectedIssues === 0 ? 0 : round(matchedIssues / expectedIssues),
    violation: {
      total: vTotal,
      truePositive: vTp,
      falsePositive: vTotal - vTp,
      precision: vTotal === 0 ? null : round(vTp / vTotal),
    },
    findings: { total, byTier },
    bySc: sortKeys(
      Object.fromEntries(Object.entries(bySc).map(([k, v]) => [k, ratio(v.e, v.m)])),
      compareSc,
    ),
    byLayer: sortKeys(
      Object.fromEntries(Object.entries(byLayer).map(([k, v]) => [k, ratio(v.e, v.m)])),
    ),
    foundBy: sortKeys(foundBy),
    missed,
    falsePositives,
    correctPatternNoise: noise,
  };
}
