import type { Rect } from '@clear-a11y/core';
import type { PageContext } from './types.js';

/** Pads a rect and clamps it to the page, for evidence crops that show some context. */
export function padRect(rect: Rect, pad: number, page: { width: number; height: number }): Rect {
  const x = Math.max(0, Math.floor(rect.x - pad));
  const y = Math.max(0, Math.floor(rect.y - pad));
  const right = Math.min(page.width, Math.ceil(rect.x + rect.width + pad));
  const bottom = Math.min(page.height, Math.ceil(rect.y + rect.height + pad));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/**
 * Screenshot crop around the first element matching `selector`. Returns the artifact path,
 * or undefined when screenshots are off or the element isn't visible.
 */
export async function captureElement(
  ctx: PageContext,
  selector: string,
  name: string,
  pad = 16,
): Promise<string | undefined> {
  if (!ctx.config.output.screenshots) return undefined;
  try {
    const box = await ctx.page.locator(selector).first().boundingBox({ timeout: 1_000 });
    if (!box || box.width === 0 || box.height === 0) return undefined;
    const size = await ctx.page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      sx: window.scrollX,
      sy: window.scrollY,
    }));
    const clip = padRect(
      { x: box.x + size.sx, y: box.y + size.sy, width: box.width, height: box.height },
      pad,
      size,
    );
    const data = await ctx.page.screenshot({ clip, fullPage: true, animations: 'disabled' });
    return await ctx.artifacts.save(name, data);
  } catch (err) {
    ctx.log.debug('screenshot failed', { selector, error: String(err) });
    return undefined;
  }
}
