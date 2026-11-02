---
id: at/expanded-state-missing
title: Toggle button without expanded state
engine: engine-at
wcag: [4.1.2]
tier: violation
---

# Toggle button without expanded state

**Rule:** `at/expanded-state-missing` · **WCAG:** 4.1.2 · **Tier:** `violation` · **Engine:** `engine-at`

## What it catches

A button that shows and hides a section of the page (an FAQ answer, "Delivery options", a filter panel) but never exposes `aria-expanded`. The engine presses each plain button twice with an observer running: if the first press shows (or hides) content and the second press undoes it, the button is a disclosure. If it has neither `aria-expanded` nor `aria-pressed`, the state is invisible to assistive technology.

Buttons that open dialogs, menus or listboxes, buttons with `aria-haspopup`, and buttons that only swap their own icon are not counted.

## Who it affects

Screen reader users hear "Delivery options, button" before and after pressing it. They are never told that something opened, so they either miss the new content or keep pressing the button. The same applies to voice-control users who rely on the announced state.

## Tier

`violation`: the toggle is observed, not guessed. A control that changes the page between two states has a state, and [WCAG 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) requires states to be programmatically determinable. The second press must undo the first, which rules out one-way actions such as "Load more".

## How to fix

Expose and update `aria-expanded`, and point `aria-controls` at the section:

```html
<button id="delivery-toggle" type="button" aria-expanded="false" aria-controls="delivery-options">
  Delivery options
</button>
<div id="delivery-options" hidden>…</div>
<script>
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });
</script>
```

A native `<details>`/`<summary>` needs no ARIA at all. See the [APG disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).

## Examples

- Barrier: [`fixtures/site/at/expanded-state-missing.html`](../../../fixtures/site/at/expanded-state-missing.html) (CSS class toggle) and [`fixtures/site/at/disclosure-no-state.html`](../../../fixtures/site/at/disclosure-no-state.html) (`hidden` toggle)
- Correct pattern: [`fixtures/site/at/expanded-state-missing-ok.html`](../../../fixtures/site/at/expanded-state-missing-ok.html) and [`fixtures/site/at/ok.html`](../../../fixtures/site/at/ok.html)
