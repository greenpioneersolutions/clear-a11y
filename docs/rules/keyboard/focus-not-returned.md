---
id: keyboard/focus-not-returned
title: Focus not returned when the overlay closes
engine: engine-keyboard
wcag: [2.4.3]
tier: likely
---

# Focus not returned when the overlay closes

**Rule:** `keyboard/focus-not-returned` · **WCAG:** 2.4.3 · **Tier:** `likely` · **Engine:** `engine-keyboard`

## What it catches

After a dialog, menu or popover closes, focus does not go back to the control that opened it. It usually drops to the page body, so the next Tab starts from the top of the page.

## Who it affects

Keyboard-only and switch users lose their place. Screen reader users hear nothing useful and must find their way back.

## WCAG and tier

[2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) covers focus moving in an order that preserves meaning and operability; the Understanding document's examples include returning focus after a dialog closes. The tier is `likely`: occasionally moving focus somewhere else on purpose (for example after deleting the item that opened the dialog) is the better design.

## How to fix

```js
function closeDialog() {
  backdrop.hidden = true;
  trigger.focus();
}
```

Native `<dialog>` restores focus to the previously focused element when it closes.

## How it's detected

Only in overlay states handed over by the state explorer, with `stateMeta.triggerSelector`. The engine closes the overlay like a keyboard user: Escape with focus inside, or, if that doesn't work, Enter on a close control inside it (a button or link named Close, Dismiss, Cancel, Done or ×). It then checks that `document.activeElement` is the trigger or inside it. The finding targets the close control that was used, or the overlay when Escape closed it.

## Limitations

- If neither Escape nor a recognizable close control closes the overlay, nothing is judged.
- If the trigger disappears after closing, nothing is judged.

## Examples

- Barrier: [`fixtures/site/keyboard/focus-not-returned.html`](../../../fixtures/site/keyboard/focus-not-returned.html), [`states/modal-focus.html`](../../../fixtures/site/states/modal-focus.html)
- Correct pattern: [`fixtures/site/keyboard/focus-not-returned-ok.html`](../../../fixtures/site/keyboard/focus-not-returned-ok.html)
