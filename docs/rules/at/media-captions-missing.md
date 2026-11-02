---
id: at/media-captions-missing
title: Video without captions
engine: engine-at
wcag: [1.2.2, 1.2.4]
tier: needs-review
---

# Video without captions

**Rule:** `at/media-captions-missing` · **WCAG:** 1.2.2, 1.2.4 · **Tier:** `needs-review` · **Engine:** `engine-at`

## What it catches

A `<video>` the visitor can play (visible or with `controls`) that has no captions track: no `<track kind="captions">` and no captions track added from script (`addTextTrack`). Subtitles (`kind="subtitles"`) do not count: they translate dialogue but leave out sound information.

A muted, autoplaying video without controls (a decorative hero loop that nobody can hear) is skipped. A video playing a live source (a `MediaStream` in `srcObject`, or an infinite duration) is reported against 1.2.4 only; other videos against 1.2.2 and 1.2.4, because the markup can't tell a recording from a stream.

`engine-static` (axe-core `video-caption`) also asks about videos without a `<track kind="captions">`; this rule adds live streams, script-added tracks and the decorative-video exception.

## Who it affects

- Deaf and hard of hearing people miss speech, speaker changes and meaningful sounds.
- People watching without sound (in an office, on a train) and people who read better than they listen.

## Tier

`needs-review` with the question "Does this video have accurate captions…?". Captions can be burned into the picture (open captions) or carried inside a live stream, and a video can have no audio at all; none of that is visible in the markup. The rule only uses `likely` when the browser reports an audio track (decoded audio or an `audioTracks` entry) and no transcript is offered either. See [Understanding 1.2.2 Captions (Prerecorded)](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html) and [Understanding 1.2.4 Captions (Live)](https://www.w3.org/WAI/WCAG22/Understanding/captions-live.html).

## How to fix

Write a WebVTT captions file and reference it:

```html
<video controls>
  <source src="tour.mp4" type="video/mp4" />
  <track kind="captions" src="tour.en.vtt" srclang="en" label="English" default />
</video>
```

For live streams, use a live captioning service that adds a captions track to the player.

## Examples

- Barrier: [`fixtures/site/wcag/1-2-2-captions.html`](../../../fixtures/site/wcag/1-2-2-captions.html) and [`fixtures/site/wcag/1-2-4-live-captions.html`](../../../fixtures/site/wcag/1-2-4-live-captions.html)
- Correct pattern: [`fixtures/site/wcag/1-2-2-captions-ok.html`](../../../fixtures/site/wcag/1-2-2-captions-ok.html) and [`fixtures/site/wcag/1-2-4-live-captions-ok.html`](../../../fixtures/site/wcag/1-2-4-live-captions-ok.html)
