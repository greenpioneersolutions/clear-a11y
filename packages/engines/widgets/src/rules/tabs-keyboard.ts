import type { RuleMeta } from '@clear-a11y/core';
import { list, reachability, type RovingItem } from '../lib/roving.js';
import type { Problem, Step } from '../lib/types.js';

export const tabsKeyboardRule: RuleMeta = {
  id: 'widgets/tabs-keyboard',
  engine: 'engine-widgets',
  wcag: ['2.1.1'],
  tier: 'violation',
  title: 'Tabs can be reached and operated with the keyboard',
  description:
    'Finds tab lists where some tabs cannot be reached with the keyboard at all: they are not in the Tab sequence (tabindex="-1" or not focusable) and the arrow keys do not move to them. Keyboard and screen reader users cannot open those panels. Tabs that only work with Tab instead of the arrow keys are reported for review.',
  fix: 'Follow the ARIA Authoring Practices tabs pattern: keep the selected tab at tabindex="0" and the others at tabindex="-1", and add a keydown handler so Left/Right Arrow (Up/Down for vertical tabs), Home and End move focus between tabs. Native buttons with tabindex="0" on every tab are also keyboard operable.',
};

export interface TabsKeyboardObservation {
  tablist: string;
  /** Visible, enabled tabs in DOM order. */
  tabs: RovingItem[];
  /** Arrow/Home/End walk starting on the first tabbable tab (empty when none is tabbable). */
  steps: Step[];
}

/** Pure APG tabs keyboard check from a recorded walk. */
export function evaluateTabsKeyboard(obs: TabsKeyboardObservation): Problem[] {
  if (obs.tabs.length < 2) return [];
  const r = reachability(obs.tabs, obs.steps);
  const base = { ruleId: tabsKeyboardRule.id, wcag: ['2.1.1'] };
  if (r.tabbable.length === 0) {
    return [
      {
        ...base,
        tier: 'violation',
        confidence: 0.95,
        selector: obs.tablist,
        message:
          'None of the tabs is in the Tab sequence, so keyboard users cannot reach this tab list or switch panels.',
        data: { unreached: r.unreached },
      },
    ];
  }
  if (r.unreached.length > 0) {
    return [
      {
        ...base,
        tier: 'violation',
        confidence: 0.95,
        selector: r.unreached[0]!,
        message: `Tabs ${list(r.unreached)} are not in the Tab sequence and the arrow keys do not move to them, so keyboard users cannot open their panels.`,
        data: { unreached: r.unreached, tablist: obs.tablist, steps: obs.steps },
      },
    ];
  }
  if (r.byArrows.length === 0 && r.tabbable.length === obs.tabs.length) {
    return [
      {
        ...base,
        tier: 'needs-review',
        confidence: 0.5,
        selector: obs.tablist,
        message:
          'Every tab is a separate Tab stop and the arrow keys do nothing. The tabs are reachable, but this differs from the ARIA Authoring Practices tabs pattern that screen reader users expect.',
        question:
          'Is it acceptable for this tab list to be operated with Tab only (arrow keys do nothing), for example because it is styled and announced as a set of buttons?',
        data: { steps: obs.steps },
      },
    ];
  }
  return [];
}
