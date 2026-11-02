import type { RuleMeta } from '@clear-a11y/core';

export const escapeDoesNotCloseRule: RuleMeta = {
  id: 'keyboard/escape-does-not-close',
  engine: 'engine-keyboard',
  wcag: ['2.1.1'],
  tier: 'needs-review',
  title: 'Escape does not close the overlay',
  description:
    'Pressing Escape inside this dialog, menu or popover leaves it open. Keyboard users expect Escape to dismiss overlays; without it they have to hunt for a close button. Not always a WCAG failure when another keyboard way out exists, so a human decides.',
  fix: 'Close the overlay on Escape and return focus to the control that opened it. Native `<dialog>` opened with `showModal()` does this for you.',
};

export interface EscapeInput {
  /** The overlay was visible before Escape was pressed. */
  openBefore: boolean;
  /** The overlay is still visible after Escape. */
  openAfter: boolean;
}

/** Pure analysis for keyboard/escape-does-not-close. */
export function detectEscapeDoesNotClose(input: EscapeInput): boolean {
  return input.openBefore && input.openAfter;
}

/** Overlay kinds (from `stateMeta.kind`) where Escape is expected to dismiss. */
export const OVERLAY_KINDS = ['modal', 'dialog', 'alertdialog', 'menu', 'popover', 'overlay'];
/** Overlay kinds that are dialogs, where focus is expected to move inside on open. */
export const DIALOG_KINDS = ['modal', 'dialog', 'alertdialog'];

export const isOverlayKind = (kind: string | undefined): boolean =>
  kind !== undefined && OVERLAY_KINDS.includes(kind);
export const isDialogKind = (kind: string | undefined): boolean =>
  kind !== undefined && DIALOG_KINDS.includes(kind);
