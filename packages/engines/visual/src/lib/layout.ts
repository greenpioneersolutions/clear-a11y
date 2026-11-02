import type { Page } from '@clear-a11y/browser';
import type { ClipMeasure } from './clipping.js';
import type { TextBox } from './geometry.js';
import type { VisualRun } from './context.js';
import { textOverlapRule, type OverlapChange, overlapWcag } from '../rules/text-overlap.js';

/** Caps keep the O(n log n) overlap sweep fast on large pages. */
const MAX_TEXT_ELEMENTS = 400;
const MAX_CONTROLS = 200;

export interface LayoutSnapshot {
  clips: ClipMeasure[];
  boxes: TextBox[];
}

/** Waits two animation frames so style and viewport changes are laid out and painted. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function measureLayout(page: Page): Promise<LayoutSnapshot> {
  await settle(page);
  return page.evaluate(
    ([maxText, maxControls]) => ({
      clips: window.__ca11yVisual.clipping(),
      boxes: window.__ca11yVisual.textBoxes(maxText, maxControls),
    }),
    [MAX_TEXT_ELEMENTS, MAX_CONTROLS] as const,
  );
}

const CHANGE_TEXT: Record<OverlapChange, string> = {
  zoom: 'at the 200% zoom layout',
  'text-only': 'when text is enlarged to 200%',
  reflow: 'at 320 CSS px wide',
};

/** Emits visual/text-overlap for pairs that overlap after a change. */
export async function emitOverlaps(
  run: VisualRun,
  pairs: readonly { a: TextBox; b: TextBox }[],
  change: OverlapChange,
): Promise<void> {
  for (const { a, b } of pairs) {
    const [text, other] = a.kind === 'text' ? [a, b] : [b, a];
    await run.emit(textOverlapRule, {
      selector: text.selector,
      wcag: overlapWcag(change),
      message: `Text in ${text.selector} overlaps ${other.kind === 'control' ? 'the control' : 'the text in'} ${other.selector} ${CHANGE_TEXT[change]}, so parts of it can't be read.`,
      evidence: { data: { change, other: other.selector } },
    });
  }
}
