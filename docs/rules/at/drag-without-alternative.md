---
id: at/drag-without-alternative
title: Dragging or swiping with no single-pointer alternative
engine: engine-at
wcag: [2.5.7, 2.5.1]
tier: needs-review
---

# Dragging or swiping with no single-pointer alternative

**Rule:** `at/drag-without-alternative` · **WCAG:** 2.5.7, 2.5.1 · **Tier:** `needs-review` · **Engine:** `engine-at`

## What it catches

Elements operated by dragging or swiping: `draggable="true"` items (reported once, on their list), elements with HTML drag-and-drop listeners (`dragstart`, `drop`), and elements with both a down listener and a move listener (`pointerdown` + `pointermove`, `touchstart` + `touchmove`, `mousedown` + `mousemove`: carousels, sliders, sortable lists, maps). Native form controls and `role=slider`/`role=scrollbar` widgets are skipped (a slider's track normally takes single clicks; check that it does). If the surrounding region (the element's parent) contains a button, select, field or slider, the rule assumes an alternative exists and stays silent.

## Who it affects

- People who use a head pointer, eye gaze, a mouth stick, a trackball or switch access, who can click but can't hold a press while moving.
- People with tremors or limited strength.

## Tier

`needs-review`. Whether the buttons nearby really do the same job, and whether dragging is essential, needs a human. 2.5.7 covers dragging; 2.5.1 covers path-based gestures such as swipes. See [Understanding 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) and [Understanding 2.5.1 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html).

## How to fix

Keep dragging, and add single-tap controls next to it:

```html
<li draggable="true">
  Book the venue
  <button type="button">Move up: Book the venue</button>
  <button type="button">Move down: Book the venue</button>
</li>
```

## Examples

- Barrier: [`fixtures/site/wcag/2-5-7-dragging-movements.html`](../../../fixtures/site/wcag/2-5-7-dragging-movements.html) and [`fixtures/site/wcag/2-5-1-pointer-gestures.html`](../../../fixtures/site/wcag/2-5-1-pointer-gestures.html)
- Correct pattern: [`fixtures/site/wcag/2-5-7-dragging-movements-ok.html`](../../../fixtures/site/wcag/2-5-7-dragging-movements-ok.html) and [`fixtures/site/wcag/2-5-1-pointer-gestures-ok.html`](../../../fixtures/site/wcag/2-5-1-pointer-gestures-ok.html)
