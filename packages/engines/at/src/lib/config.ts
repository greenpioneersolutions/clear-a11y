import { z } from 'zod';

/** Options under `at` in clear-a11y config. Unknown keys are ignored. */
export const AtConfigSchema = z.object({
  /** Real screen reader via Guidepup (macOS VoiceOver, Windows NVDA). Opt-in only; never in CI. */
  guidepup: z.boolean().default(false),
  /** Press up to this many buttons per page to watch for status messages and toggles. 0 disables. */
  probeButtons: z.number().int().nonnegative().default(20),
  /** Submit up to this many forms empty per page to check error messages. 0 disables. */
  probeForms: z.number().int().nonnegative().default(3),
  /** A probe ends once the DOM has been quiet this long (ms)... */
  settleMs: z.number().int().positive().default(250),
  /** ...or after this long at most (ms). */
  maxSettleMs: z.number().int().positive().default(1_500),
  /** Stop starting new probes after this many ms, so big pages stay inside the scan timeout. */
  budgetMs: z.number().int().positive().default(20_000),
});
export type AtConfig = z.infer<typeof AtConfigSchema>;

export function parseAtConfig(section: unknown): AtConfig {
  return AtConfigSchema.parse(section ?? {});
}
