---
id: visual/non-text-contrast
title: Control boundary has low contrast
engine: engine-visual
wcag: [1.4.11]
tier: likely
---

# Control boundary has low contrast

**Rule:** `visual/non-text-contrast` · **WCAG:** 1.4.11 · **Tier:** `likely` · **Engine:** `engine-visual`

## What it catches

A text field, select or textarea whose border and fill are both too faint against the page (below 3:1), or an icon-only button whose border, fill and icon are all too faint. A common case: a `#ddd` border on white (about 1.4:1).

## Who it affects

People with low vision, and anyone using a dim or glare-affected screen. If they can't see the field's boundary, they can't find where to type.

## How it's measured

The engine takes one screenshot around the control (4px padding) and, for each side, samples the middle 60% of:

- a line 2px **outside** the border box (the page behind the control),
- every pixel row or column **within** the border (inset, outset and native painting differ),
- a line 2px **inside** the border (the control's fill).

It computes the contrast of the border against the outside per side, and of the fill against the outside. One side reaching 3:1 is enough (an underline-only field passes on its bottom edge). For icon-only buttons it also measures the icon: the 99th-percentile contrast of the inner pixels against the button's fill. If no cue reaches 3:1, the control is reported.

It's `likely`, not `violation`, because SC 1.4.11 accepts other ways to identify a control (a visible label next to an unbordered field can be enough in some designs), which the engine can't judge.

**Limits.** Disabled controls are skipped (inactive components are exempt). Checkboxes, radios and sliders aren't measured yet. Measurement assumes device scale factor 1, which is what the runner uses.

## How to fix

```css
/* Before: about 1.4:1 */
input {
  border: 1px solid #ddd;
}
/* After: 4.5:1 */
input {
  border: 1px solid #767676;
}
```

For icon-only buttons, make the icon (or the button's border or fill) at least 3:1 against what's behind it.

## WCAG

[SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) (AA): visual information required to identify user interface components and states has at least 3:1 contrast against adjacent colors.

## Examples

- Barrier: [`fixtures/site/visual/non-text-contrast.html`](../../../fixtures/site/visual/non-text-contrast.html)
- Correct pattern: [`fixtures/site/visual/non-text-contrast-ok.html`](../../../fixtures/site/visual/non-text-contrast-ok.html)
