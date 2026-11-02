import type { RuleMeta, Tier } from '@clear-a11y/core';

export const contextChangeOnFocusRule: RuleMeta = {
  id: 'keyboard/context-change-on-focus',
  engine: 'engine-keyboard',
  wcag: ['3.2.1'],
  tier: 'likely',
  title: 'Focus causes a change of context',
  description:
    'Moving keyboard focus onto this element (just Tab, nothing activated) changes the context: the page navigates, a new window opens, a form is submitted, a modal dialog opens, or focus is moved somewhere else by script. Keyboard and screen reader users explore a page by tabbing through it and are thrown somewhere they did not ask to go.',
  fix: 'Only change context when the user activates a control (click, Enter, Space) or submits a form. Show help inline instead of opening windows or dialogs on focus, and never move or remove focus from a focus handler.',
};

export type FocusContextChangeKind =
  'navigation' | 'new-window' | 'form-submit' | 'modal-opened' | 'focus-removed' | 'focus-moved';

/** What happened during one Tab press of the focus walk. */
export interface FocusPressInput {
  /** Elements that received focus during the press, in order (consecutive repeats removed). */
  focused: { selector: string; tiny: boolean }[];
  /** document.activeElement after the press, or null for body / outside the document. */
  finalSelector: string | null;
  /** The final element is the first focused element, inside it, or contains it. */
  finalRelated: boolean;
  /** Main-frame navigations to another document that the press started. */
  navigations: string[];
  /** `window.open()` calls made during the press. */
  windowsOpened: string[];
  /** Forms that fired a submit event during the press. */
  submitted: string[];
  /** Modal dialogs that became visible during the press. */
  modalsOpened: string[];
}

export interface FocusContextChange {
  kind: FocusContextChangeKind;
  tier: Tier;
  /** Selector of the element focus landed on first (the one whose focus caused the change). */
  trigger: string;
  /** Where it went: the URL, the dialog or the element that took focus. */
  detail?: string;
}

/**
 * Pure analysis for keyboard/context-change-on-focus (SC 3.2.1). Navigation and new windows are
 * certain changes of context (`violation`); a submitted form, a modal, and focus moved or removed
 * by script are `likely` (a submit handler may only validate, and focus can be moved for reasons
 * a human should confirm). Focus delegated into a descendant (composite widgets) and hidden focus
 * sentinels (focus-trap wrap-around) are not changes of context.
 */
export function detectContextChangeOnFocus(input: FocusPressInput): FocusContextChange | null {
  const first = input.focused[0];
  if (!first) return null; // Tab left the document or went somewhere we can't see.
  const trigger = first.selector;
  const nav = input.navigations[0];
  if (nav !== undefined) return { kind: 'navigation', tier: 'violation', trigger, detail: nav };
  const win = input.windowsOpened[0];
  if (win !== undefined) return { kind: 'new-window', tier: 'violation', trigger, detail: win };
  const form = input.submitted[0];
  if (form !== undefined) return { kind: 'form-submit', tier: 'likely', trigger, detail: form };
  const modal = input.modalsOpened[0];
  if (modal !== undefined) return { kind: 'modal-opened', tier: 'likely', trigger, detail: modal };
  if (first.tiny) return null; // a visually hidden sentinel that forwards focus (focus traps)
  if (input.finalSelector === null) return { kind: 'focus-removed', tier: 'likely', trigger };
  if (!input.finalRelated && input.finalSelector !== trigger) {
    return { kind: 'focus-moved', tier: 'likely', trigger, detail: input.finalSelector };
  }
  return null;
}

/** One sentence per kind, for the finding message. */
export function describeContextChange(change: FocusContextChange, label: string): string {
  switch (change.kind) {
    case 'navigation':
      return `Tabbing onto ${label} loads another page (${change.detail}) without the user activating anything.`;
    case 'new-window':
      return `Tabbing onto ${label} opens a new window${change.detail ? ` (${change.detail})` : ''} without the user activating anything.`;
    case 'form-submit':
      return `Tabbing onto ${label} submits the form \`${change.detail}\` without the user activating anything.`;
    case 'modal-opened':
      return `Tabbing onto ${label} opens the modal dialog \`${change.detail}\` without the user activating anything.`;
    case 'focus-removed':
      return `When ${label} receives keyboard focus, a script immediately removes focus from it, so focus falls back to the page.`;
    case 'focus-moved':
      return `When ${label} receives keyboard focus, a script immediately moves focus to \`${change.detail}\`.`;
  }
}
