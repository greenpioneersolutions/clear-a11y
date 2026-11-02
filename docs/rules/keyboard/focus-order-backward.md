---
id: keyboard/focus-order-backward
title: Focus order jumps backward
engine: engine-keyboard
wcag: [2.4.3, 1.3.2]
tier: likely
---

# Focus order jumps backward

**Rule:** `keyboard/focus-order-backward` · **WCAG:** 2.4.3, 1.3.2 · **Tier:** `likely` · **Engine:** `engine-keyboard`

## What it catches

Pressing Tab moves focus back up the page, or to the left on the same row, instead of following the order people read the page in. A typical case: a form shows First name and Last name side by side with Country below, but Tab goes First name, Country, then back up to Last name.

## Who it affects

Keyboard-only and switch users lose their place and may skip fields. Screen magnifier users, who only see part of the screen, have to search for where focus went.

## WCAG and tier

[2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) requires that focusable components receive focus in an order that preserves meaning and operability. [1.3.2 Meaningful Sequence](https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html) is the related reading-order criterion.

The tier is `likely`, not `violation`: auditors disagree on borderline layouts, and an order can differ from the visual order and still make sense. The AI focus-order judge (S07) reviews the focus path for sense.

## How to fix

Make the DOM order match the visual order. Avoid positive `tabindex` and CSS that moves controls away from their source position (`order`, `grid-row`, absolute positioning).

```html
<!-- Before: Country is second in the DOM but placed on row 2 with CSS -->
<div id="first-name-field">...</div>
<div id="country-field" style="grid-row: 2">...</div>
<div id="last-name-field">...</div>

<!-- After: DOM order = visual order -->
<div>First name</div>
<div>Last name</div>
<div class="wide">Country</div>
```

## How it's detected

The engine walks the real Tab order with key presses (never predicted from `tabindex`) and records each stop's box in page coordinates. `isBackwardJump(prev, next)` flags a stop that is a row above the previous one (vertical centers further apart than half the smaller height) or on the same row but more than 8 px to the left. The finding's `evidence.focusPath` is the full walk with `backward: true` on each flagged stop.

Not flagged: jumps between landmarks, dialogs or fixed/sticky bars; stops without a visible box; and a column wrap (moving up to a column that lies entirely to the right, such as the top of the second column in a two-column form).

## Limitations

- Right-to-left pages only get the vertical check; same-row order is left to the AI judge and humans.
- Masonry and multi-column layouts where a column wrap lands partly to the left can be flagged.

## Examples

- Barrier: [`fixtures/site/keyboard/focus-order-backward.html`](../../../fixtures/site/keyboard/focus-order-backward.html)
- Correct pattern: [`fixtures/site/keyboard/focus-order-backward-ok.html`](../../../fixtures/site/keyboard/focus-order-backward-ok.html), [`focus-order-two-column-ok.html`](../../../fixtures/site/keyboard/focus-order-two-column-ok.html)
