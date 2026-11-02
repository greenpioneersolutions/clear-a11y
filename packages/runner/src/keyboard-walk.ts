import {
  ensureHelpers,
  gotoAndSettle,
  launchBrowser,
  VIEWPORTS,
  type BrowserSession,
} from '@clear-a11y/browser';
import type { FocusStop, Viewport } from '@clear-a11y/core';
import {
  detectCycle,
  isBackwardJump,
  toFocusStop,
  walkFocus,
  type WalkEnd,
  type WalkStop,
} from '@clear-a11y/engine-keyboard';

export interface KeyboardWalkOptions {
  /** Viewport to load the page at. Default: desktop (1280x800). */
  viewport?: Viewport;
  /** Most Tab presses. Default 100. */
  maxStops?: number;
  /** Page load timeout in ms. Default 30 000. */
  timeoutMs?: number;
  /** Reuse an existing browser session (it is not closed). Otherwise one is launched and closed. */
  session?: BrowserSession;
}

export interface KeyboardWalkResult {
  url: string;
  viewport: string;
  /** Every Tab stop in order, with selector, accessible name, role, page rect and `backward` flag. */
  stops: FocusStop[];
  /** Indices (into `stops`) of each jump that moved focus backward against the visual order. */
  backwardJumps: { from: number; to: number }[];
  /**
   * Why the walk stopped: `wrapped` (focus left the document: the whole order was seen), `cycle`
   * (a stop repeated), `max` (hit maxStops) or `frame` (focus stayed inside an iframe).
   */
  end: WalkEnd;
  /** Stops Tab kept circling through when `end` is `cycle` (a possible keyboard trap). */
  cycle: string[] | null;
  /** False when the walk could not start from the top of the document (e.g. an inert page behind a modal). */
  fromTop: boolean;
}

/** Backward jumps in a walk, using engine-keyboard's geometry check (the same one its rule uses). */
export function backwardJumpsOf(stops: readonly WalkStop[]): { from: number; to: number }[] {
  const rtl = stops[0]?.rtl ?? false;
  const out: { from: number; to: number }[] = [];
  for (let i = 1; i < stops.length; i++) {
    if (isBackwardJump(stops[i - 1] as WalkStop, stops[i] as WalkStop, { rtl })) {
      out.push({ from: i - 1, to: i });
    }
  }
  return out;
}

/**
 * Loads `url` and walks the Tab order with real key presses (engine-keyboard's walker), returning
 * the focus path. It reports what happened; it does not create findings (scan the page for those).
 */
export async function keyboardWalk(
  url: string,
  options: KeyboardWalkOptions = {},
): Promise<KeyboardWalkResult> {
  const viewport = options.viewport ?? VIEWPORTS.desktop;
  const session = options.session ?? (await launchBrowser());
  const opened = await session.newPage(viewport);
  try {
    const { page } = opened;
    await gotoAndSettle(page, url, options.timeoutMs ?? 30_000);
    await ensureHelpers(page);
    await page.mouse.move(0, 0);
    const walk = await walkFocus(page, { maxStops: options.maxStops ?? 100 });
    const backwardJumps = backwardJumpsOf(walk.stops);
    const marks = new Set(backwardJumps.map((j) => j.to));
    return {
      url,
      viewport: viewport.name,
      stops: walk.stops.map((s) => toFocusStop(s, marks.has(s.index))),
      backwardJumps,
      end: walk.end,
      cycle: walk.end === 'cycle' ? (detectCycle(walk.sequence)?.members ?? null) : null,
      fromTop: walk.fromTop,
    };
  } finally {
    await opened.close().catch(() => undefined);
    if (!options.session) await session.close().catch(() => undefined);
  }
}
