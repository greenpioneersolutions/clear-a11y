import { detectNonTextContrast, nonTextContrastRule } from './non-text-contrast.js';

describe('visual/non-text-contrast', () => {
  it('has rule metadata', () => {
    expect(nonTextContrastRule.id).toBe('visual/non-text-contrast');
    expect(nonTextContrastRule.wcag).toEqual(['1.4.11']);
  });

  it('detects a field whose border and fill are both faint', () => {
    expect(detectNonTextContrast({ sideRatios: [1.36, 1.36, 1.36, 1.36], fillRatio: 1 })).toBe(
      true,
    );
  });

  it('accepts any one strong cue: a side, the fill or the icon', () => {
    expect(detectNonTextContrast({ sideRatios: [1, 1, 4.6, 1], fillRatio: 1 })).toBe(false);
    expect(detectNonTextContrast({ sideRatios: [1, 1, 1, 1], fillRatio: 3.2 })).toBe(false);
    expect(detectNonTextContrast({ sideRatios: [1, 1, 1, 1], fillRatio: 1, iconRatio: 12 })).toBe(
      false,
    );
  });
});
