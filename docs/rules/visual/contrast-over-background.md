---
id: visual/contrast-over-background
title: Low contrast text over an image or gradient
engine: engine-visual
wcag: [1.4.3]
tier: violation
---

# Low contrast text over an image or gradient

**Rule:** `visual/contrast-over-background` · **WCAG:** 1.4.3 · **Tier:** `violation` (median fails) / `likely` (part fails) · **Engine:** `engine-visual`

## What it catches

Text on a background image, a gradient or an overlapping element where the real rendered pixels behind the letters don't give enough contrast: 4.5:1 for normal text, 3:1 for large text (at least 24px, or at least 18.66px and bold).

Rules scanners like axe can only compute contrast against a solid background color, so for these cases they ask for a manual review (or, worse, use a fallback `background-color` that is never painted). This rule measures the pixels.

## Who it affects

People with low vision or color vision deficiencies, and anyone reading in bright light.

## How it's measured

1. **Candidates.** Text elements whose background axe cannot determine:
   - an ancestor up to the first opaque background has a `background-image` (image or gradient);
   - another element (an image, video, canvas or painted box) sits between the text and its opaque ancestor at the text's position;
   - another element covers part of the text (an open tooltip over a paragraph): only the visible letters are measured;
   - the text's box is drawn over other content (an absolutely positioned tooltip or popover).

   Text on a plain solid background in normal flow is left to axe, so findings are not duplicated. Text that isn't rendered (inside a closed `<details>`, under `content-visibility: hidden`, behind an open modal) is skipped.

2. **Two screenshots** of the text's box at device scale 1: one as is, one with `color: transparent` on the element (transitions disabled). Pixels that differ are the glyph pixels; the second shot is the exact background under every one of them.
3. **Per-pixel contrast.** For each glyph pixel, the text color (with its alpha and the element's effective opacity) is composited over the background pixel under it, and the WCAG contrast ratio is computed. Using the background _under_ each glyph, rather than anti-aliased glyph edges, avoids underestimating contrast.
4. **Verdict.** If the median ratio fails the threshold, most of the text is hard to read: `violation`. If only the worst 10% fails (part of the text crosses a light area), `likely`. Fewer than 20 glyph pixels: no verdict.

Evidence: median, 10th percentile and worst ratio, the threshold, font size and weight, and a screenshot crop. A text box larger than 1200 × 300 px is measured on its top-left part.

**Verified passes.** When the text passes and the screenshot covered all of it (and at least 20 glyph pixels were measured), the engine records a verified pass for SC 1.4.3 ([ADR 0003](../../adr/0003-engine-pass-records.md)). The runner then drops axe's `static/color-contrast` `needs-review` question for the same element and state ("background could not be determined"), and lists it under `resolved` in the report with these measurements.

**Limits.** Text with `background-clip: text` or a transparent fill is skipped. Text shadows are counted as part of the background under the glyphs (a dark halo improves the measured contrast, as it does for readers). Up to 40 candidates per page by default (`visual.maxContrastCandidates`).

## How to fix

Give the text a background it can rely on:

```css
/* A scrim between the photo and the text */
.hero {
  background-image: linear-gradient(rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6)), url(photo.jpg);
}
/* Or a solid panel behind the text */
.caption {
  background: #1c3d5a;
  color: #fff;
}
```

Check the contrast against the lightest (or darkest) part of the image that sits behind the letters, not the average.

## WCAG

[SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) (AA). The Understanding document notes that for text over images, the contrast is measured against the background around the letters.

## Examples

- Barrier: [`fixtures/site/visual/contrast-over-background.html`](../../../fixtures/site/visual/contrast-over-background.html) (white text on a pale local photo), [`fixtures/site/visual/contrast-over-image.html`](../../../fixtures/site/visual/contrast-over-image.html) (white text on a pale gradient)
- Correct pattern: [`fixtures/site/visual/contrast-over-background-ok.html`](../../../fixtures/site/visual/contrast-over-background-ok.html), [`fixtures/site/visual/ok.html`](../../../fixtures/site/visual/ok.html) (white text on a dark gradient passes)
