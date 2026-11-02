export { createVisualEngine, ENGINE_NAME } from './lib/engine.js';
export { VisualConfigSchema, parseVisualConfig, type VisualConfig } from './lib/config.js';
export {
  blend,
  contrastRatio,
  isLargeText,
  parseCssColor,
  relativeLuminance,
  textContrastThreshold,
  type Rgba,
} from './lib/color.js';
export {
  failsSpacing,
  intersection,
  isUndersized,
  newOverlaps,
  overlappingPairs,
  overlaps,
  type Box,
  type TextBox,
} from './lib/geometry.js';
export { hiddenOverflow, newlyClipped, type ClipMeasure, type NewClip } from './lib/clipping.js';
export {
  diffMask,
  glyphContrast,
  percentile,
  type GlyphContrast,
  type RgbaImage,
} from './lib/pixels.js';
export { decodePng } from './lib/png.js';
export { rules } from './rules/index.js';
