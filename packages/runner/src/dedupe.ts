import { applyTierPolicy, compareTiers, type Finding } from '@clear-a11y/core';

/** Removes exact duplicates (same stable id), applies the tier policy and sorts by severity. */
export function finalizeFindings(findings: readonly Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const prev = byId.get(f.id);
    if (!prev || f.confidence > prev.confidence) byId.set(f.id, f);
  }
  return applyTierPolicy([...byId.values()]).sort(
    (a, b) =>
      compareTiers(a.tier, b.tier) ||
      a.page.url.localeCompare(b.page.url) ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.target.selector.localeCompare(b.target.selector),
  );
}

/**
 * Drops findings from replayed states that the default state of the same page and viewport already
 * reported for the same rule and selector: a barrier visible in every state is one issue, not one
 * per state. Dedupe is by `ruleId + selector`, not by id, because the id includes the state.
 */
export function dropStateDuplicates(findings: readonly Finding[]): Finding[] {
  const key = (f: Finding) =>
    JSON.stringify([f.page.url, f.page.viewport, f.ruleId, f.target.selector]);
  const inDefault = new Set(findings.filter((f) => f.page.state === 'default').map(key));
  return findings.filter((f) => f.page.state === 'default' || !inDefault.has(key(f)));
}
