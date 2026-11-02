import type { RuleMeta, Tier } from '@clear-a11y/core';
import type { GlyphContrast } from '../lib/pixels.js';

export const contrastOverBackgroundRule: RuleMeta = {
  id: 'visual/contrast-over-background',
  engine: 'engine-visual',
  wcag: ['1.4.3'],
  tier: 'violation',
  title: 'Low contrast text over an image or gradient',
  description:
    'Text sits on a background image, gradient or overlapping element, and the real rendered pixels behind the letters do not have enough contrast (4.5:1, or 3:1 for large text). Rules scanners cannot compute this; people with low vision or in bright light cannot read it.',
  fix: 'Put a solid or semi-opaque scrim behind the text, darken or lighten the image where the text sits, or move the text off the image. Check the contrast against the lightest (or darkest) part of the background behind the letters.',
};

/**
 * Pure analysis for visual/contrast-over-background. `contrast` holds per-glyph-pixel ratios
 * against the real background. When the median fails, most of the text is hard to read:
 * `violation`. When only the worst 10% fails (part of the text over a busy area): `likely`.
 */
export function detectContrastOverBackground(
  contrast: GlyphContrast | undefined,
  threshold: number,
): Tier | undefined {
  if (!contrast || contrast.samples < 20) return undefined;
  if (contrast.median < threshold) return 'violation';
  if (contrast.p10 < threshold) return 'likely';
  return undefined;
}
