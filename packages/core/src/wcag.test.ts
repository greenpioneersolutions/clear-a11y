import {
  compareSc,
  criteriaForLevel,
  getSuccessCriterion,
  scFromAxeTag,
  understandingSlug,
  WCAG,
} from './wcag.js';

describe('WCAG map', () => {
  it('covers WCAG 2.2 (87 entries including obsolete 4.1.1)', () => {
    expect(Object.keys(WCAG)).toHaveLength(87);
    expect(getSuccessCriterion('4.1.1')?.removed).toBe(true);
  });

  it('has 55 A + AA criteria in WCAG 2.2', () => {
    expect(criteriaForLevel('AA')).toHaveLength(55);
    expect(criteriaForLevel('A')).toHaveLength(31);
  });

  it('builds Understanding URLs', () => {
    expect(understandingSlug('Contrast (Minimum)')).toBe('contrast-minimum');
    expect(getSuccessCriterion('3.3.4')?.understanding).toBe(
      'https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html',
    );
    expect(getSuccessCriterion('2.5.8')).toMatchObject({
      level: 'AA',
      since: '2.2',
      principle: 'Operable',
    });
  });

  it('parses axe tags', () => {
    expect(scFromAxeTag('wcag143')).toBe('1.4.3');
    expect(scFromAxeTag('wcag1410')).toBe('1.4.10');
    expect(scFromAxeTag('wcag2aa')).toBeUndefined();
    expect(scFromAxeTag('wcag999')).toBeUndefined();
  });

  it('sorts SC numbers numerically', () => {
    expect(['1.4.10', '1.4.9', '1.1.1'].sort(compareSc)).toEqual(['1.1.1', '1.4.9', '1.4.10']);
  });
});
