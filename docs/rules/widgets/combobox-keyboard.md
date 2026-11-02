---
id: widgets/combobox-keyboard
title: Comboboxes work with the keyboard and report their state
engine: engine-widgets
wcag: [2.1.1, 4.1.2]
tier: violation
---

# Comboboxes work with the keyboard and report their state

**Rule:** `widgets/combobox-keyboard` · **WCAG:** 2.1.1, 4.1.2 · **Tier:** `violation` (blocked or wrong state) or `needs-review` · **Engine:** `engine-widgets`

## What it catches

For each `role="combobox"`, on a fresh page each time, the engine tries to open the popup with Down Arrow, Alt+Down Arrow, typing the first letter of an option (editable comboboxes only) and a mouse click. It then opens it with the first keyboard method that works, presses Down Arrow twice, and records `aria-expanded`, `aria-activedescendant`, which option has focus, and the options' `class`/`style` (to spot highlights that are only visual). Finally it tries Enter on the active option and Escape.

## Who it affects

Keyboard users cannot pick an option if the list only opens or responds to the mouse. Screen reader users are not told a list appeared when `aria-expanded` stays `false`, and hear nothing while moving through options when the highlight is only a CSS class.

## Tier

- `violation`, WCAG [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): the popup opens with the mouse but with no keyboard method, or Down Arrow never reaches an option (and nothing changes visually either).
- `violation`, WCAG [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html): the popup is open but `aria-expanded` is not `"true"`; or Down Arrow changes the highlighted option visually while neither `aria-activedescendant` nor focus moves.
- `needs-review`: Enter neither selects the active option nor closes the popup, or Escape does not close it. The APG expects both, but a human should confirm.

## How to fix

```html
<input
  id="country"
  role="combobox"
  aria-autocomplete="list"
  aria-expanded="false"
  aria-controls="country-list"
/>
<ul role="listbox" id="country-list" hidden>
  <li role="option" id="country-be">Belgium</li>
</ul>
```

When the list opens set `aria-expanded="true"`; on Down/Up Arrow set `aria-activedescendant` on the input to the active option's id (and `aria-selected="true"` on it); Enter copies the option into the input and closes the list; Escape closes it. See the [APG combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). A native `<select>` or `<input list>` avoids all of this.

## Examples

- Barrier: [`fixtures/site/widgets/combobox-keyboard.html`](../../../fixtures/site/widgets/combobox-keyboard.html)
- Correct pattern: [`fixtures/site/widgets/combobox-keyboard-ok.html`](../../../fixtures/site/widgets/combobox-keyboard-ok.html)
