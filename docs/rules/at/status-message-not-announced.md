---
id: at/status-message-not-announced
title: Status message not announced
engine: engine-at
wcag: [4.1.3]
tier: likely
---

# Status message not announced

**Rule:** `at/status-message-not-announced` · **WCAG:** 4.1.3 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

A short message that appears after pressing a button ("Added to cart", "Draft saved") without being announced. The engine reloads the page with an announcement recorder installed before the page's own scripts (`page.addInitScript`). The recorder is a `MutationObserver` that knows which elements are live regions (`aria-live`, `role="status|alert|log"`, `<output>`). The engine then presses each plain button and compares:

- what became visible: new text, or an element that was hidden and is now shown;
- what a screen reader would have been told: changes inside live regions that already existed;
- where focus went.

It reports when short, human-readable text (up to 200 characters with at least one letter or digit, no links or controls, not in a dialog or menu) newly appeared, nothing was announced, and focus did not move to it. Content revealed by a disclosure (`aria-expanded`, `aria-controls`, or a second press that hides it again) is not a status message.

"Newly appeared" means the text on screen is different from before the press. Frameworks such as Preact and React rewrite text nodes on every render, often with the same value (`0` becomes `0`, an empty message stays empty). The recorder compares each changed element's text (or, for an element created during the press, its nearest existing ancestor's text) with what it showed before, and ignores the change when nothing visible changed.

## Who it affects

Screen reader users press "Add to cart" and hear nothing. They press it again, or leave thinking it failed.

## Tier

`likely`: the observation is deterministic, but whether a given piece of text is a status message in the sense of [Understanding 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) needs a little judgment (some new text is just content).

## How to fix

Render an empty live region with the page and write messages into it:

```html
<div id="cart-status" role="status"></div>
<script>
  addToCart.addEventListener('click', () => {
    document.getElementById('cart-status').textContent = 'Added to cart. 1 item in your cart.';
  });
</script>
```

Use `role="alert"` only for urgent, time-sensitive messages.

## Examples

- Barrier: [`fixtures/site/at/status-message-not-announced.html`](../../../fixtures/site/at/status-message-not-announced.html) (revealed with `hidden`) and [`fixtures/site/at/status-message.html`](../../../fixtures/site/at/status-message.html) (text written into a plain `div`)
- Correct pattern: [`fixtures/site/at/status-message-not-announced-ok.html`](../../../fixtures/site/at/status-message-not-announced-ok.html) and [`fixtures/site/at/ok.html`](../../../fixtures/site/at/ok.html)
- Correct pattern (re-render churn, nothing new on screen): [`fixtures/site/at/status-rerender-ok.html`](../../../fixtures/site/at/status-rerender-ok.html)
