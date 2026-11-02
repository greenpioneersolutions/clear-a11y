import type { RuleMeta } from '@clear-a11y/core';
import type { Problem } from '../lib/types.js';

export const tabsSelectedStateRule: RuleMeta = {
  id: 'widgets/tabs-selected-state',
  engine: 'engine-widgets',
  wcag: ['4.1.2'],
  tier: 'violation',
  title: 'aria-selected follows the shown tab panel',
  description:
    'Activates each tab and checks that aria-selected moves to it and that the panel shown belongs to the selected tab. When aria-selected goes stale, screen readers announce the wrong tab as selected, so blind users do not know which panel they are reading.',
  fix: 'When a tab is activated, set aria-selected="true" on it and aria-selected="false" on every other tab in the same tablist, and show only the tabpanel it controls (aria-controls).',
};

export interface TabPanelState {
  tab: string;
  /** The tabpanel this tab controls (aria-controls, or a tabpanel labelled by it). */
  panel: string | null;
  selected: boolean;
  panelVisible: boolean;
}

export interface TabsSelectedStateObservation {
  tablist: string;
  initial: TabPanelState[];
  /** Tab states after clicking each listed tab on a fresh page. */
  activations: Array<{ clicked: string; after: TabPanelState[] }>;
}

const selectedOf = (states: readonly TabPanelState[]) =>
  states.filter((s) => s.selected).map((s) => s.tab);

/**
 * A state is inconsistent when exactly one mapped panel is visible and its tab is not the only
 * selected tab. Panels without a mapping are ignored (we cannot tell which tab they belong to).
 */
function mismatch(states: readonly TabPanelState[]): { shown: string; selected: string[] } | null {
  const mapped = states.filter((s) => s.panel !== null);
  if (mapped.length < 2) return null;
  const shown = mapped.filter((s) => s.panelVisible);
  if (shown.length !== 1) return null;
  const selected = selectedOf(states);
  const tab = shown[0]!.tab;
  if (selected.length === 1 && selected[0] === tab) return null;
  return { shown: tab, selected };
}

/** Pure check that aria-selected tracks the visible panel, at load and after each activation. */
export function evaluateTabsSelectedState(obs: TabsSelectedStateObservation): Problem[] {
  const problems: Problem[] = [];
  const base = { ruleId: tabsSelectedStateRule.id, wcag: ['4.1.2'] };
  const initial = mismatch(obs.initial);
  if (initial) {
    problems.push({
      ...base,
      tier: 'violation',
      confidence: 0.9,
      selector: initial.shown,
      message: `At load the panel of "${initial.shown}" is shown, but aria-selected marks ${initial.selected.length ? initial.selected.map((s) => `"${s}"`).join(', ') : 'no tab'} as selected.`,
      data: { state: obs.initial },
    });
  }
  for (const { clicked, after } of obs.activations) {
    const before = obs.initial.find((s) => s.tab === clicked);
    const now = after.find((s) => s.tab === clicked);
    // Only judge activations that visibly worked: the clicked tab's panel appeared.
    if (!before?.panel || !now || before.panelVisible || !now.panelVisible) continue;
    const selected = selectedOf(after);
    if (selected.length === 1 && selected[0] === clicked) continue;
    problems.push({
      ...base,
      tier: 'violation',
      confidence: 0.95,
      selector: clicked,
      message: `Activating "${clicked}" shows its panel, but aria-selected ${selected.length ? `still marks ${selected.map((s) => `"${s}"`).join(', ')}` : 'marks no tab'} as selected, so screen readers announce the wrong tab.`,
      data: { after },
    });
  }
  return problems;
}
