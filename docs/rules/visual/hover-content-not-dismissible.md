---
id: visual/hover-content-not-dismissible
title: Hover or focus content cannot be dismissed
engine: engine-visual
wcag: [1.4.13]
tier: violation
---

# Hover or focus content cannot be dismissed

**Rule:** `visual/hover-content-not-dismissible` · **WCAG:** 1.4.13 · **Tier:** `violation` · **Engine:** `engine-visual`

## What it catches

A tooltip, popup or submenu appears on hover or focus, covers other content, and pressing Escape doesn't close it while the pointer and focus stay where they are.

## Who it affects

People who magnify the screen: the popup can cover exactly the text they are trying to read, and the only way to get rid of it is to move the pointer or focus away and lose their place. Also people with cognitive disabilities who are distracted by content they didn't ask for.

## How it's measured

1. **Triggers.** The engine looks for likely hover/focus triggers: elements matched by CSS rules that reveal something else on `:hover`/`:focus`/`:focus-within`/`:focus-visible` (the selector continues after the pseudo-class and the rule changes `display`, `visibility`, `opacity`, `transform`, position or size), elements whose `aria-describedby` points at hidden content, and `[data-tooltip]`-style attributes. Up to 6 per page by default (`visual.maxHoverTriggers`).
2. **Open.** It records which elements are visible, moves the real mouse onto the trigger (or focuses it if hovering shows nothing), waits 400ms, and diffs the visible set. The outermost new elements with text or images are the hover content.
3. **Obscures?** It samples points of the new content with `elementsFromPoint`. If another element's text or a control is underneath, the content covers it. Content that covers nothing, or that is an input error (`role="alert"`), doesn't need to be dismissible.
4. **Escape.** With pointer and focus unchanged, it presses Escape and waits 200ms. If the content is still visible, that's a `violation`.

**Limits.** Triggers built only from JavaScript listeners without ARIA or data attributes may be missed. Browser-native `title` tooltips are exempt (user agent controlled) and not tested.

## How to fix

Close the popup on Escape without requiring the pointer or focus to move:

```js
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') tooltip.hidden = true;
});
```

CSS-only `:hover` tooltips can't do this on their own; add the small script, or show the content in a place where it covers nothing.

## WCAG

[SC 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) (AA): dismissible, hoverable and persistent.

## Examples

- Barrier: [`fixtures/site/visual/hover-content-not-dismissible.html`](../../../fixtures/site/visual/hover-content-not-dismissible.html) (CSS-only tooltip over the next paragraph)
- Correct pattern: [`fixtures/site/visual/hover-content-not-dismissible-ok.html`](../../../fixtures/site/visual/hover-content-not-dismissible-ok.html)
