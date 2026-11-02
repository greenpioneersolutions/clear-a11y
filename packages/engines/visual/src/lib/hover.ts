import type { Page } from '@clear-a11y/browser';
import {
  detectHoverContentNotDismissible,
  hoverContentNotDismissibleRule,
} from '../rules/hover-content-not-dismissible.js';
import {
  detectHoverContentNotHoverable,
  hoverContentNotHoverableRule,
} from '../rules/hover-content-not-hoverable.js';
import {
  detectHoverContentNotPersistent,
  hoverContentNotPersistentRule,
} from '../rules/hover-content-not-persistent.js';
import type { VisualRun } from './context.js';
import type { HoverTrigger, NewContent } from './probe.js';

/** Time for show delays and transitions after hover or focus. */
const OPEN_WAIT_MS = 400;
const SETTLE_MS = 200;
/** Rough cost of one trigger, used against the time budget. */
const TRIGGER_COST_MS = 3_000;

type Mode = 'hover' | 'focus';

const probe = <T>(page: Page, fn: () => T): Promise<T> => page.evaluate(fn);

async function reset(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
  await probe(page, () => window.__ca11yVisual.blur());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS);
}

/** Opens the trigger and returns the content that appeared (relative to the snapshot before). */
async function open(page: Page, t: HoverTrigger, mode: Mode): Promise<NewContent[]> {
  const box = await page.evaluate((id) => window.__ca11yVisual.viewportBox(id), t.id);
  if (!box) return [];
  await page.waitForTimeout(100);
  await probe(page, () => window.__ca11yVisual.snapshotVisible());
  if (mode === 'hover') {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  } else {
    await page.evaluate((id) => window.__ca11yVisual.focus(id), t.id);
  }
  await page.waitForTimeout(OPEN_WAIT_MS);
  return probe(page, () => window.__ca11yVisual.newlyVisible());
}

const stillShown = async (page: Page): Promise<boolean> =>
  (await probe(page, () => window.__ca11yVisual.newlyVisible())).length > 0;

async function testTrigger(run: VisualRun, t: HoverTrigger): Promise<void> {
  const { page } = run.ctx;
  let mode: Mode = 'hover';
  let content = await open(page, t, mode);
  if (!content.length) {
    await reset(page);
    mode = 'focus';
    content = await open(page, t, mode);
  }
  if (!content.length) return;
  const how = mode === 'hover' ? 'hovering' : 'focusing';
  const contentSel = content.map((c) => c.selector).join(', ');
  const data = { trigger: t.selector, content: contentSel, mode, source: t.source };

  // Persistent: stays without any interaction.
  await page.waitForTimeout(run.config.hoverPersistMs);
  const persisted = await stillShown(page);
  if (detectHoverContentNotPersistent({ appeared: true, visibleAfterWait: persisted })) {
    await run.emit(hoverContentNotPersistentRule, {
      selector: t.selector,
      message: `Content that appears when ${how} ${t.selector} (${contentSel}) disappears within ${run.config.hoverPersistMs}ms although the ${mode === 'hover' ? 'pointer' : 'focus'} has not moved. Slow readers lose it.`,
      evidence: { data: { ...data, waitedMs: run.config.hoverPersistMs } },
    });
    await reset(page);
    content = await open(page, t, mode);
    if (!content.length) return;
  }

  // Dismissible: Escape hides it without moving pointer or focus.
  const obscures = content.some((c) => c.obscures);
  const isError = content.every((c) => c.isError);
  if (obscures && !isError) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_MS);
    const visibleAfterEscape = await stillShown(page);
    if (detectHoverContentNotDismissible({ obscures, isError, visibleAfterEscape })) {
      await run.emit(hoverContentNotDismissibleRule, {
        selector: t.selector,
        message: `Content that appears when ${how} ${t.selector} (${contentSel}) covers other content and does not close when Escape is pressed. People using magnification can't see what it hides without moving away.`,
        evidence: { data: { ...data, pressed: 'Escape' } },
        screenshot: true,
      });
    }
  }

  // Hoverable: the pointer can move from the trigger onto the content. Content that already hid
  // itself failed persistence; its timer would make this result meaningless.
  if (mode !== 'hover' || !persisted) return;
  await reset(page);
  const box = await page.evaluate((id) => window.__ca11yVisual.viewportBox(id), t.id);
  content = await open(page, t, 'hover');
  const target = content[0];
  if (!target || !box) return;
  const scroll = await probe(page, () => ({ x: window.scrollX, y: window.scrollY }));
  const dest = { ...target.box, x: target.box.x - scroll.x, y: target.box.y - scroll.y };
  // Like a person: head for the nearest edge of the content first, then into it.
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const edge = {
    x: Math.min(Math.max(start.x, dest.x + 1), dest.x + dest.width - 1),
    y: Math.min(Math.max(start.y, dest.y + 1), dest.y + dest.height - 1),
  };
  await page.mouse.move(edge.x, edge.y, { steps: 8 });
  await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, { steps: 4 });
  await page.waitForTimeout(SETTLE_MS);
  const onContent = await stillShown(page);
  if (
    detectHoverContentNotHoverable({
      appearedOnHover: true,
      visibleWhenPointerOnContent: onContent,
    })
  ) {
    await run.emit(hoverContentNotHoverableRule, {
      selector: t.selector,
      message: `Content that appears when hovering ${t.selector} (${target.selector}) disappears when the pointer moves onto it. People using screen magnifiers can't read it.`,
      evidence: { data },
    });
  }
}

/** SC 1.4.13: exercise likely hover/focus triggers and test the three requirements. */
export async function checkHoverContent(run: VisualRun): Promise<void> {
  const { page } = run.ctx;
  const triggers: HoverTrigger[] = await page.evaluate(
    (max) => window.__ca11yVisual.hoverTriggers(max),
    run.config.maxHoverTriggers,
  );
  for (const t of triggers) {
    if (run.timeLeft() < TRIGGER_COST_MS + run.config.hoverPersistMs) {
      run.ctx.log.debug('engine-visual: hover budget exhausted', { trigger: t.selector });
      break;
    }
    try {
      await testTrigger(run, t);
    } finally {
      await reset(page);
    }
  }
}
