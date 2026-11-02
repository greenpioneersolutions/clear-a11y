import { z } from 'zod';
import { stableHash } from './hash.js';

export const TIERS = ['violation', 'likely', 'needs-review'] as const;
export const TierSchema = z.enum(TIERS);
export type Tier = z.infer<typeof TierSchema>;

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Rect = z.infer<typeof RectSchema>;

/** One stop in a keyboard focus walk. */
export const FocusStopSchema = z.object({
  index: z.number().int().nonnegative(),
  selector: z.string(),
  name: z.string().optional(),
  role: z.string().optional(),
  rect: RectSchema.optional(),
  /** True when reaching this stop moved focus backward against the visual reading order. */
  backward: z.boolean().optional(),
});
export type FocusStop = z.infer<typeof FocusStopSchema>;

export const EvidenceSchema = z.object({
  /** Path (relative to the report) or data URI of a screenshot crop. */
  screenshot: z.string().optional(),
  focusPath: z.array(FocusStopSchema).optional(),
  axTree: z.string().optional(),
  announcement: z.string().optional(),
  /** Short HTML snippet of the target. */
  html: z.string().optional(),
  /** Free-form, engine-specific measurements (contrast ratio, sizes, step trace...). */
  data: z.record(z.string(), z.unknown()).optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const PageRefSchema = z.object({
  url: z.string(),
  state: z.string().default('default'),
  viewport: z.string().default('desktop'),
});
export type PageRef = z.infer<typeof PageRefSchema>;

export const TargetSchema = z.object({
  selector: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
});
export type Target = z.infer<typeof TargetSchema>;

export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative().optional(),
  component: z.string().optional(),
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

const WCAG_SC = /^\d\.\d{1,2}\.\d{1,2}$/;

export const FindingSchema = z.object({
  id: z.string(),
  ruleId: z.string().min(1),
  wcag: z.array(z.string().regex(WCAG_SC, 'expected a WCAG success criterion like 2.4.3')),
  tier: TierSchema,
  confidence: z.number().min(0).max(1),
  engine: z.string().min(1),
  page: PageRefSchema,
  target: TargetSchema,
  evidence: EvidenceSchema,
  source: SourceLocationSchema.optional(),
  message: z.string().min(1),
  fix: z.string().optional(),
  question: z.string().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export type FindingInput = Omit<Finding, 'id' | 'page' | 'evidence'> & {
  id?: string;
  page: z.input<typeof PageRefSchema>;
  evidence?: Evidence;
};

/** Stable id from rule + target + state, so the same issue keeps its id across runs. */
export function findingId(f: Pick<Finding, 'ruleId' | 'target'> & { page: PageRef }): string {
  return stableHash(
    [f.ruleId, f.target.selector, f.page.url, f.page.state, f.page.viewport].join('|'),
  );
}

/** Builds a validated Finding, filling defaults and the stable id. Throws on invalid input. */
export function createFinding(input: FindingInput): Finding {
  const page = PageRefSchema.parse(input.page);
  const draft = { ...input, page, evidence: input.evidence ?? {} };
  const finding = FindingSchema.parse({ ...draft, id: input.id ?? findingId(draft) });
  if (finding.tier === 'needs-review' && !finding.question) {
    throw new Error(`needs-review finding ${finding.ruleId} must carry a yes/no question`);
  }
  return finding;
}

export const FindingListSchema = z.array(FindingSchema);
