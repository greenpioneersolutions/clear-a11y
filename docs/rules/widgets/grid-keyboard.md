---
id: widgets/grid-keyboard
title: Grid cells can be reached with the arrow keys
engine: engine-widgets
wcag: [2.1.1]
tier: violation
---

# Grid cells can be reached with the arrow keys

**Rule:** `widgets/grid-keyboard` · **WCAG:** 2.1.1 · **Tier:** `violation` or `needs-review` · **Engine:** `engine-widgets`

## What it catches

Interactive grids (`role="grid"`: calendars, data grids, spreadsheets). The engine focuses the first tabbable cell (or the control inside it) and presses Right, Down, Left and Up Arrow, recording which cell holds focus after each key. If focus moves to another cell, the grid passes. If it never moves, it looks at the cells that are not in the Tab sequence:

- cells that contain a control (button, link, input) or carry `tabindex` are "meant to be focusable";
- other cells are static content.

## Who it affects

Keyboard users cannot reach controls inside unreachable cells, for example any date other than the first one in a date picker.

## Tier

- `violation`, WCAG [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): the arrow keys do not move focus and at least one cell with a control (or `tabindex="-1"`) is not in the Tab sequence. Those controls cannot be operated from the keyboard.
- `needs-review`: the arrow keys do nothing but every cell is a Tab stop (operable, not the APG grid pattern); no cell can be focused at all (maybe it should be a plain table); or only static cells are unreachable.

## How to fix

Use a roving tabindex: one cell (or its control) has `tabindex="0"`, all others `tabindex="-1"`, and a keydown handler moves focus with Left/Right/Up/Down Arrow, Home and End:

```js
day.addEventListener('keydown', (event) => {
  const target = {
    ArrowRight: [r, c + 1],
    ArrowLeft: [r, c - 1],
    ArrowDown: [r + 1, c],
    ArrowUp: [r - 1, c],
  }[event.key];
  if (!target) return;
  event.preventDefault();
  moveTo(...target); // sets tabindex and calls .focus()
});
```

See the [APG grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/). If the grid is only for reading, use a plain `<table>` without `role="grid"`.

## Examples

- Barrier: [`fixtures/site/widgets/grid-keyboard.html`](../../../fixtures/site/widgets/grid-keyboard.html)
- Correct pattern: [`fixtures/site/widgets/grid-keyboard-ok.html`](../../../fixtures/site/widgets/grid-keyboard-ok.html)
