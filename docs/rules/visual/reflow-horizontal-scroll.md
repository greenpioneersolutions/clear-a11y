---
id: visual/reflow-horizontal-scroll
title: Content scrolls horizontally at 320 CSS px
engine: engine-visual
wcag: [1.4.10]
tier: violation
---

# Content scrolls horizontally at 320 CSS px

**Rule:** `visual/reflow-horizontal-scroll` · **WCAG:** 1.4.10 · **Tier:** `violation` · **Engine:** `engine-visual`

## What it catches

At a viewport 320 CSS px wide, the page scrolls sideways because some element is wider than the viewport: a fixed-width layout box, a row of columns that never stacks, a form grid that can't shrink. 320 CSS px is what a 1280px-wide screen shows at 400% zoom, so this is what people who zoom in actually see.

## Who it affects

People with low vision who zoom to 400%, and people on small screens. With horizontal scrolling they have to scroll back and forth for every line of text, which makes reading slow and easy to lose track of.

## How it's measured

1. The engine resizes the viewport to 320 × 256 CSS px (`VIEWPORTS.reflow`).
2. If the document's `scrollWidth` is more than 1px wider than its `clientWidth`, the page scrolls horizontally.
3. It reports the **root causes**: visible elements whose right edge passes the viewport while their parent's does not. Elements inside a container that already scrolls or clips horizontally are skipped (that container is judged by [`visual/reflow-two-dimensional`](reflow-two-dimensional.md)), and so are `position: fixed` elements.
4. Culprits that are, or sit inside, content SC 1.4.10 exempts (data tables, `pre`/`code`, `role="grid"`, toolbars, math) are not reported. Image-like culprits (images, SVG, canvas, video, maps) become a `needs-review` question instead, because only a person can tell whether a picture needs two dimensions.

Evidence: the document and element widths, and a screenshot crop taken at 320px. The original viewport is restored afterwards.

**Limits.** Only the page's current state is checked (the runner gives the engine each discovered state). Vertical scrolling is never flagged: SC 1.4.10 only measures width for vertically scrolling content.

## How to fix

Let the layout shrink with the viewport:

```css
/* Before */
.layout {
  width: 960px;
}
/* After */
.layout {
  max-width: 960px;
}
img,
video {
  max-width: 100%;
  height: auto;
}
.grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}
```

For grids and flex rows, `min-width: 0` on items lets them shrink below the default width of form controls.

## WCAG

[SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) (AA): content can be presented without loss of information or functionality, and without scrolling in two dimensions, at a width equivalent to 320 CSS px. Exception: parts of the content that require two-dimensional layout.

## Examples

- Barrier: [`fixtures/site/visual/reflow-horizontal-scroll.html`](../../../fixtures/site/visual/reflow-horizontal-scroll.html) (fixed 960px layout box), [`fixtures/site/visual/reflow.html`](../../../fixtures/site/visual/reflow.html)
- Correct pattern: [`fixtures/site/visual/reflow-horizontal-scroll-ok.html`](../../../fixtures/site/visual/reflow-horizontal-scroll-ok.html)
