import { gotoAndSettle, VIEWPORTS, type BrowserSession } from '@clear-a11y/browser';
import type { LinkSource } from './crawl.js';

/** Collects `a[href]` and `area[href]` from each page using a real browser. */
export function browserLinkSource(session: BrowserSession, timeoutMs = 30_000): LinkSource {
  return async (url) => {
    const { page, close } = await session.newPage(VIEWPORTS.desktop);
    try {
      await gotoAndSettle(page, url, timeoutMs);
      return await page.$$eval('a[href], area[href]', (els) =>
        els.map((e) => (e as HTMLAnchorElement).href),
      );
    } finally {
      await close();
    }
  };
}
