import type { Page } from '@clear-a11y/browser';
import {
  contrastOverBackgroundRule,
  detectContrastOverBackground,
} from '../rules/contrast-over-background.js';
import { detectNonTextContrast, nonTextContrastRule } from '../rules/non-text-contrast.js';
import { contrastRatio, parseCssColor, textContrastThreshold } from './color.js';
import { round, type VisualRun } from './context.js';
import type { Box } from './geometry.js';
import {
  diffMask,
  glyphContrast,
  lineSamples,
  type GlyphContrast,
  medianColor,
  percentile,
  pixelAt,
  type RgbaImage,
} from './pixels.js';
import { decodePng } from './png.js';
import type { ContrastCandidate, NonTextCandidate } from './probe.js';

/** Largest region screenshotted per text element (long paragraphs are sampled from the top). */
const MAX_CLIP = { width: 1200, height: 300 };

async function pageSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
}

function clampClip(b: Box, pad: number, size: { width: number; height: number }): Box | undefined {
  const x = Math.max(0, Math.floor(b.x - pad));
  const y = Math.max(0, Math.floor(b.y - pad));
  const r = Math.min(size.width, Math.ceil(b.x + b.width + pad), x + MAX_CLIP.width);
  const btm = Math.min(size.height, Math.ceil(b.y + b.height + pad), y + MAX_CLIP.height);
  return r - x >= 2 && btm - y >= 2 ? { x, y, width: r - x, height: btm - y } : undefined;
}

/** Glyph pixels needed before a measurement counts as a verified pass. */
const MIN_PASS_SAMPLES = 20;

/**
 * Pure: true when a real-pixel measurement is complete enough to record as a pass (ADR 0003).
 * Every glyph pixel at or above the threshold is not enough on its own: the screenshot must
 * cover the element's whole text (long text is only sampled from the top) and enough glyph
 * pixels must have been measured.
 */
export function isVerifiedPass(
  measured: GlyphContrast | undefined,
  clip: Box,
  text: Box,
): measured is GlyphContrast {
  if (!measured || measured.samples < MIN_PASS_SAMPLES) return false;
  const tol = 1;
  return (
    clip.x <= text.x + tol &&
    clip.y <= text.y + tol &&
    clip.x + clip.width >= text.x + text.width - tol &&
    clip.y + clip.height >= text.y + text.height - tol
  );
}

async function shot(page: Page, clip: Box): Promise<RgbaImage> {
  return decodePng(
    await page.screenshot({ clip, fullPage: true, animations: 'disabled', caret: 'hide' }),
  );
}

/**
 * SC 1.4.3 for text on non-solid backgrounds (images, gradients, overlapping layers): screenshot
 * the text twice, shown and with `color: transparent`. The difference is the glyph mask; the
 * second shot is the exact background under every glyph pixel.
 */
export async function checkTextContrast(run: VisualRun): Promise<void> {
  const { page } = run.ctx;
  const candidates: ContrastCandidate[] = await page.evaluate(
    (max) => window.__ca11yVisual.contrastCandidates(max),
    run.config.maxContrastCandidates,
  );
  if (!candidates.length) return;
  const size = await pageSize(page);
  for (const c of candidates) {
    if (run.timeLeft() < 2_000) {
      run.ctx.log.debug('engine-visual: contrast budget exhausted', {
        remaining: candidates.length,
      });
      break;
    }
    const fg = parseCssColor(c.color);
    const clip = clampClip(c.clip, 2, size);
    if (!fg || fg.a === 0 || !clip) continue;
    const shown = await shot(page, clip);
    await page.evaluate((id) => window.__ca11yVisual.setHidden(id, true), c.id);
    let hidden: RgbaImage;
    try {
      hidden = await shot(page, clip);
    } finally {
      await page.evaluate((id) => window.__ca11yVisual.setHidden(id, false), c.id);
    }
    if (shown.width !== hidden.width || shown.height !== hidden.height) continue;
    const measured = glyphContrast(diffMask(shown, hidden), hidden, fg, c.opacity);
    const threshold = textContrastThreshold(c.fontSize, c.fontWeight);
    const tier = detectContrastOverBackground(measured, threshold);
    if (!tier) {
      // ADR 0003: a complete real-pixel pass settles axe's "background could not be determined".
      if (isVerifiedPass(measured, clip, c.clip)) {
        run.ctx.recordPass?.({
          ruleId: contrastOverBackgroundRule.id,
          wcag: contrastOverBackgroundRule.wcag,
          selector: c.selector,
          evidence: {
            data: {
              method: 'real-pixel',
              threshold,
              median: round(measured.median),
              p10: round(measured.p10),
              worst: round(measured.worst),
              glyphPixels: measured.samples,
              color: c.color,
              background: c.reason,
            },
          },
        });
      }
      continue;
    }
    if (!measured) continue;
    const where =
      c.reason === 'background-image'
        ? 'a background image or gradient'
        : c.reason === 'obscured'
          ? 'a background partly covered by another element'
          : 'an overlapping element';
    await run.emit(contrastOverBackgroundRule, {
      selector: c.selector,
      tier,
      message:
        tier === 'violation'
          ? `Text "${c.text}" over ${where} has a median contrast of ${round(measured.median)}:1 against the real pixels behind it (needs ${threshold}:1). Most of it is hard to read for people with low vision.`
          : `Part of the text "${c.text}" over ${where} drops to ${round(measured.p10)}:1 against the pixels behind it (needs ${threshold}:1), although the median is ${round(measured.median)}:1.`,
      evidence: {
        data: {
          method: 'real-pixel',
          threshold,
          median: round(measured.median),
          p10: round(measured.p10),
          worst: round(measured.worst),
          glyphPixels: measured.samples,
          color: c.color,
          fontSize: c.fontSize,
          fontWeight: c.fontWeight,
          background: c.reason,
        },
      },
      screenshot: true,
    });
  }
}

interface NonTextMeasure {
  sideRatios: number[];
  fillRatio: number;
  iconRatio?: number;
}

/** Samples just outside, on, and just inside each side of the control's border box. */
export function measureBoundary(
  img: RgbaImage,
  box: Box,
  c: NonTextCandidate,
): NonTextMeasure | undefined {
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.width - 1;
  const y1 = box.y + box.height - 1;
  const { top, right, bottom, left } = c.borders;
  const span = (a: number, b: number): [number, number] => [
    Math.round(a + (b - a) * 0.2),
    Math.round(a + (b - a) * 0.8),
  ];
  const [hx0, hx1] = span(x0, x1);
  const [vy0, vy1] = span(y0, y1);
  const h = (y: number) => lineSamples(img, { x: hx0, y }, { x: hx1, y });
  const v = (x: number) => lineSamples(img, { x, y: vy0 }, { x, y: vy1 });
  /** Every pixel row/column inside the border (inset, outset and native painting differ). */
  const within = (bw: number, line: (i: number) => ReturnType<typeof h>) =>
    Array.from({ length: Math.max(1, Math.ceil(bw)) }, (_, i) => line(i));
  const sides = [
    { out: h(y0 - 2), on: within(top, (i) => h(y0 + i)), fill: h(y0 + Math.ceil(top) + 2) },
    { out: v(x1 + 2), on: within(right, (i) => v(x1 - i)), fill: v(x1 - Math.ceil(right) - 2) },
    { out: h(y1 + 2), on: within(bottom, (i) => h(y1 - i)), fill: h(y1 - Math.ceil(bottom) - 2) },
    { out: v(x0 - 2), on: within(left, (i) => v(x0 + i)), fill: v(x0 + Math.ceil(left) + 2) },
  ];
  const outside = medianColor(sides.flatMap((s) => s.out));
  const fill = medianColor(sides.flatMap((s) => s.fill));
  if (!outside || !fill) return undefined;
  const sideRatios = sides.flatMap((s) => {
    const out = medianColor(s.out);
    if (!out) return [];
    const ratios = s.on.flatMap((line) => {
      const on = medianColor(line);
      return on ? [contrastRatio(on, out)] : [];
    });
    return ratios.length ? [Math.max(...ratios)] : [];
  });
  const result: NonTextMeasure = { sideRatios, fillRatio: contrastRatio(fill, outside) };
  if (c.kind === 'icon-button') {
    const inset = Math.ceil(Math.max(top, right, bottom, left)) + 1;
    const ratios: number[] = [];
    for (let y = y0 + inset; y <= y1 - inset; y++)
      for (let x = x0 + inset; x <= x1 - inset; x++)
        ratios.push(contrastRatio(pixelAt(img, x, y), fill));
    result.iconRatio = ratios.length ? percentile(ratios, 99) : 0;
  }
  return result;
}

/** SC 1.4.11: boundaries of form fields and icon-only buttons against the page behind them. */
export async function checkNonTextContrast(run: VisualRun): Promise<void> {
  const { page } = run.ctx;
  const candidates: NonTextCandidate[] = await page.evaluate(
    (max) => window.__ca11yVisual.nonTextCandidates(max),
    run.config.maxNonTextCandidates,
  );
  if (!candidates.length) return;
  const size = await pageSize(page);
  const PAD = 4;
  for (const c of candidates) {
    if (run.timeLeft() < 2_000) break;
    const clip = clampClip(c.box, PAD, size);
    if (!clip) continue;
    const img = await shot(page, clip);
    const scale = img.width / clip.width;
    if (Math.abs(scale - 1) > 0.01) continue; // Pixel math assumes deviceScaleFactor 1.
    const local: Box = {
      x: Math.round(c.box.x - clip.x),
      y: Math.round(c.box.y - clip.y),
      width: Math.round(c.box.width),
      height: Math.round(c.box.height),
    };
    const m = measureBoundary(img, local, c);
    if (!m || !detectNonTextContrast(m)) continue;
    const what = c.kind === 'input' ? 'form field' : 'icon-only button';
    await run.emit(nonTextContrastRule, {
      selector: c.selector,
      message: `This ${what} has no visual cue with 3:1 contrast: its border reaches ${round(Math.max(...m.sideRatios))}:1 and its fill ${round(m.fillRatio)}:1 against the page${m.iconRatio !== undefined ? `, its icon ${round(m.iconRatio)}:1` : ''}. People with low vision may not see the control.`,
      evidence: {
        data: {
          method: 'real-pixel',
          threshold: 3,
          borderRatios: m.sideRatios.map((r) => round(r)),
          fillRatio: round(m.fillRatio),
          ...(m.iconRatio !== undefined ? { iconRatio: round(m.iconRatio) } : {}),
        },
      },
      screenshot: true,
    });
  }
}
