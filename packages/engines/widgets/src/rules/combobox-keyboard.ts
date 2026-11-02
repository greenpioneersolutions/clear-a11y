import type { RuleMeta } from '@clear-a11y/core';
import type { Problem } from '../lib/types.js';

export const comboboxKeyboardRule: RuleMeta = {
  id: 'widgets/combobox-keyboard',
  engine: 'engine-widgets',
  wcag: ['2.1.1', '4.1.2'],
  tier: 'violation',
  title: 'Comboboxes work with the keyboard and report their state',
  description:
    'Opens comboboxes with Down Arrow, Alt+Down Arrow or typing, moves through the options with Down Arrow, then tries Enter and Escape. A popup that opens only with the mouse, or options the keyboard cannot reach, block keyboard users (2.1.1). aria-expanded that stays "false" while the popup is open, or an active option shown only visually (no aria-activedescendant and no focus), leave screen reader users without the information (4.1.2).',
  fix: 'Follow the ARIA Authoring Practices combobox pattern: set aria-expanded="true" while the listbox is shown; on Down/Up Arrow move the active option and point aria-activedescendant at it (or move DOM focus to it); Enter accepts the active option; Escape closes the popup.',
};

export type ComboOpenMethod = 'ArrowDown' | 'Alt+ArrowDown' | 'typing' | 'click';

export interface ComboNavStep {
  key: string;
  /** Option referenced by aria-activedescendant, when it points at an option. */
  activeOption: string | null;
  /** Focused element when it is an option. */
  focusedOption: string | null;
  /** Signature of the options' class/style attributes (visual-only highlight changes). */
  look: string;
}

export interface ComboboxObservation {
  combobox: string;
  tabbable: boolean;
  opens: Record<ComboOpenMethod, boolean>;
  /** After opening with the keyboard: aria-expanded on the combobox. */
  expandedWhenOpen: string | null;
  /** Number of options visible after opening. */
  options: number;
  /** Navigation with Down Arrow after opening with the keyboard; first entry is the open state. */
  nav: ComboNavStep[];
  /** After Enter on the active option. */
  enter: { popupVisible: boolean; valueChanged: boolean } | null;
  /** After Escape with the popup open. */
  escape: { popupVisible: boolean } | null;
}

const base = { ruleId: comboboxKeyboardRule.id };

/** Pure APG combobox check. */
export function evaluateCombobox(obs: ComboboxObservation): Problem[] {
  const kbOpen = obs.opens.ArrowDown || obs.opens['Alt+ArrowDown'] || obs.opens.typing;
  if (!kbOpen) {
    if (!obs.opens.click) return [];
    return [
      {
        ...base,
        wcag: ['2.1.1'],
        tier: 'violation',
        confidence: 0.9,
        selector: obs.combobox,
        message: obs.tabbable
          ? 'The popup opens with a mouse click but not with Down Arrow, Alt+Down Arrow or typing, so keyboard users cannot choose an option.'
          : 'This combobox is not in the Tab sequence and its popup opens only with a mouse click.',
      },
    ];
  }
  const problems: Problem[] = [];
  if (obs.expandedWhenOpen !== 'true') {
    problems.push({
      ...base,
      wcag: ['4.1.2'],
      tier: 'violation',
      confidence: 0.9,
      selector: obs.combobox,
      message: `The popup is open but the combobox reports aria-expanded=${obs.expandedWhenOpen === null ? ' (missing)' : `"${obs.expandedWhenOpen}"`}, so screen readers do not know a list is available.`,
    });
  }
  if (obs.options > 0 && obs.nav.length > 1) {
    const start = obs.nav[0]!;
    const exposed = obs.nav
      .slice(1)
      .some(
        (s) =>
          (s.activeOption !== null && s.activeOption !== start.activeOption) ||
          (s.focusedOption !== null && s.focusedOption !== start.focusedOption),
      );
    const visual = obs.nav.slice(1).some((s) => s.look !== start.look);
    if (!exposed && visual) {
      problems.push({
        ...base,
        wcag: ['4.1.2'],
        tier: 'violation',
        confidence: 0.9,
        selector: obs.combobox,
        message:
          'Down Arrow highlights options only visually: aria-activedescendant is not set and focus does not move, so screen readers never announce the active option.',
      });
    } else if (!exposed) {
      problems.push({
        ...base,
        wcag: ['2.1.1'],
        tier: 'violation',
        confidence: 0.85,
        selector: obs.combobox,
        message:
          'With the popup open, Down Arrow does not move to any option, so keyboard users cannot choose one.',
      });
    } else if (obs.enter && obs.enter.popupVisible && !obs.enter.valueChanged) {
      problems.push({
        ...base,
        wcag: ['2.1.1'],
        tier: 'needs-review',
        confidence: 0.5,
        selector: obs.combobox,
        message: 'Enter on the active option neither selects it nor closes the popup.',
        question: 'Can keyboard users accept an option in this combobox (Enter does nothing)?',
      });
    }
  }
  if (obs.escape?.popupVisible) {
    problems.push({
      ...base,
      wcag: ['2.1.1'],
      tier: 'needs-review',
      confidence: 0.5,
      selector: obs.combobox,
      message: 'Escape does not close the open popup.',
      question:
        'Can keyboard users dismiss this popup without choosing an option (Escape does nothing)?',
    });
  }
  return problems;
}
