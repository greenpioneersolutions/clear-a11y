import { z } from 'zod';
import { WIDGET_KINDS } from './types.js';

/** Options under `widgets` in clear-a11y config. Unknown keys are ignored. */
export const WidgetsConfigSchema = z.object({
  /** Which widget contracts to run. Default: all. */
  contracts: z.array(z.enum(WIDGET_KINDS)).default([...WIDGET_KINDS]),
  /** At most this many widgets of each kind are driven per page. */
  maxPerKind: z.number().int().positive().default(5),
  /**
   * When a page has hidden dialogs with no linked trigger (`aria-controls`/`aria-haspopup="dialog"`),
   * try up to this many visible non-submit buttons to find the one that opens them. 0 disables it.
   */
  maxDialogProbes: z.number().int().nonnegative().default(8),
  /** Stop starting new widget scripts after this many ms, so big pages stay inside the scan timeout. */
  budgetMs: z.number().int().positive().default(20_000),
});
export type WidgetsConfig = z.infer<typeof WidgetsConfigSchema>;

export function parseWidgetsConfig(section: unknown): WidgetsConfig {
  return WidgetsConfigSchema.parse(section ?? {});
}
