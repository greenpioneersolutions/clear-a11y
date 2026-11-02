import { z } from 'zod';
import { FindingListSchema, type Finding, type Tier } from './finding.js';
import { ResolvedFindingSchema, type ResolvedFinding } from './pass.js';

export const SCAN_RESULT_SCHEMA_VERSION = 1 as const;

export const ScannedPageSchema = z.object({
  url: z.string(),
  viewport: z.string(),
  states: z.array(z.string()),
  title: z.string().optional(),
  error: z.string().optional(),
});
export type ScannedPage = z.infer<typeof ScannedPageSchema>;

export const ScanErrorSchema = z.object({
  url: z.string(),
  state: z.string(),
  viewport: z.string(),
  engine: z.string(),
  message: z.string(),
});
export type ScanError = z.infer<typeof ScanErrorSchema>;

export const ScanSummarySchema = z.object({
  total: z.number().int(),
  byTier: z.record(z.string(), z.number().int()),
  byEngine: z.record(z.string(), z.number().int()),
  bySc: z.record(z.string(), z.number().int()),
  /** `needs-review` findings dropped because a deterministic pass settled them (ADR 0003). */
  resolved: z.number().int().optional(),
});
export type ScanSummary = z.infer<typeof ScanSummarySchema>;

/** The canonical scan output. SARIF and HTML reports are derived from it. */
export const ScanResultSchema = z.object({
  schemaVersion: z.literal(SCAN_RESULT_SCHEMA_VERSION),
  tool: z.object({ name: z.string(), version: z.string() }),
  startedAt: z.string(),
  finishedAt: z.string(),
  targets: z.array(z.string()),
  pages: z.array(ScannedPageSchema),
  findings: FindingListSchema,
  errors: z.array(ScanErrorSchema),
  summary: ScanSummarySchema,
  /**
   * `needs-review` findings dropped because a deterministic engine verified a pass for the same
   * element and success criterion (ADR 0003). Optional: older results and scans with no pass
   * records omit it.
   */
  resolved: z.array(ResolvedFindingSchema).optional(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

/** Counts findings by tier, engine and SC. Pass `resolved` to also count resolved findings. */
export function summarize(
  findings: readonly Finding[],
  resolved?: readonly ResolvedFinding[],
): ScanSummary {
  const byTier: Record<Tier, number> = { violation: 0, likely: 0, 'needs-review': 0 };
  const byEngine: Record<string, number> = {};
  const bySc: Record<string, number> = {};
  for (const f of findings) {
    byTier[f.tier]++;
    byEngine[f.engine] = (byEngine[f.engine] ?? 0) + 1;
    for (const sc of f.wcag) bySc[sc] = (bySc[sc] ?? 0) + 1;
  }
  return {
    total: findings.length,
    byTier,
    byEngine,
    bySc,
    ...(resolved ? { resolved: resolved.length } : {}),
  };
}
