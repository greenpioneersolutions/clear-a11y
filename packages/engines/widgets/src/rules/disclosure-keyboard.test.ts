import {
  disclosureKeyboardRule,
  evaluateDisclosure,
  type DisclosureState,
} from './disclosure-keyboard.js';

const closed: DisclosureState = { expanded: 'false', regionVisible: false };
const opened: DisclosureState = { expanded: 'true', regionVisible: true };
const obs = (
  after: Partial<Record<'Enter' | 'Space' | 'click', DisclosureState>>,
  tabbable = true,
) => ({
  button: '#toggle',
  region: '#panel',
  tabbable,
  initial: closed,
  after: { Enter: closed, Space: closed, click: closed, ...after },
});

describe('widgets/disclosure-keyboard', () => {
  it('has rule metadata', () => {
    expect(disclosureKeyboardRule.id).toBe('widgets/disclosure-keyboard');
    expect(disclosureKeyboardRule.wcag).toEqual(['2.1.1', '4.1.2']);
  });

  it('does not flag a native button disclosure', () => {
    expect(evaluateDisclosure(obs({ Enter: opened, Space: opened, click: opened }))).toEqual([]);
  });

  it('flags a toggle that only works with the mouse', () => {
    const [p] = evaluateDisclosure(obs({ click: opened }));
    expect(p).toMatchObject({ tier: 'violation', wcag: ['2.1.1'], selector: '#toggle' });
  });

  it('mentions when the toggle is not even focusable', () => {
    expect(evaluateDisclosure(obs({ click: opened }, false))[0]?.message).toMatch(/Tab sequence/);
  });

  it('asks for review when only Enter (or only Space) works', () => {
    const [p] = evaluateDisclosure(obs({ Enter: opened, click: opened }));
    expect(p).toMatchObject({ tier: 'needs-review', wcag: ['2.1.1'] });
    expect(p?.question).toContain('Space');
  });

  it('flags aria-expanded that disagrees with the shown content', () => {
    const stale = { expanded: 'false', regionVisible: true };
    const [p] = evaluateDisclosure(obs({ Enter: stale, Space: stale, click: stale }));
    expect(p).toMatchObject({ tier: 'violation', wcag: ['4.1.2'] });
  });

  it('flags a mismatch at load', () => {
    const [p] = evaluateDisclosure({
      ...obs({}),
      initial: { expanded: 'true', regionVisible: false },
      after: {
        Enter: { expanded: 'true', regionVisible: false },
        Space: { expanded: 'true', regionVisible: false },
        click: { expanded: 'true', regionVisible: false },
      },
    });
    expect(p).toMatchObject({ tier: 'violation', wcag: ['4.1.2'] });
    expect(p?.message).toMatch(/^At load/);
  });

  it('ignores a control that does nothing at all', () => {
    expect(evaluateDisclosure(obs({}))).toEqual([]);
  });
});
