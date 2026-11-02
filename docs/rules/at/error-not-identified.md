---
id: at/error-not-identified
title: Error not identified in text
engine: engine-at
wcag: [3.3.1]
tier: violation
---

# Error not identified in text

**Rule:** `at/error-not-identified` · **WCAG:** 3.3.1 · **Tier:** `violation` · **Engine:** `engine-at`

## What it catches

A field that is flagged as invalid after a failed submit with no text anywhere explaining the error. The engine submits the form (or replays a `form-invalid`/`form-empty` state) and compares each field before and after:

- `aria-invalid` became `"true"`; or
- its border, background or shadow changed. Only fields that don't have focus are compared, so focus rings don't count.

It reports only when no readable text appeared or changed anywhere on the page, nothing was announced, and no field's accessible name or description changed.

## Who it affects

Anyone who can't perceive the color change: color-blind users, screen reader users, people in bright sunlight. They don't know which field failed, or why.

## Tier

`violation`: [Understanding 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) requires the item in error to be identified and the error described in text. The check is deterministic: the field visibly changed and the page contains no new text at all. A related failure technique is [F81](https://www.w3.org/WAI/WCAG22/Techniques/failures/F81) (identifying required or error fields using color differences only).

## How to fix

Keep the red border, and add a text message linked to the field:

```html
<label for="postcode">Postcode</label>
<input id="postcode" aria-invalid="true" aria-describedby="postcode-error" />
<span id="postcode-error">Enter your postcode.</span>
```

## Examples

- Barrier: [`fixtures/site/at/error-not-identified.html`](../../../fixtures/site/at/error-not-identified.html)
- Correct pattern: [`fixtures/site/at/error-not-identified-ok.html`](../../../fixtures/site/at/error-not-identified-ok.html)
