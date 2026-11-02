/**
 * Listener spy. Installed with `page.addInitScript` (after the helpers and the announcement
 * recorder, so their own listeners are not counted) before the page's scripts run. It records
 * which event types have listeners on which targets, so probes can find shortcut keys, pointer
 * down handlers, drag/swipe handlers and motion listeners without guessing from markup.
 *
 * Delegated listeners (one listener on a parent, as React and many frameworks use) are seen on
 * the parent, not on the element; rules that need a listener on the element itself say so.
 *
 * `installListenerSpy` runs inside the page: self-contained, no imports, plain JSON results.
 */

/** What changed between `watch()` and `effects()`. */
export interface WatchEffects {
  domChanged: boolean;
  focusMoved: boolean;
  scrolled: boolean;
  navigated: boolean;
}

export interface ListenerSpy {
  /** Event types with a listener on the target (addEventListener or an on* property/attribute). */
  types(target: EventTarget | null): string[];
  /**
   * Starts watching for side effects: DOM mutations (class/style attribute changes only when
   * `withStyle`), focus moves, scrolling and URL changes.
   */
  watch(withStyle: boolean): void;
  effects(): WatchEffects;
}

declare global {
  interface Window {
    __clearA11yListeners?: ListenerSpy;
  }
}

export function installListenerSpy(): void {
  if (window.__clearA11yListeners) return;
  const WATCHED = [
    'keydown',
    'keypress',
    'keyup',
    'mousedown',
    'pointerdown',
    'touchstart',
    'mouseup',
    'pointerup',
    'touchend',
    'click',
    'dblclick',
    'mousemove',
    'pointermove',
    'touchmove',
    'dragstart',
    'drop',
    'devicemotion',
    'deviceorientation',
    'deviceorientationabsolute',
    'paste',
  ];
  const counts = new WeakMap<EventTarget, Map<string, number>>();
  const proto = EventTarget.prototype;
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;
  proto.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (listener && WATCHED.includes(type)) {
      let m = counts.get(this);
      if (!m) counts.set(this, (m = new Map()));
      m.set(type, (m.get(type) ?? 0) + 1);
    }
    return add.call(this, type, listener, options);
  };
  proto.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    const m = counts.get(this);
    if (listener && m?.has(type)) m.set(type, Math.max(0, (m.get(type) ?? 1) - 1));
    return remove.call(this, type, listener, options);
  };
  let observer: MutationObserver | null = null;
  let changed = 0;
  let styleCounts = false;
  const tally = (records: MutationRecord[]) => {
    for (const r of records) {
      if (!styleCounts && r.type === 'attributes' && /^(class|style)$/.test(r.attributeName ?? ''))
        continue;
      changed++;
    }
  };
  let start = { focus: null as Element | null, x: 0, y: 0, href: '' };
  window.__clearA11yListeners = {
    watch(withStyle) {
      observer?.disconnect();
      changed = 0;
      styleCounts = withStyle;
      observer = new MutationObserver(tally);
      observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      start = {
        focus: document.activeElement,
        x: window.scrollX,
        y: window.scrollY,
        href: location.href,
      };
    },
    effects() {
      if (observer) {
        tally(observer.takeRecords());
        observer.disconnect();
        observer = null;
      }
      return {
        domChanged: changed > 0,
        focusMoved: document.activeElement !== start.focus,
        scrolled: Math.abs(window.scrollX - start.x) + Math.abs(window.scrollY - start.y) > 2,
        navigated: location.href !== start.href,
      };
    },
    types(target) {
      if (!target) return [];
      const m = counts.get(target);
      const props = target as unknown as Record<string, unknown>;
      return WATCHED.filter((t) => (m?.get(t) ?? 0) > 0 || typeof props[`on${t}`] === 'function');
    },
  };
}
