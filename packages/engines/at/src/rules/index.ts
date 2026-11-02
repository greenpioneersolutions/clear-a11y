import type { RuleMeta } from '@clear-a11y/core';
import { dragWithoutAlternativeRule } from './drag-without-alternative.js';
import { motionActuationRule } from './motion-actuation.js';
import { pointerDownActionRule } from './pointer-down-action.js';
import { characterKeyShortcutRule } from './character-key-shortcut.js';
import { authPasteBlockedRule } from './auth-paste-blocked.js';
import { autocompleteMissingRule } from './autocomplete-missing.js';
import { audioAutoplayNoControlRule } from './audio-autoplay-no-control.js';
import { mediaAlternativeMissingRule } from './media-alternative-missing.js';
import { mediaCaptionsMissingRule } from './media-captions-missing.js';
import { linkTextGenericRule } from './link-text-generic.js';
import { altTextSuspiciousRule } from './alt-text-suspicious.js';
import { errorNotIdentifiedRule } from './error-not-identified.js';
import { errorNotAssociatedRule } from './error-not-associated.js';
import { errorNotAnnouncedRule } from './error-not-announced.js';
import { liveRegionInsertedWithContentRule } from './live-region-inserted-with-content.js';
import { statusMessageNotAnnouncedRule } from './status-message-not-announced.js';
import { labelInNameRule } from './label-in-name.js';
import { placeholderOnlyLabelRule } from './placeholder-only-label.js';
import { roleMissingRule } from './role-missing.js';
import { stateMissingRule } from './state-missing.js';
import { expandedStateMissingRule } from './expanded-state-missing.js';

// `nx g @clear-a11y/workspace-plugin:rule` adds imports above and entries below.
export const rules: RuleMeta[] = [
  dragWithoutAlternativeRule,
  motionActuationRule,
  pointerDownActionRule,
  characterKeyShortcutRule,
  authPasteBlockedRule,
  autocompleteMissingRule,
  audioAutoplayNoControlRule,
  mediaAlternativeMissingRule,
  mediaCaptionsMissingRule,
  linkTextGenericRule,
  altTextSuspiciousRule,
  errorNotIdentifiedRule,
  errorNotAssociatedRule,
  errorNotAnnouncedRule,
  liveRegionInsertedWithContentRule,
  statusMessageNotAnnouncedRule,
  labelInNameRule,
  placeholderOnlyLabelRule,
  roleMissingRule,
  stateMissingRule,
  expandedStateMissingRule,
];
