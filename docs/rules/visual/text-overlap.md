---
id: visual/text-overlap
title: Text overlaps after resize or reflow
engine: engine-visual
wcag: [1.4.4, 1.4.10]
tier: likely
---

# Text overlaps after resize or reflow

**Rule:** `visual/text-overlap` · **WCAG:** 1.4.4, 1.4.10 · **Tier:** `likely` · **Engine:** `engine-visual`

## What it catches

After text is enlarged to 200%, or the viewport is narrowed to 320 CSS px, text runs into other text or into a control. Classic cause: a heading with a fixed height and a pixel line height. Its enlarged letters spill out of the box and over the paragraph below.

Overlap caused by resizing is reported against SC 1.4.4; overlap caused by the 320px layout against SC 1.4.10.

## Who it affects

People who zoom in or enlarge text. Overlapping words can't be read, and text over a control can hide it or make people click the wrong thing.

## How it's measured

For every element with its own text, the engine collects the line boxes of its text nodes (`Range.getClientRects()`), clipped to the nearest scrolling or clipping container. Interactive controls are collected as boxes. It does this for the baseline layout and again at the 200% zoom layout, with text-only resize, and at 320 × 256 CSS px.

A pair is reported when the boxes overlap by more than 2px in both directions after the change but did not before. An element is never compared with its own ancestors or descendants, two controls are never compared, and `position: fixed`/`sticky` elements are skipped (they overlap scrolling content by design). Elements created during the change aren't compared.

**Limits.** Text inside `svg`, canvas or images isn't measured. Overlap that existed before the change is not reported.

## How to fix

Let boxes that hold text grow, and use unitless line heights:

```css
/* Before */
h2 {
  height: 24px;
  line-height: 24px;
}
/* After */
h2 {
  line-height: 1.2;
}
```

Avoid absolute positioning for boxes that hold text next to other content.

## WCAG

- [SC 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) (AA)
- [SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) (AA)

## Examples

- Barrier: [`fixtures/site/visual/text-overlap.html`](../../../fixtures/site/visual/text-overlap.html)
- Correct pattern: [`fixtures/site/visual/text-overlap-ok.html`](../../../fixtures/site/visual/text-overlap-ok.html)
