---
id: visual/target-size
title: Target smaller than 24 by 24 CSS px without spacing
engine: engine-visual
wcag: [2.5.8]
tier: violation
---

# Target smaller than 24 by 24 CSS px without spacing

**Rule:** `visual/target-size` · **WCAG:** 2.5.8 · **Tier:** `violation` · **Engine:** `engine-visual`

## What it catches

Links, buttons and other controls smaller than 24 × 24 CSS px that are packed so closely together that a 24px circle centered on one touches another target, for example tiny pagination links side by side.

## Who it affects

People with hand tremors, limited dexterity or large fingers, and anyone on a touch screen. They hit the wrong target, or have to try several times.

## How it's measured

Targets are `a[href]`, `button`, `input`, `select`, `textarea`, `summary`, `[onclick]` and elements with a button, link, checkbox, radio, tab, menu item, switch or option role. Hidden, `aria-hidden`, `inert`, disabled and visually-hidden (1px) targets are skipped.

For each target smaller than 24px in either direction:

1. **Exceptions.** Inline targets in a sentence (`display: inline` with surrounding text in the same block) are exempt. Inputs and selects whose size equals the browser's unstyled default (measured in an isolated shadow root) are exempt as user-agent controlled.
2. **Spacing test.** A 24px-diameter circle centered on the target's bounding box must not intersect another target's box, nor the circle of another undersized target. Circles that only touch (exactly 24px apart) pass. Targets that contain each other are not compared.
3. **Equivalent control.** The engine can't know whether the same function is available elsewhere. List such targets in `visual.targetSizeEquivalent` (CSS selectors) and their findings become `needs-review` with a yes/no question.

axe-core also has a `target-size` rule; both findings use the shared selector helper, so the runner and benchmark line them up.

**Limits.** Clickable areas enlarged with pseudo-elements or invisible padding on a parent aren't recognized; measure the element that receives the click.

## How to fix

Make targets at least 24 × 24 CSS px (padding counts), or space them out:

```css
.pager a {
  display: inline-block;
  min-width: 24px;
  min-height: 24px;
  padding: 4px;
}
/* or keep 16px icons with enough gap */
.toolbar {
  display: flex;
  gap: 12px;
}
```

## WCAG

[SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (AA, new in WCAG 2.2), with its spacing, equivalent, inline, user-agent control and essential exceptions.

## Examples

- Barrier: [`fixtures/site/visual/target-size.html`](../../../fixtures/site/visual/target-size.html) (12px pagination links packed together)
- Correct pattern: [`fixtures/site/visual/target-size-ok.html`](../../../fixtures/site/visual/target-size-ok.html) (16px icons, 12px apart), [`fixtures/site/visual/target-size-inline-link-ok.html`](../../../fixtures/site/visual/target-size-inline-link-ok.html) (links in a sentence)
