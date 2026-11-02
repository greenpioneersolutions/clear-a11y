import { ensureHelpers, type Page } from '@clear-a11y/browser';
import type { StateAction } from './descriptor.js';
import { describeKeys, pageSnapshot } from './in-page.js';
import type { Revealed } from './classify.js';
import type { StatesOptions } from './options.js';
import type { Snapshot } from './visible-set-diff.js';

/** Performs one state action on `page`, then waits `settleMs`. */
export async function performAction(
  page: Page,
  action: StateAction,
  opts: Pick<StatesOptions, 'candidateTimeoutMs' | 'settleMs'>,
): Promise<void> {
  const timeout = opts.candidateTimeoutMs;
  switch (action.type) {
    case 'click':
      await page.locator(action.selector).first().click({ timeout });
      break;
    case 'hover':
      await page.mouse.move(0, 0);
      await page.locator(action.selector).first().hover({ timeout });
      break;
    case 'focus':
      await page.locator(action.selector).first().focus({ timeout });
      break;
    case 'submit':
      for (const [selector, value] of Object.entries(action.fill)) {
        await page.locator(selector).first().fill(value, { timeout });
      }
      await page.locator(action.submit).first().click({ timeout });
      break;
  }
  if (opts.settleMs > 0) await page.waitForTimeout(opts.settleMs);
}

export async function snapshot(page: Page, maxElements: number): Promise<Snapshot> {
  await ensureHelpers(page);
  return page.evaluate(pageSnapshot, maxElements);
}

export async function describe(page: Page, keys: number[]): Promise<Revealed[]> {
  if (keys.length === 0) return [];
  await ensureHelpers(page);
  return page.evaluate(describeKeys, keys);
}

/** Reloads the explored URL (fast: no network-idle wait) and reinstalls the helpers. */
export async function reload(page: Page, url: string, timeoutMs: number): Promise<void> {
  await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
  await ensureHelpers(page);
}
