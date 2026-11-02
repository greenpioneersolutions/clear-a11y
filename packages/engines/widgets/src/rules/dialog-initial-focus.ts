import type { RuleMeta } from '@clear-a11y/core';
import type { Problem } from '../lib/types.js';

export const dialogInitialFocusRule: RuleMeta = {
  id: 'widgets/dialog-initial-focus',
  engine: 'engine-widgets',
  wcag: ['2.4.3', '4.1.2'],
  tier: 'likely',
  title: 'Focus moves into a dialog when it opens, and the dialog has a name',
  description:
    'Opens each dialog from its trigger with the keyboard and checks that focus lands inside the dialog and that the dialog has an accessible name. When focus stays behind the dialog, keyboard and screen reader users keep working in the page underneath and may not know the dialog appeared (2.4.3). A dialog without a name is announced only as "dialog" (4.1.2).',
  fix: 'Use <dialog> with showModal(), or move focus yourself to the first focusable element (or the dialog heading with tabindex="-1") when the dialog opens. Name the dialog with aria-labelledby pointing at its heading, or aria-label.',
};

export interface DialogObservation {
  dialog: string;
  trigger: string;
  /** The dialog became visible after activating the trigger. */
  opened: boolean;
  /** Focus is inside the dialog after it opened. */
  focusInside: boolean;
  /** Focused element after it opened (null for <body>). */
  focused: string | null;
  /** Accessible name from aria-labelledby, aria-label or title. */
  name: string;
}

const base = { ruleId: dialogInitialFocusRule.id, selector: '' };

/** Pure dialog-open check. Escape and focus return are engine-keyboard's job. */
export function evaluateDialog(obs: DialogObservation): Problem[] {
  if (!obs.opened) return [];
  const problems: Problem[] = [];
  if (!obs.focusInside) {
    problems.push({
      ...base,
      selector: obs.dialog,
      wcag: ['2.4.3'],
      tier: 'likely',
      confidence: 0.8,
      message: `When the dialog opens from "${obs.trigger}", focus stays ${obs.focused ? `on "${obs.focused}"` : 'on the page'} behind it, so keyboard and screen reader users are not taken into the dialog.`,
      data: { trigger: obs.trigger, focused: obs.focused },
    });
  }
  if (obs.name.trim() === '') {
    problems.push({
      ...base,
      selector: obs.dialog,
      wcag: ['4.1.2'],
      tier: 'violation',
      confidence: 0.9,
      message:
        'The dialog has no accessible name (no aria-labelledby or aria-label), so screen readers announce it only as "dialog".',
    });
  }
  return problems;
}
