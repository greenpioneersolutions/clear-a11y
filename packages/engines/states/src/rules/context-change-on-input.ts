import type { RuleMeta, Tier } from '@clear-a11y/core';

export const contextChangeOnInputRule: RuleMeta = {
  id: 'states/context-change-on-input',
  engine: 'engine-states',
  wcag: ['3.2.2'],
  tier: 'likely',
  title: 'Changing a form control causes a change of context',
  description:
    'Choosing an option, ticking a box or typing into a field (without pressing a submit button) navigates to another page, submits the form, opens a window or dialog, or moves focus, and nothing on the page warned about it. Keyboard and screen reader users often change a value just to explore the options and are taken somewhere they did not choose to go.',
  fix: 'Let people change values freely and start the change of context with an explicit button ("Go", "Apply", "Submit"). If the control must act on change, say so in visible text before it, for example in its label or hint.',
};

export type InputContextChangeKind =
  'form-submit' | 'navigation' | 'new-window' | 'modal-opened' | 'focus-moved' | 'content-replaced';

/** What changing one control did, observed on a freshly loaded page under the route guard. */
export interface InputChangeObservation {
  /** Forms that were submitted (submit event, `form.submit()`). */
  submitted: string[];
  /** Main-frame navigations to another document (blocked by the route guard), reloads, or URL changes through the history API. */
  navigations: string[];
  /** `window.open()` calls and popups. */
  windowsOpened: string[];
  /** Modal dialogs that became visible. */
  modalsOpened: string[];
  /** Selector of another element that took focus right after the change, or null. */
  focusMovedTo: string | null;
  /** Elements visible before the change. */
  visibleBefore: number;
  /** Of those, how many are no longer visible. */
  visibleRemoved: number;
  /** Visible text around the control (label, hint, legend, form) may announce the behaviour. */
  warned: boolean;
}

export interface InputContextChange {
  kind: InputContextChangeKind;
  tier: Tier;
  detail?: string;
}

/** Most of the page disappearing counts as replaced content only on pages with enough content. */
const MIN_VISIBLE_FOR_REPLACED = 20;
const REPLACED_SHARE = 0.6;

/**
 * Text that may tell users, before they change the control, that it acts immediately. Kept broad:
 * a match only lowers the finding to `needs-review`, it never hides it.
 */
const WARNING_TEXT =
  /\b(automatic(ally)?|immediately|instantly|right away|reload(s|ed)?|refresh(es|ed)?|redirect(s|ed)?|new (window|tab)|(will|to) (take you|go to|open|load|navigate|submit|update|refresh|reload|change the page)|takes you|goes to|as soon as|when you (select|choose|change|pick|check|tick|type|enter)|on (selection|change))\b/i;

/** True when `text` may warn about a change of context on input. Pure. */
export function mayAnnounceChange(text: string): boolean {
  return WARNING_TEXT.test(text.replace(/\s+/g, ' '));
}

/**
 * Pure analysis for states/context-change-on-input (SC 3.2.2). A form submission, navigation, new
 * window, modal or moved focus caused only by changing a value is `likely` (`needs-review` when
 * text near the control may have announced it). Most of the page being replaced is always
 * `needs-review`: it can be a legitimate filter.
 */
export function detectContextChangeOnInput(obs: InputChangeObservation): InputContextChange | null {
  const tier: Tier = obs.warned ? 'needs-review' : 'likely';
  const form = obs.submitted[0];
  if (form !== undefined) return { kind: 'form-submit', tier, detail: form };
  const nav = obs.navigations[0];
  if (nav !== undefined) return { kind: 'navigation', tier, detail: nav };
  const win = obs.windowsOpened[0];
  if (win !== undefined) return { kind: 'new-window', tier, detail: win };
  const modal = obs.modalsOpened[0];
  if (modal !== undefined) return { kind: 'modal-opened', tier, detail: modal };
  if (obs.focusMovedTo) return { kind: 'focus-moved', tier, detail: obs.focusMovedTo };
  if (
    obs.visibleBefore >= MIN_VISIBLE_FOR_REPLACED &&
    obs.visibleRemoved / obs.visibleBefore >= REPLACED_SHARE
  ) {
    return { kind: 'content-replaced', tier: 'needs-review' };
  }
  return null;
}

/** Message fragment: what happened. */
export function describeInputChange(change: InputContextChange): string {
  switch (change.kind) {
    case 'form-submit':
      return `submits the form \`${change.detail}\``;
    case 'navigation':
      return `loads another page (${change.detail})`;
    case 'new-window':
      return `opens a new window${change.detail ? ` (${change.detail})` : ''}`;
    case 'modal-opened':
      return `opens the modal dialog \`${change.detail}\``;
    case 'focus-moved':
      return `moves focus to \`${change.detail}\``;
    case 'content-replaced':
      return 'replaces most of the page';
  }
}
