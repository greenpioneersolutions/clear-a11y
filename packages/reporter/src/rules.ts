import { getSuccessCriterion, type Finding, type RuleMeta } from '@clear-a11y/core';

export const PROJECT_URL = 'https://github.com/greenpioneersolutions/clear-a11y';

/** Options shared by the derived reports. */
export interface RenderOptions {
  /**
   * Rule metadata (titles, descriptions, fixes). Optional: without it, reports fall back to what
   * the findings themselves carry. The CLI passes `allRules()` from `@clear-a11y/runner`.
   */
  rules?: readonly RuleMeta[];
}

export interface RuleInfo {
  id: string;
  title: string;
  description?: string;
  fix?: string;
  engine: string;
  wcag: string[];
  tier: Finding['tier'];
  helpUri: string;
}

/** "keyboard/focus-order-backward" -> "Focus order backward". */
export function titleFromRuleId(ruleId: string): string {
  const name = ruleId.split('/').pop() ?? ruleId;
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/;

/** First http(s) URL in a text, without trailing punctuation. */
export function firstUrl(text: string | undefined): string | undefined {
  const m = text ? URL_IN_TEXT.exec(text) : null;
  return m ? m[0].replace(/[.,;:]+$/, '') : undefined;
}

/** W3C Understanding URL for the first known SC, else the project's rule docs. */
export function helpUriFor(ruleId: string, wcag: readonly string[], fix?: string): string {
  const fromFix = firstUrl(fix);
  if (fromFix) return fromFix;
  for (const sc of wcag) {
    const info = getSuccessCriterion(sc);
    if (info) return info.understanding;
  }
  return `${PROJECT_URL}/blob/main/docs/rules/${ruleId}.md`;
}

/** Rule info for every ruleId in `findings`, sorted by id. Metadata wins over finding fields. */
export function collectRules(
  findings: readonly Finding[],
  rules: readonly RuleMeta[] = [],
): RuleInfo[] {
  const meta = new Map(rules.map((r) => [r.id, r]));
  const byId = new Map<string, RuleInfo>();
  for (const f of findings) {
    if (byId.has(f.ruleId)) continue;
    const m = meta.get(f.ruleId);
    const wcag = m?.wcag ?? f.wcag;
    const fix = m?.fix ?? f.fix;
    byId.set(f.ruleId, {
      id: f.ruleId,
      title: m?.title ?? titleFromRuleId(f.ruleId),
      ...(m?.description ? { description: m.description } : {}),
      ...(fix ? { fix } : {}),
      engine: m?.engine ?? f.engine,
      wcag: [...wcag],
      tier: m?.tier ?? f.tier,
      helpUri: helpUriFor(f.ruleId, wcag, f.fix ?? m?.fix),
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
