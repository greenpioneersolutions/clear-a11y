import { detectLabelInName, labelInNameRule } from './label-in-name.js';

const base = {
  role: 'button',
  name: 'Find products',
  nameSource: 'aria-label',
  visibleLabel: 'Search',
};

describe('at/label-in-name', () => {
  it('has rule metadata', () => {
    expect(labelInNameRule.id).toBe('at/label-in-name');
    expect(labelInNameRule.wcag).toEqual(['2.5.3']);
  });

  it('detects a visible label missing from the accessible name', () => {
    expect(detectLabelInName(base)).toBe(true);
    expect(
      detectLabelInName({ ...base, role: 'textbox', nameSource: 'aria-labelledby', name: 'Query' }),
    ).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(detectLabelInName({ ...base, name: 'Search products' })).toBe(false);
    expect(detectLabelInName({ ...base, name: 'search, products!' })).toBe(false);
    expect(detectLabelInName({ ...base, nameSource: 'contents', name: 'Search' })).toBe(false);
  });

  it('skips icon-only controls and one-character symbols', () => {
    expect(detectLabelInName({ ...base, visibleLabel: '' })).toBe(false);
    expect(detectLabelInName({ ...base, visibleLabel: 'X', name: 'Close' })).toBe(false);
    expect(detectLabelInName({ ...base, visibleLabel: '→', name: 'Next' })).toBe(false);
  });
});
