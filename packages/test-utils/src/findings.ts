import type { Finding } from '@clear-a11y/core';

export interface FindingQuery {
  ruleId?: string;
  wcag?: string;
  selector?: string;
  tier?: Finding['tier'];
  engine?: string;
}

export function matchesQuery(f: Finding, q: FindingQuery): boolean {
  return (
    (q.ruleId === undefined || f.ruleId === q.ruleId) &&
    (q.wcag === undefined || f.wcag.includes(q.wcag)) &&
    (q.selector === undefined ||
      f.target.selector === q.selector ||
      f.target.selector.includes(q.selector)) &&
    (q.tier === undefined || f.tier === q.tier) &&
    (q.engine === undefined || f.engine === q.engine)
  );
}

export function findFindings(findings: readonly Finding[], q: FindingQuery): Finding[] {
  return findings.filter((f) => matchesQuery(f, q));
}

const describe = (findings: readonly Finding[]) =>
  findings.map((f) => `  - ${f.ruleId} [${f.tier}] ${f.target.selector}`).join('\n') || '  (none)';

/** Throws with a readable diff when no finding matches. Returns the first match. */
export function expectFinding(findings: readonly Finding[], q: FindingQuery): Finding {
  const [match] = findFindings(findings, q);
  if (!match)
    throw new Error(
      `Expected a finding matching ${JSON.stringify(q)}. Got:\n${describe(findings)}`,
    );
  return match;
}

/** Throws when any finding matches (use on correct-pattern pages). */
export function expectNoFinding(findings: readonly Finding[], q: FindingQuery = {}): void {
  const matches = findFindings(findings, q);
  if (matches.length)
    throw new Error(
      `Expected no finding matching ${JSON.stringify(q)}. Got:\n${describe(matches)}`,
    );
}
