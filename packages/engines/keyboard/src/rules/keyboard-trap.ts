import type { RuleMeta } from '@clear-a11y/core';

export const keyboardTrapRule: RuleMeta = {
  id: 'keyboard/keyboard-trap',
  engine: 'engine-keyboard',
  wcag: ['2.1.2'],
  tier: 'violation',
  title: 'Keyboard trap',
  description:
    'Once keyboard focus enters this part of the page, Tab, Shift+Tab and Escape cannot move it out. Keyboard-only and switch users are stuck and must reload the page.',
  fix: 'Let Tab and Shift+Tab leave the component. If the component needs Tab (a code editor), provide a documented exit such as Escape followed by Tab. Modal dialogs may contain focus only if Escape or a close button closes them.',
};

export interface KeyboardTrapInput {
  /** Distinct stops Tab kept cycling through. */
  cycleSize: number;
  /** Tabbable elements on the page. */
  tabbableCount: number;
  /** Shift+Tab moved focus outside the cycle. */
  escapedBackward: boolean;
  /** Escape followed by Tab moved focus outside the cycle. */
  escapedAfterEscape: boolean;
  /** The cycle is inside an open modal dialog that has its own close control. */
  modalWithCloseControl: boolean;
}

/**
 * Pure analysis for keyboard/keyboard-trap: a strict subset of the stops captures Tab,
 * Shift+Tab and Escape, and it is not a modal dialog that can be closed from inside.
 */
export function detectKeyboardTrap(input: KeyboardTrapInput): boolean {
  return (
    input.cycleSize > 0 &&
    input.cycleSize < input.tabbableCount &&
    !input.escapedBackward &&
    !input.escapedAfterEscape &&
    !input.modalWithCloseControl
  );
}
