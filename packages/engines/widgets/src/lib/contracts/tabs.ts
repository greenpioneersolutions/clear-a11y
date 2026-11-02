import { evaluateTabsKeyboard } from '../../rules/tabs-keyboard.js';
import { evaluateTabsSelectedState, type TabPanelState } from '../../rules/tabs-selected-state.js';
import type { Driver } from '../driver.js';
import type { Problem, Step, Widget } from '../types.js';

interface TabInfo extends TabPanelState {
  tabbable: boolean;
}

/** Runs in the page. */
function readTabs(tablistSelector: string): { vertical: boolean; tabs: TabInfo[] } {
  const h = window.__clearA11y!;
  const tablist = document.querySelector(tablistSelector);
  if (!tablist) return { vertical: false, tabs: [] };
  const shown = (el: Element) => h.isVisible(el) && !el.closest('[hidden]');
  const tabs = Array.from(tablist.querySelectorAll('[role~="tab"]')).filter(
    (t) =>
      t.closest('[role~="tablist"]') === tablist &&
      shown(t) &&
      !(t as HTMLButtonElement).disabled &&
      t.getAttribute('aria-disabled') !== 'true',
  );
  return {
    vertical: tablist.getAttribute('aria-orientation') === 'vertical',
    tabs: tabs.map((t) => {
      const controls = (t.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean)[0];
      const panel =
        (controls ? document.getElementById(controls) : null) ??
        (t.id ? document.querySelector(`[role~="tabpanel"][aria-labelledby~="${t.id}"]`) : null);
      return {
        tab: h.selector(t),
        tabbable: (t as HTMLElement).tabIndex >= 0,
        selected: t.getAttribute('aria-selected') === 'true',
        panel: panel ? h.selector(panel) : null,
        panelVisible: panel ? shown(panel) : false,
      };
    }),
  };
}

const strip = ({ tab, panel, selected, panelVisible }: TabInfo): TabPanelState => ({
  tab,
  panel,
  selected,
  panelVisible,
});

/** Max tabs clicked for the selected-state check. */
const MAX_ACTIVATIONS = 3;

/** APG tabs: arrow-key walk (widgets/tabs-keyboard) and activation state (widgets/tabs-selected-state). */
export async function runTabs(drv: Driver, widget: Widget): Promise<Problem[]> {
  await drv.fresh();
  const info = await drv.evaluate(readTabs, widget.selector);
  if (info.tabs.length < 2) return [];

  const steps: Step[] = [];
  const start =
    info.tabs.find((t) => t.tabbable && t.selected) ?? info.tabs.find((t) => t.tabbable);
  if (start) {
    await drv.focus(start.tab);
    steps.push({ key: 'start', focused: await drv.focused(true) });
    const [next, prev] = info.vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
    for (const key of [
      ...Array<string>(info.tabs.length).fill(next!),
      ...Array<string>(info.tabs.length).fill(prev!),
      'Home',
      'End',
    ]) {
      steps.push({ key, focused: await drv.press(key) });
    }
  }
  const problems = evaluateTabsKeyboard({
    tablist: widget.selector,
    tabs: info.tabs.map((t) => ({ selector: t.tab, tabbable: t.tabbable })),
    steps,
  });

  const activations: Array<{ clicked: string; after: TabPanelState[] }> = [];
  for (const tab of info.tabs.filter((t) => !t.selected).slice(0, MAX_ACTIVATIONS)) {
    await drv.fresh();
    if (!(await drv.click(tab.tab))) continue;
    const after = await drv.evaluate(readTabs, widget.selector);
    activations.push({ clicked: tab.tab, after: after.tabs.map(strip) });
  }
  problems.push(
    ...evaluateTabsSelectedState({
      tablist: widget.selector,
      initial: info.tabs.map(strip),
      activations,
    }),
  );
  return problems;
}
