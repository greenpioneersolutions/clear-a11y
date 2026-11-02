---
id: widgets/listbox-keyboard
title: Listboxes work with the keyboard and expose the active option
engine: engine-widgets
wcag: [2.1.1, 4.1.2]
tier: violation
---

# Listboxes work with the keyboard and expose the active option

**Rule:** `widgets/listbox-keyboard` · **WCAG:** 2.1.1, 4.1.2 · **Tier:** `violation` or `needs-review` (Tab-only) · **Engine:** `engine-widgets`

## What it catches

Standalone `role="listbox"` widgets (listboxes that are the popup of a combobox are checked by `widgets/combobox-keyboard`). The engine focuses the listbox, or its tabbable option, presses Down Arrow twice and records `aria-activedescendant`, the focused option, which options have `aria-selected="true"`, and the options' `class`/`style`.

## Who it affects

Keyboard users cannot choose an option they cannot reach. Screen reader users hear nothing when the active option changes only visually, so they cannot tell which value is chosen.

## Tier

- `violation`, WCAG [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): neither the listbox nor any option is in the Tab sequence; or it can be focused but Down Arrow changes nothing and the options are not tabbable.
- `violation`, WCAG [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html): Down Arrow changes the highlighted option visually while `aria-activedescendant`, focus and `aria-selected` all stay the same.
- `needs-review`: every option is its own Tab stop and the arrow keys do nothing (operable, but not the APG listbox pattern).

## How to fix

```html
<ul role="listbox" tabindex="0" aria-labelledby="size-label" aria-activedescendant="size-41">
  <li role="option" id="size-41" aria-selected="true">EU 41</li>
  <li role="option" id="size-42" aria-selected="false">EU 42</li>
</ul>
```

On Up/Down Arrow, Home and End, move `aria-activedescendant` (or DOM focus with a roving tabindex) to the new option and keep `aria-selected` in sync. Style the selection from `[aria-selected='true']`. See the [APG listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/). For simple choices, native radio buttons or `<select>` are easier.

## Examples

- Barrier: [`fixtures/site/widgets/listbox-keyboard.html`](../../../fixtures/site/widgets/listbox-keyboard.html)
- Correct pattern: [`fixtures/site/widgets/listbox-keyboard-ok.html`](../../../fixtures/site/widgets/listbox-keyboard-ok.html)
