import type { RuleMeta } from '@clear-a11y/core';

export const skipLinkMissingRule: RuleMeta = {
  id: 'keyboard/skip-link-missing',
  engine: 'engine-keyboard',
  wcag: ['2.4.1'],
  tier: 'needs-review',
  title: 'No way to bypass repeated blocks',
  description:
    'Keyboard users must Tab through a block of repeated navigation before reaching the content, and the page offers no skip link, no main landmark and no headings to jump past it. Landmarks or headings can satisfy 2.4.1, so a human decides.',
  fix: 'Add a skip link as the first focusable element (`<a href="#main">Skip to content</a>`), mark the content with `<main id="main">`, and structure it with headings.',
};

export interface SkipLinkMissingInput {
  hasSkipLink: boolean;
  hasMainLandmark: boolean;
  hasHeadings: boolean;
  /** Consecutive focus stops at the start of the page inside navigation or a banner. */
  leadingNavStops: number;
}

/** Leading navigation stops from which skipping becomes worth asking about. */
export const MIN_REPEATED_STOPS = 5;

/** Pure analysis for keyboard/skip-link-missing. */
export function detectSkipLinkMissing(input: SkipLinkMissingInput): boolean {
  return (
    !input.hasSkipLink &&
    !input.hasMainLandmark &&
    !input.hasHeadings &&
    input.leadingNavStops >= MIN_REPEATED_STOPS
  );
}
