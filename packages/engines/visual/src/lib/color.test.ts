import {
  blend,
  contrastRatio,
  isLargeText,
  parseCssColor,
  relativeLuminance,
  textContrastThreshold,
} from './color.js';

const hex = (h: string) => ({
  r: parseInt(h.slice(1, 3), 16),
  g: parseInt(h.slice(3, 5), 16),
  b: parseInt(h.slice(5, 7), 16),
  a: 1,
});

describe('color', () => {
  it('computes relative luminance at the extremes', () => {
    expect(relativeLuminance(hex('#000000'))).toBe(0);
    expect(relativeLuminance(hex('#ffffff'))).toBeCloseTo(1, 10);
  });

  it('matches known WCAG contrast values', () => {
    expect(contrastRatio(hex('#000000'), hex('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(hex('#777777'), hex('#ffffff'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(hex('#767676'), hex('#ffffff'))).toBeCloseTo(4.54, 2);
    expect(contrastRatio(hex('#ffffff'), hex('#777777'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(hex('#dddddd'), hex('#ffffff'))).toBeCloseTo(1.36, 2);
  });

  it('blends a translucent color over a background', () => {
    const half = blend({ r: 0, g: 0, b: 0, a: 0.5 }, hex('#ffffff'));
    expect(half.r).toBeCloseTo(127.5);
    expect(blend({ r: 0, g: 0, b: 0, a: 1 }, hex('#ffffff'), 0).r).toBe(255);
  });

  it('parses computed colors', () => {
    expect(parseCssColor('rgb(255, 0, 10)')).toEqual({ r: 255, g: 0, b: 10, a: 1 });
    expect(parseCssColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseCssColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseCssColor('transparent')?.a).toBe(0);
    expect(parseCssColor('color(display-p3 1 0 0)')).toBeUndefined();
  });

  it('applies the large-text boundary', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 600)).toBe(false);
    expect(isLargeText(18.5, 700)).toBe(false);
    expect(textContrastThreshold(16, 400)).toBe(4.5);
    expect(textContrastThreshold(32, 400)).toBe(3);
  });
});
