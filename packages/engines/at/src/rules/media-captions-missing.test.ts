import {
  detectMediaCaptionsMissing,
  isSilentBackground,
  mediaCaptionsMissingRule,
  type MediaInfo,
} from './media-captions-missing.js';

const media = (over: Partial<MediaInfo> = {}): MediaInfo => ({
  kind: 'video',
  tracks: [],
  muted: false,
  autoplay: false,
  controls: true,
  loop: false,
  duration: null,
  transcript: false,
  audioDescribed: false,
  ...over,
});

describe('at/media-captions-missing', () => {
  it('has rule metadata', () => {
    expect(mediaCaptionsMissingRule.id).toBe('at/media-captions-missing');
    expect(mediaCaptionsMissingRule.wcag).toEqual(['1.2.2', '1.2.4']);
    expect(mediaCaptionsMissingRule.tier).toBe('needs-review');
  });

  it('asks about a video without a captions track', () => {
    expect(detectMediaCaptionsMissing(media())).toEqual({
      tier: 'needs-review',
      wcag: ['1.2.2', '1.2.4'],
    });
    // Subtitles are translations of dialogue; they don't carry sound information.
    expect(detectMediaCaptionsMissing(media({ tracks: ['subtitles', 'descriptions'] }))?.tier).toBe(
      'needs-review',
    );
  });

  it('is likely only when the browser confirmed audio and there is no transcript', () => {
    expect(detectMediaCaptionsMissing(media({ hasAudio: true }))?.tier).toBe('likely');
    expect(detectMediaCaptionsMissing(media({ hasAudio: true, transcript: true }))?.tier).toBe(
      'needs-review',
    );
  });

  it('asks only about live captions for a live source', () => {
    expect(detectMediaCaptionsMissing(media({ live: true }))?.wcag).toEqual(['1.2.4']);
  });

  it('does not flag the correct pattern', () => {
    expect(detectMediaCaptionsMissing(media({ tracks: ['captions'] }))).toBeUndefined();
    expect(detectMediaCaptionsMissing(media({ kind: 'audio' }))).toBeUndefined();
    const hero = media({ muted: true, autoplay: true, controls: false, loop: true });
    expect(isSilentBackground(hero)).toBe(true);
    expect(detectMediaCaptionsMissing(hero)).toBeUndefined();
  });
});
