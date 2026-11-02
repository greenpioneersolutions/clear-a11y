import {
  evaluateMenubar,
  evaluateMenuButton,
  menuKeyboardRule,
  type MenuButtonObservation,
  type MenuOpenResult,
} from './menu-keyboard.js';

const r = (open: boolean, expanded: string | null = open ? 'true' : 'false'): MenuOpenResult => ({
  open,
  expanded,
  focusInMenu: false,
});
const items = [
  { selector: '#item-1', tabbable: false },
  { selector: '#item-2', tabbable: false },
];

/** Recorded from the APG actions menu button. */
const good: MenuButtonObservation = {
  button: '#btn',
  buttonTabbable: true,
  open: { Enter: r(true), Space: r(true), ArrowDown: r(true), click: r(true) },
  items,
  steps: [
    { key: 'start', focused: '#item-1' },
    { key: 'ArrowDown', focused: '#item-2' },
    { key: 'ArrowDown', focused: '#item-1' },
  ],
  escape: { closed: true, focusOnButton: true },
};

describe('widgets/menu-keyboard', () => {
  it('has rule metadata', () => {
    expect(menuKeyboardRule.id).toBe('widgets/menu-keyboard');
    expect(menuKeyboardRule.wcag).toEqual(['2.1.1', '4.1.2']);
  });

  it('does not flag the APG menu button', () => {
    expect(evaluateMenuButton(good)).toEqual([]);
  });

  it('flags a menu that opens only with the mouse', () => {
    const [p] = evaluateMenuButton({
      ...good,
      open: { Enter: r(false), Space: r(false), ArrowDown: r(false), click: r(true) },
      steps: [],
      escape: null,
    });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['2.1.1'], selector: '#btn' });
  });

  it('flags items that focus never reaches, plus APG deviations for review', () => {
    const problems = evaluateMenuButton({
      ...good,
      open: { ...good.open, ArrowDown: r(false) },
      steps: [
        { key: 'start', focused: '#btn' },
        { key: 'ArrowDown', focused: '#btn' },
      ],
      escape: { closed: false, focusOnButton: true },
    });
    expect(problems.map((p) => p.tier).sort()).toEqual([
      'needs-review',
      'needs-review',
      'violation',
    ]);
    expect(problems.find((p) => p.tier === 'violation')?.message).toContain('#item-1');
  });

  it('asks for review when items are reachable only with Tab', () => {
    const [p] = evaluateMenuButton({
      ...good,
      items: items.map((i) => ({ ...i, tabbable: true })),
      steps: [
        { key: 'start', focused: '#btn' },
        { key: 'ArrowDown', focused: '#btn' },
      ],
    });
    expect(p).toMatchObject({ tier: 'needs-review' });
  });

  it('flags aria-expanded that stays false while the menu is open', () => {
    const [p] = evaluateMenuButton({
      ...good,
      open: {
        Enter: r(true, 'false'),
        Space: r(true, 'false'),
        ArrowDown: r(true, 'false'),
        click: r(true),
      },
    });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['4.1.2'] });
  });

  it('ignores a button that does nothing at all', () => {
    expect(
      evaluateMenuButton({
        ...good,
        open: { Enter: r(false), Space: r(false), ArrowDown: r(false), click: r(false) },
        escape: null,
      }),
    ).toEqual([]);
  });

  describe('menubar', () => {
    const bar = (tabbable: boolean[], focused: string[]) => ({
      menubar: '#bar',
      items: tabbable.map((t, i) => ({ selector: `#m${i + 1}`, tabbable: t })),
      steps: focused.map((f, i) => ({ key: i ? 'ArrowRight' : 'start', focused: f })),
    });

    it('flags unreachable menubar items', () => {
      const [p] = evaluateMenubar(bar([true, false, false], ['#m1', '#m1', '#m1']));
      expect(p).toMatchObject({ tier: 'violation', selector: '#m2' });
    });

    it('flags a menubar with no tabbable item', () => {
      const [p] = evaluateMenubar(bar([false, false], []));
      expect(p).toMatchObject({ tier: 'violation', selector: '#bar' });
    });

    it('does not flag a roving menubar', () => {
      expect(evaluateMenubar(bar([true, false], ['#m1', '#m2', '#m1']))).toEqual([]);
    });
  });
});
