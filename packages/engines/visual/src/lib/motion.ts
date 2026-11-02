import { ensureHelpers, gotoAndSettle, type Page, type PageHelpers } from '@clear-a11y/browser';
import {
  motionVerdict,
  motionWithoutPauseRule,
  PAUSE_CONTROL_NAME,
  pickMoving,
  type MotionEntry,
  type PauseControlState,
} from '../rules/motion-without-pause.js';
import type { VisualRun } from './context.js';

/** One observation of the page: everything that moved, and how long we watched. */
export interface MotionSample {
  entries: MotionEntry[];
  observeMs: number;
}

/**
 * Watches the page for motion. Self-contained (runs in the page through `page.evaluate`).
 *
 * - CSS animations and Web Animations: `document.getAnimations()`, running ones only.
 * - Script-driven motion (timers, requestAnimationFrame, auto-updating text): a MutationObserver
 *   records when `style`, `class`, `hidden`, `src`, text and children change. Changes inside a
 *   carousel-like container count for that container; others count for the element and its
 *   three nearest ancestors, so a ticker's text node rolls up to a box worth reporting.
 *
 * The window is `shortMs`, or `longMs` when a carousel, slider, slideshow, ticker or marquee is
 * on the page without a running animation to explain it (rotations every few seconds need the
 * longer look).
 */
export async function sampleMotion(args: {
  shortMs: number;
  longMs: number;
  maxEntries: number;
}): Promise<MotionSample> {
  const h = window.__clearA11y as PageHelpers;
  const HINT =
    '[aria-roledescription~="carousel" i], [aria-roledescription~="slide" i], [class*="carousel" i], [class*="slideshow" i], [class*="slider" i], [class*="swiper" i], [class*="splide" i], [class*="glide" i], [class*="slick" i], [class*="marquee" i], [class*="ticker" i], [id*="carousel" i], [id*="slideshow" i], [id*="slider" i], [id*="ticker" i], marquee';
  const PROGRESS =
    '[role="progressbar"], progress, [aria-busy="true"], [class*="spinner" i], [class*="loader" i], [class*="loading" i], [id*="spinner" i], [id*="loader" i], [id*="loading" i]';
  const visible = (el: Element): boolean => {
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const longAnimation = (a: Animation): boolean => {
    if (a.playState !== 'running') return false;
    const t = a.effect?.getComputedTiming();
    const d = t?.activeDuration;
    return typeof d === 'number' ? !Number.isFinite(d) || d > 5000 : false;
  };
  const hints = Array.from(document.querySelectorAll(HINT)).filter(visible);
  const animatedAtStart = document
    .getAnimations()
    .filter(longAnimation)
    .map((a) => (a.effect as KeyframeEffect | null)?.target)
    .filter((t): t is Element => !!t);
  const unexplained = hints.some(
    (hint) => !animatedAtStart.some((t) => hint === t || hint.contains(t) || t.contains(hint)),
  );
  const observeMs = unexplained ? args.longMs : args.shortMs;

  const times = new Map<Element, number[]>();
  const add = (el: Element, t: number) => {
    const list = times.get(el);
    if (list) list.push(t);
    else times.set(el, [t]);
  };
  const observer = new MutationObserver((records) => {
    const now = performance.now();
    for (const r of records) {
      const el = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      if (!el || !document.body.contains(el)) continue;
      const carousel = el.closest(HINT);
      if (carousel) {
        add(carousel, now);
        continue;
      }
      let n: Element | null = el;
      for (let d = 0; n && n !== document.body && d < 4; d++, n = n.parentElement) add(n, now);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'src', 'srcset', 'transform'],
  });
  await new Promise((resolve) => setTimeout(resolve, observeMs));
  observer.disconnect();

  const bodyText = (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().length;
  const textLen = (el: Element) =>
    ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().length;
  const base = (el: Element) => {
    const r = el.getBoundingClientRect();
    return {
      selector: h.selector(el),
      inCarousel: !!el.closest(HINT),
      width: Math.round(r.width),
      height: Math.round(r.height),
      progressLike: !!el.closest(PROGRESS),
      otherText: Math.max(0, bodyText - textLen(el)),
    };
  };

  const entries: (MotionEntry & { el: Element })[] = [];
  const animated = new Map<Element, { infinite: boolean; activeMs: number }>();
  for (const a of document.getAnimations()) {
    if (!longAnimation(a)) continue;
    const target = (a.effect as KeyframeEffect | null)?.target;
    if (!target || !visible(target)) continue;
    const d = a.effect?.getComputedTiming().activeDuration as number;
    const prev = animated.get(target);
    const infinite = !Number.isFinite(d) || !!prev?.infinite;
    animated.set(target, {
      infinite,
      activeMs: Math.max(prev?.activeMs ?? 0, Number.isFinite(d) ? d : 0),
    });
  }
  for (const [el, a] of animated) {
    entries.push({
      el,
      id: entries.length,
      ancestors: [],
      source: 'animation',
      infinite: a.infinite,
      activeMs: a.infinite ? null : Math.round(a.activeMs),
      bursts: 0,
      mutations: 0,
      spanMs: 0,
      ...base(el),
    });
  }
  const busiest = Array.from(times.entries())
    .filter(([el]) => el.isConnected && visible(el))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, args.maxEntries);
  for (const [el, ts] of busiest) {
    ts.sort((a, b) => a - b);
    let bursts = 0;
    let last = -Infinity;
    for (const t of ts) {
      if (t - last > 250) bursts++;
      last = t;
    }
    entries.push({
      el,
      id: entries.length,
      ancestors: [],
      source: 'mutation',
      infinite: false,
      activeMs: null,
      bursts,
      mutations: ts.length,
      spanMs: Math.round((ts[ts.length - 1] ?? 0) - (ts[0] ?? 0)),
      ...base(el),
    });
  }
  for (const a of entries) {
    for (const b of entries) {
      if (a !== b && a.el !== b.el && a.el.contains(b.el)) b.ancestors.push(a.id);
    }
  }
  return { entries: entries.map(({ el: _el, ...rest }) => rest), observeMs };
}

/** For each selector: the first visible control near it that may pause, stop or hide it. */
export function pauseControlCandidates(args: { selectors: string[]; pattern: string }): {
  selector: string;
  control: string | null;
  name: string;
}[] {
  const h = window.__clearA11y as PageHelpers;
  const pattern = new RegExp(args.pattern, 'i');
  const GLOBAL =
    /(pause|stop|turn off|switch off|disable|reduce)\b.{0,30}\b(animation|motion|movement|autoplay|carousel|slideshow|ticker)/i;
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const nameOf = (el: Element): string => {
    const label = clean(el.getAttribute('aria-label'));
    if (label) return label;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = clean(
        by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' '),
      );
      if (t) return t;
    }
    if (el instanceof HTMLInputElement) {
      const labels = clean(Array.from(el.labels ?? [], (l) => l.textContent).join(' '));
      return labels || clean(el.value) || clean(el.title);
    }
    return (
      clean((el as HTMLElement).innerText ?? el.textContent) || clean(el.getAttribute('title'))
    );
  };
  const controls = Array.from(
    document.querySelectorAll(
      'button, [role="button"], [role="switch"], input[type="button"], input[type="checkbox"], [aria-pressed]',
    ),
  ).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el instanceof HTMLButtonElement && el.type === 'submit' && el.form) return false;
    const r = el.getBoundingClientRect();
    return h.isVisible(el) && r.width > 0 && r.height > 0;
  });
  return args.selectors.map((selector) => {
    const target = document.querySelector(selector);
    if (!target) return { selector, control: null, name: '' };
    // The closest container (up to four levels up) holding a matching control: carousels and
    // tickers keep their controls next to the moving content.
    let near: Element | undefined;
    let scope: Element | null = target;
    for (let i = 0; !near && scope && scope !== document.body && i <= 4; i++) {
      const box: Element = scope;
      near = controls.find((c) => box.contains(c) && pattern.test(nameOf(c)));
      scope = scope.parentElement;
    }
    const global = near ?? controls.find((c) => GLOBAL.test(nameOf(c)));
    return {
      selector,
      control: global ? h.selector(global) : null,
      name: global ? nameOf(global) : '',
    };
  });
}

/** True when the two selectors name the same element or one contains the other. */
export function relatedTargets(args: { a: string; others: string[] }): boolean {
  const x = document.querySelector(args.a);
  if (!x) return false;
  return args.others.some((s) => {
    const y = document.querySelector(s);
    return !!y && (x === y || x.contains(y) || y.contains(x));
  });
}

/** True when no long-running animation is left on the element or inside it. */
export function animationsStopped(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!el) return true;
  return !el.getAnimations({ subtree: true }).some((a) => {
    if (a.playState !== 'running') return false;
    const d = a.effect?.getComputedTiming().activeDuration;
    return typeof d === 'number' && (!Number.isFinite(d) || d > 5000);
  });
}

/** True when the element is no longer rendered (the "hide" mechanism). */
export function isGone(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!el || !el.isConnected) return true;
  const r = el.getBoundingClientRect();
  return (
    r.width === 0 ||
    r.height === 0 ||
    (typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
  );
}

export interface MotionOptions {
  shortMs: number;
  longMs: number;
  maxEntries: number;
  timeoutMs: number;
}

/** Moving targets on `page` right now, as selectors of that document. */
async function movingNow(page: Page, opts: MotionOptions): Promise<string[]> {
  const sample = await page.evaluate(sampleMotion, {
    shortMs: opts.shortMs,
    longMs: opts.longMs,
    maxEntries: opts.maxEntries,
  });
  return pickMoving(sample.entries, sample.observeMs).map((e) => e.selector);
}

/**
 * SC 2.2.2 on a separate page of the same browser context, so the other checks keep their page:
 *
 * 1. load with `prefers-reduced-motion: no-preference` (what most people get) and watch;
 * 2. for moving content with a pause/stop/hide-like control nearby, activate it and watch again;
 * 3. for the rest, reload with `prefers-reduced-motion: reduce` and watch again, to know whether
 *    the motion honours the user setting.
 *
 * Default state only: motion is a property of the page, and the state explorer's states would
 * report the same thing again.
 */
export async function checkMotion(run: VisualRun, opts: MotionOptions): Promise<void> {
  const { ctx } = run;
  const page = await ctx.page.context().newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoAndSettle(page, ctx.url, opts.timeoutMs);
    await ensureHelpers(page);
    const first = await page.evaluate(sampleMotion, {
      shortMs: opts.shortMs,
      longMs: opts.longMs,
      maxEntries: opts.maxEntries,
    });
    const moving = pickMoving(first.entries, first.observeMs);
    if (!moving.length) return;

    const found = await page.evaluate(pauseControlCandidates, {
      selectors: moving.map((m) => m.selector),
      pattern: PAUSE_CONTROL_NAME.source,
    });
    const control = new Map<string, { state: PauseControlState; selector: string; name: string }>();
    const clicked = new Set<string>();
    for (const f of found) {
      if (!f.control) continue;
      let state: PauseControlState = 'unverified';
      try {
        // One control may serve several moving things ("Pause all animations"): click it once.
        if (!clicked.has(f.control))
          await page.locator(f.control).first().click({ timeout: 2_000 });
        clicked.add(f.control);
        const entry = moving.find((m) => m.selector === f.selector);
        if (await page.evaluate(isGone, f.selector)) state = 'works';
        else if (entry?.source === 'animation') {
          if (await page.evaluate(animationsStopped, f.selector)) state = 'works';
        } else {
          const still = await movingNow(page, opts);
          const related = await page.evaluate(relatedTargets, { a: f.selector, others: still });
          if (!related) state = 'works';
        }
      } catch (err) {
        ctx.log.debug('motion: pause control could not be checked', {
          control: f.control,
          error: String(err),
        });
      }
      control.set(f.selector, { state, selector: f.control, name: f.name });
    }

    const needReduced = moving.filter((m) => control.get(m.selector)?.state !== 'works');
    let reducedMoving: string[] = [];
    if (needReduced.length) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoAndSettle(page, ctx.url, opts.timeoutMs);
      await ensureHelpers(page);
      reducedMoving = await movingNow(page, opts);
    }

    for (const m of needReduced) {
      const c = control.get(m.selector);
      const stopsWithReducedMotion = !(await page
        .evaluate(relatedTargets, { a: m.selector, others: reducedMoving })
        .catch(() => true));
      const tier = motionVerdict({ control: c?.state ?? 'none', stopsWithReducedMotion });
      if (!tier) continue;
      const what =
        m.source === 'animation'
          ? `This content is animated ${m.infinite ? 'forever' : `for ${Math.round((m.activeMs ?? 0) / 1000)} seconds`}`
          : m.inCarousel
            ? 'This carousel or ticker changes on its own'
            : 'This content keeps changing on its own';
      const reduced = stopsWithReducedMotion
        ? ' It stops only when the user has turned on "reduce motion" in their system settings.'
        : '';
      const message = c
        ? `${what}, next to other content. The control "${c.name}" (\`${c.selector}\`) looks like it should pause, stop or hide it, but the motion continued after activating it.${reduced}`
        : `${what}, next to other content, and there is no control to pause, stop or hide it.${reduced} People with attention or reading difficulties are distracted, and people who read slowly cannot finish reading.`;
      await run.emit(motionWithoutPauseRule, {
        selector: m.selector,
        tier,
        message,
        ...(tier === 'needs-review'
          ? {
              question: c
                ? `Does "${c.name}" let users pause, stop or hide this moving content?`
                : 'Is there a way on the page for every user to pause, stop or hide this moving content (not only the system "reduce motion" setting)?',
            }
          : {}),
        evidence: {
          data: {
            source: m.source,
            infinite: m.infinite,
            activeMs: m.activeMs,
            bursts: m.bursts,
            observedMs: first.observeMs,
            inCarousel: m.inCarousel,
            pauseControl: c ? { selector: c.selector, name: c.name, state: c.state } : null,
            stopsWithReducedMotion,
          },
        },
      });
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}
