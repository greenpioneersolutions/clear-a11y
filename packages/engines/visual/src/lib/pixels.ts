import { blend, contrastRatio, type Rgba } from './color.js';

/** Decoded RGBA image: 4 bytes per pixel, row-major. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export function pixelAt(img: RgbaImage, x: number, y: number): Rgba {
  const i = (y * img.width + x) * 4;
  return {
    r: img.data[i] ?? 0,
    g: img.data[i + 1] ?? 0,
    b: img.data[i + 2] ?? 0,
    a: (img.data[i + 3] ?? 255) / 255,
  };
}

/** Value at percentile `p` (0..100) of the numbers, nearest-rank. Returns NaN for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((Math.max(0, Math.min(100, p)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)] as number;
}

/** Per-channel median color of a pixel list. */
export function medianColor(pixels: readonly Rgba[]): Rgba | undefined {
  if (pixels.length === 0) return undefined;
  return {
    r: percentile(
      pixels.map((p) => p.r),
      50,
    ),
    g: percentile(
      pixels.map((p) => p.g),
      50,
    ),
    b: percentile(
      pixels.map((p) => p.b),
      50,
    ),
    a: 1,
  };
}

/**
 * Indexes of pixels whose color differs between two same-size shots by at least `threshold` in
 * any channel. With the text shown in `a` and hidden in `b`, these are the glyph pixels. The
 * threshold is low on purpose: Chromium renders both shots identically apart from the glyphs, and
 * low-contrast text (white on #f6f5f4) only differs by a few levels.
 */
export function diffMask(a: RgbaImage, b: RgbaImage, threshold = 3): number[] {
  if (a.width !== b.width || a.height !== b.height) throw new Error('image sizes differ');
  const out: number[] = [];
  for (let i = 0; i < a.width * a.height; i++) {
    const o = i * 4;
    const d = Math.max(
      Math.abs((a.data[o] ?? 0) - (b.data[o] ?? 0)),
      Math.abs((a.data[o + 1] ?? 0) - (b.data[o + 1] ?? 0)),
      Math.abs((a.data[o + 2] ?? 0) - (b.data[o + 2] ?? 0)),
    );
    if (d >= threshold) out.push(i);
  }
  return out;
}

/** Evenly samples at most `max` items, keeping order (deterministic). */
export function sampleEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)] as T);
}

export interface GlyphContrast {
  /** Number of glyph pixels measured. */
  samples: number;
  median: number;
  /** 10th percentile: 10% of glyph pixels sit on a background at least this bad. */
  p10: number;
  worst: number;
}

/**
 * Contrast of a text color against the real background under each glyph pixel. `background` is
 * the shot with the text hidden, so every glyph pixel's background is known exactly, even on
 * images and gradients. `opacity` is the product of the element's and its ancestors' opacity.
 */
export function glyphContrast(
  mask: readonly number[],
  background: RgbaImage,
  fg: Rgba,
  opacity = 1,
  maxSamples = 4000,
): GlyphContrast | undefined {
  if (mask.length === 0) return undefined;
  const ratios = sampleEvenly(mask, maxSamples).map((i) => {
    const bg = pixelAt(background, i % background.width, Math.floor(i / background.width));
    return contrastRatio(blend(fg, bg, opacity), bg);
  });
  return {
    samples: ratios.length,
    median: percentile(ratios, 50),
    p10: percentile(ratios, 10),
    worst: Math.min(...ratios),
  };
}

/** Pixels along a horizontal or vertical segment (clamped to the image). */
export function lineSamples(
  img: RgbaImage,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Rgba[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const out: Rgba[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    out.push(pixelAt(img, x, y));
  }
  return out;
}
