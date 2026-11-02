import type { RuleMeta } from '@clear-a11y/core';

export const characterKeyShortcutRule: RuleMeta = {
  id: 'at/character-key-shortcut',
  engine: 'engine-at',
  wcag: ['2.1.4'],
  tier: 'needs-review',
  title: 'Single-character keyboard shortcut',
  description:
    'Pressing a single letter, digit or punctuation key (with no Ctrl, Alt or Meta) does something on the page even when no field or widget has focus. Speech input users trigger these shortcuts by accident when they dictate words, and keyboard users with tremors hit them by mistake. WCAG allows them only if they can be turned off, remapped to use a modifier, or only work while a specific component has focus; that needs a human to check.',
  fix: 'Use a modifier key (Ctrl/Alt/Meta) for shortcuts, offer a setting to turn single-key shortcuts off or remap them, or only listen while the related component has focus.',
};

/** What happened after one key press with focus on the page body. */
export interface KeyPressEffect {
  key: string;
  focusMoved: boolean;
  domChanged: boolean;
  scrolled: boolean;
  navigated: boolean;
}

export interface CharacterKeyShortcutInput {
  /** The page changes on its own (timers, animations), so DOM changes prove nothing. */
  baselineChanges: boolean;
  presses: KeyPressEffect[];
}

/**
 * Pure analysis for at/character-key-shortcut: the keys that did something. Native browsers do
 * nothing when a printable key is pressed with focus on the body, so any effect comes from the
 * page's own key handler.
 */
export function detectCharacterKeyShortcut(input: CharacterKeyShortcutInput): KeyPressEffect[] {
  return input.presses.filter(
    (p) => p.focusMoved || p.scrolled || p.navigated || (p.domChanged && !input.baselineChanges),
  );
}

/** Keys the probe presses: letters, digits and the punctuation sites commonly bind. */
export const SHORTCUT_KEYS = [...'abcdefghijklmnopqrstuvwxyz0123456789', '/', '?', '.', ','];
