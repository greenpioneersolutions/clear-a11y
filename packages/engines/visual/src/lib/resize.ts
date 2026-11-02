import { detectTextOverlap } from '../rules/text-overlap.js';
import {
  detectTextResizeClipped,
  textResizeClippedRule,
  type ResizeMode,
} from '../rules/text-resize-clipped.js';
import { round, type VisualRun } from './context.js';
import { emitOverlaps, measureLayout, type LayoutSnapshot } from './layout.js';

/** Zoom-equivalent check only makes sense from a desktop-sized baseline. */
const MIN_ZOOM_BASELINE_WIDTH = 1024;

async function report(
  run: VisualRun,
  base: LayoutSnapshot,
  after: LayoutSnapshot,
  mode: ResizeMode,
) {
  for (const c of detectTextResizeClipped(base.clips, after.clips, mode)) {
    const how =
      mode === 'zoom'
        ? 'At the 200% zoom layout (half the viewport width)'
        : 'With every font size doubled (text-only resize)';
    await run.emit(textResizeClippedRule, {
      selector: c.after.selector,
      tier: c.tier,
      message: `${how}, ${c.after.selector} cuts off ${round(Math.max(c.extra.x, c.extra.y), 0)}px of its text because its size is fixed and overflow is hidden.`,
      evidence: {
        data: {
          mode,
          before: {
            clientWidth: c.before.clientWidth,
            clientHeight: c.before.clientHeight,
            scrollWidth: c.before.scrollWidth,
            scrollHeight: c.before.scrollHeight,
          },
          after: {
            clientWidth: c.after.clientWidth,
            clientHeight: c.after.clientHeight,
            scrollWidth: c.after.scrollWidth,
            scrollHeight: c.after.scrollHeight,
          },
        },
      },
      screenshot: true,
    });
  }
  await emitOverlaps(run, detectTextOverlap(base.boxes, after.boxes), mode);
}

/**
 * SC 1.4.4. (a) 200% zoom equivalent: browser zoom halves the CSS viewport, so lay the page out
 * at half the width and height. (b) Text-only resize: double every element's computed font size.
 */
export async function checkTextResize(run: VisualRun, base: LayoutSnapshot): Promise<void> {
  const { page, viewport } = run.ctx;
  if (viewport.width >= MIN_ZOOM_BASELINE_WIDTH) {
    await page.setViewportSize({
      width: Math.round(viewport.width / 2),
      height: Math.round(viewport.height / 2),
    });
    try {
      await report(run, base, await measureLayout(page), 'zoom');
    } finally {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    }
  }
  await page.evaluate(() => window.__ca11yVisual.scaleFonts(2));
  try {
    await report(run, base, await measureLayout(page), 'text-only');
  } finally {
    await page.evaluate(() => window.__ca11yVisual.restoreFonts());
  }
}
