import { z } from 'zod';

/** `config.keyboard`: options for engine-keyboard. Unknown keys are ignored. */
export const KeyboardOptionsSchema = z.object({
  /** Most Tab presses in one walk. */
  maxStops: z.number().int().positive().default(150),
  /** Stops whose focus indicator is checked with screenshots (two crops each). */
  focusVisibleMaxStops: z.number().int().nonnegative().default(40),
  /** Most findings per rule per page state, so one broken pattern doesn't flood the report. */
  maxFindingsPerRule: z.number().int().positive().default(10),
  /** Padding in CSS px around the element for focus-indicator crops (outlines sit outside the box). */
  focusCropPadding: z.number().int().nonnegative().default(8),
  /** Most elements whose event listeners are inspected for click-not-focusable. */
  maxClickCandidates: z.number().int().positive().default(300),
});
export type KeyboardOptions = z.infer<typeof KeyboardOptionsSchema>;

export function parseKeyboardOptions(section: unknown): KeyboardOptions {
  return KeyboardOptionsSchema.parse(section ?? {});
}
