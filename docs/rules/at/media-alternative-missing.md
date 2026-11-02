---
id: at/media-alternative-missing
title: Media without a transcript or audio description
engine: engine-at
wcag: [1.2.1, 1.2.3, 1.2.5]
tier: needs-review
---

# Media without a transcript or audio description

**Rule:** `at/media-alternative-missing` · **WCAG:** 1.2.1, 1.2.3, 1.2.5 · **Tier:** `needs-review` · **Engine:** `engine-at`

## What it catches

Prerecorded media the visitor can play, missing the alternative WCAG asks for:

- **Audio only** (`<audio>`) with no transcript next to it: 1.2.1.
- **Video** with no audio description (`<track kind="descriptions">` or a link to an "audio-described version") and no transcript: 1.2.3, 1.2.5 and 1.2.1 (if the video turns out to be silent).
- **Video** with a transcript but no audio description: 1.2.5 only, because a full text alternative already meets 1.2.3.

"Next to it" means inside the player's `figure`, `section`, `article`, list item or region (or its parent): a link, button, `summary`, heading or caption whose text contains "transcript", or the media's `aria-describedby` text. Live sources and hidden background audio are skipped (1.2.1, 1.2.3 and 1.2.5 are about prerecorded content; background audio is covered by `at/audio-autoplay-no-control`).

## Who it affects

- Deaf and hard of hearing people need a transcript of audio-only content.
- Blind and low-vision people miss information that is only shown (on-screen text, actions, scene changes) unless it is described.
- Deafblind people use transcripts with a braille display.

## Tier

`needs-review`. Whether a video's visuals carry information the soundtrack never mentions is a human judgment (a talking head needs no description), and a transcript may live on another page. See [Understanding 1.2.1](https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html), [Understanding 1.2.3](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-or-media-alternative-prerecorded.html) and [Understanding 1.2.5](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html).

## How to fix

Link a full transcript right next to the player, and for video provide an audio description:

```html
<figure>
  <video controls>
    <source src="assembly.mp4" type="video/mp4" />
    <track kind="captions" src="assembly.en.vtt" srclang="en" label="English" />
  </video>
  <figcaption>
    <a href="#transcript">Read the transcript</a> or
    <a href="assembly-described.mp4">watch the audio-described version</a>.
  </figcaption>
</figure>
```

## Examples

- Barrier: [`fixtures/site/wcag/1-2-1-audio-only.html`](../../../fixtures/site/wcag/1-2-1-audio-only.html) and [`fixtures/site/wcag/1-2-3-media-alternative.html`](../../../fixtures/site/wcag/1-2-3-media-alternative.html) and [`fixtures/site/wcag/1-2-5-audio-description.html`](../../../fixtures/site/wcag/1-2-5-audio-description.html)
- Correct pattern: [`fixtures/site/wcag/1-2-1-audio-only-ok.html`](../../../fixtures/site/wcag/1-2-1-audio-only-ok.html) and [`fixtures/site/wcag/1-2-3-media-alternative-ok.html`](../../../fixtures/site/wcag/1-2-3-media-alternative-ok.html) and [`fixtures/site/wcag/1-2-5-audio-description-ok.html`](../../../fixtures/site/wcag/1-2-5-audio-description-ok.html)
