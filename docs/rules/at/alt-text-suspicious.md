---
id: at/alt-text-suspicious
title: Alt text is a file name, URL or placeholder
engine: engine-at
wcag: [1.1.1]
tier: likely
---

# Alt text is a file name, URL or placeholder

**Rule:** `at/alt-text-suspicious` · **WCAG:** 1.1.1 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

An image that has alt text, so rules scanners such as axe-core pass it, but whose alt text describes nothing:

- a **file name**: `IMG_2041.jpg`, `DSC_0042.JPG`, or text that repeats the image's own file name (`hero-banner_v2` for `hero-banner_v2.webp`);
- a **URL**: `https://cdn.example.com/charts/size-chart-v3.png`;
- a **placeholder word** on its own: `image`, `photo`, `picture`, `graphic`, `spacer`, `icon`, `logo`, `untitled`, optionally with a number (`image 3`).

It checks `img[alt]`, `input[type=image][alt]` and `role="img"` elements with an `aria-label`, skipping hidden ones and anything inside `aria-hidden="true"` or `inert`. Alt text that merely starts with "Photo of..." is a description and is not reported.

These are the patterns code can decide. Whether a real sentence actually describes the image ("A dog" for a photo of a cat) is a judgment call: the AI layer's `ai/alt-text` judge handles it when you configure a model.

## Who it affects

- Screen reader users hear "D S C underscore zero zero four two dot J P G" instead of what the photo shows.
- Braille display users, and anyone browsing with images off, get the same meaningless text.

## Tier

`likely`: a file name or placeholder is almost never an adequate text alternative, but in rare cases the alt text is correct (an image that really is a file name in a file manager). [Understanding 1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) requires a text alternative that serves the equivalent purpose; failure technique [F30](https://www.w3.org/WAI/WCAG22/Techniques/failures/F30) lists file names and placeholders.

## How to fix

Describe what the image shows or does in this context. If it is purely decorative, use empty alt so screen readers skip it:

```html
<!-- Before -->
<img src="dsc_0042.jpg" alt="DSC_0042.JPG" />
<!-- After -->
<img src="dsc_0042.jpg" alt="Blue trail running shoe with a deep-lug sole, side view" />
<!-- Decorative -->
<img src="divider.svg" alt="" />
```

## Examples

- Barrier: [`fixtures/site/at/alt-text-suspicious.html`](../../../fixtures/site/at/alt-text-suspicious.html) and [`fixtures/site/ai/alt-filename.html`](../../../fixtures/site/ai/alt-filename.html)
- Correct pattern: [`fixtures/site/at/alt-text-suspicious-ok.html`](../../../fixtures/site/at/alt-text-suspicious-ok.html)
