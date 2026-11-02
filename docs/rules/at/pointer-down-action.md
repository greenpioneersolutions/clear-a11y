---
id: at/pointer-down-action
title: Action fires on pointer down
engine: engine-at
wcag: [2.5.2]
tier: likely
---

# Action fires on pointer down

**Rule:** `at/pointer-down-action` · **WCAG:** 2.5.2 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

An element with a `mousedown`, `pointerdown` or `touchstart` listener on itself, no `click`/`mouseup`/`pointerup`/`touchend` listener and no move listener (drag handles are covered by `at/drag-without-alternative`). The engine presses the mouse button on it without releasing; if the page changes (elements added, removed or retexted, attributes other than `class`/`style`) or navigates before the release, the action fires on the down event. The button is then released outside the element.

Listeners attached to a parent (event delegation, as most frameworks do) are not seen on the element, so this rule only covers directly attached handlers.

## Who it affects

- People with tremors or limited dexterity who press the wrong target and expect to slide away to cancel.
- Touch screen users who start a scroll on a button.

## Tier

`likely`. 2.5.2 exempts actions where the down event is essential (a piano key, a game) and actions the up event reverses; a human confirms. See [Understanding 2.5.2 Pointer Cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html).

## How to fix

Run the action on `click` (which fires on release inside the element), not on `mousedown`/`pointerdown`/`touchstart`:

```js
button.addEventListener('click', () => deleteAddress(id));
```

## Examples

- Barrier: [`fixtures/site/wcag/2-5-2-pointer-cancellation.html`](../../../fixtures/site/wcag/2-5-2-pointer-cancellation.html)
- Correct pattern: [`fixtures/site/wcag/2-5-2-pointer-cancellation-ok.html`](../../../fixtures/site/wcag/2-5-2-pointer-cancellation-ok.html)
