---
id: visual/reflow-two-dimensional
title: Horizontally scrolling region may not need two dimensions
engine: engine-visual
wcag: [1.4.10]
tier: needs-review
---

# Horizontally scrolling region may not need two dimensions

**Rule:** `visual/reflow-two-dimensional` · **WCAG:** 1.4.10 · **Tier:** `needs-review` · **Engine:** `engine-visual`

## What it catches

At 320 CSS px wide, a region of the page scrolls sideways (`overflow-x: auto | scroll` with content wider than the region), or an image-like element makes the page scroll. SC 1.4.10 allows two-dimensional scrolling only for content that needs it: data tables, maps, diagrams, code, toolbars, video. A row of text cards or a list of links does not.

The engine can't know what the content means, so it asks:

> At 320 CSS px wide, does this content need a two-dimensional layout (like a data table, map or diagram) to be understood?

Answer **no** and it's a 1.4.10 failure; **yes** and it passes.

## Who it affects

People who zoom in, and people on small screens. Sideways scrolling regions are easy to miss (the hidden content looks absent) and hard to operate without a precise pointer.

## How it's measured

At 320 × 256 CSS px the engine lists horizontally scrolling containers whose `scrollWidth` exceeds `clientWidth` by more than 1px. Containers that are, or contain, a `table`, `pre`, `code`, `role="grid" | "table" | "treegrid" | "toolbar" | "application"`, `math`, or media (`img`, `svg`, `canvas`, `video`, `iframe`, `map`) are treated as the SC exception and not reported. Image-like elements that widen the whole page are asked about too.

**Limits.** A container holding a small table plus unrelated wide text is treated as exempt. Text-only carousels are asked about, even when they also offer next/previous buttons.

## How to fix

If the content can be read in one column, let it wrap:

```css
#plans {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.plan {
  flex: 1 1 15rem;
}
```

If it truly needs two dimensions (a comparison table), keep the scroll container, and make it a labelled, focusable region so keyboard users can scroll it: `<div role="region" aria-labelledby="caption-id" tabindex="0">`.

## WCAG

[SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) (AA), including the exception for "parts of the content which require two-dimensional layout for usage or meaning".

## Examples

- Barrier: [`fixtures/site/visual/reflow-two-dimensional.html`](../../../fixtures/site/visual/reflow-two-dimensional.html) (plan cards in a sideways-scrolling row)
- Correct pattern: [`fixtures/site/visual/reflow-two-dimensional-ok.html`](../../../fixtures/site/visual/reflow-two-dimensional-ok.html) (wide data table in its own scroll region: no finding)
