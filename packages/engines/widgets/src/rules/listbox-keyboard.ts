import type { RuleMeta } from '@clear-a11y/core';
import type { Problem } from '../lib/types.js';

export const listboxKeyboardRule: RuleMeta = {
  id: 'widgets/listbox-keyboard',
  engine: 'engine-widgets',
  wcag: ['2.1.1', '4.1.2'],
  tier: 'violation',
  title: 'Listboxes work with the keyboard and expose the active option',
  description:
    'Focuses standalone listboxes and presses Down Arrow. A listbox that cannot be focused, or whose options the arrow keys do not reach, blocks keyboard users (2.1.1). An active or selected option shown only visually (no aria-activedescendant, no focus, no aria-selected change) is invisible to screen reader users (4.1.2).',
  fix: 'Follow the ARIA Authoring Practices listbox pattern: make the listbox (or one option) tabbable; on Up/Down Arrow, Home and End move the active option with aria-activedescendant or roving focus; keep aria-selected in sync with the selection.',
};

export interface ListboxNavStep {
  key: string;
  activeOption: string | null;
  focusedOption: string | null;
  /** Options with aria-selected="true". */
  selected: string[];
  look: string;
}

export interface ListboxObservation {
  listbox: string;
  options: number;
  /** The listbox or one of its options is in the Tab sequence. */
  tabbable: boolean;
  /** Every option is in the Tab sequence (Tab-only navigation). */
  allOptionsTabbable: boolean;
  /** First entry is the state right after focusing. */
  nav: ListboxNavStep[];
}

const base = { ruleId: listboxKeyboardRule.id };

/** Pure APG listbox check. */
export function evaluateListbox(obs: ListboxObservation): Problem[] {
  if (obs.options < 2) return [];
  if (!obs.tabbable) {
    return [
      {
        ...base,
        wcag: ['2.1.1'],
        tier: 'violation',
        confidence: 0.9,
        selector: obs.listbox,
        message:
          'Neither the listbox nor any option is in the Tab sequence, so keyboard users cannot reach these options.',
      },
    ];
  }
  const [start, ...rest] = obs.nav;
  if (!start || rest.length === 0) return [];
  const exposed = rest.some(
    (s) =>
      (s.activeOption !== null && s.activeOption !== start.activeOption) ||
      (s.focusedOption !== null && s.focusedOption !== start.focusedOption),
  );
  if (exposed) return [];
  const selectionChanged = rest.some((s) => s.selected.join() !== start.selected.join());
  if (selectionChanged) return [];
  const visual = rest.some((s) => s.look !== start.look);
  if (visual) {
    return [
      {
        ...base,
        wcag: ['4.1.2'],
        tier: 'violation',
        confidence: 0.9,
        selector: obs.listbox,
        message:
          'Down Arrow changes the highlighted option only visually: aria-activedescendant, focus and aria-selected stay the same, so screen readers never announce the option.',
      },
    ];
  }
  if (obs.allOptionsTabbable) {
    return [
      {
        ...base,
        wcag: ['2.1.1'],
        tier: 'needs-review',
        confidence: 0.5,
        selector: obs.listbox,
        message:
          'Every option is a separate Tab stop and the arrow keys do nothing, unlike the ARIA Authoring Practices listbox pattern.',
        question:
          'Is it acceptable that this listbox is navigated with Tab only (arrow keys do nothing)?',
      },
    ];
  }
  return [
    {
      ...base,
      wcag: ['2.1.1'],
      tier: 'violation',
      confidence: 0.85,
      selector: obs.listbox,
      message:
        'The listbox can be focused, but Down Arrow does not move to another option and the options are not in the Tab sequence, so keyboard users cannot choose them.',
    },
  ];
}
