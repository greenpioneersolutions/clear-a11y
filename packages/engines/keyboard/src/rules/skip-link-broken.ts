import type { RuleMeta } from '@clear-a11y/core';

export const skipLinkBrokenRule: RuleMeta = {
  id: 'keyboard/skip-link-broken',
  engine: 'engine-keyboard',
  wcag: ['2.4.1'],
  tier: 'violation',
  title: 'Skip link is broken',
  description:
    'The "skip to content" link points at an element that does not exist, or activating it does not move the keyboard focus point past the repeated content. Keyboard users still have to Tab through every navigation link.',
  fix: 'Point the link at an element that exists: `<a href="#main">Skip to content</a>` and `<main id="main" tabindex="-1">`.',
};

const SKIP_TEXT = /\b(skip|jump|bypass)\b|\bgo to (the )?(main )?content\b|^main content$/i;

/** True when an in-page link looks like a skip link (its name talks about skipping to content). */
export function isSkipLinkCandidate(name: string, href: string | null): boolean {
  if (!href || !href.startsWith('#') || href.length < 2) return false;
  return SKIP_TEXT.test(name.trim());
}

/** The fragment id a skip link points at (`#main%20content` → `main content`). */
export function skipTargetId(href: string): string {
  const raw = href.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface SkipLinkInput {
  targetExists: boolean;
  /**
   * After activating the link and pressing Tab, focus landed inside or after the target.
   * `undefined` when it could not be measured.
   */
  landedAfterTarget?: boolean;
}

/** Pure analysis for keyboard/skip-link-broken. */
export function detectSkipLinkBroken(input: SkipLinkInput): boolean {
  return !input.targetExists || input.landedAfterTarget === false;
}
