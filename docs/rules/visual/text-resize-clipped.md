---
id: visual/text-resize-clipped
title: Text clipped at 200% text size
engine: engine-visual
wcag: [1.4.4]
tier: violation
---

# Text clipped at 200% text size

**Rule:** `visual/text-resize-clipped` · **WCAG:** 1.4.4 · **Tier:** `violation` (zoom) / `likely` (text-only) · **Engine:** `engine-visual`

## What it catches

When text is enlarged to 200%, part of it disappears because a box has a fixed size and `overflow: hidden` (or `clip`), often with `text-overflow: ellipsis`. Typical cases: a button with a fixed width and `white-space: nowrap`, a card description with a fixed height.

## Who it affects

People with low vision who use browser zoom or a larger default text size. The clipped words are simply gone for them.

## How it's measured

The engine measures every element that clips its content and contains visible text (`scrollWidth`/`scrollHeight` against `clientWidth`/`clientHeight`), then measures again after resizing:

1. **200% zoom equivalent** (`violation`). Browser zoom at 200% gives the page half as many CSS pixels, so the engine lays the page out at half the viewport (640 × 400 for the 1280 × 800 desktop viewport). Only runs when the scan viewport is at least 1024px wide.
2. **Text-only resize** (`likely`). Chromium has no text-only zoom switch, so the engine doubles every element's computed `font-size` with inline styles (root and body included, so `rem` sizes scale too). This can break layouts that browser zoom would handle, which is why it's only `likely`.

An element is reported when it hides more than 2px more content after resizing than before. Text that was already cut off and gets cut off further counts too. Elements the page creates or replaces during the resize are ignored, because they can't be compared. Visually hidden elements (1px boxes, `clip: rect(0 0 0 0)`) are skipped. All styles and the viewport are restored afterwards.

**Limits.** Text overflowing a box with `overflow: visible` isn't clipping; when it runs into other text, [`visual/text-overlap`](text-overlap.md) reports it.

## How to fix

Let boxes grow with their text:

```css
/* Before */
.button {
  width: 24vw;
  height: 40px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* After */
.button {
  min-width: 24vw;
  max-width: 100%;
  min-height: 40px;
}
```

Use `min-height`/`min-width` instead of fixed sizes, and size fixed boxes in `em`/`rem` so they follow the text.

## WCAG

[SC 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) (AA): text can be resized without assistive technology up to 200 percent without loss of content or functionality.

## Examples

- Barrier: [`fixtures/site/visual/text-resize-clipped.html`](../../../fixtures/site/visual/text-resize-clipped.html) (button label cut off at the 200% zoom layout)
- Correct pattern: [`fixtures/site/visual/text-resize-clipped-ok.html`](../../../fixtures/site/visual/text-resize-clipped-ok.html)
