import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareSc, getSuccessCriterion, type Finding, type Tier } from '@clear-a11y/core';
import { storyIdFromUrl } from '@clear-a11y/repo';
import { z } from 'zod';
import { scanRepo } from '../repo.js';
import { selectorsMatch } from './match.js';
import { round } from './score.js';
import type { Ratio } from './types.js';

/**
 * Ground truth for a sample repo: `fixtures/repos/<name>/expected.json`. Two kinds of issues:
 * - source issues (`file` + `line`): matched by source location, same file, line within ±2,
 *   overlapping WCAG SC (static lint);
 * - story issues (`story` + `selector`): matched like site issues on that Storybook story, same
 *   story id, matching selector (` | ` separates alternatives), overlapping WCAG SC (runtime layer).
 */
export const RepoExpectedIssueSchema = z
  .object({
    id: z.string(),
    /** Repo-relative POSIX path. */
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
    /** Storybook story id, e.g. "components-button--icon-only". */
    story: z.string().optional(),
    selector: z.string().optional(),
    /** Rule we expect to fire (informational; matching uses location and SC). */
    rule: z.string().optional(),
    /** First SC is the primary one used for recall-by-SC. */
    wcag: z.array(z.string()).min(1),
    layer: z.string().default('repo'),
    description: z.string(),
  })
  .refine((i) => (i.file !== undefined && i.line !== undefined) !== (i.story !== undefined), {
    message: 'an issue needs either file + line (source) or story + selector (runtime)',
  })
  .refine((i) => i.story === undefined || i.selector !== undefined, {
    message: 'a story issue needs a selector',
  });
export type RepoExpectedIssue = z.infer<typeof RepoExpectedIssueSchema>;

export const RepoExpectedSchema = z.object({
  $schema: z.string().optional(),
  repo: z.string(),
  title: z.string(),
  /** Files with correct patterns only: any finding in them is noise. */
  correctFiles: z.array(z.string()).default([]),
  /** Storybook stories with correct patterns only: any finding on them is noise. */
  correctStories: z.array(z.string()).default([]),
  issues: z.array(RepoExpectedIssueSchema),
});
export type RepoExpected = z.infer<typeof RepoExpectedSchema>;

/** Lines a repo finding may be off by and still match (multi-line JSX reports vary). */
export const REPO_LINE_TOLERANCE = 2;

export function repoFindingMatchesIssue(
  finding: Finding,
  issue: RepoExpectedIssue,
  tolerance = REPO_LINE_TOLERANCE,
): boolean {
  if (issue.story !== undefined)
    return (
      storyIdFromUrl(finding.page.url) === issue.story &&
      selectorsMatch(finding.target.selector, issue.selector ?? '') &&
      finding.wcag.some((sc) => issue.wcag.includes(sc))
    );
  if (!finding.source || issue.line === undefined || finding.source.file !== issue.file)
    return false;
  if (Math.abs(finding.source.line - issue.line) > tolerance) return false;
  return finding.wcag.some((sc) => issue.wcag.includes(sc));
}

export interface RepoBenchmarkResult {
  repos: number;
  files: number;
  /** Storybook stories scanned by the runtime layer. */
  stories: number;
  expectedIssues: number;
  matchedIssues: number;
  recall: number;
  violation: {
    total: number;
    truePositive: number;
    falsePositive: number;
    precision: number | null;
  };
  findings: { total: number; byTier: Record<Tier, number> };
  bySc: Record<string, Ratio>;
  byRepo: Record<string, Ratio>;
  /** Recall by the layer expected to catch each issue (`repo` for static lint, engine layers for stories). */
  byLayer: Record<string, Ratio>;
  missed: Array<{
    repo: string;
    id: string;
    /** `file:line` for source issues, `story:<id> <selector>` for story issues. */
    where: string;
    wcag: string[];
    description: string;
  }>;
  falsePositives: Array<{ repo: string; ruleId: string; where: string; message: string }>;
  /** Findings of any tier in correct-pattern files or on correct-pattern stories. */
  correctFileNoise: Array<{ repo: string; ruleId: string; where: string; tier: Tier }>;
  /** Scan errors and notices (parse errors, skipped frameworks). */
  errors: Array<{ repo: string; message: string }>;
}

export interface RepoBenchmarkEntry {
  expected: RepoExpected;
  findings: readonly Finding[];
  files?: number;
  stories?: number;
  errors?: string[];
}

/** Where a finding is, for reports: the story and selector for runtime findings, else file:line. */
function whereOf(f: Finding): string {
  const story = storyIdFromUrl(f.page.url);
  if (story) return `story:${story} ${f.target.selector}`;
  return `${f.source?.file ?? f.page.url}:${f.source?.line ?? 0}`;
}

const whereOfIssue = (i: RepoExpectedIssue) =>
  i.story !== undefined ? `story:${i.story} ${i.selector ?? ''}` : `${i.file}:${i.line}`;

const ratio = (e: number, m: number): Ratio => ({
  expected: e,
  matched: m,
  recall: e === 0 ? 1 : round(m / e),
});

/** Scores repo scans against their expected.json files. Pure. */
export function scoreRepoBenchmark(entries: readonly RepoBenchmarkEntry[]): RepoBenchmarkResult {
  const byTier: Record<Tier, number> = { violation: 0, likely: 0, 'needs-review': 0 };
  const bySc: Record<string, { e: number; m: number }> = {};
  const byRepo: Record<string, { e: number; m: number }> = {};
  const byLayer: Record<string, { e: number; m: number }> = {};
  const r: RepoBenchmarkResult = {
    repos: entries.length,
    files: 0,
    stories: 0,
    expectedIssues: 0,
    matchedIssues: 0,
    recall: 0,
    violation: { total: 0, truePositive: 0, falsePositive: 0, precision: null },
    findings: { total: 0, byTier },
    bySc: {},
    byRepo: {},
    byLayer: {},
    missed: [],
    falsePositives: [],
    correctFileNoise: [],
    errors: [],
  };
  for (const { expected, findings, files, stories, errors } of entries) {
    const repo = expected.repo;
    r.files += files ?? 0;
    r.stories += stories ?? 0;
    for (const message of errors ?? []) r.errors.push({ repo, message });
    byRepo[repo] ??= { e: 0, m: 0 };
    for (const f of findings) {
      r.findings.total++;
      byTier[f.tier]++;
      const story = storyIdFromUrl(f.page.url);
      // A runtime finding mapped to a component file is still judged by its story.
      const noisy = story
        ? expected.correctStories.includes(story)
        : expected.correctFiles.includes(f.source?.file ?? '');
      if (noisy)
        r.correctFileNoise.push({ repo, ruleId: f.ruleId, where: whereOf(f), tier: f.tier });
      if (f.tier !== 'violation') continue;
      r.violation.total++;
      if (expected.issues.some((i) => repoFindingMatchesIssue(f, i))) r.violation.truePositive++;
      else r.falsePositives.push({ repo, ruleId: f.ruleId, where: whereOf(f), message: f.message });
    }
    for (const issue of expected.issues) {
      const sc = issue.wcag[0] as string;
      bySc[sc] ??= { e: 0, m: 0 };
      byLayer[issue.layer] ??= { e: 0, m: 0 };
      r.expectedIssues++;
      bySc[sc].e++;
      byRepo[repo].e++;
      byLayer[issue.layer].e++;
      if (findings.some((f) => repoFindingMatchesIssue(f, issue))) {
        r.matchedIssues++;
        bySc[sc].m++;
        byRepo[repo].m++;
        byLayer[issue.layer].m++;
      } else
        r.missed.push({
          repo,
          id: issue.id,
          where: whereOfIssue(issue),
          wcag: issue.wcag,
          description: issue.description,
        });
    }
  }
  r.recall = r.expectedIssues === 0 ? 0 : round(r.matchedIssues / r.expectedIssues);
  r.violation.falsePositive = r.violation.total - r.violation.truePositive;
  r.violation.precision =
    r.violation.total === 0 ? null : round(r.violation.truePositive / r.violation.total);
  r.bySc = Object.fromEntries(
    Object.entries(bySc)
      .sort(([a], [b]) => compareSc(a, b))
      .map(([k, v]) => [k, ratio(v.e, v.m)]),
  );
  const sorted = (m: Record<string, { e: number; m: number }>) =>
    Object.fromEntries(
      Object.entries(m)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ratio(v.e, v.m)]),
    );
  r.byRepo = sorted(byRepo);
  r.byLayer = sorted(byLayer);
  return r;
}

/** Loads `<reposDir>/<name>/expected.json` for every sample repo that has one. */
export async function loadRepoExpected(
  reposDir: string,
): Promise<Array<{ dir: string; expected: RepoExpected }>> {
  const entries = await readdir(reposDir, { withFileTypes: true }).catch(() => []);
  const out: Array<{ dir: string; expected: RepoExpected }> = [];
  for (const e of entries
    .filter((x) => x.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(reposDir, e.name);
    const raw = await readFile(join(dir, 'expected.json'), 'utf-8').catch(() => undefined);
    if (raw === undefined) continue;
    const parsed = RepoExpectedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`repos/${e.name}/expected.json: ${parsed.error.message}`);
    out.push({ dir, expected: parsed.data });
  }
  return out;
}

/**
 * Runs the full repo scan (static lint, plus the runtime layer for sample repos with a built
 * Storybook) on every sample repo under `reposDir` and scores the result. Never boots a dev server.
 */
export async function runRepoBenchmark(options: {
  reposDir: string;
  onRepo?: (repo: string, findings: number) => void;
}): Promise<RepoBenchmarkResult> {
  const entries: RepoBenchmarkEntry[] = [];
  for (const { dir, expected } of await loadRepoExpected(options.reposDir)) {
    const { result, runtime } = await scanRepo({
      path: dir,
      config: { output: { screenshots: false } },
      repo: { boot: false },
    });
    options.onRepo?.(expected.repo, result.findings.length);
    entries.push({
      expected,
      findings: result.findings,
      files: result.pages.filter((p) => p.viewport === 'none').length,
      stories: runtime.stories ?? 0,
      errors: result.errors.map((e) => `${e.url}: ${e.message}`),
    });
  }
  return scoreRepoBenchmark(entries);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);

/** Markdown section for the repo layer, appended to the benchmark report (no timestamps). */
export function repoBenchmarkToMarkdown(r: RepoBenchmarkResult): string {
  const lines: string[] = [
    '## Repo layer (source scanning)',
    '',
    `${r.repos} sample repo(s) in \`fixtures/repos/\`: static lint of ${r.files} source files, scored by file and line (±${REPO_LINE_TOLERANCE}) plus WCAG SC, and the runtime layer on ${r.stories} Storybook stories (full engine set), scored by story id, selector and WCAG SC. Separate from the site numbers above.`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Recall (any tier) | ${pct(r.recall)} (${r.matchedIssues}/${r.expectedIssues}) |`,
    `| Precision of \`violation\` | ${pct(r.violation.precision)} (${r.violation.truePositive}/${r.violation.total}) |`,
    `| Findings | ${r.findings.total} (violation ${r.findings.byTier.violation}, likely ${r.findings.byTier.likely}, needs-review ${r.findings.byTier['needs-review']}) |`,
    `| Noise in correct-pattern files and stories | ${r.correctFileNoise.length} |`,
    '',
    '| Repo | Recall | Matched / expected |',
    '|---|---|---|',
    ...Object.entries(r.byRepo).map(
      ([k, v]) => `| ${k} | ${pct(v.recall)} | ${v.matched}/${v.expected} |`,
    ),
    '',
    '| Layer | Recall | Matched / expected |',
    '|---|---|---|',
    ...Object.entries(r.byLayer).map(
      ([k, v]) => `| ${k} | ${pct(v.recall)} | ${v.matched}/${v.expected} |`,
    ),
    '',
    '| SC | Title | Recall | Matched / expected |',
    '|---|---|---|---|',
    ...Object.entries(r.bySc).map(
      ([sc, v]) =>
        `| ${sc} | ${getSuccessCriterion(sc)?.title ?? ''} | ${pct(v.recall)} | ${v.matched}/${v.expected} |`,
    ),
  ];
  if (r.falsePositives.length) {
    lines.push('', '### Repo false positives (violation tier)', '');
    for (const f of r.falsePositives)
      lines.push(`- \`${f.repo}/${f.where}\` ${f.ruleId}: ${f.message}`);
  }
  if (r.correctFileNoise.length) {
    lines.push('', '### Repo findings in correct-pattern files and stories', '');
    for (const f of r.correctFileNoise)
      lines.push(`- \`${f.repo}/${f.where}\` ${f.ruleId} [${f.tier}]`);
  }
  if (r.missed.length) {
    lines.push('', '### Repo issues missed', '');
    for (const m of r.missed)
      lines.push(`- \`${m.repo}/${m.where}\` (${m.wcag.join(', ')}): ${m.description}`);
  }
  if (r.errors.length) {
    lines.push('', '### Repo scan errors and notices', '');
    for (const e of r.errors) lines.push(`- \`${e.repo}\`: ${e.message}`);
  }
  return lines.join('\n') + '\n';
}
