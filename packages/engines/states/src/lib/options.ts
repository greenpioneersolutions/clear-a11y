import type { ClearA11yConfig } from '@clear-a11y/core';
import { z } from 'zod';

/** Options read from `config.states`. Validated here because core keeps engine sections loose. */
export const StatesOptionsSchema = z.object({
  /** Most states discovered per page and viewport. */
  maxStates: z.number().int().nonnegative().default(10),
  /** Most candidate controls tried per page and viewport. */
  maxCandidates: z.number().int().positive().default(60),
  /** Most forms submitted per page. */
  maxForms: z.number().int().nonnegative().default(5),
  /** Most form controls whose value is changed to look for a change of context (SC 3.2.2). */
  maxInputs: z.number().int().nonnegative().default(10),
  /** Time allowed for one action (click, hover, focus, submit) in ms. */
  candidateTimeoutMs: z.number().int().positive().default(2_000),
  /** Wait after an action before comparing the page, in ms. */
  settleMs: z.number().int().nonnegative().default(150),
  /** Total discovery budget per page and viewport, in ms. Default: 80% of `timeoutMs`. */
  budgetMs: z.number().int().positive().optional(),
  /** Viewport names where discovery runs. Default: every scanned viewport. */
  viewports: z.array(z.string()).optional(),
  /** Visible elements compared per snapshot (keeps huge pages bounded). */
  maxElements: z.number().int().positive().default(5_000),
});

export type StatesOptions = z.infer<typeof StatesOptionsSchema> & { budgetMs: number };
export type StatesOptionsInput = z.input<typeof StatesOptionsSchema>;

export function resolveStatesOptions(
  config: Pick<ClearA11yConfig, 'states' | 'timeoutMs'>,
  overrides: StatesOptionsInput = {},
): StatesOptions {
  const parsed = StatesOptionsSchema.parse({ ...config.states, ...overrides });
  return { ...parsed, budgetMs: parsed.budgetMs ?? Math.floor(config.timeoutMs * 0.8) };
}
