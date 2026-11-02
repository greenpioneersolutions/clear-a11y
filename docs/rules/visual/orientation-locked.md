---
id: visual/orientation-locked
title: Content locked to one orientation
engine: engine-visual
wcag: [1.3.4]
tier: likely
---

# Content locked to one orientation

**Rule:** `visual/orientation-locked` · **WCAG:** 1.3.4 · **Tier:** `violation` (hidden behind a rotate message) / `likely` · **Engine:** `engine-visual`

## What it catches

A page that only works in portrait or only in landscape:

- in one orientation the content is replaced or covered by a message such as "Please rotate your device" (`violation`);
- in one orientation the page turns itself by 90 degrees with a CSS transform to force the other layout (`likely`);
- in one orientation almost all the content disappears, without any message (`likely`).

A layout that changes between orientations (two columns in landscape, one in portrait) is fine, and so is a "rotate for a wider view" tip shown next to content that stays usable.

## Who it affects

People who have their phone or tablet mounted in a fixed orientation, for example on a wheelchair or a bed arm, and people who can't easily turn the device. If the page refuses the orientation they have, they can't use it at all.

## How it's measured

On the default state, the engine lays the page out at phone size (375 × 812 portrait, 812 × 375 landscape) and then at tablet size (768 × 1024 and 1024 × 768), so the CSS `orientation` media feature switches. In each layout it measures:

- the visible text on the page (characters in rendered text nodes);
- visible elements whose text asks to rotate the device ("rotate your device", "landscape mode", "switch to portrait", "only works in landscape"), and how much of the viewport they cover (5 × 5 `elementFromPoint` samples);
- whether `html`, `body` or a large top-level container is turned by about 90° (`transform` or `rotate`).

Then it compares the two orientations of the same size. A rotate message that appears only in one orientation and leaves less than a quarter of the other orientation's text visible (or covers more than 60% of the viewport) is a `violation`: the content is hidden, and the message proves it's on purpose. A 90° turn in one orientation only, or less than 10% of the text without any message, is `likely`. The viewport is restored afterwards.

Orientation locks set with the Screen Orientation API (`screen.orientation.lock()`) or a web app manifest only apply to installed or full-screen apps and aren't tested.

## How to fix

Use responsive CSS that works in both orientations, and remove rotate messages and orientation-based transforms.

```css
/* Before: portrait users get a message instead of the page */
@media (orientation: portrait) {
  main {
    display: none;
  }
  #rotate-message {
    display: block;
  }
}

/* After: portrait just gets a one-column layout */
.layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
}
@media (orientation: portrait) {
  .layout {
    grid-template-columns: 1fr;
  }
}
```

Restricting the orientation is allowed only when it's essential, for example a piano keyboard or a cheque-deposit camera view.

## WCAG

[SC 1.3.4 Orientation](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html) (AA): content does not restrict its view and operation to a single display orientation, such as portrait or landscape, unless a specific display orientation is essential. Related failures: [F97](https://www.w3.org/WAI/WCAG22/Techniques/failures/F97) (locking the orientation to landscape or portrait view) and [F100](https://www.w3.org/WAI/WCAG22/Techniques/failures/F100) (showing a message asking to reorient the device).

## Examples

- Barrier: [`fixtures/site/visual/orientation-locked.html`](../../../fixtures/site/visual/orientation-locked.html) (portrait shows only "Please rotate your device")
- Correct pattern: [`fixtures/site/visual/orientation-locked-ok.html`](../../../fixtures/site/visual/orientation-locked-ok.html) (the layout adapts; a rotate tip is only advice)
