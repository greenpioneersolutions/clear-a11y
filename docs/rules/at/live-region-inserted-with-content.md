---
id: at/live-region-inserted-with-content
title: Live region inserted with its message
engine: engine-at
wcag: [4.1.3]
tier: likely
---

# Live region inserted with its message

**Rule:** `at/live-region-inserted-with-content` · **WCAG:** 4.1.3 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

A live region (`aria-live="polite|assertive"`, `role="status"`, `role="log"`, `<output>`) that is added to the page already containing its message, after a button press. The announcement recorder sees the insertion and the text in the same batch of DOM changes. `role="alert"` is not reported, because browsers fire an alert event when one is inserted.

## Who it affects

Screen readers track live regions that exist in the page and announce changes to them. A region that arrives together with its text is usually not announced at all (behavior differs between screen readers and browsers), so screen reader users miss the message.

## Tier

`likely`: some screen reader and browser combinations do announce inserted regions, so the message is not always lost. It is a fragile pattern that fails in common setups. See [Understanding 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

## How to fix

Render the empty region when the page loads and only change its text:

```html
<div id="coupon-status" role="status"></div>
<script>
  apply.addEventListener('click', () => {
    document.getElementById('coupon-status').textContent = 'Coupon applied: 10% off.';
  });
</script>
```

## Examples

- Barrier: [`fixtures/site/at/live-region-inserted-with-content.html`](../../../fixtures/site/at/live-region-inserted-with-content.html)
- Correct pattern: [`fixtures/site/at/live-region-inserted-with-content-ok.html`](../../../fixtures/site/at/live-region-inserted-with-content-ok.html)
