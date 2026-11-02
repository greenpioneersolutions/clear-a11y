---
id: at/audio-autoplay-no-control
title: Autoplaying audio with no way to stop it
engine: engine-at
wcag: [1.4.2]
tier: likely
---

# Autoplaying audio with no way to stop it

**Rule:** `at/audio-autoplay-no-control` · **WCAG:** 1.4.2 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

An `<audio>` or `<video>` element with `autoplay` that is not muted, has no native `controls`, and has no visible control on the page: no button, switch or checkbox whose `aria-controls` points at it, and none named pause, stop, mute, sound, audio, music or volume. A clip the browser knows is 3 seconds or shorter and doesn't loop is not reported (1.4.2 applies to sound that plays for more than 3 seconds).

Sound started from script (`new Audio().play()`) is not seen by this rule.

## Who it affects

- Screen reader users can't hear their screen reader over the music, and may not be able to find the control to stop it.
- People with attention, cognitive or sensory processing disabilities are distracted or overwhelmed.

## Tier

`likely`. When the media has not loaded (no duration), the rule can't prove it plays longer than 3 seconds, and a control may exist that it doesn't recognise. See [Understanding 1.4.2 Audio Control](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html).

## How to fix

Don't autoplay sound. If you must, start muted, or put a pause/mute button at the top of the page:

```html
<button type="button" aria-controls="welcome-music" aria-pressed="false">Pause music</button>
<audio id="welcome-music" src="music.mp3" autoplay loop></audio>
```

## Examples

- Barrier: [`fixtures/site/wcag/1-4-2-audio-control.html`](../../../fixtures/site/wcag/1-4-2-audio-control.html)
- Correct pattern: [`fixtures/site/wcag/1-4-2-audio-control-ok.html`](../../../fixtures/site/wcag/1-4-2-audio-control-ok.html)
