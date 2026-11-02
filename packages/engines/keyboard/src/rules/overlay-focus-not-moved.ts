import type { RuleMeta } from '@clear-a11y/core';
import { isDialogKind } from './escape-does-not-close.js';

export const overlayFocusNotMovedRule: RuleMeta = {
  id: 'keyboard/overlay-focus-not-moved',
  engine: 'engine-keyboard',
  wcag: ['2.4.3'],
  tier: 'likely',
  title: 'Focus not moved into the opened dialog',
  description:
    'Opening this dialog leaves keyboard focus behind it on the page. Keyboard users have to Tab through the rest of the page to reach the dialog, and screen reader users may not know it opened.',
  fix: 'When the dialog opens, move focus into it: to the first control, or to the dialog itself with `tabindex="-1"`. Native `<dialog>` opened with `showModal()` does this for you.',
};

export interface FocusMovedInput {
  /** `stateMeta.kind` of the current state. */
  kind: string | undefined;
  /** The overlay is visible. */
  overlayVisible: boolean;
  /** document.activeElement is the overlay or inside it right after it opened. */
  focusInside: boolean;
}

/** Pure analysis for keyboard/overlay-focus-not-moved. Only dialogs are expected to take focus. */
export function detectOverlayFocusNotMoved(input: FocusMovedInput): boolean {
  return isDialogKind(input.kind) && input.overlayVisible && !input.focusInside;
}
