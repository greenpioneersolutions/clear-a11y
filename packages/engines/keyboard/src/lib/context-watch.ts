import type { Page } from '@clear-a11y/browser';
import type { FocusPressInput } from '../rules/context-change-on-focus.js';

/**
 * Watches for changes of context during the focus walk (SC 3.2.1).
 *
 * In the page, a recorder logs what each Tab press caused: the elements that received focus,
 * `window.open()` calls (answered with `null`, so no window really opens), submit events,
 * modal dialogs that appeared and the start of a navigation (`beforeunload`). The log restarts
 * on every Tab keydown, so focus changes made by the engine itself between presses (the
 * focus-indicator measurements blur and refocus) are never attributed to a press.
 *
 * Outside the page, a route answers every main-frame navigation with a local `204 No Content`,
 * so the browser stays on the page, the walk can continue and the request never reaches the
 * server. The Navigation API `navigate` event tells which press started it and where it went.
 */
export interface ContextWatch {
  /** Reads and clears the log of the press that just happened. */
  take(): Promise<FocusPressInput | null>;
  stop(): Promise<void>;
}

/** Raw log returned by the in-page recorder. */
interface RecorderLog {
  focused: { selector: string; tiny: boolean }[];
  finalSelector: string | null;
  finalRelated: boolean;
  windowsOpened: string[];
  submitted: string[];
  modalsOpened: string[];
  /** Cross-document navigations the page started (Navigation API `navigate` event). */
  navigated: string[];
  unload: boolean;
}

interface RecorderApi {
  take(): RecorderLog;
}

declare global {
  interface Window {
    __ca11yContextWatch?: RecorderApi;
  }
}

/** Installs the in-page recorder. Self-contained: serialized with `toString` by `page.evaluate`. */
export function installContextRecorder(): void {
  if (window.__ca11yContextWatch) return;
  const h = window.__clearA11y;
  if (!h) throw new Error('helpers not installed');
  const isTiny = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    return !h.isVisible(el) || r.width < 4 || r.height < 4;
  };
  const modals = (): Set<Element> =>
    new Set(
      Array.from(document.querySelectorAll('dialog, [aria-modal="true"]')).filter((d) => {
        if (d.tagName === 'DIALOG' && !d.matches(':modal')) return false;
        return h.isVisible(d);
      }),
    );
  let focused: Element[] = [];
  let opened: string[] = [];
  let submitted: string[] = [];
  let navigated: string[] = [];
  let unload = false;
  let modalsBefore = modals();
  const reset = () => {
    focused = [];
    opened = [];
    submitted = [];
    navigated = [];
    unload = false;
    modalsBefore = modals();
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') reset();
    },
    true,
  );
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.composedPath()[0] ?? e.target;
      if (!(t instanceof Element) || t.hasAttribute('data-clear-a11y-sentinel')) return;
      if (focused[focused.length - 1] !== t) focused.push(t);
    },
    true,
  );
  document.addEventListener(
    'submit',
    (e) => {
      if (e.target instanceof Element) submitted.push(h.selector(e.target));
    },
    true,
  );
  window.addEventListener('beforeunload', () => {
    unload = true;
  });
  // The Navigation API reports where a navigation goes, synchronously, while the press is still
  // being handled (Chromium). Same-document navigations (#hash, history API) are ignored here.
  const nav = (window as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('navigate', (e) => {
    const dest = (e as Event & { destination?: { url: string; sameDocument: boolean } })
      .destination;
    if (dest && !dest.sameDocument) navigated.push(dest.url);
  });
  // Record instead of opening: no real window, no request to the site.
  window.open = function (url?: string | URL): WindowProxy | null {
    opened.push(url === undefined ? '' : String(url));
    return null;
  };
  window.__ca11yContextWatch = {
    take() {
      let active: Element | null = document.activeElement;
      while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      const final = !active || active === document.body || active === document.documentElement;
      const first = focused[0];
      const related =
        !!first &&
        !!active &&
        !final &&
        (first === active || first.contains(active) || active.contains(first));
      const now = modals();
      const log: RecorderLog = {
        focused: focused.map((el) => ({ selector: h.selector(el), tiny: isTiny(el) })),
        finalSelector: final || !active ? null : h.selector(active),
        finalRelated: related,
        windowsOpened: opened,
        submitted,
        modalsOpened: Array.from(now)
          .filter((d) => !modalsBefore.has(d))
          .map((d) => h.selector(d)),
        navigated,
        unload,
      };
      reset();
      return log;
    },
  };
}

function takeLog(): RecorderLog | null {
  return window.__ca11yContextWatch?.take() ?? null;
}

/** Most time spent waiting for the route to report a navigation the page announced. */
const NAV_WAIT_MS = 300;

/** Starts watching. Call after the page (and any state) is loaded, right before the walk. */
export async function startContextWatch(page: Page): Promise<ContextWatch> {
  const navigations: string[] = [];
  const handler: Parameters<Page['route']>[1] = async (route) => {
    const req = route.request();
    let mainFrame = false;
    try {
      mainFrame = req.frame() === page.mainFrame();
    } catch {
      // Service worker requests have no frame.
    }
    // Every main-frame navigation from here on is started by the page (the engine itself never
    // navigates once the watch runs): keep the page, including a reload of the same URL.
    if (req.isNavigationRequest() && mainFrame) {
      navigations.push(req.url());
      await route.fulfill({ status: 204, body: '' }).catch(() => undefined);
      return;
    }
    await route.fallback().catch(() => undefined);
  };
  await page.route('**/*', handler);
  await page.evaluate(installContextRecorder);

  return {
    async take() {
      const log = await page.evaluate(takeLog).catch(() => null);
      if (!log) return null;
      let navs = log.navigated;
      if (!navs.length && log.unload) {
        // No Navigation API: fall back to what the route saw. The page announced a navigation
        // (beforeunload); the request may not have reached the route yet.
        const until = Date.now() + NAV_WAIT_MS;
        while (navigations.length === 0 && Date.now() < until) {
          await new Promise((r) => setTimeout(r, 20));
        }
        navs = navigations.slice(-1);
      }
      // Requests seen by the route are only a fallback; ones started by the engine's own refocus
      // between presses (focus-indicator check) must never be blamed on the next stop.
      navigations.length = 0;
      return {
        focused: log.focused,
        finalSelector: log.finalSelector,
        finalRelated: log.finalRelated,
        navigations: navs,
        windowsOpened: log.windowsOpened,
        submitted: log.submitted,
        modalsOpened: log.modalsOpened,
      };
    },
    async stop() {
      await page.unroute('**/*', handler).catch(() => undefined);
    },
  };
}
