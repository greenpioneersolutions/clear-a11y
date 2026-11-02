import type { Finding, Tier } from './finding.js';

/** Lower number = more severe. */
export const TIER_RANK: Record<Tier, number> = { violation: 0, likely: 1, 'needs-review': 2 };

export function compareTiers(a: Tier, b: Tier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

/** True when `tier` is at least as severe as `threshold`. */
export function tierAtLeast(tier: Tier, threshold: Tier): boolean {
  return TIER_RANK[tier] <= TIER_RANK[threshold];
}

/** AI engines are named `ai-*` (judges) or `persona-*` (persona agents). */
export function isAiEngine(engine: string): boolean {
  return engine.startsWith('ai-') || engine.startsWith('persona-');
}

/**
 * Trust policy: an AI finding is never a `violation` on its own. It stays a violation only
 * when a deterministic finding confirms the same rule area on the same target and page state.
 */
export function enforceTierPolicy(
  finding: Finding,
  deterministic: readonly Finding[] = [],
): Finding {
  if (!isAiEngine(finding.engine) || finding.tier !== 'violation') return finding;
  const confirmed = deterministic.some(
    (d) =>
      !isAiEngine(d.engine) &&
      d.tier === 'violation' &&
      d.target.selector === finding.target.selector &&
      d.page.url === finding.page.url &&
      d.page.state === finding.page.state &&
      d.wcag.some((sc) => finding.wcag.includes(sc)),
  );
  return confirmed ? finding : { ...finding, tier: 'likely' };
}

/** Applies the tier policy to a full finding list. */
export function applyTierPolicy(findings: readonly Finding[]): Finding[] {
  const deterministic = findings.filter((f) => !isAiEngine(f.engine));
  return findings.map((f) => enforceTierPolicy(f, deterministic));
}
