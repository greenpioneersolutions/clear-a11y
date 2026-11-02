import { ensureHelpers, padRect, type Page } from '@clear-a11y/browser';
import type { Rect } from '@clear-a11y/core';
import { classifyFocusIndicator, type FocusIndicator } from '../rules/focus-not-visible.js';
import { blurActive, installStableStyles, nextFrames, refocus } from './page-scripts.js';
import { focusChange, type FocusChange } from './pixels.js';
import { decodePng, type RgbaImage } from './png.js';
import type { WalkStop } from './walker.js';

/** Installs helpers and stable styles, parks the mouse and waits for web fonts. Idempotent. */
export async function preparePage(page: Page): Promise<void> {
  await ensureHelpers(page);
  await page.evaluate(installStableStyles);
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
}

/** Viewport-relative clip around a viewport rect, or null when it is off screen. */
export function clipAround(
  client: Rect,
  pad: number,
  viewport: { width: number; height: number },
): Rect | null {
  const right = client.x + client.width;
  const bottom = client.y + client.height;
  if (right <= 0 || bottom <= 0 || client.x >= viewport.width || client.y >= viewport.height) {
    return null;
  }
  return padRect(client, pad, viewport);
}

interface Shot {
  png: Buffer;
  image: RgbaImage;
}

async function shoot(page: Page, clip?: Rect): Promise<Shot> {
  const png = await page.screenshot({
    ...(clip ? { clip } : {}),
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
  return { png, image: decodePng(png) };
}

export interface FocusMeasure {
  indicator: FocusIndicator;
  change: FocusChange;
  /** Pixels that changed anywhere in the viewport, measured only when the crop showed nothing. */
  viewportChanged?: number;
  /** PNG of the focused crop, for evidence. */
  focusedPng: Buffer;
  clip: Rect;
}

/**
 * Compares the element's padded box while focused (reached with Tab) and after blur.
 * When the crop shows no change at all, the whole viewport is compared as well, so focus styles
 * drawn on a distant container are not missed. Leaves the element focused again.
 * Returns null when the element can't be measured (off screen, or it refuses to blur).
 */
export async function measureFocusIndicator(
  page: Page,
  stop: WalkStop,
  pad: number,
): Promise<FocusMeasure | null> {
  const viewport = page.viewportSize();
  if (!viewport || stop.tiny) return null;
  const clip = clipAround(stop.client, pad, viewport);
  if (!clip) return null;
  await page.evaluate(nextFrames);
  const focused = await shoot(page, clip);
  const blurred = await page.evaluate(blurActive, stop.selector);
  if (!blurred) return null; // it grabs focus back on blur; can't see the unfocused state
  try {
    await page.evaluate(nextFrames);
    const unfocused = await shoot(page, clip);
    const change = focusChange(unfocused.image, focused.image);
    const shortSide = Math.min(stop.client.width, stop.client.height);
    const indicator = classifyFocusIndicator(change, shortSide);
    if (indicator !== 'none') return { indicator, change, focusedPng: focused.png, clip };

    const unfocusedFull = await shoot(page);
    await page.evaluate(refocus, stop.selector);
    await page.evaluate(nextFrames);
    const focusedFull = await shoot(page);
    const whole = focusChange(unfocusedFull.image, focusedFull.image);
    const viewportChanged = whole.changed;
    return {
      indicator: classifyFocusIndicator(whole, shortSide),
      change,
      viewportChanged,
      focusedPng: focused.png,
      clip,
    };
  } finally {
    await page.evaluate(refocus, stop.selector);
  }
}
