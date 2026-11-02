import { createFinding, stableHash, type Finding } from '@clear-a11y/core';
import { describeElement, mentionedAttributes } from './element.js';
import type { LintMessage } from './lint.js';
import { CONFIDENCE, RULE_MAP, tierFor, type RepoRuleEntry } from './rule-map.js';

/** Engine name on every static repo finding. */
export const REPO_ESLINT_ENGINE = 'repo-eslint';

/** `repo:<relative path>`: the page reference for findings that come from a source file. */
export const repoPageUrl = (file: string): string => `repo:${file}`;

/** Finding rule id for a lint rule: "jsx-a11y/alt-text" -> "repo/jsx-a11y/alt-text". */
export const repoRuleId = (lintRuleId: string): string => `repo/${lintRuleId}`;

/** Selector for a lint message: the element description, or the rule's subject when unknown. */
export function selectorFor(msg: LintMessage): string {
  if (!msg.element) return `${msg.file}:${msg.line}:${msg.column}`;
  return describeElement(msg.element, mentionedAttributes(msg.element, msg.message));
}

/**
 * Normalizes one lint message into a canonical Finding. Returns undefined for rules that are not
 * in the rule map (they are never enabled, so this only guards against plugin changes).
 * `occurrence` disambiguates identical elements in the same file so ids stay stable when lines move.
 */
export function toFinding(
  msg: LintMessage,
  occurrence = 0,
  map: Readonly<Record<string, RepoRuleEntry>> = RULE_MAP,
): Finding | undefined {
  const entry = map[msg.lintRuleId];
  if (!entry) return undefined;
  const tier = tierFor(entry, { element: msg.element, lintMessage: msg.message });
  const ruleId = repoRuleId(msg.lintRuleId);
  const selector = selectorFor(msg);
  const role = msg.element?.attributes['role'];
  return createFinding({
    id: stableHash([ruleId, msg.file, selector, String(occurrence)].join('|')),
    ruleId,
    wcag: [...entry.wcag],
    tier,
    confidence: CONFIDENCE[tier],
    engine: REPO_ESLINT_ENGINE,
    page: { url: repoPageUrl(msg.file), state: 'source', viewport: 'none' },
    target: {
      selector,
      ...(typeof role === 'string' && role !== '{…}' ? { role } : {}),
    },
    evidence: {
      ...(msg.snippet ? { html: msg.snippet } : {}),
      data: {
        lintRule: msg.lintRuleId,
        lintMessage: msg.message,
        ...(msg.element ? { spreadProps: msg.element.hasSpread } : {}),
      },
    },
    source: {
      file: msg.file,
      line: msg.line,
      column: msg.column,
      ...(msg.component ? { component: msg.component } : {}),
    },
    message: entry.message,
    fix: entry.fix,
    ...(tier === 'needs-review' ? { question: entry.question } : {}),
  });
}

/** Normalizes a batch of lint messages, sorted by file and position. */
export function toFindings(messages: readonly LintMessage[]): Finding[] {
  const seen = new Map<string, number>();
  const out: Finding[] = [];
  const sorted = [...messages].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
  for (const msg of sorted) {
    const key = [msg.lintRuleId, msg.file, selectorFor(msg)].join('|');
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const f = toFinding(msg, n);
    if (f) out.push(f);
  }
  return out;
}
