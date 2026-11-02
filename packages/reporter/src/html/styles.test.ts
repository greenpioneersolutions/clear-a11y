import { COLORS } from './styles.js';

/** WCAG relative luminance contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(['light', 'dark'] as const)('%s palette', (scheme) => {
  const c = COLORS[scheme];

  it.each([
    ['text', c.text, c.bg],
    ['text on surface', c.text, c.surface],
    ['muted', c.muted, c.bg],
    ['muted on surface', c.muted, c.surface],
    ['link', c.link, c.bg],
    ['link on surface', c.link, c.surface],
    ['violation badge', c.violationFg, c.violationBg],
    ['likely badge', c.likelyFg, c.likelyBg],
    ['review badge', c.reviewFg, c.reviewBg],
    ['stop number', c.stopText, c.stop],
    ['backward stop number', c.bg, c.back],
    ['backward label', c.back, c.bg],
  ])('%s meets 4.5:1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['focus ring', c.focus, c.bg],
    ['borders', c.border, c.bg],
    ['diagram lines', c.line, c.surface],
    ['backward lines', c.back, c.surface],
    ['stop circles', c.stop, c.surface],
  ])('%s meets 3:1 (non-text)', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
