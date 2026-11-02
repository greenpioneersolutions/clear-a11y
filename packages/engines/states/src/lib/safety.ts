import type { Page } from '@clear-a11y/browser';

/**
 * Accessible names of controls the explorer never activates. Exploring must not change data on
 * the site being scanned, end the session or spend money.
 */
export const DESTRUCTIVE_NAME =
  /\b(delete|remove|erase|destroy|deactivate|close\s+account|log\s*-?\s*out|sign\s*-?\s*out|buy|pay|purchase|checkout|check\s+out|place\s+order|order\s+now|subscribe\s+now|unsubscribe|cancel\s+(my\s+)?(account|subscription|order|membership)|reset|transfer|send\s+money|donate)\b/i;

export function isDestructiveName(name: string): boolean {
  return DESTRUCTIVE_NAME.test(name.replace(/\s+/g, ' '));
}

export interface RequestInfo {
  method: string;
  url: string;
  isNavigation: boolean;
  isMainFrame: boolean;
}

const withoutHash = (u: string): string => {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.href;
  } catch {
    return u;
  }
};

/**
 * Route guard decision while exploring or replaying a state. Aborts every non-GET request (form
 * posts, API writes) and any main-frame navigation away from the page being explored (another
 * origin, path or query; a change of `#hash` only is fine). Pure.
 */
export function shouldAbort(request: RequestInfo, pageUrl: string): boolean {
  if (request.method.toUpperCase() !== 'GET' && request.method.toUpperCase() !== 'HEAD') {
    return true;
  }
  if (request.isNavigation && request.isMainFrame) {
    return withoutHash(request.url) !== withoutHash(pageUrl);
  }
  return false;
}

/** Same document? (Ignores the hash.) Pure. */
export function sameDocument(a: string, b: string): boolean {
  return withoutHash(a) === withoutHash(b);
}

const guarded = new WeakMap<Page, string>();

/**
 * Installs the route guard on `page` for `pageUrl` (idempotent). It stays for the life of the page,
 * so engines that run on a replayed state cannot post data or navigate away either.
 */
export async function installRouteGuard(page: Page, pageUrl: string): Promise<void> {
  if (guarded.get(page) === pageUrl) return;
  if (guarded.has(page)) await page.unroute('**/*').catch(() => undefined);
  guarded.set(page, pageUrl);
  await page.route('**/*', async (route) => {
    const req = route.request();
    let isMainFrame = false;
    try {
      isMainFrame = req.frame() === page.mainFrame();
    } catch {
      // Service worker requests have no frame.
    }
    const isNavigation = req.isNavigationRequest();
    const abort = shouldAbort(
      { method: req.method(), url: req.url(), isNavigation, isMainFrame },
      pageUrl,
    );
    // A blocked main-frame navigation (link, form post) is answered locally with 204 No Content:
    // browsers then stay on the current document instead of showing an error page.
    const done = !abort
      ? route.fallback()
      : isNavigation && isMainFrame
        ? route.fulfill({ status: 204, body: '' })
        : route.abort('blockedbyclient');
    await done.catch(() => undefined);
  });
}
