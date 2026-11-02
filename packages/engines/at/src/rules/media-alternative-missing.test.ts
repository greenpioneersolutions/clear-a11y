import {
  detectMediaAlternativeMissing,
  mediaAlternativeMissingRule,
} from './media-alternative-missing.js';
import type { MediaInfo } from './media-captions-missing.js';

const media = (over: Partial<MediaInfo> = {}): MediaInfo => ({
  kind: 'video',
  tracks: ['captions'],
  muted: false,
  autoplay: false,
  controls: true,
  loop: false,
  duration: null,
  transcript: false,
  audioDescribed: false,
  ...over,
});

describe('at/media-alternative-missing', () => {
  it('has rule metadata', () => {
    expect(mediaAlternativeMissingRule.id).toBe('at/media-alternative-missing');
    expect(mediaAlternativeMissingRule.wcag).toEqual(['1.2.1', '1.2.3', '1.2.5']);
  });

  it('asks for a transcript of audio-only content', () => {
    expect(detectMediaAlternativeMissing(media({ kind: 'audio', tracks: [] }))?.wcag).toEqual([
      '1.2.1',
    ]);
  });

  it('asks about a video with neither an audio description nor a transcript', () => {
    expect(detectMediaAlternativeMissing(media())?.wcag).toEqual(['1.2.3', '1.2.5', '1.2.1']);
  });

  it('asks only about 1.2.5 when a transcript exists but no audio description', () => {
    const r = detectMediaAlternativeMissing(media({ transcript: true }));
    expect(r?.wcag).toEqual(['1.2.5']);
    expect(r?.question).toMatch(/\?$/);
  });

  it('does not flag the correct pattern', () => {
    expect(
      detectMediaAlternativeMissing(media({ kind: 'audio', transcript: true })),
    ).toBeUndefined();
    expect(
      detectMediaAlternativeMissing(media({ tracks: ['captions', 'descriptions'] })),
    ).toBeUndefined();
    expect(detectMediaAlternativeMissing(media({ audioDescribed: true }))).toBeUndefined();
    // Live streams: 1.2.1/1.2.3/1.2.5 apply to prerecorded media only.
    expect(detectMediaAlternativeMissing(media({ live: true }))).toBeUndefined();
    expect(detectMediaAlternativeMissing(media({ kind: 'audio', live: true }))).toBeUndefined();
    expect(
      detectMediaAlternativeMissing(
        media({ tracks: [], muted: true, autoplay: true, controls: false }),
      ),
    ).toBeUndefined();
  });
});
