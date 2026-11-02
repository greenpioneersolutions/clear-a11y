---
id: keyboard/overlay-focus-not-moved
title: Focus not moved into the opened dialog
engine: engine-keyboard
wcag: [2.4.3]
tier: likely
---

# Focus not moved into the opened dialog

**Rule:** `keyboard/overlay-focus-not-moved` · **WCAG:** 2.4.3 · **Tier:** `likely` · **Engine:** `engine-keyboard`

## What it catches

A dialog opens, but keyboard focus stays on the button behind it (or on the page body).

## Who it affects

Keyboard-only and switch users must Tab through the rest of the page to reach the dialog, often behind a backdrop where they can't see focus. Screen reader users may not notice the dialog opened.

## WCAG and tier

[2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html): when a dialog opens, focus order that leaves focus behind it does not preserve operability. The [ARIA Authoring Practices dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) says focus moves into the dialog. The tier is `likely`: a few non-modal dialogs legitimately leave focus where it was. Menus and popovers are not checked, because many disclosure-style menus correctly keep focus on the button.

## How to fix

Move focus into the dialog when it opens: to the first control, or to the dialog itself with `tabindex="-1"` so its title is announced.

```js
opener.addEventListener('click', () => {
  backdrop.hidden = false;
  dialog.focus(); // <div role="dialog" tabindex="-1" aria-labelledby="...">
});
```

Native `<dialog>` opened with `showModal()` does this for you.

## How it's detected

Only in dialog states (`stateMeta.kind` is `modal`, `dialog` or `alertdialog`). Before anything else moves focus, the engine finds the open dialog and checks whether `document.activeElement` is the dialog or inside it.

## Limitations

- Needs the state explorer (S03) to open the dialog. In the default state there is nothing to check.
- If the state explorer opens a dialog in a way a user wouldn't (for example without a click), the result may differ.

## Examples

- Barrier: [`fixtures/site/keyboard/overlay-focus-not-moved.html`](../../../fixtures/site/keyboard/overlay-focus-not-moved.html), [`states/modal-focus.html`](../../../fixtures/site/states/modal-focus.html)
- Correct pattern: [`fixtures/site/keyboard/overlay-focus-not-moved-ok.html`](../../../fixtures/site/keyboard/overlay-focus-not-moved-ok.html)
