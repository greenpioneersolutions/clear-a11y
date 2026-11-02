import { summarize, type Finding, type ResolvedFinding, type ScanResult } from '@clear-a11y/core';
import { repoPageUrl } from '../static/to-finding.js';

export interface LimitResultOptions {
  /**
   * Also keep findings, pages and errors on these page URLs whatever their source file, e.g. the
   * runtime pages of the stories selected for a pull request (`repo:storybook-static/…`).
   */
  keepUrl?: (url: string) => boolean;
}

/**
 * Keeps only what concerns `files` in a repo scan result: findings in those files, their page
 * entries and parse errors. Repo-wide notices (errors on the repo target itself) are kept, so a
 * coverage gap is never hidden.
 */
export function limitResultToFiles(
  result: ScanResult,
  files: readonly string[],
  options: LimitResultOptions = {},
): ScanResult {
  const keep = new Set(files);
  const fileUrls = new Set(files.map(repoPageUrl));
  const keepUrl = options.keepUrl ?? (() => false);
  const pageUrls = { has: (url: string) => fileUrls.has(url) || keepUrl(url) };
  const kept = (f: Finding) => (f.source && keep.has(f.source.file)) || pageUrls.has(f.page.url);
  const findings = result.findings.filter(kept);
  const resolved = result.resolved?.filter((r) => kept(r.finding));
  return {
    ...result,
    pages: result.pages.filter((p) => pageUrls.has(p.url)),
    findings,
    errors: result.errors.filter((e) => pageUrls.has(e.url) || result.targets.includes(e.url)),
    summary: summarize(findings, resolved),
    ...(resolved ? { resolved } : {}),
  };
}

/**
 * Combines several scan results (site pages, stories, repo lint) into one canonical result:
 * targets, pages, findings (deduplicated by id) and errors are concatenated, the time span covers
 * all of them and the summary is recomputed. Throws when given nothing.
 */
export function mergeScanResults(results: readonly ScanResult[]): ScanResult {
  const [first] = results;
  if (!first) throw new Error('mergeScanResults needs at least one result');
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const r of results)
    for (const f of r.findings) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      findings.push(f);
    }
  const times = (key: 'startedAt' | 'finishedAt') => results.map((r) => r[key]).sort();
  // Resolved findings (ADR 0003) are kept only when some input carried the list.
  const withResolved = results.filter((r) => r.resolved);
  const resolved: ResolvedFinding[] | undefined = withResolved.length
    ? withResolved.flatMap((r) => r.resolved ?? [])
    : undefined;
  return {
    schemaVersion: first.schemaVersion,
    tool: first.tool,
    startedAt: times('startedAt')[0] ?? first.startedAt,
    finishedAt: times('finishedAt').at(-1) ?? first.finishedAt,
    targets: [...new Set(results.flatMap((r) => r.targets))],
    pages: results.flatMap((r) => r.pages),
    findings,
    errors: results.flatMap((r) => r.errors),
    summary: summarize(findings, resolved),
    ...(resolved ? { resolved } : {}),
  };
}
