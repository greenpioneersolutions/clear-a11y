import {
  audioAutoplayNoControlRule,
  detectAudioAutoplayNoControl,
  type AutoplayInput,
} from './audio-autoplay-no-control.js';

const input = (over: Partial<AutoplayInput> = {}): AutoplayInput => ({
  autoplay: true,
  muted: false,
  controls: false,
  loop: false,
  duration: null,
  stopControl: false,
  ...over,
});

describe('at/audio-autoplay-no-control', () => {
  it('has rule metadata', () => {
    expect(audioAutoplayNoControlRule.id).toBe('at/audio-autoplay-no-control');
    expect(audioAutoplayNoControlRule.wcag).toEqual(['1.4.2']);
    expect(audioAutoplayNoControlRule.tier).toBe('likely');
  });

  it('detects sound that starts by itself with no way to stop it', () => {
    expect(detectAudioAutoplayNoControl(input())).toBe(true);
    expect(detectAudioAutoplayNoControl(input({ loop: true, duration: 2 }))).toBe(true);
    expect(detectAudioAutoplayNoControl(input({ duration: 30 }))).toBe(true);
  });

  it('does not flag the correct pattern', () => {
    expect(detectAudioAutoplayNoControl(input({ autoplay: false }))).toBe(false);
    expect(detectAudioAutoplayNoControl(input({ muted: true }))).toBe(false);
    expect(detectAudioAutoplayNoControl(input({ controls: true }))).toBe(false);
    expect(detectAudioAutoplayNoControl(input({ stopControl: true }))).toBe(false);
    expect(detectAudioAutoplayNoControl(input({ duration: 2 }))).toBe(false);
  });
});
