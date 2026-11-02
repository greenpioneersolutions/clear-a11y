export { createStatesEngine, ENGINE_NAME } from './lib/engine.js';
export { discoverStates, tryCandidate } from './lib/discover.js';
export type { StateDescriptor, StateKind, StateAction } from './lib/descriptor.js';
export { STATE_KINDS } from './lib/descriptor.js';
export {
  resolveStatesOptions,
  StatesOptionsSchema,
  type StatesOptions,
  type StatesOptionsInput,
} from './lib/options.js';
export { stateId, uniqueId, slug } from './lib/state-id.js';
export { visibleSetDiff, newTexts, type VisibleSetDiff } from './lib/visible-set-diff.js';
export { classifyState, significant, type Candidate, type Revealed } from './lib/classify.js';
export { invalidValueFor, type FieldInfo } from './lib/invalid-value.js';
export {
  DESTRUCTIVE_NAME,
  isDestructiveName,
  shouldAbort,
  sameDocument,
  installRouteGuard,
  type RequestInfo,
} from './lib/safety.js';
export { rules } from './rules/index.js';
