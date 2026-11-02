import { z } from 'zod';
import { EvidenceSchema, FindingSchema, PageRefSchema, type Finding } from './finding.js';
import { isAiEngine } from './tiers.js';

/**
 * A verified pass (ADR 0003): a deterministic engine measured an element for a success criterion
 * and found it compliant, e.g. real-pixel text contrast on a gradient. Engines record passes only
 * for what they verified completely for that element in that page state.
 */
export const PassRecordSchema = z.object({
  /** The rule that measured it, e.g. "visual/contrast-over-background". */
  ruleId: z.string().min(1),
  /** Success criteria the measurement verified. */
  wcag: FindingSchema.shape.wcag.min(1),
  /** Set by the runner from the engine that recorded the pass (engines can't claim another name). */
  engine: z.string().min(1),
  page: PageRefSchema,
  selector: z.string().min(1),
  /** The measurement, so a resolved finding can be audited. */
  evidence: EvidenceSchema.optional(),
});
export type PassRecord = z.infer<typeof PassRecordSchema>;

/** A `needs-review` finding dropped because a deterministic pass settled the question. */
export const ResolvedFindingSchema = z.object({
  /** The finding as it would have been reported. */
  finding: FindingSchema,
  /** The pass that settled it. */
  resolvedBy: PassRecordSchema,
});
export type ResolvedFinding = z.infer<typeof ResolvedFindingSchema>;

const samePage = (f: Finding, p: PassRecord) =>
  f.page.url === p.page.url && f.page.state === p.page.state && f.page.viewport === p.page.viewport;

/** The pass that resolves `finding`, if any. Pure; see `resolveWithPasses` for the policy. */
export function passResolving(
  finding: Finding,
  passes: readonly PassRecord[],
): PassRecord | undefined {
  if (finding.tier !== 'needs-review') return undefined;
  return passes.find(
    (p) =>
      !isAiEngine(p.engine) &&
      p.engine !== finding.engine &&
      p.selector === finding.target.selector &&
      samePage(finding, p) &&
      p.wcag.some((sc) => finding.wcag.includes(sc)),
  );
}

/**
 * Trust policy for pass records (ADR 0003). A `needs-review` finding is dropped when a pass
 * recorded by a different, deterministic engine covers the same selector, page, state and
 * viewport with an overlapping success criterion. `violation` and `likely` findings are never
 * dropped, and passes from AI engines (`ai-*`, `persona-*`) never drop anything. Every dropped
 * finding is returned in `resolved` with the pass that settled it, so the decision is auditable.
 */
export function resolveWithPasses(
  findings: readonly Finding[],
  passes: readonly PassRecord[],
): { findings: Finding[]; resolved: ResolvedFinding[] } {
  const kept: Finding[] = [];
  const resolved: ResolvedFinding[] = [];
  for (const finding of findings) {
    const pass = passes.length ? passResolving(finding, passes) : undefined;
    if (pass) resolved.push({ finding, resolvedBy: pass });
    else kept.push(finding);
  }
  return { findings: kept, resolved };
}
