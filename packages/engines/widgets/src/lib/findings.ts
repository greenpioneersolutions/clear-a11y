import {
  compareTiers,
  createFinding,
  type FocusStop,
  type Finding,
  type PageRef,
  type RuleMeta,
} from '@clear-a11y/core';
import { ENGINE_NAME } from './engine-name.js';
import type { Problem, Step } from './types.js';

const isSteps = (v: unknown): v is Step[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'object' && s !== null && 'key' in s);

const toFocusPath = (steps: readonly Step[]): FocusStop[] =>
  steps
    .filter((s) => s.focused !== null)
    .map((s, index) => ({ index, selector: s.focused!, name: s.key }));

/**
 * Pure: groups problems by rule and target (one Finding each, since the Finding id is a hash of
 * rule + target + state). The most severe tier wins; its SCs and messages lead, and less severe
 * problems for the same target are appended for context.
 */
export function problemsToFindings(
  problems: readonly Problem[],
  page: PageRef,
  rules: readonly RuleMeta[],
): Finding[] {
  const groups = new Map<string, Problem[]>();
  for (const p of problems) {
    const key = `${p.ruleId}\u0000${p.selector}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const out: Finding[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => compareTiers(a.tier, b.tier));
    const top = sorted[0]!;
    const lead = sorted.filter((p) => p.tier === top.tier);
    const rest = sorted.filter((p) => p.tier !== top.tier);
    const steps = sorted.map((p) => p.data?.['steps']).find(isSteps);
    const rule = rules.find((r) => r.id === top.ruleId);
    out.push(
      createFinding({
        ruleId: top.ruleId,
        wcag: [...new Set(lead.flatMap((p) => p.wcag))],
        tier: top.tier,
        confidence: Math.max(...lead.map((p) => p.confidence)),
        engine: ENGINE_NAME,
        page,
        target: { selector: top.selector },
        message: [
          ...lead.map((p) => p.message),
          ...(rest.length ? [`Also worth reviewing: ${rest.map((p) => p.message).join(' ')}`] : []),
        ].join(' '),
        ...(rule ? { fix: rule.fix } : {}),
        ...(top.tier === 'needs-review'
          ? { question: lead.find((p) => p.question)?.question }
          : {}),
        evidence: {
          ...(steps?.length ? { focusPath: toFocusPath(steps) } : {}),
          data: {
            problems: sorted.map(({ message, tier, wcag, data }) => {
              const { steps: _steps, ...rest } = data ?? {};
              return { message, tier, wcag, ...(Object.keys(rest).length ? { data: rest } : {}) };
            }),
          },
        },
      }),
    );
  }
  return out;
}
