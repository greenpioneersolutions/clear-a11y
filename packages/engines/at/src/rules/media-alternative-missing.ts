import type { RuleMeta } from '@clear-a11y/core';
import { isSilentBackground, type MediaInfo } from './media-captions-missing.js';

export const mediaAlternativeMissingRule: RuleMeta = {
  id: 'at/media-alternative-missing',
  engine: 'engine-at',
  wcag: ['1.2.1', '1.2.3', '1.2.5'],
  tier: 'needs-review',
  title: 'Media without a transcript or audio description',
  description:
    'Audio has no transcript next to it, or a video has neither an audio description nor a text alternative for what is shown. Deaf people miss audio-only content; blind people miss visual information that the soundtrack never mentions. Whether the visuals carry information the audio does not is a human judgment, so this is a question.',
  fix: 'Link a full transcript next to the player (speech, relevant sounds and, for video, what is shown). For video, also provide an audio description: a described version, or <track kind="descriptions">.',
};

export interface MediaAlternativeResult {
  wcag: string[];
  question: string;
}

/**
 * Pure analysis for at/media-alternative-missing.
 * - audio without a transcript: 1.2.1;
 * - video without an audio description or a transcript: 1.2.3 (and 1.2.5, and 1.2.1 if silent);
 * - video with a transcript but no audio description: 1.2.5 only (a transcript meets 1.2.3).
 */
export function detectMediaAlternativeMissing(m: MediaInfo): MediaAlternativeResult | undefined {
  if (m.kind === 'audio' && !m.live) {
    return m.transcript
      ? undefined
      : {
          wcag: ['1.2.1'],
          question:
            'Is there a text transcript of this audio (all speech and meaningful sounds) on the page or linked next to it?',
        };
  }
  // 1.2.1, 1.2.3 and 1.2.5 are about prerecorded media; live streams only need live captions.
  if (isSilentBackground(m) || m.live) return undefined;
  const described = m.tracks.includes('descriptions') || m.audioDescribed;
  if (described) return undefined;
  if (!m.transcript) {
    return {
      wcag: ['1.2.3', '1.2.5', '1.2.1'],
      question:
        'Is everything this video shows (on-screen text, actions, scene changes) either spoken in its soundtrack or covered by an audio description or a full text alternative?',
    };
  }
  return {
    wcag: ['1.2.5'],
    question:
      'Is everything this video shows (on-screen text, actions, scene changes) spoken in its soundtrack or in an audio-described version?',
  };
}
