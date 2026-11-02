import { VIEWPORTS } from '@clear-a11y/browser';
import {
  detectReflowHorizontalScroll,
  reflowHorizontalScrollRule,
} from '../rules/reflow-horizontal-scroll.js';
import {
  detectReflowTwoDimensional,
  REFLOW_TWO_DIMENSIONAL_QUESTION,
  reflowTwoDimensionalRule,
} from '../rules/reflow-two-dimensional.js';
import { detectTextOverlap } from '../rules/text-overlap.js';
import { round, type VisualRun } from './context.js';
import { emitOverlaps, measureLayout, settle, type LayoutSnapshot } from './layout.js';
import type { ReflowMeasure } from './probe.js';

/** Culprits reported per page; the first few root causes are enough to fix the layout. */
const MAX_CULPRITS = 5;

/** SC 1.4.10: lay the page out at 320 x 256 CSS px and look for two-dimensional scrolling. */
export async function checkReflow(run: VisualRun, base: LayoutSnapshot): Promise<void> {
  const { page, viewport } = run.ctx;
  const { width, height } = VIEWPORTS.reflow;
  await page.setViewportSize({ width, height });
  try {
    await settle(page);
    const m: ReflowMeasure = await page.evaluate(() => window.__ca11yVisual.reflow());
    if (detectReflowHorizontalScroll(m)) {
      for (const c of m.culprits.filter((x) => x.kind === 'content').slice(0, MAX_CULPRITS)) {
        await run.emit(reflowHorizontalScrollRule, {
          selector: c.selector,
          message: `At 320 CSS px wide the page scrolls horizontally (${m.scrollWidth}px of content in a ${m.viewportWidth}px viewport) because ${c.selector} is ${round(c.box.width, 0)}px wide. People who zoom in have to scroll sideways to read every line.`,
          evidence: {
            data: {
              viewport: `${width}x${height}`,
              documentScrollWidth: m.scrollWidth,
              viewportWidth: m.viewportWidth,
              elementWidth: round(c.box.width),
              elementRight: round(c.box.x + c.box.width),
            },
          },
          screenshot: true,
        });
      }
    }
    const media =
      m.scrollWidth > m.viewportWidth + 1 ? m.culprits.filter((c) => c.kind === 'media') : [];
    for (const c of media.slice(0, MAX_CULPRITS)) {
      await run.emit(reflowTwoDimensionalRule, {
        selector: c.selector,
        message: `At 320 CSS px wide this ${c.tag} is ${round(c.box.width, 0)}px wide and makes the page scroll horizontally. That is allowed only if it needs two dimensions to be understood (a map or diagram, for example).`,
        question: REFLOW_TWO_DIMENSIONAL_QUESTION,
        evidence: { data: { viewport: `${width}x${height}`, elementWidth: round(c.box.width) } },
      });
    }
    for (const s of m.scrollers.filter(detectReflowTwoDimensional).slice(0, MAX_CULPRITS)) {
      await run.emit(reflowTwoDimensionalRule, {
        selector: s.selector,
        message: `At 320 CSS px wide ${s.selector} scrolls horizontally (${s.scrollWidth}px of content in ${s.clientWidth}px). That is allowed only for content that needs two dimensions, like a data table or map.`,
        question: REFLOW_TWO_DIMENSIONAL_QUESTION,
        evidence: {
          data: {
            viewport: `${width}x${height}`,
            clientWidth: s.clientWidth,
            scrollWidth: s.scrollWidth,
          },
        },
        screenshot: true,
      });
    }
    await emitOverlaps(
      run,
      detectTextOverlap(base.boxes, (await measureLayout(page)).boxes),
      'reflow',
    );
  } finally {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}
