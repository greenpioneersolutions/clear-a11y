/**
 * Announcement recorder. Installed with `page.addInitScript` before the page's own scripts run,
 * so it sees every DOM change the way a screen reader's live-region handling would.
 *
 * `installAtRecorder` runs inside the page: it must be self-contained (no imports, no closures
 * over module scope). Everything it returns is plain JSON.
 */

export type Politeness = 'polite' | 'assertive';

export interface Announcement {
  politeness: Politeness;
  text: string;
  selector: string;
}

export interface InsertedRegion {
  selector: string;
  text: string;
  politeness: Politeness;
}

/** An element whose text changed (or that appeared) outside any live region. */
export interface ChangedElement {
  selector: string;
  text: string;
  /** Inside, or containing, a dialog, menu, listbox or tooltip. */
  isPopup: boolean;
  /** Contains links, buttons or form fields: new UI, not a message. */
  hasFocusable: boolean;
  /** Inside the control that was activated (its own label changed). */
  insideTrigger: boolean;
  /** Inside a live region (announced). */
  inLiveRegion: boolean;
  /** The focused element is this element or inside it. */
  hasFocus: boolean;
}

export type FocusKind = 'body' | 'trigger' | 'field' | 'control' | 'other';

export interface FocusInfo {
  before: string | null;
  after: string | null;
  kind: FocusKind;
}

export interface ProbeReport {
  announcements: Announcement[];
  insertedWithContent: InsertedRegion[];
  /** Elements whose visible text changed, outside live regions. */
  changedText: ChangedElement[];
  /** Elements that became visible (topmost only). */
  shown: ChangedElement[];
  /** Elements that became hidden or were removed (topmost only; removed ones have no selector). */
  hidden: ChangedElement[];
  /** True when the previous probe was undone: what it showed is hidden again and what it hid is shown again. */
  reverted: boolean;
  focus: FocusInfo;
  /** A form submitted natively (the page did not handle it); the recorder blocked the navigation. */
  nativeSubmit: boolean;
}

export interface AtRecorder {
  mark(trigger?: Element | null): void;
  quiet(quietMs: number, maxMs: number): Promise<void>;
  report(): ProbeReport;
}

declare global {
  interface Window {
    __clearA11yAt?: AtRecorder;
  }
}

export function installAtRecorder(): void {
  if (window.__clearA11yAt) return;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'BR']);
  const FOCUSABLE =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, iframe, [tabindex], [contenteditable=""], [contenteditable="true"]';
  const POPUP =
    'dialog, [role=dialog], [role=alertdialog], [aria-modal=true], [role=menu], [role=listbox], [role=tooltip], [role=tree], [role=grid]';
  const LIVE = '[aria-live], [role=status], [role=alert], [role=log], output';
  const MAX_ELEMENTS = 4000;

  const politenessOf = (el: Element): 'polite' | 'assertive' | 'off' | null => {
    const live = el.getAttribute('aria-live');
    if (live === 'polite' || live === 'assertive' || live === 'off') return live;
    const role = el.getAttribute('role');
    if (role === 'status' || role === 'log') return 'polite';
    if (role === 'alert') return 'assertive';
    if (el.tagName === 'OUTPUT') return 'polite';
    return null;
  };
  const liveRegionOf = (node: Node | null) => {
    let el: Element | null =
      node && node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : (node?.parentElement ?? null);
    while (el) {
      const p = politenessOf(el);
      if (p === 'off') return null;
      if (p) return { el, politeness: p };
      el = el.parentElement;
    }
    return null;
  };
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const visible = (el: Element): boolean => {
    if (!el.isConnected) return false;
    const he = el as HTMLElement & {
      checkVisibility?: (o: Record<string, boolean>) => boolean;
    };
    if (he.checkVisibility && !he.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const selector = (el: Element): string =>
    el.isConnected && window.__clearA11y ? window.__clearA11y.selector(el) : '';
  const elementsOf = (): Element[] =>
    Array.from(document.body ? document.body.getElementsByTagName('*') : [])
      .filter((e) => !SKIP_TAGS.has(e.tagName))
      .slice(0, MAX_ELEMENTS);
  const topmost = (els: Element[]): Element[] => {
    const set = new Set(els);
    return els.filter((e) => {
      for (let p = e.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
  };

  const state = {
    armed: false,
    lastMutation: 0,
    announcements: [] as Array<{ politeness: 'polite' | 'assertive'; text: string; el: Element }>,
    inserted: [] as Array<{ politeness: 'polite' | 'assertive'; text: string; el: Element }>,
    changed: [] as Element[],
    snapshot: new Map<Element, boolean>(),
    /** Text of every element when the probe started, to tell real changes from re-render churn. */
    textAtMark: new Map<Element, string>(),
    trigger: null as Element | null,
    focusBefore: null as Element | null,
    lastShown: [] as Element[],
    lastHidden: [] as Element[],
    prevShown: [] as Element[],
    prevHidden: [] as Element[],
    nativeSubmit: false,
  };

  const observer = new MutationObserver((records) => {
    if (!state.armed) return;
    state.lastMutation = performance.now();
    const addedRegions: Element[] = [];
    // Pass 1: live regions inserted in this batch. Screen readers only announce changes to
    // regions that already exist; a region inserted with its message is usually silent
    // (role=alert is the exception: browsers fire an alert event on insertion).
    for (const r of records) {
      for (const n of Array.from(r.addedNodes)) {
        if (n.nodeType !== Node.ELEMENT_NODE) continue;
        const el = n as Element;
        const regions = [el, ...Array.from(el.querySelectorAll(LIVE))].filter((e) => {
          const p = politenessOf(e);
          return p === 'polite' || p === 'assertive';
        });
        for (const reg of regions) {
          addedRegions.push(reg);
          const t = text(reg);
          if (!t) continue;
          const politeness = politenessOf(reg) as 'polite' | 'assertive';
          if (reg.getAttribute('role') === 'alert')
            state.announcements.push({ politeness: 'assertive', text: t, el: reg });
          else state.inserted.push({ politeness, text: t, el: reg });
        }
      }
    }
    // Pass 2: text changes. Inside an existing live region: announced. Elsewhere: silent.
    const announced = new Set<Element>();
    for (const r of records) {
      const live = liveRegionOf(r.target);
      if (live) {
        if (addedRegions.some((a) => a === live.el || a.contains(live.el) || live.el.contains(a)))
          continue;
        if (announced.has(live.el)) continue;
        announced.add(live.el);
        const t = text(live.el);
        if (t)
          state.announcements.push({
            politeness: live.politeness as 'polite' | 'assertive',
            text: t,
            el: live.el,
          });
        continue;
      }
      if (r.type === 'characterData') {
        if (r.target.parentElement) state.changed.push(r.target.parentElement);
        continue;
      }
      for (const n of Array.from(r.addedNodes)) {
        if (n.nodeType === Node.ELEMENT_NODE) state.changed.push(n as Element);
        else if (n.nodeType === Node.TEXT_NODE && r.target.nodeType === Node.ELEMENT_NODE)
          state.changed.push(r.target as Element);
      }
    }
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true });

  window.addEventListener('submit', (event) => {
    if (!state.armed || event.defaultPrevented) return;
    // The page did not handle the submit itself. Block the navigation so the probe stays on
    // this document; server-side validation can't be observed here anyway.
    event.preventDefault();
    state.nativeSubmit = true;
  });

  const describe = (el: Element, focused: Element | null) => {
    // Inside a live region, or wrapping one (an inserted region shows up as its container).
    const inLive =
      liveRegionOf(el) !== null ||
      Array.from(el.querySelectorAll(LIVE)).some((r) => {
        const p = politenessOf(r);
        return (p === 'polite' || p === 'assertive') && text(r) !== '';
      });
    return {
      selector: selector(el),
      text: text(el),
      isPopup: el.closest(POPUP) !== null || el.querySelector(POPUP) !== null,
      hasFocusable: el.matches(FOCUSABLE) || el.querySelector(FOCUSABLE) !== null,
      insideTrigger: !!state.trigger && (state.trigger === el || state.trigger.contains(el)),
      inLiveRegion: inLive,
      hasFocus: !!focused && (focused === el || el.contains(focused)),
    };
  };

  /**
   * True when the element (or, for an element created during the probe, its nearest ancestor
   * that already existed) shows the same text as before the probe. Frameworks such as Preact
   * and React rewrite text nodes on every render ("0" -> "0", "" -> ""): that is not a message.
   */
  const unchangedSinceMark = (el: Element): boolean => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const before = state.textAtMark.get(n);
      if (before !== undefined) return before === text(n);
    }
    return false;
  };

  const focusKind = (el: Element | null): FocusKind => {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    if (state.trigger && el === state.trigger) return 'trigger';
    if (
      el.matches('textarea, select, input:not([type=submit]):not([type=button]):not([type=reset])')
    )
      return 'field';
    if (el.matches('a[href], button, input, summary, [role=button], [role=link]')) return 'control';
    return 'other';
  };

  const recorder: AtRecorder = {
    mark(trigger) {
      state.prevShown = state.lastShown;
      state.prevHidden = state.lastHidden;
      state.announcements = [];
      state.inserted = [];
      state.changed = [];
      state.nativeSubmit = false;
      state.trigger = trigger ?? null;
      state.focusBefore = document.activeElement;
      const els = elementsOf();
      state.snapshot = new Map(els.map((e) => [e, visible(e)]));
      state.textAtMark = new Map(els.map((e) => [e, text(e)]));
      state.lastMutation = performance.now();
      state.armed = true;
    },
    quiet(quietMs, maxMs) {
      const start = performance.now();
      return new Promise<void>((resolve) => {
        const tick = () => {
          const now = performance.now();
          if (
            now - start >= maxMs ||
            (now - start >= quietMs && now - state.lastMutation >= quietMs)
          )
            resolve();
          else setTimeout(tick, 25);
        };
        tick();
      });
    },
    report() {
      const focused = document.activeElement;
      const now = elementsOf();
      const shownEls = topmost(
        now.filter(
          (e) =>
            visible(e) &&
            state.snapshot.get(e) !== true &&
            text(e) !== '' &&
            // Shown again after being hidden counts; a re-created copy of unchanged text doesn't.
            (state.snapshot.has(e) || !unchangedSinceMark(e)),
        ),
      );
      const hiddenEls = topmost(
        Array.from(state.snapshot.entries())
          .filter(([e, was]) => was && !visible(e))
          .map(([e]) => e),
      );
      // Undone means both halves are undone: what was shown is hidden again AND what was hidden is
      // shown again. A carousel's Next button (A -> B, then B -> C) hides what it showed but never
      // brings A back, so it is not a toggle.
      const reverted =
        state.prevShown.length + state.prevHidden.length > 0 &&
        state.prevShown.every((e) => !visible(e)) &&
        state.prevHidden.every((e) => visible(e));
      state.lastShown = shownEls;
      state.lastHidden = hiddenEls;
      const changed = topmost(
        Array.from(new Set(state.changed)).filter(
          (e) => e.isConnected && visible(e) && text(e) && !unchangedSinceMark(e),
        ),
      );
      const out: ProbeReport = {
        announcements: state.announcements.map((a) => ({
          politeness: a.politeness,
          text: a.text,
          selector: selector(a.el),
        })),
        insertedWithContent: state.inserted
          .filter((a) => a.el.isConnected)
          .map((a) => ({ politeness: a.politeness, text: a.text, selector: selector(a.el) })),
        changedText: changed.map((e) => describe(e, focused)),
        shown: shownEls.map((e) => describe(e, focused)),
        hidden: hiddenEls.map((e) => describe(e, focused)),
        reverted,
        focus: {
          before: state.focusBefore ? selector(state.focusBefore) : null,
          after: focused ? selector(focused) : null,
          kind: focusKind(focused),
        },
        nativeSubmit: state.nativeSubmit,
      };
      state.armed = false;
      return out;
    },
  };
  Object.defineProperty(window, '__clearA11yAt', { value: recorder, configurable: true });
}
