import { createFinding, scFromAxeTag, type Finding, type PageRef } from '@clear-a11y/core';
import type { AxeResults, NodeResult, Result } from 'axe-core';

export const ENGINE_NAME = 'engine-static';

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA. Best-practice rules (no WCAG SC) are not run. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/** Yes/no questions for axe "incomplete" results, so a human can settle them quickly. */
const QUESTIONS: Record<string, string> = {
  'color-contrast':
    'Does this text have at least 4.5:1 contrast (3:1 for large text) against what is actually behind it?',
  'link-in-text-block':
    'Can this link be told apart from the surrounding text without relying on color?',
  'video-caption': 'Does this video have accurate captions?',
  'audio-caption': 'Does this audio have a transcript or captions?',
  'aria-valid-attr-value':
    'Does this ARIA attribute point at an element that exists and makes sense?',
  'label-content-name-mismatch': 'Does the accessible name contain the visible label text?',
};

/** axe targets can cross shadow roots and frames; flatten them into one selector string. */
export function axeTargetToSelector(target: NodeResult['target']): string {
  return target
    .map((part) => (Array.isArray(part) ? part.join(' >>> ') : String(part)))
    .join(' >>> ');
}

export function wcagFromTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map(scFromAxeTag).filter((sc): sc is string => sc !== undefined))];
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function toFinding(
  rule: Result,
  node: NodeResult,
  kind: 'violation' | 'incomplete',
  page: PageRef,
): Finding | undefined {
  const wcag = wcagFromTags(rule.tags);
  if (wcag.length === 0) return undefined;
  const summary = clean(node.failureSummary).replace(/^Fix (any|all) of the following:\s*/i, '');
  const violation = kind === 'violation';
  return createFinding({
    ruleId: `static/${rule.id}`,
    wcag,
    tier: violation ? 'violation' : 'needs-review',
    // axe aims for zero false positives on violations; incomplete means axe could not decide.
    confidence: violation ? 0.95 : 0.5,
    engine: ENGINE_NAME,
    page,
    target: { selector: axeTargetToSelector(node.target) },
    message: summary ? `${clean(rule.help)}: ${summary}` : clean(rule.help),
    fix: `${clean(rule.description)} See ${rule.helpUrl}`,
    evidence: {
      html: node.html.length > 300 ? `${node.html.slice(0, 299)}…` : node.html,
      data: { axeRule: rule.id, impact: node.impact ?? rule.impact ?? null, helpUrl: rule.helpUrl },
    },
    ...(violation
      ? {}
      : { question: QUESTIONS[rule.id] ?? `Does this element meet "${clean(rule.help)}"?` }),
  });
}

/** Pure mapping from axe results to Clear A11Y findings. */
export function mapAxeResults(
  results: Pick<AxeResults, 'violations' | 'incomplete'>,
  page: PageRef,
): Finding[] {
  const out: Finding[] = [];
  for (const [kind, list] of [
    ['violation', results.violations],
    ['incomplete', results.incomplete],
  ] as const) {
    for (const rule of list) {
      for (const node of rule.nodes) {
        const f = toFinding(rule, node, kind, page);
        if (f) out.push(f);
      }
    }
  }
  return out;
}
