import { ensureHelpers, type Page } from '@clear-a11y/browser';
import type { ClipMeasure } from './clipping.js';
import type { Box, TextBox } from './geometry.js';

export interface ReflowCulprit {
  id: number;
  selector: string;
  box: Box;
  tag: string;
  /** "exempt" = SC 1.4.10 two-dimensional exception (table, pre, code...); "media" = image-like. */
  kind: 'content' | 'exempt' | 'media';
}

export interface ReflowScroller {
  id: number;
  selector: string;
  box: Box;
  clientWidth: number;
  scrollWidth: number;
  /** Contains a data table, code, map, media or toolbar: covered by the SC exception. */
  exempt: boolean;
}

export interface ReflowMeasure {
  viewportWidth: number;
  scrollWidth: number;
  culprits: ReflowCulprit[];
  scrollers: ReflowScroller[];
}

export interface TargetInfo {
  id: number;
  selector: string;
  box: Box;
  /** Ids of targets that contain this one. */
  ancestors: number[];
  exempt?: 'inline' | 'user-agent';
  /** Matches a configured "equivalent control elsewhere" selector. */
  equivalent: boolean;
  html: string;
}

export interface ContrastCandidate {
  id: number;
  selector: string;
  clip: Box;
  color: string;
  opacity: number;
  fontSize: number;
  fontWeight: number;
  /**
   * Why axe-core can't settle the contrast: `background-image` (image or gradient behind the
   * text), `overlap` (other painted content between the text and its background, or the text's
   * box drawn over other content, like a tooltip), `obscured` (another element covers part of the
   * text).
   */
  reason: 'background-image' | 'overlap' | 'obscured';
  text: string;
}

export interface NonTextCandidate {
  id: number;
  selector: string;
  box: Box;
  borders: { top: number; right: number; bottom: number; left: number };
  kind: 'input' | 'icon-button';
}

export interface HoverTrigger {
  id: number;
  selector: string;
  source: 'css' | 'describedby' | 'data-attr';
}

export interface NewContent {
  id: number;
  selector: string;
  box: Box;
  /** Out of flow (absolute/fixed) and drawn over other text or controls. */
  obscures: boolean;
  /** Communicates an input error (role=alert): exempt from the dismissible requirement. */
  isError: boolean;
}

/** In-page API installed as `window.__ca11yVisual`. */
export interface VisualProbe {
  clipping(): ClipMeasure[];
  textBoxes(maxText: number, maxControls: number): TextBox[];
  reflow(): ReflowMeasure;
  targets(equivalentSelectors: string[]): TargetInfo[];
  contrastCandidates(max: number): ContrastCandidate[];
  nonTextCandidates(max: number): NonTextCandidate[];
  hoverTriggers(max: number): HoverTrigger[];
  /** Scrolls the element into view and returns its viewport box. */
  viewportBox(id: number): Box | undefined;
  focus(id: number): void;
  blur(): void;
  setHidden(id: number, hidden: boolean): void;
  scaleFonts(factor: number): void;
  restoreFonts(): void;
  setTextSpacing(on: boolean): void;
  snapshotVisible(): void;
  newlyVisible(): NewContent[];
  visibleIds(ids: number[]): boolean[];
}

declare global {
  interface Window {
    /** Installed by `ensureProbe(page)` before any engine code calls it. */
    __ca11yVisual: VisualProbe;
  }
}

/**
 * Runs inside the page. Must be self-contained: no imports, no closures over module scope.
 * Requires `window.__clearA11y` (ensureHelpers) for selectors and visibility.
 */
export function installVisualProbe(): void {
  if (Object.prototype.hasOwnProperty.call(window, '__ca11yVisual')) return;
  // ensureProbe() installs the shared helpers first.
  const H = window.__clearA11y as NonNullable<Window['__clearA11y']>;
  const ids = new WeakMap<Element, number>();
  const byId = new Map<number, Element>();
  let next = 1;
  const idOf = (el: Element): number => {
    let id = ids.get(el);
    if (id === undefined) {
      id = next++;
      ids.set(el, id);
      byId.set(id, el);
    }
    return id;
  };
  const pageBox = (r: DOMRect | DOMRectReadOnly): Box => ({
    x: r.x + window.scrollX,
    y: r.y + window.scrollY,
    width: r.width,
    height: r.height,
  });
  const all = (): Element[] => Array.from(document.body.querySelectorAll('*'));
  const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'TITLE']);
  const INTERACTIVE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [onclick], ' +
    '[role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], ' +
    '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], [role="option"]';

  /** Hidden for sighted users even though it may have a box: opacity 0 or visually-hidden clipping. */
  const renderCache = new Map<Element, boolean>();
  /**
   * The open modal, if any. Content outside it is inert and sits behind the backdrop, so it is
   * not what a sighted user is looking at in this state and must not be measured.
   */
  const openModal = (): Element | null => {
    const native = document.querySelector('dialog:modal');
    if (native) return native;
    return (
      Array.from(document.querySelectorAll('[aria-modal="true"]')).find((m) => {
        const r = m.getBoundingClientRect();
        const cs = getComputedStyle(m);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      }) ?? null
    );
  };
  const isRendered = (el: Element | null): boolean => {
    if (el && el.closest('[inert]')) return false;
    const modal = el ? openModal() : null;
    if (el && modal && !modal.contains(el) && !el.contains(modal)) return false;
    return isRenderedInPage(el);
  };
  /**
   * True when `parent` doesn't render `child`: a closed `<details>` renders only its summary
   * (Chrome lays the rest out under `content-visibility: hidden`, so boxes can look real), and
   * `content-visibility: hidden` (also `hidden="until-found"`) skips an element's contents.
   */
  const contentsSkipped = (parent: Element | null, child: Element): boolean => {
    if (!parent) return false;
    if (parent instanceof HTMLDetailsElement && !parent.open)
      return parent.querySelector(':scope > summary') !== child;
    return getComputedStyle(parent).contentVisibility === 'hidden';
  };
  const isRenderedInPage = (el: Element | null): boolean => {
    if (!el || el === document.documentElement) return true;
    const cached = renderCache.get(el);
    if (cached !== undefined) return cached;
    const cs = getComputedStyle(el);
    let ok = true;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) ok = false;
    else if (
      cs.overflow !== 'visible' &&
      (el as HTMLElement).clientWidth <= 2 &&
      (el as HTMLElement).clientHeight <= 2
    )
      ok = false;
    else if (cs.clip && cs.clip !== 'auto' && /rect\(\s*0/.test(cs.clip)) ok = false;
    else if (/inset\(\s*50%/.test(cs.clipPath)) ok = false;
    else if (contentsSkipped(el.parentElement, el)) ok = false;
    else ok = isRenderedInPage(el.parentElement);
    renderCache.set(el, ok);
    return ok;
  };

  const ownText = (el: Element): Text[] =>
    Array.from(el.childNodes).filter(
      (n): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
    );

  /** True when the viewport point lies on one of the element's own text line boxes. */
  const ownTextAt = (el: Element, x: number, y: number): boolean =>
    ownText(el).some((t) => {
      const range = document.createRange();
      range.selectNodeContents(t);
      return Array.from(range.getClientRects()).some(
        (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
      );
    });

  const hasVisibleText = (el: Element): boolean => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || SKIP_TEXT.has(parent.tagName)) continue;
      if ((n.textContent ?? '').trim() && H.isVisible(parent)) return true;
    }
    return false;
  };

  const clips = (v: string) => v === 'hidden' || v === 'clip';
  /** Contains a running animation that lasts more than five seconds (or forever). */
  const scrollsForever = (el: Element): boolean =>
    el.getAnimations({ subtree: true }).some((a) => {
      if (a.playState !== 'running') return false;
      const d = a.effect?.getComputedTiming().activeDuration;
      return typeof d === 'number' && (!Number.isFinite(d) || d > 5000);
    });

  const clipping = (): ClipMeasure[] => {
    renderCache.clear();
    const out: ClipMeasure[] = [];
    for (const el of all()) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.matches('input, select, textarea, iframe, video, canvas, img, svg, svg *')) continue;
      const cs = getComputedStyle(el);
      const cx = clips(cs.overflowX);
      const cy = clips(cs.overflowY);
      if (!cx && !cy) continue;
      if (el.clientWidth <= 2 || el.clientHeight <= 2) continue;
      if (!isRendered(el) || !H.isVisible(el) || !hasVisibleText(el)) continue;
      // A marquee or ticker clips its moving content by design, and the content's position
      // changes between measurements; visual/motion-without-pause (2.2.2) reports it instead.
      if (scrollsForever(el)) continue;
      out.push({
        id: idOf(el),
        selector: H.selector(el),
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        scrollWidth: cx ? el.scrollWidth : el.clientWidth,
        scrollHeight: cy ? el.scrollHeight : el.clientHeight,
        ellipsis: cs.textOverflow === 'ellipsis',
      });
    }
    return out;
  };

  /** Nearest ancestor (or self) that clips or scrolls its content, excluding the viewport. */
  const clipBoxOf = (el: Element): Box | undefined => {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const r = n.getBoundingClientRect();
        return pageBox(r);
      }
    }
    return undefined;
  };
  const intersect = (a: Box, b: Box): Box | undefined => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.width, b.x + b.width) - x;
    const h = Math.min(a.y + a.height, b.y + b.height) - y;
    return w > 0 && h > 0 ? { x, y, width: w, height: h } : undefined;
  };
  const fixedCache = new Map<Element, boolean>();
  const inFixed = (el: Element | null): boolean => {
    if (!el || el === document.body) return false;
    const c = fixedCache.get(el);
    if (c !== undefined) return c;
    const p = getComputedStyle(el).position;
    const v = p === 'fixed' || p === 'sticky' || inFixed(el.parentElement);
    fixedCache.set(el, v);
    return v;
  };
  const ancestorIds = (el: Element): number[] => {
    const out: number[] = [];
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) out.push(idOf(n));
    return out;
  };

  const textBoxes = (maxText: number, maxControls: number): TextBox[] => {
    renderCache.clear();
    fixedCache.clear();
    const out: TextBox[] = [];
    const parents = new Map<Element, Text[]>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || SKIP_TEXT.has(p.tagName) || p.closest('svg')) continue;
      if (!(n.textContent ?? '').trim()) continue;
      const list = parents.get(p) ?? [];
      list.push(n as Text);
      parents.set(p, list);
    }
    let count = 0;
    for (const [el, texts] of parents) {
      if (count >= maxText) break;
      if (!isRendered(el) || inFixed(el)) continue;
      const clip = clipBoxOf(el);
      const rects: Box[] = [];
      for (const t of texts) {
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width < 1 || r.height < 1) continue;
          const b = pageBox(r);
          const c = clip ? intersect(b, clip) : b;
          if (c) rects.push(c);
        }
      }
      if (!rects.length) continue;
      count++;
      out.push({
        id: idOf(el),
        selector: H.selector(el),
        kind: 'text',
        rects,
        ancestors: ancestorIds(el),
      });
    }
    let controls = 0;
    for (const el of Array.from(document.body.querySelectorAll(INTERACTIVE))) {
      if (controls >= maxControls) break;
      if (!isRendered(el) || inFixed(el) || !H.isVisible(el)) continue;
      const clip = clipBoxOf(el.parentElement ?? el);
      // One box per line fragment: an inline link that wraps onto a second line has a bounding box
      // spanning both lines' full width, which would "overlap" the text beside it on each line.
      const rects = Array.from(el.getClientRects())
        .filter((r) => r.width >= 1 && r.height >= 1)
        .map((r) => {
          const b = pageBox(r);
          return clip ? intersect(b, clip) : b;
        })
        .filter((c): c is Box => !!c);
      if (!rects.length) continue;
      controls++;
      out.push({
        id: idOf(el),
        selector: H.selector(el),
        kind: 'control',
        rects,
        ancestors: ancestorIds(el),
      });
    }
    return out;
  };

  const EXEMPT_2D =
    'table, pre, code, [role="grid"], [role="table"], [role="treegrid"], [role="toolbar"], [role="application"], math';
  const MEDIA = 'img, svg, canvas, video, iframe, object, embed, map, picture, [role="img"]';

  const reflow = (): ReflowMeasure => {
    renderCache.clear();
    const de = document.documentElement;
    const vw = de.clientWidth;
    const scrollWidth = Math.max(de.scrollWidth, document.body.scrollWidth);
    const culprits: ReflowCulprit[] = [];
    const scrollers: ReflowScroller[] = [];
    const containedCache = new Map<Element, boolean>();
    /** True when an ancestor below body contains horizontal overflow (scrolls or clips). */
    const contained = (el: Element | null): boolean => {
      if (!el || el === document.body || el === de) return false;
      const c = containedCache.get(el);
      if (c !== undefined) return c;
      const v = getComputedStyle(el).overflowX !== 'visible' || contained(el.parentElement);
      containedCache.set(el, v);
      return v;
    };
    const overflowsRight = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right + window.scrollX > vw + 1;
    };
    for (const el of all()) {
      const cs = getComputedStyle(el);
      if (
        el instanceof HTMLElement &&
        (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
        el.scrollWidth > el.clientWidth + 1 &&
        el.clientWidth > 2 &&
        isRendered(el) &&
        !el.matches('textarea, select')
      ) {
        scrollers.push({
          id: idOf(el),
          selector: H.selector(el),
          box: pageBox(el.getBoundingClientRect()),
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          exempt:
            el.matches(`${EXEMPT_2D}, ${MEDIA}`) || !!el.querySelector(`${EXEMPT_2D}, ${MEDIA}`),
        });
      }
      if (cs.position === 'fixed' || !H.isVisible(el) || !isRendered(el)) continue;
      if (!overflowsRight(el) || contained(el.parentElement)) continue;
      const parent = el.parentElement;
      if (parent && parent !== document.body && overflowsRight(parent)) continue;
      const kind = el.closest(EXEMPT_2D) ? 'exempt' : el.closest(MEDIA) ? 'media' : 'content';
      culprits.push({
        id: idOf(el),
        selector: H.selector(el),
        box: pageBox(el.getBoundingClientRect()),
        tag: el.tagName.toLowerCase(),
        kind,
      });
    }
    return { viewportWidth: vw, scrollWidth, culprits, scrollers };
  };

  /** Size of a control as the browser draws it with no author styles (SC 2.5.8 exception). */
  const uaSizeCache = new Map<string, { w: number; h: number }>();
  const uaSize = (el: Element): { w: number; h: number } | undefined => {
    if (!el.matches('input, select')) return undefined;
    const key = `${el.tagName}:${(el as HTMLInputElement).type ?? ''}`;
    const hit = uaSizeCache.get(key);
    if (hit) return hit;
    const host = document.createElement('div');
    host.setAttribute('style', 'all: initial; position: absolute; left: -9999px; top: 0;');
    const root = host.attachShadow({ mode: 'open' });
    const probe = document.createElement(el.tagName.toLowerCase());
    if (el instanceof HTMLInputElement) probe.setAttribute('type', el.type);
    root.appendChild(probe);
    document.body.appendChild(host);
    const r = probe.getBoundingClientRect();
    host.remove();
    const size = { w: r.width, h: r.height };
    uaSizeCache.set(key, size);
    return size;
  };

  const targets = (equivalentSelectors: string[]): TargetInfo[] => {
    renderCache.clear();
    const els = Array.from(document.body.querySelectorAll(INTERACTIVE)).filter((el) => {
      if (!H.isVisible(el) || !isRendered(el)) return false;
      if (el.closest('[aria-hidden="true"], [inert]')) return false;
      if ((el as HTMLButtonElement).disabled) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    const set = new Set(els);
    const blockOf = (el: Element): Element => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (!getComputedStyle(n).display.startsWith('inline')) return n;
      }
      return document.body;
    };
    /** Text in the surrounding block that is not inside a target: "inline in a sentence". */
    const inSentence = (el: Element): boolean => {
      const block = blockOf(el);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!(n.textContent ?? '').trim()) continue;
        const p = n.parentElement;
        if (!p || SKIP_TEXT.has(p.tagName)) continue;
        if (p.closest(INTERACTIVE)) continue;
        return true;
      }
      return false;
    };
    return els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      let exempt: TargetInfo['exempt'];
      if (cs.display === 'inline' && inSentence(el)) exempt = 'inline';
      else {
        const ua = uaSize(el);
        if (ua && Math.abs(ua.w - r.width) < 0.5 && Math.abs(ua.h - r.height) < 0.5)
          exempt = 'user-agent';
      }
      const ancestors: number[] = [];
      for (let n = el.parentElement; n; n = n.parentElement)
        if (set.has(n)) ancestors.push(idOf(n));
      return {
        id: idOf(el),
        selector: H.selector(el),
        box: pageBox(r),
        ancestors,
        ...(exempt ? { exempt } : {}),
        equivalent: equivalentSelectors.some((s) => {
          try {
            return el.matches(s);
          } catch {
            return false;
          }
        }),
        html: H.snippet(el, 160),
      };
    });
  };

  const hasBgImage = (cs: CSSStyleDeclaration) =>
    cs.backgroundImage && cs.backgroundImage !== 'none';
  const alphaOf = (color: string): number => {
    const m = /rgba?\(([^)]+)\)/.exec(color);
    if (!m) return color === 'transparent' ? 0 : 1;
    const a = (m[1] ?? '').split(/[\s,/]+/).filter(Boolean)[3];
    return a === undefined ? 1 : Number(a.replace('%', '')) / (a.endsWith('%') ? 100 : 1);
  };

  /** Why the text's background is not one solid color, or undefined when it is (axe covers that). */
  const nonSolidReason = (
    el: Element,
    at: { x: number; y: number },
  ): ContrastCandidate['reason'] | undefined => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (hasBgImage(cs)) return 'background-image';
      if (alphaOf(cs.backgroundColor) >= 1) break;
    }
    const stack = document.elementsFromPoint(at.x, at.y);
    const start = stack.indexOf(el);
    if (start < 0) return undefined;
    for (const n of stack.slice(start + 1)) {
      const cs = getComputedStyle(n);
      if (n.contains(el)) {
        if (hasBgImage(cs)) return 'background-image';
        if (alphaOf(cs.backgroundColor) >= 1) return undefined;
        continue;
      }
      if (n.matches(MEDIA) || hasBgImage(cs) || alphaOf(cs.backgroundColor) > 0) return 'overlap';
    }
    return undefined;
  };

  const inViewport = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;

  /** True when another element (not the text's own element, content or ancestors) covers part of its text. */
  const textObscured = (el: Element, texts: Text[]): boolean => {
    let samples = 0;
    for (const t of texts) {
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1 || r.height < 1) continue;
        for (const fx of [0.1, 0.5, 0.9]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height / 2;
          if (!inViewport(x, y)) continue;
          if (++samples > 30) return false;
          const top = document.elementFromPoint(x, y);
          if (top && top !== el && !el.contains(top) && !top.contains(el)) return true;
        }
      }
    }
    return false;
  };

  /**
   * True when the element's box is drawn over content that is not one of its ancestors (an
   * absolutely positioned tooltip or popover over the page). axe-core gives up on those ("partially
   * overlaps other elements") even when the element paints its own solid background.
   */
  const drawnOverContent = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    for (const [fx, fy] of [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.5, 0.5],
      [0.1, 0.9],
      [0.9, 0.9],
    ] as const) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (!inViewport(x, y)) continue;
      const stack = document.elementsFromPoint(x, y);
      const i = stack.indexOf(el);
      if (i < 0) continue;
      if (stack.slice(i + 1).some((n) => !n.contains(el) && !el.contains(n))) return true;
    }
    return false;
  };

  const contrastCandidates = (max: number): ContrastCandidate[] => {
    renderCache.clear();
    const out: ContrastCandidate[] = [];
    const sx = window.scrollX;
    const sy = window.scrollY;
    for (const el of all()) {
      if (out.length >= max) break;
      if (SKIP_TEXT.has(el.tagName) || el.closest('svg')) continue;
      const texts = ownText(el);
      if (!texts.length || !H.isVisible(el) || !isRendered(el)) continue;
      const cs = getComputedStyle(el);
      if (alphaOf(cs.color) === 0 || alphaOf(cs.webkitTextFillColor || cs.color) === 0) continue;
      if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') continue;
      let union: Box | undefined;
      for (const t of texts) {
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width < 1 || r.height < 1) continue;
          const b = pageBox(r);
          union = union
            ? {
                x: Math.min(union.x, b.x),
                y: Math.min(union.y, b.y),
                width: Math.max(union.x + union.width, b.x + b.width) - Math.min(union.x, b.x),
                height: Math.max(union.y + union.height, b.y + b.height) - Math.min(union.y, b.y),
              }
            : b;
        }
      }
      if (!union) continue;
      const first = document.createRange();
      first.selectNodeContents(texts[0] as Text);
      const fr = first.getClientRects()[0];
      if (!fr) continue;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const fr2 = first.getClientRects()[0] ?? fr;
      const reason =
        nonSolidReason(el, { x: fr2.x + fr2.width / 2, y: fr2.y + fr2.height / 2 }) ??
        (textObscured(el, texts) ? 'obscured' : drawnOverContent(el) ? 'overlap' : undefined);
      if (!reason) continue;
      let opacity = 1;
      for (let n: Element | null = el; n; n = n.parentElement)
        opacity *= Number(getComputedStyle(n).opacity);
      out.push({
        id: idOf(el),
        selector: H.selector(el),
        clip: union,
        color: cs.webkitTextFillColor || cs.color,
        opacity,
        fontSize: parseFloat(cs.fontSize),
        fontWeight: Number(cs.fontWeight) || 400,
        reason,
        text: (el.textContent ?? '').trim().slice(0, 80),
      });
    }
    window.scrollTo(sx, sy);
    return out;
  };

  const nonTextCandidates = (max: number): NonTextCandidate[] => {
    renderCache.clear();
    const out: NonTextCandidate[] = [];
    const inputs =
      'input:not([type]), input[type="text"], input[type="email"], input[type="password"], input[type="search"], ' +
      'input[type="tel"], input[type="url"], input[type="number"], input[type="date"], select, textarea';
    for (const el of Array.from(
      document.body.querySelectorAll(`${inputs}, button, [role="button"]`),
    )) {
      if (out.length >= max) break;
      if (!H.isVisible(el) || !isRendered(el) || (el as HTMLButtonElement).disabled) continue;
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      let kind: NonTextCandidate['kind'];
      if (el.matches(inputs)) kind = 'input';
      else {
        const label = ((el as HTMLElement).innerText ?? '').trim();
        if (label) continue;
        if (!el.querySelector('svg, img') && !hasBgImage(getComputedStyle(el))) continue;
        kind = 'icon-button';
      }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      out.push({
        id: idOf(el),
        selector: H.selector(el),
        box: pageBox(r),
        borders: {
          top: parseFloat(cs.borderTopWidth) || 0,
          right: parseFloat(cs.borderRightWidth) || 0,
          bottom: parseFloat(cs.borderBottomWidth) || 0,
          left: parseFloat(cs.borderLeftWidth) || 0,
        },
        kind,
      });
    }
    return out;
  };

  const REVEAL_PROPS = [
    'display',
    'visibility',
    'opacity',
    'transform',
    'clip',
    'clip-path',
    'max-height',
    'height',
    'left',
    'top',
    'right',
    'bottom',
    'inset',
  ];
  const splitTopLevel = (s: string, sep: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
      if (ch === sep && depth === 0) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const PSEUDO = /:(hover|focus-within|focus-visible|focus)\b/;
  /** "a.tip:hover > .bubble" -> "a.tip" (only when something after the pseudo is revealed). */
  const triggerFromSelector = (sel: string): string | undefined => {
    const m = PSEUDO.exec(sel);
    if (!m) return undefined;
    let end = m.index + m[0].length;
    let depth = 0;
    while (end < sel.length) {
      const ch = sel.charAt(end);
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (depth === 0 && /[\s>+~]/.test(ch)) break;
      end++;
    }
    const rest = sel.slice(end).trim();
    if (!rest) return undefined;
    const trigger = sel.slice(0, end).replace(new RegExp(PSEUDO.source, 'g'), '').trim();
    return trigger || undefined;
  };
  const cssTriggers = (): string[] => {
    const out = new Set<string>();
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          if (!PSEUDO.test(rule.selectorText)) continue;
          if (!REVEAL_PROPS.some((p) => rule.style.getPropertyValue(p))) continue;
          for (const s of splitTopLevel(rule.selectorText, ',')) {
            const t = triggerFromSelector(s.trim());
            if (t) out.add(t);
          }
        } else if ('cssRules' in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visit(sheet.cssRules);
      } catch {
        // Cross-origin stylesheet: rules are not readable.
      }
    }
    return [...out];
  };

  const hoverTriggers = (max: number): HoverTrigger[] => {
    renderCache.clear();
    const out: HoverTrigger[] = [];
    const seen = new Set<Element>();
    const add = (el: Element, source: HoverTrigger['source']) => {
      if (out.length >= max || seen.has(el) || !H.isVisible(el) || !isRendered(el)) return;
      seen.add(el);
      out.push({ id: idOf(el), selector: H.selector(el), source });
    };
    for (const t of cssTriggers()) {
      try {
        for (const el of Array.from(document.body.querySelectorAll(t))) add(el, 'css');
      } catch {
        // Selector the engine can't evaluate; skip.
      }
    }
    for (const el of Array.from(document.body.querySelectorAll('[aria-describedby]'))) {
      const refs = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      const hidden = refs.some((r) => {
        const d = document.getElementById(r);
        return d && !H.isVisible(d);
      });
      if (hidden) add(el, 'describedby');
    }
    for (const el of Array.from(
      document.body.querySelectorAll(
        '[data-tooltip], [data-tippy-content], [data-bs-toggle="tooltip"]',
      ),
    ))
      add(el, 'data-attr');
    return out;
  };

  const viewportBox = (id: number): Box | undefined => {
    const el = byId.get(id);
    if (!el || !el.isConnected) return undefined;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };

  const focus = (id: number) => (byId.get(id) as HTMLElement | undefined)?.focus?.();
  const blur = () => (document.activeElement as HTMLElement | null)?.blur?.();

  const HIDE_STYLE_ID = 'ca11y-visual-hide';
  const setHidden = (id: number, hidden: boolean) => {
    if (!document.getElementById(HIDE_STYLE_ID)) {
      const s = document.createElement('style');
      s.id = HIDE_STYLE_ID;
      s.textContent =
        '[data-ca11y-hide]{color:transparent!important;-webkit-text-fill-color:transparent!important;' +
        'text-decoration-color:transparent!important;transition:none!important}';
      document.head.appendChild(s);
    }
    const el = byId.get(id);
    if (!el) return;
    if (hidden) el.setAttribute('data-ca11y-hide', '');
    else el.removeAttribute('data-ca11y-hide');
  };

  const savedFonts = new Map<HTMLElement, { value: string; priority: string }>();
  const scaleFonts = (factor: number) => {
    // Root and body too, so rem-based sizes grow like they do with the browser's text size setting.
    const els = [document.documentElement, document.body, ...all()].filter(
      (e): e is HTMLElement => e instanceof HTMLElement,
    );
    const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    els.forEach((e, i) => {
      const size = sizes[i];
      if (!size) return;
      savedFonts.set(e, {
        value: e.style.getPropertyValue('font-size'),
        priority: e.style.getPropertyPriority('font-size'),
      });
      e.style.setProperty('font-size', `${size * factor}px`, 'important');
    });
  };
  const restoreFonts = () => {
    for (const [e, v] of savedFonts) {
      if (v.value) e.style.setProperty('font-size', v.value, v.priority);
      else e.style.removeProperty('font-size');
    }
    savedFonts.clear();
  };

  const SPACING_ID = 'ca11y-visual-text-spacing';
  const setTextSpacing = (on: boolean) => {
    document.getElementById(SPACING_ID)?.remove();
    if (!on) return;
    const s = document.createElement('style');
    s.id = SPACING_ID;
    // WCAG 1.4.12 metrics, as in the W3C-referenced text spacing bookmarklet.
    s.textContent =
      '*,*::before,*::after{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important}' +
      'p{margin-bottom:2em!important}';
    document.head.appendChild(s);
  };

  let visible = new Set<Element>();
  const shown = (el: Element): boolean => {
    if (!H.isVisible(el)) return false;
    const c = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
    return c ? c.call(el, { opacityProperty: true, visibilityProperty: true }) : true;
  };
  const snapshotVisible = () => {
    visible = new Set(all().filter(shown));
  };
  const newlyVisible = (): NewContent[] => {
    const fresh = all().filter((el) => !visible.has(el) && shown(el));
    const freshSet = new Set(fresh);
    const roots = fresh.filter((el) => !el.parentElement || !freshSet.has(el.parentElement));
    return roots
      .filter((el) => hasVisibleText(el) || el.querySelector('img, svg'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        // In-flow content only has its own ancestors underneath; anything else under it is covered.
        let obscures = false;
        for (const fx of [0.2, 0.5, 0.8]) {
          for (const fy of [0.2, 0.5, 0.8]) {
            const x = r.x + r.width * fx;
            const y = r.y + r.height * fy;
            if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
            // Only what is painted below the content counts: elements above it at this point
            // (an open menu or a sticky bar) cover the content, not the other way round.
            const stack = document.elementsFromPoint(x, y);
            // (Content with pointer-events: none is not in the stack at all; then everything there
            // is treated as underneath, as before.)
            const at = stack.findIndex((n) => el.contains(n));
            const under = stack.slice(Math.max(at, 0)).find((n) => !el.contains(n));
            if (!under || under === document.body || under === document.documentElement) continue;
            if (under.contains(el)) continue;
            // Text only counts where the point is on its glyph line boxes: an element's padding
            // (e.g. space a heading reserves for a hover-revealed anchor icon) hides nothing.
            if (ownTextAt(under, x, y) || under.matches(`${INTERACTIVE}, img`)) obscures = true;
          }
        }
        return {
          id: idOf(el),
          selector: H.selector(el),
          box: pageBox(r),
          obscures,
          isError: !!el.closest('[role="alert"], [aria-invalid="true"]'),
        };
      });
  };
  const visibleIds = (list: number[]): boolean[] =>
    list.map((id) => {
      const el = byId.get(id);
      return !!el && el.isConnected && shown(el);
    });

  const probe: VisualProbe = {
    clipping,
    textBoxes,
    reflow,
    targets,
    contrastCandidates,
    nonTextCandidates,
    hoverTriggers,
    viewportBox,
    focus,
    blur,
    setHidden,
    scaleFonts,
    restoreFonts,
    setTextSpacing,
    snapshotVisible,
    newlyVisible,
    visibleIds,
  };
  Object.defineProperty(window, '__ca11yVisual', { value: probe, configurable: true });
}

/** Installs `window.__clearA11y` and `window.__ca11yVisual` (idempotent). */
export async function ensureProbe(page: Page): Promise<void> {
  await ensureHelpers(page);
  await page.evaluate(installVisualProbe);
}
