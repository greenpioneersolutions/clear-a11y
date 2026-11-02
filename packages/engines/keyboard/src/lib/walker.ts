import type { Page } from '@clear-a11y/browser';
import type { FocusStop } from '@clear-a11y/core';
import { describeActive, resetFocusToTop, type ActiveInfo } from './page-scripts.js';

/** One stop of a focus walk: the evidence shape (`FocusStop`) plus what the checks need. */
export interface WalkStop extends ActiveInfo {
  /** Position in the walk, 0-based. */
  index: number;
}

export type WalkEnd =
  /** Focus left the document (browser UI / body): the whole Tab order was seen. */
  | 'wrapped'
  /** A stop repeated: Tab is circling. */
  | 'cycle'
  /** Hit `maxStops`. */
  | 'max'
  /** Focus stayed inside an iframe we can't look into. */
  | 'frame';

export interface WalkResult {
  stops: WalkStop[];
  /** Selector per Tab press (null = focus left the document), including the repeat that ended a cycle. */
  sequence: (string | null)[];
  end: WalkEnd;
  /** The walk started from the top of the document (false when the page behind a modal is inert). */
  fromTop: boolean;
}

export interface WalkOptions {
  maxStops: number;
  /** Selector of the open overlay in this state, so stops can be marked `inOverlay`. */
  overlaySelector?: string | null;
  /** 'Tab' (default) or 'Shift+Tab'. */
  key?: 'Tab' | 'Shift+Tab';
  /** Called while each new stop has focus. It may blur, but must leave the stop focused. */
  onStop?: (stop: WalkStop) => Promise<void>;
  /**
   * Called right after every Tab press with what has focus (null = body / outside the document),
   * before `onStop`. Used to see what the press itself caused (SC 3.2.1).
   */
  onPress?: (info: ActiveInfo | null, press: number) => Promise<void>;
}

/** Most Tab presses spent inside one iframe before giving up on it. */
const MAX_FRAME_PRESSES = 50;

export function toWalkStop(info: ActiveInfo, index: number): WalkStop {
  return { ...info, index };
}

/** Evidence-friendly copy of a stop (just the `FocusStop` fields). */
export function toFocusStop(stop: WalkStop, backward = false): FocusStop {
  return {
    index: stop.index,
    selector: stop.selector,
    ...(stop.name ? { name: stop.name } : {}),
    ...(stop.role ? { role: stop.role } : {}),
    rect: {
      x: Math.round(stop.rect.x),
      y: Math.round(stop.rect.y),
      width: Math.round(stop.rect.width),
      height: Math.round(stop.rect.height),
    },
    ...(backward ? { backward: true } : {}),
  };
}

/**
 * Walks the Tab order with real key presses, from the top of the document, until focus leaves
 * the document, a stop repeats, or `maxStops` is reached. Never predicts the order from
 * tabindex or DOM order: shadow DOM, inert, iframes and CSS all change it.
 */
export async function walkFocus(page: Page, options: WalkOptions): Promise<WalkResult> {
  const key = options.key ?? 'Tab';
  const overlay = options.overlaySelector ?? null;
  const fromTop = await page.evaluate(resetFocusToTop);
  const stops: WalkStop[] = [];
  const sequence: (string | null)[] = [];
  const seen = new Set<string>();
  let end: WalkEnd = 'max';

  for (let presses = 0; presses < options.maxStops; presses++) {
    await page.keyboard.press(key);
    let info = await page.evaluate(describeActive, overlay);
    if (info?.frame && seen.has(info.selector)) {
      // Tab is moving inside the iframe; keep pressing until focus comes back out.
      let inside = 0;
      while (info?.frame && seen.has(info.selector) && inside < MAX_FRAME_PRESSES) {
        await page.keyboard.press(key);
        info = await page.evaluate(describeActive, overlay);
        inside++;
      }
      if (inside >= MAX_FRAME_PRESSES) {
        end = 'frame';
        break;
      }
    }
    if (options.onPress) await options.onPress(info, presses);
    if (!info) {
      sequence.push(null);
      end = 'wrapped';
      break;
    }
    sequence.push(info.selector);
    if (seen.has(info.selector)) {
      end = 'cycle';
      break;
    }
    seen.add(info.selector);
    const stop = toWalkStop(info, stops.length);
    stops.push(stop);
    if (options.onStop) await options.onStop(stop);
  }
  return { stops, sequence, end, fromTop };
}

/**
 * Presses `key` up to `presses` times and reports whether focus ever left `members`
 * (including leaving the document).
 */
export async function escapesSet(
  page: Page,
  members: ReadonlySet<string>,
  key: 'Tab' | 'Shift+Tab',
  presses: number,
): Promise<boolean> {
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
    const info = await page.evaluate(describeActive, null);
    if (!info || !members.has(info.selector)) return true;
  }
  return false;
}
