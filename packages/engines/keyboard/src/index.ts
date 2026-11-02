export { createKeyboardEngine, ENGINE_NAME } from './lib/engine.js';
export { walkFocus, toFocusStop } from './lib/walker.js';
export type { WalkStop, WalkResult, WalkEnd, WalkOptions } from './lib/walker.js';
export { isBackwardJump, readingOrder, rowOf, sameRow } from './lib/geometry.js';
export type { StopGeometry, BackwardJumpOptions } from './lib/geometry.js';
export {
  contrastRatio,
  relativeLuminance,
  diffStats,
  focusChange,
  maxContrastChange,
} from './lib/pixels.js';
export { detectCycle, isStrictSubset } from './lib/trap.js';
export { KeyboardOptionsSchema, parseKeyboardOptions } from './lib/options.js';
export type { KeyboardOptions } from './lib/options.js';
export { rules } from './rules/index.js';
