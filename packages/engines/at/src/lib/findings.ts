import type { PageContext } from '@clear-a11y/browser';
import {
  createFinding,
  type Evidence,
  type Finding,
  type RuleMeta,
  type Tier,
} from '@clear-a11y/core';
import { ENGINE_NAME } from './engine-name.js';

export interface FindingOptions {
  selector: string;
  role?: string;
  name?: string;
  message: string;
  evidence?: Evidence;
  confidence: number;
  tier?: Tier;
  wcag?: string[];
  question?: string;
}

/** Builds a validated engine-at finding from rule metadata and what the probe saw. */
export function atFinding(
  ctx: Pick<PageContext, 'url' | 'state' | 'viewport'>,
  rule: RuleMeta,
  o: FindingOptions,
): Finding {
  return createFinding({
    ruleId: rule.id,
    wcag: o.wcag ?? rule.wcag,
    tier: o.tier ?? rule.tier,
    confidence: o.confidence,
    engine: ENGINE_NAME,
    page: { url: ctx.url, state: ctx.state, viewport: ctx.viewport.name },
    target: {
      selector: o.selector,
      ...(o.role ? { role: o.role } : {}),
      ...(o.name ? { name: o.name } : {}),
    },
    message: o.message,
    fix: rule.fix,
    evidence: o.evidence ?? {},
    ...(o.question ? { question: o.question } : {}),
  });
}

export const quote = (s: string, max = 80) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return `"${t.length > max ? `${t.slice(0, max - 1)}…` : t}"`;
};
