import type { BenchmarkResult } from '@clear-a11y/runner';
import { compareSc } from '@clear-a11y/core';
import { cell, prose } from './markdown.ts';
import { layerName, layerRank, type ScLookup } from './wcag.ts';

interface Ratio {
  expected: number;
  matched: number;
  recall: number;
}

/** The repo-layer block bench:run appends to latest.json. */
export interface RepoBenchmark {
  repos: number;
  files: number;
  stories?: number;
  expectedIssues: number;
  matchedIssues: number;
  recall: number;
  violation: {
    total: number;
    truePositive: number;
    falsePositive: number;
    precision: number | null;
  };
  findings: { total: number };
  correctPatternNoise?: unknown[];
  byLayer?: Record<string, Ratio>;
}

export type BenchmarkFile = BenchmarkResult & { repo?: RepoBenchmark };

export interface HistoryEntry {
  /** File name without extension, e.g. "wave3" or "s01-axe-baseline". */
  name: string;
  result: BenchmarkFile;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** "97.4% (75/77)". */
export const ratio = (matched: number, total: number, value: number) =>
  `${pct(value)} (${matched}/${total})`;

/** Precision of violation, or an explanation when there were no violation findings. */
export function precision(v: {
  truePositive: number;
  total: number;
  precision: number | null;
}): string {
  return v.precision === null
    ? 'n/a (no `violation` findings)'
    : ratio(v.truePositive, v.total, v.precision);
}

/** Signed change in percentage points ("+22.7 pts", "±0 pts"), or "–" for the first row. */
export function delta(current: number, previous: number | undefined): string {
  if (previous === undefined) return '–';
  const pts = Math.round((current - previous) * 1000) / 10;
  if (pts === 0) return '±0 pts';
  return `${pts > 0 ? '+' : '−'}${Math.abs(pts).toFixed(1)} pts`;
}

/** Human label for a saved benchmark file name. */
export function historyLabel(name: string): string {
  const wave = /^wave(\d+)$/.exec(name);
  if (wave) return `Wave ${wave[1]}`;
  if (name === 's01-axe-baseline') return 'S01 baseline (axe-core only)';
  return name;
}

/** The files that make up the progression table: the S01 baseline and each wave's result. */
export const isHistoryFile = (name: string) =>
  name === 's01-axe-baseline' || /^wave\d+$/.test(name);

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
}

const byLayerRows = (byLayer: Record<string, Ratio>) =>
  Object.entries(byLayer)
    .sort(([a], [b]) => layerRank(a) - layerRank(b) || a.localeCompare(b))
    .map(([layer, r]) => [layerName(layer), pct(r.recall), `${r.matched}/${r.expected}`]);

/** Markdown for the benchmark section of "How coverage is measured". Deterministic for a given input. */
export function renderBenchmark(
  latest: BenchmarkFile,
  history: readonly HistoryEntry[],
  lookup: ScLookup,
): string {
  const out: string[] = [];
  out.push(
    `Latest run: ${latest.pages} fixture pages (${latest.correctPatternPages} of them correct-pattern pages), ${latest.expectedIssues} expected issues. Generated ${latest.generatedAt.slice(0, 10)} from \`bench-results/latest.json\`.`,
  );
  out.push(
    table(
      ['Metric', 'Value'],
      [
        ['Recall (any tier)', ratio(latest.matchedIssues, latest.expectedIssues, latest.recall)],
        ['Precision of `violation`', precision(latest.violation)],
        [
          'Findings',
          `${latest.findings.total} (violation ${latest.findings.byTier.violation}, likely ${latest.findings.byTier.likely}, needs-review ${latest.findings.byTier['needs-review']})`,
        ],
        ['Findings on correct-pattern pages (noise)', String(latest.correctPatternNoise.length)],
      ],
    ),
  );

  out.push('### Recall by layer', 'The layer is the engine we expect to catch each issue.');
  out.push(table(['Layer', 'Recall', 'Matched / expected'], byLayerRows(latest.byLayer)));

  out.push(
    '### Which layer found the issues',
    'An issue can be found by more than one layer, so these numbers add up to more than the matched total. This shows what each layer adds on top of axe-core.',
  );
  out.push(
    table(
      ['Layer', 'Issues found'],
      Object.entries(latest.foundBy)
        .sort(([a], [b]) => layerRank(a) - layerRank(b) || a.localeCompare(b))
        .map(([layer, n]) => [layerName(layer), String(n)]),
    ),
  );

  out.push('### Recall by WCAG success criterion');
  out.push(
    table(
      ['Success criterion', 'Recall', 'Matched / expected'],
      Object.entries(latest.bySc)
        .sort(([a], [b]) => compareSc(a, b))
        .map(([sc, r]) => {
          const c = lookup(sc);
          return [
            c ? `[${sc} ${c.title}](${c.understanding})` : sc,
            pct(r.recall),
            `${r.matched}/${r.expected}`,
          ];
        }),
    ),
  );

  out.push('### Missed issues');
  out.push(
    latest.missed.length === 0
      ? 'None.'
      : latest.missed
          .map(
            (m) =>
              `- \`${m.page}\` (${m.wcag.join(', ')}, ${layerName(m.layer)}): ${prose(m.description)}`,
          )
          .join('\n'),
  );

  out.push('### Noise on correct-pattern pages');
  out.push(
    latest.correctPatternNoise.length === 0
      ? 'None.'
      : `${latest.correctPatternNoise.length} finding(s), none of them \`violation\`s:\n\n` +
          latest.correctPatternNoise
            .map((n) => `- \`${n.page}\`: \`${n.ruleId}\` (\`${n.tier}\`) on \`${n.selector}\``)
            .join('\n'),
  );

  if (latest.repo) {
    const r = latest.repo;
    out.push(
      '### Repo layer (source scanning)',
      `Scored separately on ${r.repos} sample repos in \`fixtures/repos/\` (${r.files} source files${r.stories ? `, ${r.stories} Storybook stories` : ''}), matched by file and line (±2 lines) plus success criterion.`,
    );
    out.push(
      table(
        ['Metric', 'Value'],
        [
          ['Recall (any tier)', ratio(r.matchedIssues, r.expectedIssues, r.recall)],
          ['Precision of `violation`', precision(r.violation)],
          ['Findings', String(r.findings.total)],
          [
            'Noise in correct-pattern files and stories',
            String(r.correctPatternNoise?.length ?? 0),
          ],
        ],
      ),
    );
  }

  if (history.length > 0) {
    const sorted = [...history].sort((a, b) =>
      a.result.generatedAt.localeCompare(b.result.generatedAt),
    );
    out.push(
      '### Progression',
      'Each row is the benchmark at the end of a build wave, starting from axe-core alone. Recall rises as engines are added; the number of expected issues rises too, because each engine slice adds seeded barriers.',
    );
    out.push(
      table(
        ['Run', 'Recall', 'Change', 'Precision of `violation`', 'Noise'],
        sorted.map((h, i) => [
          historyLabel(h.name),
          ratio(h.result.matchedIssues, h.result.expectedIssues, h.result.recall),
          delta(h.result.recall, sorted[i - 1]?.result.recall),
          precision(h.result.violation),
          String(h.result.correctPatternNoise.length),
        ]),
      ),
    );
  }
  return out.join('\n\n');
}
