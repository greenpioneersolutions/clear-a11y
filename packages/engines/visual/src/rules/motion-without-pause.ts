import type { RuleMeta, Tier } from '@clear-a11y/core';

export const motionWithoutPauseRule: RuleMeta = {
  id: 'visual/motion-without-pause',
  engine: 'engine-visual',
  wcag: ['2.2.2'],
  tier: 'likely',
  title: 'Moving content without a pause control',
  description:
    'Content starts moving, scrolling, blinking or updating on its own, keeps going for more than five seconds next to other content, and there is no control to pause, stop or hide it. People with attention or reading difficulties are distracted from the rest of the page, and people who read slowly or use magnification cannot finish reading what moves away.',
  fix: 'Add a visible Pause (or Stop, or Hide) button next to the moving content that really stops it, or stop the motion on its own within five seconds. Honouring `prefers-reduced-motion` is good, but it does not replace a control on the page.',
};

/** Something on the page that moves or changes on its own, measured in the page. */
export interface MotionEntry {
  /** Per-sample id. */
  id: number;
  /** Ids of other entries that contain this element. */
  ancestors: number[];
  selector: string;
  /** `animation`: CSS animation or Web Animation; `mutation`: script-driven changes (timers, rAF). */
  source: 'animation' | 'mutation';
  /** Animation: runs forever. */
  infinite: boolean;
  /** Animation: active duration in ms (null when infinite). */
  activeMs: number | null;
  /** Mutation: groups of changes separated by quiet time. */
  bursts: number;
  /** Mutation: number of changes and time between the first and last, in ms. */
  mutations: number;
  spanMs: number;
  /** Inside a carousel, slider, slideshow, ticker or marquee. */
  inCarousel: boolean;
  width: number;
  height: number;
  /** A loading indicator: progressbar, aria-busy, or a spinner/loader by name. */
  progressLike: boolean;
  /** Characters of visible text on the page outside this element. */
  otherText: number;
}

/** Content smaller than this (both sides, CSS px) is a dot or caret, not content to read. */
const MIN_SIDE = 16;
/** Some other content must be on the page for "presented in parallel with other content". */
const MIN_OTHER_TEXT = 20;
/** "More than five seconds" (SC 2.2.2). */
const FIVE_SECONDS = 5_000;

/**
 * Pure: does this entry move or update on its own for more than five seconds, in parallel with
 * other content? Animations must run forever or longer than 5 s. Script changes must repeat
 * within the observation window (two separate bursts, or continuous changes for most of the
 * window); a single change inside a carousel counts, because carousels rotate repeatedly.
 * Loading indicators are exempt (Understanding 2.2.2: essential while loading).
 */
export function isMovingContent(entry: MotionEntry, observeMs: number): boolean {
  if (entry.progressLike) return false;
  if (entry.width < MIN_SIDE && entry.height < MIN_SIDE) return false;
  if (entry.otherText < MIN_OTHER_TEXT) return false;
  if (entry.source === 'animation') {
    return entry.infinite || (entry.activeMs ?? 0) > FIVE_SECONDS;
  }
  return (
    entry.bursts >= 2 ||
    (entry.bursts >= 1 && entry.inCarousel) ||
    (entry.mutations >= 10 && entry.spanMs >= observeMs * 0.6)
  );
}

export type PauseControlState =
  /** No pause, stop or hide control found. */
  | 'none'
  /** A control was found and activating it stopped or hid the content. */
  | 'works'
  /** A control was found, but the content kept moving after activating it (or it couldn't be activated). */
  | 'unverified';

export interface MotionVerdictInput {
  control: PauseControlState;
  /** The motion also stops when the user asks the system for reduced motion. */
  stopsWithReducedMotion: boolean;
}

/**
 * Pure verdict for visual/motion-without-pause. A working control is a pass. A control that may
 * not work is `needs-review`. Without a control, motion that only `prefers-reduced-motion` stops
 * is `needs-review` (WCAG lists no technique that accepts the media query alone as the
 * mechanism, but it does help the people affected); otherwise `likely`.
 */
export function motionVerdict(input: MotionVerdictInput): Tier | null {
  if (input.control === 'works') return null;
  if (input.control === 'unverified') return 'needs-review';
  return input.stopsWithReducedMotion ? 'needs-review' : 'likely';
}

/** Name of a control that pauses, stops or hides motion. */
export const PAUSE_CONTROL_NAME =
  /\b(pause|stop|freeze|hide|close|dismiss|turn off|switch off|disable)\b|\b(play|autoplay|animation|motion)\b.*\b(on|off)\b/i;

/** Pure: does an accessible name read like a pause, stop or hide control? */
export function isPauseControlName(name: string): boolean {
  return PAUSE_CONTROL_NAME.test(name.replace(/\s+/g, ' ').trim());
}

/**
 * Pure: the moving content to report. When nested elements both qualify (a ticker and its
 * wrapper), only the innermost is kept, so one moving thing gives one finding.
 */
export function pickMoving(entries: readonly MotionEntry[], observeMs: number): MotionEntry[] {
  const moving = entries.filter((e) => isMovingContent(e, observeMs));
  const containsAnother = new Set(moving.flatMap((e) => e.ancestors));
  const seen = new Set<string>();
  return moving.filter((e) => {
    if (containsAnother.has(e.id) || seen.has(e.selector)) return false;
    seen.add(e.selector);
    return true;
  });
}
