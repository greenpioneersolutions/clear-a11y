/** An sRGB color with 0..255 channels and 0..1 alpha. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of an opaque sRGB color (0 = black, 1 = white). */
export function relativeLuminance(c: Pick<Rgba, 'r' | 'g' | 'b'>): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio between two opaque colors, 1..21. */
export function contrastRatio(
  a: Pick<Rgba, 'r' | 'g' | 'b'>,
  b: Pick<Rgba, 'r' | 'g' | 'b'>,
): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composites `fg` (with `fg.a * opacity`) over an opaque background. */
export function blend(fg: Rgba, bg: Pick<Rgba, 'r' | 'g' | 'b'>, opacity = 1): Rgba {
  const a = Math.max(0, Math.min(1, fg.a * opacity));
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/** Parses `rgb(...)`/`rgba(...)` as returned by getComputedStyle (legacy and space syntax). */
export function parseCssColor(value: string): Rgba | undefined {
  const m =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(
      value.trim(),
    );
  if (!m) {
    if (value.trim() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return undefined;
  }
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] === '%' ? 100 : 1);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
}

/**
 * WCAG "large scale" text: at least 18pt (24px), or 14pt (18.66px) and bold.
 * Large text needs 3:1 instead of 4.5:1 (SC 1.4.3).
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

/** Minimum contrast for text under SC 1.4.3. */
export function textContrastThreshold(fontSizePx: number, fontWeight: number): number {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5;
}

/** Minimum contrast for user interface components and graphics under SC 1.4.11. */
export const NON_TEXT_CONTRAST_THRESHOLD = 3;
