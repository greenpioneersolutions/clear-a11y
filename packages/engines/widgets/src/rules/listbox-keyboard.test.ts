import { evaluateListbox, listboxKeyboardRule, type ListboxNavStep } from './listbox-keyboard.js';

const step = (over: Partial<ListboxNavStep> = {}): ListboxNavStep => ({
  key: 'ArrowDown',
  activeOption: null,
  focusedOption: null,
  selected: [],
  look: '|;|',
  ...over,
});
const base = { listbox: '#lb', options: 4, tabbable: true, allOptionsTabbable: false };

describe('widgets/listbox-keyboard', () => {
  it('has rule metadata', () => {
    expect(listboxKeyboardRule.id).toBe('widgets/listbox-keyboard');
    expect(listboxKeyboardRule.wcag).toEqual(['2.1.1', '4.1.2']);
  });

  it('does not flag aria-activedescendant navigation', () => {
    expect(
      evaluateListbox({
        ...base,
        nav: [step({ key: 'start', activeOption: '#o1' }), step({ activeOption: '#o2' })],
      }),
    ).toEqual([]);
  });

  it('does not flag roving focus or selection that follows the arrows', () => {
    expect(
      evaluateListbox({
        ...base,
        nav: [step({ key: 'start', focusedOption: '#o1' }), step({ focusedOption: '#o2' })],
      }),
    ).toEqual([]);
    expect(
      evaluateListbox({
        ...base,
        nav: [step({ key: 'start', selected: ['#o1'] }), step({ selected: ['#o2'] })],
      }),
    ).toEqual([]);
  });

  it('flags a highlight that only changes visually', () => {
    const [p] = evaluateListbox({
      ...base,
      nav: [step({ key: 'start', look: 'is-current|;|' }), step({ look: '|;is-current|' })],
    });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['4.1.2'] });
  });

  it('flags a listbox that cannot be focused', () => {
    const [p] = evaluateListbox({ ...base, tabbable: false, nav: [] });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['2.1.1'] });
  });

  it('flags arrows that do nothing, or asks for review when every option is a Tab stop', () => {
    const nav = [step({ key: 'start' }), step()];
    expect(evaluateListbox({ ...base, nav })[0]).toMatchObject({ tier: 'violation' });
    expect(evaluateListbox({ ...base, allOptionsTabbable: true, nav })[0]).toMatchObject({
      tier: 'needs-review',
    });
  });
});
