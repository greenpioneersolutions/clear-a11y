import { getSuccessCriterion } from '@clear-a11y/core';
import type { BenchmarkResult } from './types.js';

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);

/** Markdown summary of a benchmark result (stable: no timestamps in tables). */
export function benchmarkToMarkdown(r: BenchmarkResult): string {
  const lines: string[] = [];
  lines.push(`# Clear A11Y benchmark${r.label ? `: ${r.label}` : ''}`, '');
  lines.push(
    `Generated ${r.generatedAt}. Fixture pages: ${r.pages} (${r.correctPatternPages} correct-pattern).`,
    '',
  );
  lines.push('| Metric | Value |', '|---|---|');
  lines.push(`| Recall (any tier) | ${pct(r.recall)} (${r.matchedIssues}/${r.expectedIssues}) |`);
  lines.push(
    `| Precision of \`violation\` | ${pct(r.violation.precision)} (${r.violation.truePositive}/${r.violation.total}) |`,
  );
  lines.push(
    `| Findings | ${r.findings.total} (violation ${r.findings.byTier.violation}, likely ${r.findings.byTier.likely}, needs-review ${r.findings.byTier['needs-review']}) |`,
  );
  lines.push(`| Noise on correct-pattern pages | ${r.correctPatternNoise.length} |`, '');

  lines.push(
    '## Recall by expected layer',
    '',
    '| Layer | Recall | Matched / expected |',
    '|---|---|---|',
  );
  for (const [layer, v] of Object.entries(r.byLayer))
    lines.push(`| ${layer} | ${pct(v.recall)} | ${v.matched}/${v.expected} |`);
  lines.push(
    '',
    '## Issues found, by the layer that found them',
    '',
    '| Layer | Issues |',
    '|---|---|',
  );
  for (const [layer, n] of Object.entries(r.foundBy)) lines.push(`| ${layer} | ${n} |`);
  if (!Object.keys(r.foundBy).length) lines.push('| (none) | 0 |');

  lines.push(
    '',
    '## Recall by WCAG success criterion',
    '',
    '| SC | Title | Recall | Matched / expected |',
    '|---|---|---|---|',
  );
  for (const [sc, v] of Object.entries(r.bySc)) {
    lines.push(
      `| ${sc} | ${getSuccessCriterion(sc)?.title ?? ''} | ${pct(v.recall)} | ${v.matched}/${v.expected} |`,
    );
  }

  if (r.falsePositives.length) {
    lines.push('', '## False positives (violation tier)', '');
    for (const f of r.falsePositives)
      lines.push(`- \`${f.page}\` ${f.ruleId} on \`${f.selector}\`: ${f.message}`);
  }
  if (r.correctPatternNoise.length) {
    lines.push('', '## Findings on correct-pattern pages', '');
    for (const f of r.correctPatternNoise)
      lines.push(`- \`${f.page}\` ${f.ruleId} [${f.tier}] on \`${f.selector}\``);
  }
  if (r.missed.length) {
    lines.push('', '## Missed issues', '');
    for (const m of r.missed)
      lines.push(`- \`${m.page}\` (${m.wcag.join(', ')}, ${m.layer}): ${m.description}`);
  }
  return lines.join('\n') + '\n';
}
