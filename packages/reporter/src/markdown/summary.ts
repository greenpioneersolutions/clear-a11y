import {
  compareTiers,
  getSuccessCriterion,
  type Finding,
  type ScanResult,
  type Tier,
} from '@clear-a11y/core';
import { escapeMarkdown, markdownCode, markdownLink } from './escape.js';

export interface MarkdownSummaryOptions {
  /** Most findings listed in the table (default 50). The rest are counted. */
  maxFindings?: number;
  /** Most needs-review questions listed (default 50). */
  maxQuestions?: number;
  /** Heading text (default "Clear A11Y accessibility scan"). */
  title?: string;
  /**
   * Where the full report is, e.g. 'Download the "clear-a11y-report" artifact and open
   * report.html.' Escaped like page text.
   */
  reportNote?: string;
  /** Extra plain-text lines shown under the counts (what was scanned, fallbacks). Escaped. */
  notes?: readonly string[];
}

const TIER_LABEL: Record<Tier, string> = {
  violation: 'Violation',
  likely: 'Likely',
  'needs-review': 'Needs review',
};
const TIER_MEANING: Record<Tier, string> = {
  violation: 'deterministic, high certainty; can fail CI',
  likely: 'strong signal, small chance of a false positive',
  'needs-review': 'a person decides; see the questions below',
};
const TIERS: Tier[] = ['violation', 'likely', 'needs-review'];

/** WCAG criteria as links to their W3C Understanding pages. */
function wcagLinks(wcag: readonly string[]): string {
  return wcag
    .map((sc) => {
      const info = getSuccessCriterion(sc);
      return info ? markdownLink(sc, info.understanding) : escapeMarkdown(sc);
    })
    .join(', ');
}

/** "src/Button.tsx:12" for source findings, else the page URL with its state. */
function where(f: Finding, inTable = true): string {
  if (f.source) return markdownCode(`${f.source.file}:${f.source.line}`, 120, inTable);
  const state = f.page.state && f.page.state !== 'default' ? ` [${f.page.state}]` : '';
  return markdownCode(`${f.page.url}${state}`, 120, inTable);
}

const sortFindings = (findings: readonly Finding[]) =>
  [...findings].sort(
    (a, b) =>
      compareTiers(a.tier, b.tier) ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.page.url.localeCompare(b.page.url) ||
      a.target.selector.localeCompare(b.target.selector),
  );

/**
 * A Markdown summary of a scan for a GitHub job summary (`$GITHUB_STEP_SUMMARY`) or a PR comment:
 * counts by tier, the top findings with WCAG links, the needs-review questions, scan errors and a
 * pointer to the full HTML report. Every page-derived string is escaped, so page content can't
 * inject HTML, links, images, mentions or table cells.
 */
export function toMarkdownSummary(
  result: ScanResult,
  options: MarkdownSummaryOptions = {},
): string {
  const maxFindings = Math.max(0, options.maxFindings ?? 50);
  const maxQuestions = Math.max(0, options.maxQuestions ?? 50);
  const byTier = Object.fromEntries(
    TIERS.map((t) => [t, result.findings.filter((f) => f.tier === t).length]),
  ) as Record<Tier, number>;
  const out: string[] = [];

  out.push(`## ${escapeMarkdown(options.title ?? 'Clear A11Y accessibility scan')}`, '');
  const pages = new Set(result.pages.map((p) => p.url)).size;
  const verdict = byTier.violation
    ? `**${byTier.violation} violation${byTier.violation === 1 ? '' : 's'}** found`
    : result.findings.length
      ? 'No violations'
      : 'No findings';
  out.push(
    `${verdict} in ${pages} scanned page${pages === 1 ? '' : 's'} or file${pages === 1 ? '' : 's'}.`,
    '',
  );
  out.push('| Tier | Findings | Meaning |', '| --- | ---: | --- |');
  for (const t of TIERS) out.push(`| ${TIER_LABEL[t]} | ${byTier[t]} | ${TIER_MEANING[t]} |`);
  out.push('');

  if (options.notes?.length) {
    for (const note of options.notes) out.push(`- ${escapeMarkdown(note, 500)}`);
    out.push('');
  }

  if (result.findings.length && maxFindings > 0) {
    const sorted = sortFindings(result.findings);
    const shown = sorted.slice(0, maxFindings);
    out.push(
      sorted.length > shown.length
        ? `### Top ${shown.length} of ${sorted.length} findings`
        : `### Findings (${sorted.length})`,
      '',
      '| Tier | Rule | WCAG | Where | Element | Issue |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const f of shown)
      out.push(
        `| ${TIER_LABEL[f.tier]} | ${markdownCode(f.ruleId, 80)} | ${wcagLinks(f.wcag)} | ${where(f)} | ${markdownCode(f.target.selector)} | ${escapeMarkdown(f.message)} |`,
      );
    if (sorted.length > shown.length)
      out.push('', `… and ${sorted.length - shown.length} more in the full report.`);
    out.push('');
  }

  const questions = sortFindings(result.findings.filter((f) => f.tier === 'needs-review'));
  if (questions.length && maxQuestions > 0) {
    out.push(
      '<details>',
      `<summary>Needs review: ${questions.length} question${questions.length === 1 ? '' : 's'} for a person</summary>`,
      '',
    );
    for (const f of questions.slice(0, maxQuestions))
      out.push(
        `- ${escapeMarkdown(f.question ?? f.message)} (${markdownCode(f.target.selector, 120, false)} on ${where(f, false)}, WCAG ${wcagLinks(f.wcag)})`,
      );
    if (questions.length > maxQuestions)
      out.push(`- … and ${questions.length - maxQuestions} more in the full report.`);
    out.push('', '</details>', '');
  }

  if (result.errors.length) {
    out.push(
      '<details>',
      `<summary>${result.errors.length} scan error${result.errors.length === 1 ? '' : 's'} or coverage gap${result.errors.length === 1 ? '' : 's'}</summary>`,
      '',
    );
    for (const e of result.errors.slice(0, 20))
      out.push(
        `- ${markdownCode(e.engine, 40, false)} on ${markdownCode(e.url, 120, false)}: ${escapeMarkdown(e.message)}`,
      );
    if (result.errors.length > 20) out.push(`- … and ${result.errors.length - 20} more.`);
    out.push('', '</details>', '');
  }

  if (options.reportNote) out.push(escapeMarkdown(options.reportNote, 500), '');
  return out.join('\n');
}
