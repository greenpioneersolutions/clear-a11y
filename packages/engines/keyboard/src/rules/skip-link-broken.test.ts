import {
  detectSkipLinkBroken,
  isSkipLinkCandidate,
  skipLinkBrokenRule,
  skipTargetId,
} from './skip-link-broken.js';

describe('keyboard/skip-link-broken', () => {
  it('has rule metadata', () => {
    expect(skipLinkBrokenRule.id).toBe('keyboard/skip-link-broken');
    expect(skipLinkBrokenRule.wcag).toEqual(['2.4.1']);
  });

  it('detects the barrier: the target does not exist', () => {
    expect(detectSkipLinkBroken({ targetExists: false })).toBe(true);
  });

  it('detects the barrier: Tab after activation does not land past the target', () => {
    expect(detectSkipLinkBroken({ targetExists: true, landedAfterTarget: false })).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(detectSkipLinkBroken({ targetExists: true, landedAfterTarget: true })).toBe(false);
    expect(detectSkipLinkBroken({ targetExists: true })).toBe(false);
  });

  it('recognizes skip links by name and in-page href only', () => {
    expect(isSkipLinkCandidate('Skip to main content', '#main')).toBe(true);
    expect(isSkipLinkCandidate('Jump to content', '#content')).toBe(true);
    expect(isSkipLinkCandidate('Home', '#home')).toBe(false);
    expect(isSkipLinkCandidate('Skip to content', '/content')).toBe(false);
    expect(isSkipLinkCandidate('Skip to content', '#')).toBe(false);
  });

  it('resolves the target id from the fragment', () => {
    expect(skipTargetId('#main')).toBe('main');
    expect(skipTargetId('#main%20content')).toBe('main content');
    expect(skipTargetId('#%E0%A4%A')).toBe('%E0%A4%A');
  });
});
