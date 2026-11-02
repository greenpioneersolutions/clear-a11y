---
id: widgets/disclosure-keyboard
title: Disclosure buttons toggle with Enter and Space and report their state
engine: engine-widgets
wcag: [2.1.1, 4.1.2]
tier: violation
---

# Disclosure buttons toggle with Enter and Space and report their state

**Rule:** `widgets/disclosure-keyboard` · **WCAG:** 2.1.1, 4.1.2 · **Tier:** `violation` or `needs-review` · **Engine:** `engine-widgets`

## What it catches

Show/hide controls: a button (or `role="button"`) with `aria-expanded`, outside any composite widget and without `aria-haspopup`. On a fresh page each time, the engine presses Enter, presses Space, and clicks, and records `aria-expanded` and whether the region in `aria-controls` is shown.

Controls without `aria-expanded` are not disclosures for this rule; a button that toggles content but exposes no expanded state at all is reported by `engine-at`.

## Who it affects

Keyboard users cannot open content behind a toggle that only listens for clicks. Screen reader users are told "collapsed" while the content is open (or the reverse) when `aria-expanded` is stale.

## Tier

- `violation`, WCAG [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): a click toggles the content but neither Enter nor Space does (often a `<div role="button">` without a key handler).
- `violation`, WCAG [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html): at load or after a toggle, `aria-expanded="false"` while the controlled region is shown, or `"true"` while it is hidden.
- `needs-review`: only one of Enter and Space works. The control is operable, but it does not behave like a native button as the APG disclosure pattern expects.

## How to fix

Use a native button and keep `aria-expanded` in sync:

```html
<button type="button" aria-expanded="false" aria-controls="returns-panel">
  Can I return worn shoes?
</button>
<div id="returns-panel" hidden>…</div>
<script>
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
</script>
```

See the [APG disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/). `<details>`/`<summary>` is a native alternative.

## Examples

- Barrier: [`fixtures/site/widgets/disclosure-keyboard.html`](../../../fixtures/site/widgets/disclosure-keyboard.html) (click-only toggle; stale `aria-expanded`)
- Correct pattern: [`fixtures/site/widgets/disclosure-keyboard-ok.html`](../../../fixtures/site/widgets/disclosure-keyboard-ok.html) and [`fixtures/site/at/ok.html`](../../../fixtures/site/at/ok.html)
