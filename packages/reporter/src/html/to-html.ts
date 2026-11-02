import {
  compareSc,
  compareTiers,
  getSuccessCriterion,
  stableHash,
  TIERS,
  type Finding,
  type ScanResult,
  type Tier,
} from '@clear-a11y/core';
import { collectRules, PROJECT_URL, type RenderOptions } from '../rules.js';
import { CLIENT_JS } from './client.js';
import { escapeHtml, linkOrText } from './escape.js';
import {
  renderFinding,
  scLink,
  TIER_LABEL,
  TIER_MEANING,
  TIER_PLURAL,
  type RenderedFinding,
} from './finding.js';
import { renderReviewQueue } from './review-queue.js';
import { screenshotDataUri } from './screenshot.js';
import { STYLES } from './styles.js';

export interface HtmlOptions extends RenderOptions {
  /**
   * Directory that `evidence.screenshot` paths are relative to (the scan's report directory,
   * which holds `artifacts/`). Without it, file screenshots are not embedded.
   */
  artifactsDir?: string;
  /** Cap on embedded screenshots, to keep the file a sane size. Default 200. */
  maxScreenshots?: number;
}

const NO_SC = 'none';

/** Stable order: tier, primary SC, rule, page, state, viewport, selector. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  const primary = (f: Finding) => f.wcag[0] ?? '9.9.99';
  return [...findings].sort(
    (a, b) =>
      compareTiers(a.tier, b.tier) ||
      compareSc(primary(a), primary(b)) ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.page.url.localeCompare(b.page.url) ||
      a.page.state.localeCompare(b.page.state) ||
      a.page.viewport.localeCompare(b.page.viewport) ||
      a.target.selector.localeCompare(b.target.selector) ||
      a.id.localeCompare(b.id),
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function prepare(result: ScanResult, options: HtmlOptions): RenderedFinding[] {
  const rules = new Map(collectRules(result.findings, options.rules).map((r) => [r.id, r]));
  const max = options.maxScreenshots ?? 200;
  let embedded = 0;
  return sortFindings(result.findings).map((finding, i) => {
    const item: RenderedFinding = { finding, n: i + 1, rule: rules.get(finding.ruleId) };
    const path = finding.evidence.screenshot;
    if (path && !path.startsWith('memory:')) {
      if (embedded >= max) {
        item.screenshotNote = `Screenshot not embedded: this report embeds at most ${max} screenshots. Find it at ${path}.`;
      } else {
        const uri = screenshotDataUri(path, options.artifactsDir);
        if (uri) {
          item.screenshot = uri;
          embedded++;
        }
      }
    }
    return item;
  });
}

function tierSection(tier: Tier, items: readonly RenderedFinding[]): string {
  const inTier = items.filter((i) => i.finding.tier === tier);
  const head =
    `<section class="tier" id="tier-${tier}" aria-labelledby="tier-${tier}-h">` +
    `<h2 id="tier-${tier}-h">${TIER_PLURAL[tier]} (${inTier.length})</h2>` +
    `<p class="lead">${TIER_MEANING[tier]}</p>`;
  if (!inTier.length) return `${head}<p>No findings in this tier.</p></section>`;
  const groups = new Map<string, RenderedFinding[]>();
  for (const item of inTier) {
    const sc = item.finding.wcag[0] ?? NO_SC;
    groups.set(sc, [...(groups.get(sc) ?? []), item]);
  }
  const body = [...groups.entries()]
    .map(([sc, list]) => {
      const gid = `${tier}-sc-${sc.replace(/\./g, '-')}`;
      const info = getSuccessCriterion(sc);
      const heading =
        sc === NO_SC
          ? 'Best practice (no WCAG criterion)'
          : info
            ? `WCAG ${scLink(sc)}`
            : `WCAG ${escapeHtml(sc)}`;
      return (
        `<section class="sc-group" aria-labelledby="${gid}-h">` +
        `<h3 id="${gid}-h">${heading} <span class="count">· ${plural(list.length, 'finding')}</span></h3>` +
        list.map(renderFinding).join('') +
        `</section>`
      );
    })
    .join('');
  return `${head}${body}<p class="filter-empty note" hidden>No findings in this tier match the filters.</p></section>`;
}

function countTable(
  caption: string,
  headers: [string, string],
  rows: Array<[string, number]>,
): string {
  const head = `<tr><th scope="col">${headers[0]}</th><th scope="col" class="num">${headers[1]}</th></tr>`;
  const body = rows.length
    ? rows
        .map(
          ([label, count]) => `<tr><th scope="row">${label}</th><td class="num">${count}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="2">None</td></tr>`;
  return `<table><caption>${caption}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function summarySection(result: ScanResult): string {
  const { byTier, byEngine, bySc } = result.summary;
  const tiers = TIERS.map(
    (t) =>
      `<div><dt>${`<a href="#tier-${t}">${TIER_PLURAL[t]}</a>`}: ${byTier[t] ?? 0}</dt><dd>${TIER_MEANING[t]}</dd></div>`,
  ).join('');
  const scRows = Object.keys(bySc)
    .sort(compareSc)
    .map((sc): [string, number] => [scLink(sc), bySc[sc] ?? 0]);
  const engineRows = Object.keys(byEngine)
    .sort()
    .map((e): [string, number] => [escapeHtml(e), byEngine[e] ?? 0]);
  const pageViews = result.pages.length;
  return (
    `<section id="summary" aria-labelledby="summary-h">` +
    `<h2 id="summary-h">Summary</h2>` +
    `<p>${plural(result.summary.total, 'finding')} across ${plural(pageViews, 'page view')} ` +
    `(${byTier['violation'] ?? 0} violation, ${byTier['likely'] ?? 0} likely, ${byTier['needs-review'] ?? 0} needs review). ` +
    `Every finding has a tier that says how sure Clear A11Y is:</p>` +
    `<dl class="tiers">${tiers}</dl>` +
    `<div class="grid-2">` +
    `<div>${countTable('Findings by WCAG success criterion', ['Success criterion', 'Findings'], scRows)}</div>` +
    `<div>${countTable('Findings by engine', ['Engine', 'Findings'], engineRows)}</div>` +
    `</div></section>`
  );
}

function filtersSection(result: ScanResult): string {
  const total = result.findings.length;
  if (!total) return '';
  const engines = Object.keys(result.summary.byEngine).sort();
  const scs = Object.keys(result.summary.bySc).sort(compareSc);
  const option = (value: string, label: string) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  return (
    `<section id="filters" class="filters" aria-labelledby="filters-h" hidden>` +
    `<h2 id="filters-h">Filter findings</h2>` +
    `<form id="filter-form">` +
    `<div class="field"><label for="filter-tier">Tier</label><select id="filter-tier" name="tier">${option('', 'All tiers')}${TIERS.map((t) => option(t, TIER_LABEL[t])).join('')}</select></div>` +
    `<div class="field"><label for="filter-engine">Engine</label><select id="filter-engine" name="engine">${option('', 'All engines')}${engines.map((e) => option(e, e)).join('')}</select></div>` +
    `<div class="field"><label for="filter-sc">WCAG criterion</label><select id="filter-sc" name="sc">${option('', 'All criteria')}${scs.map((sc) => option(sc, `${sc} ${getSuccessCriterion(sc)?.title ?? ''}`.trim())).join('')}</select></div>` +
    `<div class="field"><button type="reset" id="filter-reset">Show all</button></div>` +
    `</form>` +
    `<p id="filter-status" class="status" role="status">Showing all ${total} findings.</p>` +
    `</section>`
  );
}

function pagesSection(result: ScanResult): string {
  const rows = result.pages.length
    ? result.pages
        .map(
          (p) =>
            `<tr><td>${linkOrText(p.url)}${p.title ? `<br><span class="note">${escapeHtml(p.title)}</span>` : ''}</td><td>${escapeHtml(p.viewport)}</td><td>${escapeHtml(p.states.join(', ') || '—')}</td><td>${p.error ? escapeHtml(p.error) : 'OK'}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="4">No pages were scanned.</td></tr>`;
  const errors = result.errors.length
    ? `<h3 id="errors-h">Engine errors (${result.errors.length})</h3><p>These checks did not complete, so their findings may be missing.</p><ul>${result.errors
        .map(
          (e) =>
            `<li><code>${escapeHtml(e.engine)}</code> on ${escapeHtml(e.url)} (state: ${escapeHtml(e.state)}, viewport: ${escapeHtml(e.viewport)}): ${escapeHtml(e.message)}</li>`,
        )
        .join('')}</ul>`
    : '';
  return (
    `<section id="pages" aria-labelledby="pages-h">` +
    `<h2 id="pages-h">Pages scanned</h2>` +
    `<table><caption>Page views (page and viewport) and the states scanned in each</caption>` +
    `<thead><tr><th scope="col">Page</th><th scope="col">Viewport</th><th scope="col">States</th><th scope="col">Result</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>${errors}</section>`
  );
}

function targetsBlock(targets: readonly string[]): string {
  if (targets.length <= 1)
    return `<p class="lead">Target: ${targets[0] ? linkOrText(targets[0]) : 'none'}</p>`;
  return `<p class="lead" id="targets-h">Targets (${targets.length}):</p><ul class="targets" aria-labelledby="targets-h">${targets.map((t) => `<li>${linkOrText(t)}</li>`).join('')}</ul>`;
}

/**
 * A single, self-contained, accessible HTML report: inline CSS and JS, screenshots as data URIs,
 * no external requests (enforced by a Content-Security-Policy). Deterministic for a given result.
 */
export function toHtml(result: ScanResult, options: HtmlOptions = {}): string {
  const items = prepare(result, options);
  const reportKey = stableHash(`${result.startedAt}|${items.map((i) => i.finding.id).join(',')}`);
  const { byTier } = result.summary;
  const target =
    result.targets.length === 1
      ? (result.targets[0] as string)
      : `${result.targets.length} targets`;
  const title = `Accessibility report: ${target} (${plural(result.summary.total, 'finding')}) – Clear A11Y`;
  const csp =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
    "base-uri 'none'; form-action 'none'";
  const navTiers = TIERS.map(
    (t) => `<li><a href="#tier-${t}">${TIER_PLURAL[t]} (${byTier[t] ?? 0})</a></li>`,
  ).join('');
  const reviewCount = items.filter(
    (i) => i.finding.tier === 'needs-review' && i.finding.question,
  ).length;

  return `<!doctype html>
<html lang="en" data-report-key="${reportKey}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="generator" content="${escapeHtml(`Clear A11Y ${result.tool.version}`)}">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to the report</a>
<header class="site"><div class="wrap">
<p class="brand">Clear A11Y</p>
<h1>Accessibility report</h1>
${targetsBlock(result.targets)}
<p class="lead">Scan started ${escapeHtml(result.startedAt)}, finished ${escapeHtml(result.finishedAt)}.</p>
</div></header>
<nav class="toc" aria-label="Report sections"><div class="wrap"><ul>
<li><a href="#summary">Summary</a></li>
${navTiers}
<li><a href="#review-queue">Review queue (${reviewCount})</a></li>
<li><a href="#pages">Pages scanned (${result.pages.length})</a></li>
</ul></div></nav>
<main id="main" tabindex="-1"><div class="wrap">
${summarySection(result)}
${filtersSection(result)}
${TIERS.map((t) => tierSection(t, items)).join('\n')}
${renderReviewQueue(items)}
${pagesSection(result)}
</div></main>
<footer class="site"><div class="wrap">
<p>Generated by <a href="${PROJECT_URL}">Clear A11Y</a> ${escapeHtml(result.tool.version)}. Automated testing finds many barriers but not all of them; pair it with manual testing.</p>
<p>This file is self-contained: it makes no network requests, and your review answers stay in this browser.</p>
</div></footer>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}
