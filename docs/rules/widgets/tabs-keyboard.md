---
id: widgets/tabs-keyboard
title: Tabs can be reached and operated with the keyboard
engine: engine-widgets
wcag: [2.1.1]
tier: violation
---

# Tabs can be reached and operated with the keyboard

**Rule:** `widgets/tabs-keyboard` · **WCAG:** 2.1.1 · **Tier:** `violation` (blocked) or `needs-review` (Tab-only) · **Engine:** `engine-widgets`

## What it catches

A tab list (`role="tablist"`) where some tabs cannot be reached with the keyboard. The engine focuses the tab a Tab press would land on, then presses Right/Left Arrow (Down/Up for `aria-orientation="vertical"`), Home and End, and records where focus goes. A tab that is not in the Tab sequence (`tabindex="-1"`, or a `<div>` with no `tabindex`) **and** never receives focus from the arrow keys is unreachable.

The classic cause is a half-built roving tabindex: the inactive tabs get `tabindex="-1"` as the ARIA Authoring Practices (APG) suggest, but the arrow-key handler that moves focus between them was never written.

## Who it affects

Keyboard users and screen reader users cannot open the other panels at all. Switch and voice-control users who rely on keyboard emulation are blocked too.

## Tier

- `violation` (WCAG [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)): at least one tab can be reached neither with Tab nor with the arrow keys, or no tab is focusable. This is deterministic: the content behind those tabs is not operable from a keyboard.
- `needs-review`: every tab is its own Tab stop and the arrow keys do nothing. The tabs are operable, so this is not a WCAG failure, but it differs from the APG tabs pattern that screen reader users expect. A human decides whether that is acceptable.

## How to fix

Keep the selected tab at `tabindex="0"`, the others at `tabindex="-1"`, and move focus with the arrow keys:

```html
<div role="tablist" aria-label="Product details">
  <button role="tab" id="tab-1" aria-selected="true" aria-controls="panel-1" tabindex="0">
    Description
  </button>
  <button role="tab" id="tab-2" aria-selected="false" aria-controls="panel-2" tabindex="-1">
    Sizing
  </button>
</div>
<script>
  tab.addEventListener('keydown', (event) => {
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length]); // updates tabindex, aria-selected, focus
  });
</script>
```

See the [APG tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

## Examples

- Barrier: [`fixtures/site/widgets/tabs-keyboard.html`](../../../fixtures/site/widgets/tabs-keyboard.html) (no tab is focusable) and [`fixtures/site/widgets/tabs-no-arrow-keys.html`](../../../fixtures/site/widgets/tabs-no-arrow-keys.html) (roving tabindex without arrow keys)
- Correct pattern: [`fixtures/site/widgets/tabs-keyboard-ok.html`](../../../fixtures/site/widgets/tabs-keyboard-ok.html) (vertical tabs) and [`fixtures/site/widgets/ok.html`](../../../fixtures/site/widgets/ok.html)
