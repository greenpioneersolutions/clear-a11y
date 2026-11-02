import {
  contrastOverBackgroundRule,
  detectContrastOverBackground,
} from './contrast-over-background.js';

const g = (median: number, p10: number, samples = 500) => ({ samples, median, p10, worst: p10 });

describe('visual/contrast-over-background', () => {
  it('has rule metadata', () => {
    expect(contrastOverBackgroundRule.id).toBe('visual/contrast-over-background');
    expect(contrastOverBackgroundRule.wcag).toEqual(['1.4.3']);
  });

  it('is a violation when the median fails', () => {
    expect(detectContrastOverBackground(g(1.3, 1.2), 3)).toBe('violation');
  });

  it('is likely when only part of the text fails', () => {
    expect(detectContrastOverBackground(g(5.2, 3.9), 4.5)).toBe('likely');
  });

  it('passes white text on a dark gradient, and ignores tiny samples', () => {
    expect(detectContrastOverBackground(g(11.2, 10.4), 3)).toBeUndefined();
    expect(detectContrastOverBackground(g(1.1, 1.1, 5), 3)).toBeUndefined();
    expect(detectContrastOverBackground(undefined, 3)).toBeUndefined();
  });
});
