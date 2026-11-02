---
id: states/error-not-in-text
title: Error shown only by colour or styling
engine: engine-states
wcag: [3.3.1, 1.4.1]
tier: likely
---

# Error shown only by colour or styling

**Rule:** `states/error-not-in-text` · **WCAG:** 3.3.1, 1.4.1 · **Tier:** `likely` · **Engine:** `engine-states`

## What it catches

The states engine submits each form empty and with invalid values. It reports a field when, after the submit:

- the field's border, background, shadow or text colour changed (and the field does not have focus, so it is not a focus style), or it became `aria-invalid="true"`, and
- no new text appeared anywhere on the page, and
- the browser did not block the submit with its own validation bubbles (those are text).

The tier is `likely`, not `violation`: a style change after submitting is a strong sign of an error state, but the engine can't be certain what the change means.

WCAG references: [Understanding SC 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) requires the error to be described to the user in text. [Understanding SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) fails when colour is the only way the information is shown (failure [F81](https://www.w3.org/WAI/WCAG22/Techniques/failures/F81)).

## Who it affects

People who can't see the colour change (colour blindness, low vision, screen reader users) are not told that anything went wrong. Everyone else has to guess what the red border means and how to fix it.

## How to fix

Keep the colour as an extra cue, and add a text message next to each field in error that says what is wrong and how to fix it. Link it to the field:

```html
<input id="postcode" aria-invalid="true" aria-describedby="postcode-msg" />
<p id="postcode-msg">Enter your postcode</p>
```

## Examples

- Barrier: [`fixtures/site/states/error-not-in-text.html`](../../../fixtures/site/states/error-not-in-text.html)
- Correct pattern: [`fixtures/site/states/error-not-in-text-ok.html`](../../../fixtures/site/states/error-not-in-text-ok.html)
