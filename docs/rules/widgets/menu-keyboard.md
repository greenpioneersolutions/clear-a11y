---
id: widgets/menu-keyboard
title: Menu buttons and menubars work with the keyboard
engine: engine-widgets
wcag: [2.1.1, 4.1.2]
tier: violation
---

# Menu buttons and menubars work with the keyboard

**Rule:** `widgets/menu-keyboard` · **WCAG:** 2.1.1, 4.1.2 · **Tier:** `violation` (blocked or wrong state) or `needs-review` (APG deviations) · **Engine:** `engine-widgets`

## What it catches

For each menu button (a button with `aria-haspopup="menu"` or `"true"`), on a fresh page each time, the engine:

1. focuses the button and presses Enter, then Space, then Down Arrow, and also tries a mouse click, recording whether the menu (`aria-controls` target or the nearby `role="menu"`) opens and what `aria-expanded` says;
2. opens it with the first key that works and presses Down Arrow once per item, recording where focus (or `aria-activedescendant`) goes;
3. presses Escape and checks that the menu closes and focus returns to the button.

For each `role="menubar"`, it walks the top-level items with the arrow keys, like the tabs check.

## Who it affects

Keyboard and screen reader users who cannot open the menu or reach its items cannot use those actions at all. A stale `aria-expanded` tells screen reader users the menu is closed while it is open.

## Tier

- `violation`, WCAG [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): the menu opens with a click but not with Enter, Space or Down Arrow; or with the menu open, some items are neither in the Tab sequence nor reached by the arrow keys; or menubar items are unreachable.
- `violation`, WCAG [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html): the menu is open but the button keeps `aria-expanded="false"`.
- `needs-review`: only some of Enter/Space/Down Arrow open the menu, items are reachable only with Tab, Escape does not close the menu, or focus does not return to the button. These are deviations from the ARIA Authoring Practices, not WCAG failures, so a human decides. (Escape and focus return for dialogs are checked by `engine-keyboard`, not here.)

When several problems affect the same button they are merged into one finding with the most severe tier.

## How to fix

```html
<button
  type="button"
  id="actions-button"
  aria-haspopup="menu"
  aria-expanded="false"
  aria-controls="actions-menu"
>
  Order actions
</button>
<ul role="menu" id="actions-menu" aria-labelledby="actions-button" hidden>
  <li role="menuitem" tabindex="-1">Track parcel</li>
  <li role="menuitem" tabindex="-1">Download invoice</li>
</ul>
```

On Enter, Space or Down Arrow: show the menu, set `aria-expanded="true"` and focus the first item. Up/Down Arrow, Home and End move focus between items; Enter activates; Escape closes the menu and focuses the button again. See the [APG menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/). If the "menu" is really site navigation, use a list of links and a disclosure button instead of `role="menu"`.

## Examples

- Barrier: [`fixtures/site/widgets/menu-keyboard.html`](../../../fixtures/site/widgets/menu-keyboard.html)
- Correct pattern: [`fixtures/site/widgets/menu-keyboard-ok.html`](../../../fixtures/site/widgets/menu-keyboard-ok.html)
