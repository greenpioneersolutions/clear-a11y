import type { RgbaImage } from './png.js';

export type Rgb = readonly [number, number, number];

/** WCAG relative luminance of an sRGB color (0..255 channels). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colors, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const pixel = (img: RgbaImage, i: number): Rgb => [
  img.data[i * 4] as number,
  img.data[i * 4 + 1] as number,
  img.data[i * 4 + 2] as number,
];

export interface DiffStats {
  total: number;
  /** Pixels whose largest channel difference exceeds the noise threshold. */
  changed: number;
  ratio: number;
  /** Bounding box of the changed pixels, or null when nothing changed. */
  bbox: { x: number; y: number; width: number; height: number } | null;
}

function assertSameSize(a: RgbaImage, b: RgbaImage) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`image sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
}

const changedAt = (a: RgbaImage, b: RgbaImage, i: number, threshold: number) => {
  const o = i * 4;
  return (
    Math.max(
      Math.abs((a.data[o] as number) - (b.data[o] as number)),
      Math.abs((a.data[o + 1] as number) - (b.data[o + 1] as number)),
      Math.abs((a.data[o + 2] as number) - (b.data[o + 2] as number)),
    ) > threshold
  );
};

/** Counts pixels that differ between two same-size images (ignoring tiny encoder noise). */
export function diffStats(a: RgbaImage, b: RgbaImage, threshold = 8): DiffStats {
  assertSameSize(a, b);
  const total = a.width * a.height;
  let changed = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < total; i++) {
    if (!changedAt(a, b, i, threshold)) continue;
    changed++;
    const x = i % a.width;
    const y = Math.floor(i / a.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    total,
    changed,
    ratio: total === 0 ? 0 : changed / total,
    bbox: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
  };
}

export interface FocusChange extends DiffStats {
  /** Changed pixels whose focused color has at least 3:1 contrast with the unfocused color. */
  strong: number;
  /** Largest contrast between a pixel's unfocused and focused color. */
  maxContrast: number;
}

/**
 * Compares the unfocused and focused crops of the same area. A focus indicator is the set of
 * changed pixels; each one is rated by the contrast between its before and after colors
 * (the WCAG 2.4.13 / 1.4.11 "change of contrast" idea).
 */
export function focusChange(unfocused: RgbaImage, focused: RgbaImage, threshold = 8): FocusChange {
  const stats = diffStats(unfocused, focused, threshold);
  let strong = 0;
  let maxContrast = 1;
  if (stats.changed) {
    for (let i = 0; i < stats.total; i++) {
      if (!changedAt(unfocused, focused, i, threshold)) continue;
      const c = contrastRatio(pixel(unfocused, i), pixel(focused, i));
      if (c >= 3) strong++;
      if (c > maxContrast) maxContrast = c;
    }
  }
  return { ...stats, strong, maxContrast: Math.round(maxContrast * 100) / 100 };
}

/** Largest before/after contrast among changed pixels (1 when nothing changed). */
export function maxContrastChange(a: RgbaImage, b: RgbaImage): number {
  return focusChange(a, b).maxContrast;
}
