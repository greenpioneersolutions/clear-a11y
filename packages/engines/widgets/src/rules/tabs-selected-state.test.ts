import {
  evaluateTabsSelectedState,
  tabsSelectedStateRule,
  type TabPanelState,
} from './tabs-selected-state.js';

const state = (selected: number, shown: number, n = 3): TabPanelState[] =>
  Array.from({ length: n }, (_, i) => ({
    tab: `#tab-${i + 1}`,
    panel: `#panel-${i + 1}`,
    selected: i === selected,
    panelVisible: i === shown,
  }));

describe('widgets/tabs-selected-state', () => {
  it('has rule metadata', () => {
    expect(tabsSelectedStateRule.id).toBe('widgets/tabs-selected-state');
    expect(tabsSelectedStateRule.wcag).toEqual(['4.1.2']);
  });

  it('flags a tab whose panel appears while aria-selected stays on the first tab', () => {
    const [p, ...rest] = evaluateTabsSelectedState({
      tablist: '#list',
      initial: state(0, 0),
      activations: [{ clicked: '#tab-2', after: state(0, 1) }],
    });
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ tier: 'violation', selector: '#tab-2', wcag: ['4.1.2'] });
    expect(p?.message).toContain('#tab-1');
  });

  it('flags a mismatch at load', () => {
    const [p] = evaluateTabsSelectedState({
      tablist: '#list',
      initial: state(0, 2),
      activations: [],
    });
    expect(p).toMatchObject({ tier: 'violation', selector: '#tab-3' });
  });

  it('ignores activations that did nothing and tabs without a panel mapping', () => {
    const noPanels = state(0, 0).map((s) => ({ ...s, panel: null }));
    expect(
      evaluateTabsSelectedState({
        tablist: '#list',
        initial: noPanels,
        activations: [
          { clicked: '#tab-2', after: noPanels },
          { clicked: '#tab-3', after: state(0, 0) },
        ],
      }),
    ).toEqual([]);
  });

  it('does not flag the correct pattern', () => {
    expect(
      evaluateTabsSelectedState({
        tablist: '#list',
        initial: state(0, 0),
        activations: [
          { clicked: '#tab-2', after: state(1, 1) },
          { clicked: '#tab-3', after: state(2, 2) },
        ],
      }),
    ).toEqual([]);
  });
});
