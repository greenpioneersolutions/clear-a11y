import type { RuleMeta } from '@clear-a11y/core';
import { hasReadableText } from '../lib/normalize-name.js';
import type { InsertedRegion } from '../lib/recorder.js';

export const liveRegionInsertedWithContentRule: RuleMeta = {
  id: 'at/live-region-inserted-with-content',
  engine: 'engine-at',
  wcag: ['4.1.3'],
  tier: 'likely',
  title: 'Live region inserted with its message',
  description:
    'A live region (aria-live or role="status") is added to the page already containing its message. Screen readers only announce changes to live regions they already know about, so this message is usually never spoken.',
  fix: 'Render the empty live region when the page loads and only change its text later. role="alert" is the one exception that browsers announce on insertion.',
};

/** Pure analysis for at/live-region-inserted-with-content: inserted regions that carry readable text. */
export function detectLiveRegionInsertedWithContent(
  inserted: readonly InsertedRegion[],
): InsertedRegion[] {
  const seen = new Set<string>();
  return inserted.filter((r) => {
    if (!r.selector || seen.has(r.selector) || !hasReadableText(r.text)) return false;
    seen.add(r.selector);
    return true;
  });
}
