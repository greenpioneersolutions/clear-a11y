import type { RuleMeta } from '@clear-a11y/core';
import type { MediaInfo } from './media-captions-missing.js';

export const audioAutoplayNoControlRule: RuleMeta = {
  id: 'at/audio-autoplay-no-control',
  engine: 'engine-at',
  wcag: ['1.4.2'],
  tier: 'likely',
  title: 'Autoplaying audio with no way to stop it',
  description:
    'An <audio> or <video> element starts playing sound on its own (autoplay, not muted) and the page offers no visible way to pause, stop or mute it: no native controls and no button that controls it. Screen reader users cannot hear their screen reader over it, and people with attention or sensory processing difficulties are distracted.',
  fix: 'Do not autoplay sound. If you must, start muted, or put a pause/mute button at the start of the page (aria-controls pointing at the player), or show the native controls.',
};

export interface AutoplayInput extends Pick<
  MediaInfo,
  'autoplay' | 'muted' | 'controls' | 'loop' | 'duration'
> {
  /** A visible button that controls the media (aria-controls) or is named pause/stop/mute/sound. */
  stopControl: boolean;
}

/**
 * Pure analysis for at/audio-autoplay-no-control. 1.4.2 applies to sound that plays for more
 * than 3 seconds, so a known short clip that does not loop is not reported. An unknown
 * duration (media not loaded) is reported: the page asked for sound to start by itself.
 */
export function detectAudioAutoplayNoControl(input: AutoplayInput): boolean {
  if (!input.autoplay || input.muted || input.controls || input.stopControl) return false;
  if (input.duration !== null && input.duration <= 3 && !input.loop) return false;
  return true;
}
