---
id: keyboard/keyboard-trap
title: Keyboard trap
engine: engine-keyboard
wcag: [2.1.2]
tier: violation
---

# Keyboard trap

**Rule:** `keyboard/keyboard-trap` · **WCAG:** 2.1.2 · **Tier:** `violation` · **Engine:** `engine-keyboard`

## What it catches

Once focus enters part of the page, Tab, Shift+Tab and Escape cannot move it out. A common cause is a rich-text or code editor that uses Tab for indentation with no way to leave.

## Who it affects

Keyboard-only and switch users are stuck. The only way out is to reload the page, losing anything they typed.

## WCAG and tier

[2.1.2 No Keyboard Trap](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html): if focus can be moved to a component with the keyboard, it must be possible to move it away with the keyboard, using standard keys or a method the user is told about. The check presses real keys and observes where focus goes, so the tier is `violation`.

## How to fix

Let Tab and Shift+Tab leave. If the component needs Tab, provide and document an exit, such as Escape then Tab:

```js
let leaving = false;
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') leaving = true;
  else if (event.key === 'Tab' && !leaving) {
    event.preventDefault();
    insertIndent();
  }
});
editor.addEventListener('blur', () => (leaving = false));
```

Modal dialogs may keep focus inside, as long as Escape or a close button inside the dialog closes them.

## How it's detected

1. The Tab walk stops when a stop repeats. `detectCycle(sequence)` finds the loop.
2. If the loop covers fewer elements than the page has tabbable elements (`isStrictSubset`), the engine presses Shift+Tab up to loop size + 2 times, then Escape followed by Tab, and checks whether focus ever leaves the loop.
3. If it never leaves, and the loop is not inside an open modal dialog (`dialog[open]`, `[aria-modal=true]`) that has a button, it is a trap.

## Limitations

- Focus inside cross-origin iframes can't be inspected; loops through iframes are not reported.
- Exit methods other than Shift+Tab and Escape then Tab (for example Ctrl+M) are not tried. If your component documents another exit, mark the finding as a false positive and tell us on the false-positive issue form.

## Examples

- Barrier: [`fixtures/site/keyboard/keyboard-trap.html`](../../../fixtures/site/keyboard/keyboard-trap.html)
- Correct pattern: [`fixtures/site/keyboard/keyboard-trap-ok.html`](../../../fixtures/site/keyboard/keyboard-trap-ok.html), modal that contains focus: [`modal-contained-ok.html`](../../../fixtures/site/keyboard/modal-contained-ok.html)
