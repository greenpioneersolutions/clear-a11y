import { z } from 'zod';

/** Options under `config.visual`. Every check can be turned off on its own. */
export const VisualConfigSchema = z.looseObject({
  reflow: z.boolean().default(true),
  textResize: z.boolean().default(true),
  textSpacing: z.boolean().default(true),
  contrast: z.boolean().default(true),
  nonTextContrast: z.boolean().default(true),
  targetSize: z.boolean().default(true),
  hover: z.boolean().default(true),
  /** SC 2.2.2: moving, blinking or auto-updating content without a pause control. */
  motion: z.boolean().default(true),
  /** SC 1.3.4: content restricted to portrait or landscape. */
  orientation: z.boolean().default(true),
  /** How long the page is watched for script-driven motion (ms). */
  motionObserveMs: z.number().int().positive().default(2_100),
  /** Longer watch when a carousel, slideshow or ticker is on the page without a running animation (ms). */
  motionCarouselObserveMs: z.number().int().positive().default(5_500),
  /** Text elements on non-solid backgrounds measured per page (two screenshots each). */
  maxContrastCandidates: z.number().int().nonnegative().default(40),
  maxNonTextCandidates: z.number().int().nonnegative().default(40),
  /** Hover/focus triggers exercised per page (each costs about 2 seconds). */
  maxHoverTriggers: z.number().int().nonnegative().default(6),
  /** How long hover content must stay visible on its own (ms). */
  hoverPersistMs: z.number().int().positive().default(1000),
  /**
   * Selectors of small targets that have an equivalent, large-enough control elsewhere on the
   * page (SC 2.5.8 "equivalent" exception). Matching failures become needs-review.
   */
  targetSizeEquivalent: z.array(z.string()).default([]),
});

export type VisualConfig = z.infer<typeof VisualConfigSchema>;

export function parseVisualConfig(section: unknown): VisualConfig {
  return VisualConfigSchema.parse(section ?? {});
}
