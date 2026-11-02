---
id: visual/hover-content-not-hoverable
title: Hover content disappears when the pointer moves onto it
engine: engine-visual
wcag: [1.4.13]
tier: likely
---

# Hover content disappears when the pointer moves onto it

**Rule:** `visual/hover-content-not-hoverable` · **WCAG:** 1.4.13 · **Tier:** `likely` · **Engine:** `engine-visual`

## What it catches

A tooltip or popup that appears on hover disappears as soon as the pointer moves from the trigger toward it, usually because it hides on the trigger's `mouseleave`, or because there is a gap between trigger and popup.

## Who it affects

People who use screen magnifiers: the popup is often outside the magnified area, so they move the pointer to it to read it, and it vanishes.

## How it's measured

Uses the triggers and the open step from [`visual/hover-content-not-dismissible`](hover-content-not-dismissible.md). After reopening the content by hovering, the engine moves the real mouse in small steps like a person would: first to the nearest edge of the new content, then to its center. It waits 200ms and checks whether the content is still visible. Content that only appears on focus isn't tested (it has no pointer to move), and neither is content that already hid itself (see [`visual/hover-content-not-persistent`](hover-content-not-persistent.md)).

It's `likely` because the pointer path is one reasonable path, not every possible one.

## How to fix

Keep trigger and popup in one hover area with no gap:

```html
<span class="tip-wrap">
  <button aria-describedby="tip">Shipping details</button>
  <span id="tip" role="tooltip" hidden>Ships in 2 working days.</span>
</span>
```

```js
wrap.addEventListener('mouseenter', show);
wrap.addEventListener('mouseleave', hide); // on the wrapper, not the button
```

Or close after a short delay that is cancelled when the pointer enters the popup.

## WCAG

[SC 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) (AA), "hoverable": if pointer hover can trigger the content, the pointer can be moved over it without it disappearing.

## Examples

- Barrier: [`fixtures/site/visual/hover-content-not-hoverable.html`](../../../fixtures/site/visual/hover-content-not-hoverable.html)
- Correct pattern: [`fixtures/site/visual/hover-content-not-hoverable-ok.html`](../../../fixtures/site/visual/hover-content-not-hoverable-ok.html)
