import type { RuleMeta, Tier } from '@clear-a11y/core';

export const mediaCaptionsMissingRule: RuleMeta = {
  id: 'at/media-captions-missing',
  engine: 'engine-at',
  wcag: ['1.2.2', '1.2.4'],
  tier: 'needs-review',
  title: 'Video without captions',
  description:
    'A video has no captions track (<track kind="captions">). If it has speech or meaningful sound, people who are Deaf or hard of hearing miss it. Captions burned into the picture or delivered in the stream cannot be seen from the markup, so a human confirms.',
  fix: 'Add a WebVTT captions file with <track kind="captions" srclang="en" label="English" src="...">, or confirm that the captions are open (burned in) or that the video has no audio.',
};

/** What the engine reads from one <video> or <audio> element. */
export interface MediaInfo {
  kind: 'video' | 'audio';
  /** `kind` of every <track> child (lower case; a missing kind is "subtitles", per HTML). */
  tracks: string[];
  /** The browser reported an audio track (true), or could not tell (undefined: media not loaded). */
  hasAudio?: boolean;
  muted: boolean;
  autoplay: boolean;
  controls: boolean;
  loop: boolean;
  /** Duration in seconds when the browser knows it. */
  duration: number | null;
  /** A transcript link, button, disclosure or description sits next to the media. */
  transcript: boolean;
  /** A described version is linked ("audio-described version") next to the media. */
  audioDescribed: boolean;
  /** A live source: a MediaStream (srcObject) or an infinite duration. */
  live?: boolean;
}

/** A muted, autoplaying video without controls: decoration (a hero loop), never heard. */
export const isSilentBackground = (m: MediaInfo): boolean =>
  m.kind === 'video' && m.muted && m.autoplay && !m.controls;

/**
 * Pure analysis for at/media-captions-missing. Returns the tier and criteria to report, or undefined.
 * `likely` only when the browser confirmed an audio track and no transcript is offered either;
 * otherwise a human answers the question (live captions, open captions, silent video).
 */
export function detectMediaCaptionsMissing(
  m: MediaInfo,
): { tier: Tier; wcag: string[] } | undefined {
  if (m.kind !== 'video' || isSilentBackground(m)) return undefined;
  if (m.tracks.includes('captions')) return undefined;
  // Prerecorded (1.2.2) or live (1.2.4): only a live source tells them apart.
  const wcag = m.live ? ['1.2.4'] : ['1.2.2', '1.2.4'];
  return { tier: m.hasAudio === true && !m.transcript ? 'likely' : 'needs-review', wcag };
}
