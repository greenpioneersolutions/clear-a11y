---
id: at/motion-actuation
title: Feature operated by device motion
engine: engine-at
wcag: [2.5.4]
tier: needs-review
---

# Feature operated by device motion

**Rule:** `at/motion-actuation` · **WCAG:** 2.5.4 · **Tier:** `needs-review` · **Engine:** `engine-at`

## What it catches

The page registers a `devicemotion`, `deviceorientation` or `deviceorientationabsolute` listener on `window` (or `document`) during load. Pages that only start listening after the user turns a motion feature on are not reported.

## Who it affects

- People whose phone or tablet is mounted on a wheelchair, who can't shake or tilt it.
- People with tremors or spasms, who trigger motion features by accident.

## Tier

`needs-review` with the question "Can everything that responds to moving the device also be done with a normal control, and can the motion response be turned off?". Whether an equivalent control exists, or the motion is essential (a pedometer), needs a human. See [Understanding 2.5.4 Motion Actuation](https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation.html).

## How to fix

Offer a button for the same function and keep motion off until the user opts in:

```html
<button type="button" id="undo">Undo</button>
<label><input type="checkbox" id="shake" /> Shake to undo</label>
```

## Examples

- Barrier: [`fixtures/site/wcag/2-5-4-motion-actuation.html`](../../../fixtures/site/wcag/2-5-4-motion-actuation.html)
- Correct pattern: [`fixtures/site/wcag/2-5-4-motion-actuation-ok.html`](../../../fixtures/site/wcag/2-5-4-motion-actuation-ok.html)
