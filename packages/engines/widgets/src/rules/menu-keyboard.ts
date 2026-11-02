import type { RuleMeta } from '@clear-a11y/core';
import { list, reachability, type RovingItem } from '../lib/roving.js';
import type { Problem, Step } from '../lib/types.js';

export const menuKeyboardRule: RuleMeta = {
  id: 'widgets/menu-keyboard',
  engine: 'engine-widgets',
  wcag: ['2.1.1', '4.1.2'],
  tier: 'violation',
  title: 'Menu buttons and menubars work with the keyboard',
  description:
    'Opens menu buttons with Enter, Space and Down Arrow, walks the items with the arrow keys and closes with Escape; walks menubar items with the arrow keys. A menu that opens only with the mouse, or whose items cannot be reached, blocks keyboard users (2.1.1). aria-expanded that stays "false" while the menu is open misreports state (4.1.2). Other deviations from the ARIA Authoring Practices menu pattern are reported for review.',
  fix: 'Use a native <button> with aria-haspopup="menu" and aria-expanded. On Enter, Space or Down Arrow open the menu and move focus to the first item; Up/Down Arrow move between items (roving tabindex or aria-activedescendant); Escape closes the menu and returns focus to the button.',
};

export const MENU_KEYS = ['Enter', 'Space', 'ArrowDown'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export interface MenuOpenResult {
  open: boolean;
  /** aria-expanded on the button after the action. */
  expanded: string | null;
  /** Focus moved onto an item inside the menu. */
  focusInMenu: boolean;
}

export interface MenuButtonObservation {
  button: string;
  buttonTabbable: boolean;
  open: Record<MenuKey | 'click', MenuOpenResult>;
  /** Visible, enabled menu items while open. */
  items: RovingItem[];
  /** After opening with the keyboard: where focus is, then Down Arrow presses. */
  steps: Step[];
  /** Escape pressed with the menu open (null when the keyboard cannot open it). */
  escape: { closed: boolean; focusOnButton: boolean } | null;
}

export interface MenubarObservation {
  menubar: string;
  items: RovingItem[];
  steps: Step[];
}

const base = { ruleId: menuKeyboardRule.id };

/** Pure APG menu button check. */
export function evaluateMenuButton(obs: MenuButtonObservation): Problem[] {
  const openKeys = MENU_KEYS.filter((k) => obs.open[k].open);
  if (openKeys.length === 0) {
    if (!obs.open.click.open) return [];
    return [
      {
        ...base,
        wcag: ['2.1.1'],
        tier: 'violation',
        confidence: 0.95,
        selector: obs.button,
        message: obs.buttonTabbable
          ? 'This menu opens with a mouse click but not with Enter, Space or Down Arrow, so keyboard users cannot open it.'
          : 'This menu button is not in the Tab sequence and the menu opens only with a mouse click.',
      },
    ];
  }
  const problems: Problem[] = [];
  const missing = MENU_KEYS.filter((k) => !obs.open[k].open);
  if (missing.length) {
    problems.push({
      ...base,
      wcag: ['2.1.1'],
      tier: 'needs-review',
      confidence: 0.5,
      selector: obs.button,
      message: `The menu opens with ${openKeys.join(' and ')} but not with ${missing.join(' or ')}, unlike the ARIA Authoring Practices menu button pattern.`,
      question: `Can keyboard users discover how to open this menu, given that ${missing.join(' and ')} do nothing?`,
    });
  }
  if (obs.items.length) {
    const r = reachability(obs.items, obs.steps);
    const reached = new Set([
      ...r.byArrows,
      ...obs.steps.map((s) => s.focused).filter((f): f is string => f !== null),
    ]);
    const blocked = obs.items.filter((i) => !i.tabbable && !reached.has(i.selector));
    if (blocked.length) {
      problems.push({
        ...base,
        wcag: ['2.1.1'],
        tier: 'violation',
        confidence: 0.9,
        selector: obs.button,
        message: `With the menu open, focus never reaches items ${list(blocked.map((i) => i.selector))}: they are not in the Tab sequence and the arrow keys do not move to them, so keyboard users cannot choose them.`,
        data: { steps: obs.steps },
      });
    } else if (!obs.items.some((i) => reached.has(i.selector))) {
      problems.push({
        ...base,
        wcag: ['2.1.1'],
        tier: 'needs-review',
        confidence: 0.5,
        selector: obs.button,
        message:
          'The menu items are reachable only with Tab; the arrow keys do not move between them as the ARIA Authoring Practices menu pattern expects.',
        question:
          'Is it acceptable that this menu is navigated with Tab instead of the arrow keys (for example because it is really a list of links)?',
      });
    }
  }
  const stale = openKeys.find(
    (k) => obs.open[k].expanded !== null && obs.open[k].expanded !== 'true',
  );
  if (stale) {
    problems.push({
      ...base,
      wcag: ['4.1.2'],
      tier: 'violation',
      confidence: 0.9,
      selector: obs.button,
      message: `The menu is open but the button still reports aria-expanded="${obs.open[stale].expanded}", so screen readers announce it as collapsed.`,
    });
  }
  if (obs.escape && !obs.escape.closed) {
    problems.push({
      ...base,
      wcag: ['2.1.1'],
      tier: 'needs-review',
      confidence: 0.5,
      selector: obs.button,
      message: 'Escape does not close the open menu.',
      question:
        'Can keyboard users close this menu without choosing an item (Escape does nothing)?',
    });
  } else if (obs.escape && !obs.escape.focusOnButton) {
    problems.push({
      ...base,
      wcag: ['2.1.1'],
      tier: 'needs-review',
      confidence: 0.5,
      selector: obs.button,
      message: 'Escape closes the menu but focus does not return to the menu button.',
      question:
        'After closing this menu with Escape, can keyboard users easily continue from the menu button?',
    });
  }
  return problems;
}

/** Pure APG menubar check: every top-level item must be reachable with Tab or the arrow keys. */
export function evaluateMenubar(obs: MenubarObservation): Problem[] {
  if (obs.items.length < 2) return [];
  const r = reachability(obs.items, obs.steps);
  if (r.tabbable.length === 0 || r.unreached.length > 0) {
    return [
      {
        ...base,
        wcag: ['2.1.1'],
        tier: 'violation',
        confidence: 0.9,
        selector: r.tabbable.length === 0 ? obs.menubar : r.unreached[0]!,
        message:
          r.tabbable.length === 0
            ? 'No menubar item is in the Tab sequence, so keyboard users cannot reach this menubar.'
            : `Menubar items ${list(r.unreached)} are not in the Tab sequence and the arrow keys do not move to them.`,
        data: { unreached: r.unreached, steps: obs.steps },
      },
    ];
  }
  if (r.byArrows.length === 0 && r.tabbable.length === obs.items.length) {
    return [
      {
        ...base,
        wcag: ['2.1.1'],
        tier: 'needs-review',
        confidence: 0.5,
        selector: obs.menubar,
        message:
          'Every menubar item is a separate Tab stop and the arrow keys do nothing, unlike the ARIA Authoring Practices menubar pattern.',
        question:
          'Is it acceptable that this menubar is operated with Tab only (should it be a plain list of links instead of role="menubar")?',
      },
    ];
  }
  return [];
}
