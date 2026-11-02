import {
  comboboxKeyboardRule,
  evaluateCombobox,
  type ComboboxObservation,
} from './combobox-keyboard.js';

/** Recorded from the APG list autocomplete combobox. */
const good: ComboboxObservation = {
  combobox: '#cb',
  tabbable: true,
  opens: { ArrowDown: true, 'Alt+ArrowDown': true, typing: true, click: true },
  expandedWhenOpen: 'true',
  options: 4,
  nav: [
    { key: 'open', activeOption: '#o1', focusedOption: null, look: '|;|' },
    { key: 'ArrowDown', activeOption: '#o2', focusedOption: null, look: '|;|' },
    { key: 'ArrowDown', activeOption: '#o3', focusedOption: null, look: '|;|' },
  ],
  enter: { popupVisible: false, valueChanged: true },
  escape: { popupVisible: false },
};

describe('widgets/combobox-keyboard', () => {
  it('has rule metadata', () => {
    expect(comboboxKeyboardRule.id).toBe('widgets/combobox-keyboard');
    expect(comboboxKeyboardRule.wcag).toEqual(['2.1.1', '4.1.2']);
  });

  it('does not flag the APG combobox', () => {
    expect(evaluateCombobox(good)).toEqual([]);
  });

  it('flags stale aria-expanded and a visual-only active option', () => {
    const problems = evaluateCombobox({
      ...good,
      expandedWhenOpen: 'false',
      nav: [
        { key: 'open', activeOption: null, focusedOption: null, look: '|;|' },
        { key: 'ArrowDown', activeOption: null, focusedOption: null, look: 'is-active|;|' },
      ],
    });
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.tier === 'violation' && p.wcag[0] === '4.1.2')).toBe(true);
  });

  it('flags a popup that opens only with the mouse', () => {
    const [p] = evaluateCombobox({
      ...good,
      opens: { ArrowDown: false, 'Alt+ArrowDown': false, typing: false, click: true },
    });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['2.1.1'] });
  });

  it('flags options that Down Arrow never reaches', () => {
    const [p] = evaluateCombobox({
      ...good,
      nav: [
        { key: 'open', activeOption: null, focusedOption: null, look: '|' },
        { key: 'ArrowDown', activeOption: null, focusedOption: null, look: '|' },
      ],
    });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['2.1.1'] });
  });

  it('asks for review when Enter or Escape do nothing', () => {
    const problems = evaluateCombobox({
      ...good,
      enter: { popupVisible: true, valueChanged: false },
      escape: { popupVisible: true },
    });
    expect(problems.map((p) => p.tier)).toEqual(['needs-review', 'needs-review']);
    expect(problems.every((p) => p.question)).toBe(true);
  });

  it('ignores a combobox that never opens', () => {
    expect(
      evaluateCombobox({
        ...good,
        opens: { ArrowDown: false, 'Alt+ArrowDown': false, typing: false, click: false },
      }),
    ).toEqual([]);
  });
});
