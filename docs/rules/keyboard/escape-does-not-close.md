---
id: keyboard/escape-does-not-close
title: Escape does not close the overlay
engine: engine-keyboard
wcag: [2.1.1]
tier: needs-review
---

# Escape does not close the overlay

**Rule:** `keyboard/escape-does-not-close` · **WCAG:** 2.1.1 · **Tier:** `needs-review` · **Engine:** `engine-keyboard`

## What it catches

A dialog, menu or popover stays open when you press Escape inside it.

## Who it affects

Keyboard users expect Escape to dismiss overlays. Without it they have to find a close button, and screen reader users may not know where it is.

## WCAG and tier

Escape is a convention from the [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), not a WCAG requirement in itself. It is only a [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) failure when there is no other keyboard way to close the overlay, so the tier is `needs-review` with the question "Is there another obvious keyboard way to close this overlay, so Escape is not needed?". When there is no keyboard way out at all and focus can't leave, `keyboard/keyboard-trap` reports it as a violation instead.

## How to fix

Close on Escape and return focus to the trigger. Native `<dialog>` opened with `showModal()` does both for you.

```js
dialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    close();
    trigger.focus();
  }
});
```

## How it's detected

Only in overlay states handed over by the state explorer (`ctx.stateMeta.kind` is `modal`, `dialog`, `alertdialog`, `menu`, `popover` or `overlay`). The engine finds the open overlay (the trigger's `aria-controls` target, or the visible `dialog[open]`, `[role=dialog]`, `[aria-modal=true]`, `[role=menu]`, `[role=listbox]` or open popover), moves focus inside it if needed, presses Escape and checks whether it is still visible.

## Limitations

- Needs the state explorer (S03) to open the overlay; in the default state there is nothing to check.
- Overlays without dialog/menu markup and without `aria-controls` on the trigger are not found.

## Examples

- Barrier: [`fixtures/site/keyboard/escape-does-not-close.html`](../../../fixtures/site/keyboard/escape-does-not-close.html)
- Correct pattern: [`fixtures/site/keyboard/escape-does-not-close-ok.html`](../../../fixtures/site/keyboard/escape-does-not-close-ok.html)
