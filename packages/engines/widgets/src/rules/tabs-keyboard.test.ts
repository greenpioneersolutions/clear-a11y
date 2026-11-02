import { evaluateTabsKeyboard, tabsKeyboardRule } from './tabs-keyboard.js';

const tabs = (...tabbable: boolean[]) =>
  tabbable.map((t, i) => ({ selector: `#tab-${i + 1}`, tabbable: t }));

describe('widgets/tabs-keyboard', () => {
  it('has rule metadata', () => {
    expect(tabsKeyboardRule.id).toBe('widgets/tabs-keyboard');
    expect(tabsKeyboardRule.wcag).toEqual(['2.1.1']);
  });

  it('flags inactive tabs that are neither tabbable nor reached by arrows (roving without handler)', () => {
    const [p, ...rest] = evaluateTabsKeyboard({
      tablist: '#list',
      tabs: tabs(true, false, false),
      steps: [
        { key: 'start', focused: '#tab-1' },
        { key: 'ArrowRight', focused: '#tab-1' },
        { key: 'ArrowRight', focused: '#tab-1' },
        { key: 'Home', focused: '#tab-1' },
      ],
    });
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ tier: 'violation', selector: '#tab-2', wcag: ['2.1.1'] });
    expect(p?.message).toContain('#tab-3');
  });

  it('flags a tab list where no tab is tabbable, on the tablist', () => {
    const [p] = evaluateTabsKeyboard({ tablist: '#list', tabs: tabs(false, false), steps: [] });
    expect(p).toMatchObject({ tier: 'violation', selector: '#list' });
  });

  it('asks for review when every tab is a Tab stop and arrows do nothing', () => {
    const [p] = evaluateTabsKeyboard({
      tablist: '#list',
      tabs: tabs(true, true, true),
      steps: [
        { key: 'start', focused: '#tab-1' },
        { key: 'ArrowRight', focused: '#tab-1' },
      ],
    });
    expect(p).toMatchObject({ tier: 'needs-review', selector: '#list' });
    expect(p?.question).toMatch(/\?$/);
  });

  it('does not flag the correct pattern (roving tabindex with arrow keys)', () => {
    expect(
      evaluateTabsKeyboard({
        tablist: '#list',
        tabs: tabs(true, false, false),
        steps: [
          { key: 'start', focused: '#tab-1' },
          { key: 'ArrowRight', focused: '#tab-2' },
          { key: 'ArrowRight', focused: '#tab-3' },
        ],
      }),
    ).toEqual([]);
  });

  it('ignores a single tab', () => {
    expect(evaluateTabsKeyboard({ tablist: '#list', tabs: tabs(false), steps: [] })).toEqual([]);
  });
});
