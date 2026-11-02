---
id: keyboard/focus-not-visible
title: Focus indicator not visible
engine: engine-keyboard
wcag: [2.4.7]
tier: violation
---

# Focus indicator not visible

**Rule:** `keyboard/focus-not-visible` · **WCAG:** 2.4.7 (and 1.4.11 for faint indicators) · **Tier:** `violation` or `needs-review` · **Engine:** `engine-keyboard`

## What it catches

Nothing on screen changes, or almost nothing, when a control receives keyboard focus. The usual cause is `outline: none` with no replacement style.

## Who it affects

Sighted keyboard-only and switch users can't tell which control is focused, so they can't predict what Enter will do. People with low vision miss faint indicators.

## WCAG and tier

[2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) requires a visible keyboard focus indicator. [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) asks for 3:1 contrast for the visual information needed to identify the state.

- `violation` when the focused and unfocused screenshots are pixel-identical, both around the element and across the whole viewport. That is deterministic.
- `needs-review` when something changes but too little or too faintly: fewer changed pixels with at least 3:1 contrast than half the element's short side (minimum 6). WCAG 2.4.7 has no minimum size or contrast, so a human answers "Can you see where focus is on this control?".

## How to fix

Never remove the outline without a replacement. Any strong change works: outline, box-shadow, background, border.

```css
a:focus {
  outline: none;
}
a:focus-visible {
  outline: 3px solid #1a5fb4;
  outline-offset: 2px;
}
```

## How it's detected

For each stop of the Tab walk (up to `keyboard.focusVisibleMaxStops`, default 40), the engine takes a screenshot of the element's box padded by 8 px while it has keyboard focus, blurs it, and takes the same crop again. Transitions, animations and the text caret are disabled first, and the mouse is parked at (0, 0). `focusChange(unfocused, focused)` counts changed pixels and how many have at least 3:1 contrast between their before and after colors. If the crop shows no change at all, the whole viewport is compared too, so indicators drawn on a distant container are not missed. The focused crop is attached as the screenshot.

## Limitations

- Elements smaller than 4 px or visually hidden are skipped; they can't be compared reliably.
- Elements that grab focus back when blurred are skipped.
- Stops completely covered by sticky content are reported by `keyboard/focus-obscured` instead.

## Examples

- Barrier: [`fixtures/site/keyboard/focus-not-visible.html`](../../../fixtures/site/keyboard/focus-not-visible.html), faint outline: [`focus-low-contrast.html`](../../../fixtures/site/keyboard/focus-low-contrast.html)
- Correct pattern: [`fixtures/site/keyboard/focus-not-visible-ok.html`](../../../fixtures/site/keyboard/focus-not-visible-ok.html)
