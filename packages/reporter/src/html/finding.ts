import { getSuccessCriterion, type Finding, type Tier } from '@clear-a11y/core';
import type { RuleInfo } from '../rules.js';
import { whoItAffects } from './affects.js';
import { escapeHtml, linkOrText } from './escape.js';
import { renderFocusPath } from './focus-path.js';

export const TIER_LABEL: Record<Tier, string> = {
  violation: 'Violation',
  likely: 'Likely',
  'needs-review': 'Needs review',
};

export const TIER_PLURAL: Record<Tier, string> = {
  violation: 'Violations',
  likely: 'Likely issues',
  'needs-review': 'Needs review',
};

export const TIER_MEANING: Record<Tier, string> = {
  violation:
    'Measured in code with high certainty. These are real barriers and are allowed to fail CI.',
  likely: 'Strong signal with a small chance of a false positive. Check each one, then fix it.',
  'needs-review':
    'A person has to decide. Each comes with a yes or no question; answer them in the review queue.',
};

export const badge = (tier: Tier): string =>
  `<span class="badge badge-${tier}">${TIER_LABEL[tier]}</span>`;

/** "2.4.3 Focus Order (Level A)" as a link to the W3C Understanding doc when known. */
export function scLink(sc: string): string {
  const info = getSuccessCriterion(sc);
  if (!info) return escapeHtml(sc);
  return `<a href="${escapeHtml(info.understanding)}">${escapeHtml(`${sc} ${info.title}`)}</a> (Level ${info.level})`;
}

/** Path + query of a URL for compact display, or the raw string. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:'
      ? `${u.host}${u.pathname}${u.search}`
      : url;
  } catch {
    return url;
  }
}

export interface RenderedFinding {
  finding: Finding;
  /** Position in the report (1-based); used for ids so they stay unique and stable. */
  n: number;
  rule: RuleInfo | undefined;
  /** Data URI of the screenshot crop, when embedded. */
  screenshot?: string;
  /** Why a screenshot was not embedded, when there was one. */
  screenshotNote?: string;
}

const fact = (term: string, value: string) =>
  `<div class="fact"><dt>${term}</dt><dd>${value}</dd></div>`;

function screenshotAlt(f: Finding): string {
  const name = f.target.name?.trim();
  const what = name
    ? `the ${f.target.role ? `${f.target.role} ` : ''}“${name}”`
    : `the element ${f.target.selector}`;
  return `Screenshot crop of ${what} on ${shortUrl(f.page.url)}${f.page.state !== 'default' ? ` (state: ${f.page.state})` : ''}, the element this finding is about.`;
}

function evidenceDetails(f: Finding): string {
  const parts: string[] = [];
  const block = (summary: string, body: string) =>
    `<details class="evidence"><summary>${summary}</summary><pre><code>${escapeHtml(body)}</code></pre></details>`;
  if (f.evidence.announcement)
    parts.push(block('Screen reader announcement', f.evidence.announcement));
  if (f.evidence.axTree) parts.push(block('Accessibility tree', f.evidence.axTree));
  if (f.evidence.html) parts.push(block('HTML snippet', f.evidence.html));
  if (f.evidence.data && Object.keys(f.evidence.data).length)
    parts.push(block('Measurements', JSON.stringify(f.evidence.data, null, 2)));
  return parts.join('');
}

/** One finding as an `<article>` with an h4 heading. */
export function renderFinding(item: RenderedFinding): string {
  const { finding: f, n, rule } = item;
  const id = `finding-${n}`;
  const title = rule?.title ?? f.ruleId;
  const page = f.page;
  const target = [
    `<code>${escapeHtml(f.target.selector)}</code>`,
    f.target.name ? ` named “${escapeHtml(f.target.name)}”` : '',
    f.target.role ? ` (role: ${escapeHtml(f.target.role)})` : '',
  ].join('');
  const facts = [
    fact('Who it affects', escapeHtml(whoItAffects(f.wcag))),
    f.fix || rule?.fix ? fact('How to fix', escapeHtml(f.fix ?? rule?.fix)) : '',
    fact('Element', target),
    fact(
      'Page',
      `${linkOrText(page.url)}<br>State: ${escapeHtml(page.state)} · Viewport: ${escapeHtml(page.viewport)}`,
    ),
    f.source
      ? fact(
          'Source',
          `<code>${escapeHtml(`${f.source.file}:${f.source.line}${f.source.column ? `:${f.source.column}` : ''}`)}</code>${f.source.component ? ` (${escapeHtml(f.source.component)})` : ''}`,
        )
      : '',
    fact(
      'WCAG',
      f.wcag.length ? f.wcag.map(scLink).join('<br>') : 'Best practice (no WCAG criterion)',
    ),
    fact(
      'Detected by',
      `<code>${escapeHtml(f.ruleId)}</code> in ${escapeHtml(f.engine)}, confidence ${Math.round(f.confidence * 100)}%`,
    ),
    f.question
      ? fact(
          'Question for you',
          `${escapeHtml(f.question)}<br><a href="#question-${n}">Answer question ${n}</a>`,
        )
      : '',
  ].join('');

  const shot = item.screenshot
    ? `<figure class="shot"><img src="${item.screenshot}" alt="${escapeHtml(screenshotAlt(f))}"><figcaption>Screenshot of the element as it appeared during the scan.</figcaption></figure>`
    : item.screenshotNote
      ? `<p class="note">${escapeHtml(item.screenshotNote)}</p>`
      : '';

  return (
    `<article class="finding" id="${id}" aria-labelledby="${id}-h" data-tier="${f.tier}" data-engine="${escapeHtml(f.engine)}" data-wcag="${escapeHtml(f.wcag.join(' '))}" data-finding-id="${escapeHtml(f.id)}">` +
    `<h4 id="${id}-h">${badge(f.tier)}<span class="visually-hidden">: </span> <span class="finding-title">${escapeHtml(title)}</span></h4>` +
    `<p class="message">${escapeHtml(f.message)}</p>` +
    `<dl class="facts">${facts}</dl>` +
    shot +
    (f.evidence.focusPath?.length ? renderFocusPath(f.evidence.focusPath, id) : '') +
    evidenceDetails(f) +
    `</article>`
  );
}
