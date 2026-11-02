---
id: visual/hover-content-not-persistent
title: Hover or focus content disappears on its own
engine: engine-visual
wcag: [1.4.13]
tier: likely
---

# Hover or focus content disappears on its own

**Rule:** `visual/hover-content-not-persistent` · **WCAG:** 1.4.13 · **Tier:** `likely` · **Engine:** `engine-visual`

## What it catches

A tooltip or popup that appears on hover or focus hides itself after a short time (usually a timer), although the pointer and focus haven't moved and nobody dismissed it.

## Who it affects

People who read slowly, use magnification or need time to understand the content. It's gone before they finish.

## How it's measured

Uses the triggers and the open step from [`visual/hover-content-not-dismissible`](hover-content-not-dismissible.md). Right after the content appears, the engine waits (1000ms by default, `visual.hoverPersistMs`) without touching pointer, focus or keyboard, then checks whether the content is still visible.

It's `likely` rather than `violation` because the engine can't always tell whether the information became invalid (which SC 1.4.13 allows), and because content that hides after longer than the wait is not caught.

## How to fix

Remove auto-hide timers. Keep the content until the pointer or focus leaves, the user presses Escape, or the information is no longer valid.

```js
// Before
show();
setTimeout(hide, 600);
// After
wrap.addEventListener('mouseleave', hide);
wrap.addEventListener('focusout', hide);
document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
```

## WCAG

[SC 1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) (AA), "persistent".

## Examples

- Barrier: [`fixtures/site/visual/hover-content-not-persistent.html`](../../../fixtures/site/visual/hover-content-not-persistent.html) (hint hides after 600ms)
- Correct pattern: [`fixtures/site/visual/hover-content-not-persistent-ok.html`](../../../fixtures/site/visual/hover-content-not-persistent-ok.html)
