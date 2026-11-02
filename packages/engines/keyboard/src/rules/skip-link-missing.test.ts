import { detectSkipLinkMissing, skipLinkMissingRule } from './skip-link-missing.js';

const page = { hasSkipLink: false, hasMainLandmark: false, hasHeadings: false, leadingNavStops: 8 };

describe('keyboard/skip-link-missing', () => {
  it('has rule metadata', () => {
    expect(skipLinkMissingRule.id).toBe('keyboard/skip-link-missing');
    expect(skipLinkMissingRule.wcag).toEqual(['2.4.1']);
    expect(skipLinkMissingRule.tier).toBe('needs-review');
  });

  it('detects the barrier: long navigation, no skip link, no landmarks, no headings', () => {
    expect(detectSkipLinkMissing(page)).toBe(true);
  });

  it('does not flag pages with a skip link, a main landmark or headings', () => {
    expect(detectSkipLinkMissing({ ...page, hasSkipLink: true })).toBe(false);
    expect(detectSkipLinkMissing({ ...page, hasMainLandmark: true })).toBe(false);
    expect(detectSkipLinkMissing({ ...page, hasHeadings: true })).toBe(false);
  });

  it('does not flag short navigation', () => {
    expect(detectSkipLinkMissing({ ...page, leadingNavStops: 3 })).toBe(false);
  });
});
