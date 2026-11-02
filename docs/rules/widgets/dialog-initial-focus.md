---
id: widgets/dialog-initial-focus
title: Focus moves into a dialog when it opens, and the dialog has a name
engine: engine-widgets
wcag: [2.4.3, 4.1.2]
tier: likely
---

# Focus moves into a dialog when it opens, and the dialog has a name

**Rule:** `widgets/dialog-initial-focus` · **WCAG:** 2.4.3, 4.1.2 · **Tier:** `likely` (focus) or `violation` (no name) · **Engine:** `engine-widgets`

## What it catches

Dialogs (`role="dialog"`, `role="alertdialog"` or `<dialog>`) that are hidden at load. The engine finds the trigger through `aria-controls`/`aria-haspopup="dialog"`; for dialogs with no linked trigger it presses Enter on up to `widgets.maxDialogProbes` visible buttons (never submit buttons or links) until the dialog opens. It activates the trigger with Enter (mouse click as a fallback), waits briefly, then checks:

- is focus inside the dialog?
- does the dialog have an accessible name (`aria-labelledby`, `aria-label` or `title`)?

Escape and focus return when the dialog closes are checked by `engine-keyboard`, so they are not repeated here.

## Who it affects

When focus stays behind a dialog, keyboard users keep tabbing through the page underneath, and screen reader users may never learn the dialog appeared. A dialog without a name is announced only as "dialog", with no hint of its purpose.

## Tier

- `likely`, WCAG [2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html): focus is not inside the dialog after it opens. Strong signal; some non-modal dialogs legitimately leave focus where it was, so it is not a `violation`.
- `violation`, WCAG [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html): the dialog has no accessible name. ARIA requires a name for `dialog`. axe-core's `aria-dialog-name` is a best-practice rule that our static layer does not run, so this does not duplicate it.

## How to fix

```html
<dialog id="settings" aria-labelledby="settings-title">
  <h2 id="settings-title">Settings</h2>
  …
</dialog>
<script>
  openButton.addEventListener('click', () => settings.showModal());
</script>
```

`showModal()` moves focus into the dialog for you. With a custom `role="dialog"`, call `.focus()` on the first control (or on the heading with `tabindex="-1"`) when you show it. See the [APG modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Examples

- Barrier: [`fixtures/site/widgets/dialog-initial-focus.html`](../../../fixtures/site/widgets/dialog-initial-focus.html) (focus left behind; dialog without a name) and [`fixtures/site/states/modal-focus.html`](../../../fixtures/site/states/modal-focus.html)
- Correct pattern: [`fixtures/site/widgets/dialog-initial-focus-ok.html`](../../../fixtures/site/widgets/dialog-initial-focus-ok.html) and [`fixtures/site/states/ok.html`](../../../fixtures/site/states/ok.html)
