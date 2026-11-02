import type { RuleMeta, Tier } from '@clear-a11y/core';

export const orientationLockedRule: RuleMeta = {
  id: 'visual/orientation-locked',
  engine: 'engine-visual',
  wcag: ['1.3.4'],
  tier: 'likely',
  title: 'Content locked to one orientation',
  description:
    'In portrait (or landscape) the page hides its content behind a "please rotate your device" message, or rotates itself so it only reads one way. People who have their phone or tablet mounted in a fixed orientation, for example on a wheelchair, cannot use the page.',
  fix: 'Let the layout adapt to both orientations with responsive CSS. Remove rotate messages and orientation-based transforms that hide or turn the content, unless a specific orientation is essential (a piano app, a cheque deposit).',
};

/** What the page shows at one viewport. Measured in the page. */
export interface OrientationMeasure {
  orientation: 'portrait' | 'landscape';
  viewport: string;
  /** Characters of visible text. */
  textLength: number;
  /** html, body or a large container turned by about 90 degrees. */
  rotated: { selector: string; angle: number } | null;
  /** Visible elements whose text asks the user to rotate the device. */
  messages: { selector: string; text: string; coverage: number }[];
}

export type OrientationLockKind = 'hidden-behind-message' | 'rotated' | 'content-hidden';

export interface OrientationLock {
  kind: OrientationLockKind;
  tier: Tier;
  /** The orientation the content is restricted to. */
  lockedTo: 'portrait' | 'landscape';
  selector: string;
  message?: string;
  /** Visible text in the restricted and the working orientation. */
  textLength: { restricted: number; working: number };
}

/** Text asking the user to change the orientation of their device. */
export const ROTATE_MESSAGE =
  /\b(rotate|turn)\b[^.!?]{0,40}\b(device|phone|tablet|screen|mobile)\b|\b(landscape|portrait)\s+(mode|orientation|view)\b|\bswitch\s+to\s+(landscape|portrait)\b|\b(only|best)\s+(works?|available|viewed|used)\s+in\s+(landscape|portrait)\b/i;

/** Pure: does this text ask the user to change the orientation of their device? */
export function isRotateMessage(text: string): boolean {
  return ROTATE_MESSAGE.test(text.replace(/\s+/g, ' '));
}

/** Content counts as hidden when less than this share of the other orientation's text is left. */
const HIDDEN_SHARE = 0.25;
/** Without a message, only a page that is nearly empty in one orientation is reported. */
const EMPTY_SHARE = 0.1;
/** The message covers most of the viewport. */
const COVERS = 0.6;
/** Enough text in the working orientation to compare against. */
const MIN_TEXT = 40;

const normalize = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();

function lockedIn(
  restricted: OrientationMeasure,
  working: OrientationMeasure,
): OrientationLock | null {
  const lockedTo = working.orientation;
  const textLength = { restricted: restricted.textLength, working: working.textLength };
  const elsewhere = new Set(working.messages.map((m) => normalize(m.text)));
  const message = restricted.messages.find((m) => !elsewhere.has(normalize(m.text)));
  if (message && working.textLength >= MIN_TEXT) {
    const rest = Math.max(0, restricted.textLength - message.text.length);
    if (rest < working.textLength * HIDDEN_SHARE || message.coverage >= COVERS) {
      return {
        kind: 'hidden-behind-message',
        tier: 'violation',
        lockedTo,
        selector: message.selector,
        message: message.text,
        textLength,
      };
    }
  }
  if (restricted.rotated && !working.rotated) {
    return {
      kind: 'rotated',
      tier: 'likely',
      lockedTo,
      selector: restricted.rotated.selector,
      textLength,
    };
  }
  if (
    !message &&
    working.textLength >= MIN_TEXT &&
    restricted.textLength < working.textLength * EMPTY_SHARE
  ) {
    return { kind: 'content-hidden', tier: 'likely', lockedTo, selector: 'body', textLength };
  }
  return null;
}

/**
 * Pure analysis for visual/orientation-locked (SC 1.3.4), comparing the same page in portrait and
 * landscape at the same device size. A rotate message that replaces or covers the content is a
 * `violation`; a page turned by 90 degrees in one orientation, or a page that is nearly empty in
 * one orientation without a message, is `likely`. A rotate tip shown next to content that stays
 * usable is not reported: the content is not restricted.
 */
export function detectOrientationLock(
  portrait: OrientationMeasure,
  landscape: OrientationMeasure,
): OrientationLock | null {
  if (portrait.orientation === landscape.orientation) return null;
  return lockedIn(portrait, landscape) ?? lockedIn(landscape, portrait);
}
