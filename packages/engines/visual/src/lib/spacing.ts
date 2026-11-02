import { detectTextSpacingClipped, textSpacingClippedRule } from '../rules/text-spacing-clipped.js';
import { hiddenOverflow } from './clipping.js';
import { round, type VisualRun } from './context.js';
import { measureLayout, type LayoutSnapshot } from './layout.js';

/** SC 1.4.12: apply the WCAG text-spacing overrides and look for new clipping or overlap. */
export async function checkTextSpacing(run: VisualRun, base: LayoutSnapshot): Promise<void> {
  const { page } = run.ctx;
  await page.evaluate(() => window.__ca11yVisual.setTextSpacing(true));
  try {
    const after = await measureLayout(page);
    const result = detectTextSpacingClipped(base, after);
    for (const c of result.clipped) {
      const hidden = hiddenOverflow(c.after);
      await run.emit(textSpacingClippedRule, {
        selector: c.after.selector,
        message: `With WCAG text spacing applied, ${c.after.selector} cuts off ${round(Math.max(c.extra.x, c.extra.y), 0)}px of its text (fixed size with overflow hidden). People who need extra spacing lose that content.`,
        evidence: {
          data: {
            before: {
              clientHeight: c.before.clientHeight,
              scrollHeight: c.before.scrollHeight,
              clientWidth: c.before.clientWidth,
              scrollWidth: c.before.scrollWidth,
            },
            after: {
              clientHeight: c.after.clientHeight,
              scrollHeight: c.after.scrollHeight,
              clientWidth: c.after.clientWidth,
              scrollWidth: c.after.scrollWidth,
            },
            hiddenPx: hidden,
          },
        },
        screenshot: true,
      });
    }
    for (const { a, b } of result.overlaps) {
      const [text, other] = a.kind === 'text' ? [a, b] : [b, a];
      await run.emit(textSpacingClippedRule, {
        selector: text.selector,
        tier: 'likely',
        message: `With WCAG text spacing applied, text in ${text.selector} overlaps ${other.selector}, so parts of it can't be read.`,
        evidence: { data: { overlap: other.selector } },
      });
    }
  } finally {
    await page.evaluate(() => window.__ca11yVisual.setTextSpacing(false));
  }
}
