---
id: keyboard/click-not-focusable
title: Clickable element not reachable by keyboard
engine: engine-keyboard
wcag: [2.1.1]
tier: likely
---

# Clickable element not reachable by keyboard

**Rule:** `keyboard/click-not-focusable` · **WCAG:** 2.1.1 · **Tier:** `likely` (click handler) or `needs-review` (pointer cursor only) · **Engine:** `engine-keyboard`

## What it catches

A `div` or `span` that reacts to mouse clicks but can't receive keyboard focus, with nothing focusable around it that does the same thing.

## Who it affects

Keyboard-only, switch and voice control users can't use the control at all.

## WCAG and tier

[2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) requires all functionality to be operable through a keyboard.

- `likely` when a click, mousedown, pointerdown, mouseup or pointerup listener (or `onclick`) is attached directly to the element. A handler is a strong signal, but some handlers only log analytics.
- `needs-review` when only `cursor: pointer` suggests a control. A human answers "Does clicking this element do something that keyboard users cannot do another way?".

## How to fix

Use a real control:

```html
<!-- Before -->
<span class="wishlist" onclick="save()">Save to wishlist</span>

<!-- After -->
<button type="button" class="wishlist" onclick="save()">Save to wishlist</button>
```

If you must keep the element, add `tabindex="0"`, a `role` and Enter/Space key handlers.

## How it's detected

The engine asks the browser (DevTools protocol `DOMDebugger.getEventListeners` over the whole tree, including shadow roots) which elements have click-like listeners. Listeners on `window`, `document` and `<body>` are event delegation and are ignored. Elements with `onclick`, and the topmost element of each `cursor: pointer` region, are added. A candidate is reported when it is visible and neither it, an ancestor nor a descendant can take focus (a `<label>` for a control counts as focusable).

## Limitations

- Delegated handlers (one listener on the document) are invisible to this check.
- Elements with `tabindex="-1"` are focusable and skipped; composite widgets with roving tabindex are checked by the widgets engine.

## Examples

- Barrier: [`fixtures/site/keyboard/click-not-focusable.html`](../../../fixtures/site/keyboard/click-not-focusable.html), [`clickable-div.html`](../../../fixtures/site/keyboard/clickable-div.html)
- Correct pattern: [`fixtures/site/keyboard/click-not-focusable-ok.html`](../../../fixtures/site/keyboard/click-not-focusable-ok.html)
