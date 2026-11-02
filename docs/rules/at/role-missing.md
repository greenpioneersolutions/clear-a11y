---
id: at/role-missing
title: Interactive element without a role
engine: engine-at
wcag: [4.1.2]
tier: likely
---

# Interactive element without a role

**Rule:** `at/role-missing` · **WCAG:** 4.1.2 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

An element that is in the Tab order (`tabindex="0"` or higher) and has its own click-style event listener (`click`, `mousedown`, `pointerdown`, ...), but whose role in the browser's accessibility tree is not interactive (`generic` for a `<div>` or `<span>`, `paragraph`, `listitem`, ...). Listeners are read through the Chrome DevTools Protocol, so inline `onclick` handlers and `addEventListener` both count. Native controls are skipped.

## Who it affects

Screen reader users reach the element with Tab but hear only its text ("In stock only"), not "button" or "toggle button". They do not know it does anything. Voice-control users cannot say "click button".

## Tier

`likely`: the role is measured, but intent is inferred from the listener. A focusable element with a click handler is almost always a control, yet some pages attach click handlers for analytics or to close popups. A focusable scroll region with only key handlers is not reported.

## How to fix

Use a real control. It brings the role, focus and Enter/Space handling for free:

```html
<button type="button" class="chip" aria-pressed="false">In stock only</button>
```

If you cannot change the element, add `role="button"` and make both Enter and Space activate it. [Understanding 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) explains why every custom control needs a role.

## Examples

- Barrier: [`fixtures/site/at/role-missing.html`](../../../fixtures/site/at/role-missing.html)
- Correct pattern: [`fixtures/site/at/role-missing-ok.html`](../../../fixtures/site/at/role-missing-ok.html)
