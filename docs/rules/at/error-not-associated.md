---
id: at/error-not-associated
title: Error message not associated with its field
engine: engine-at
wcag: [3.3.1, 1.3.1]
tier: likely
---

# Error message not associated with its field

**Rule:** `at/error-not-associated` · **WCAG:** 3.3.1, 1.3.1 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

An error message shown next to a field after a failed submit that is not part of the field's accessible name or description. The engine submits the form (or replays a `form-invalid`/`form-empty` state), collects the error text that appeared, and ties each error to a field when it sits inside the field's `<label>` or in a small wrapper (at most two levels up, below the form) that holds exactly one field. It then checks whether the error text is in what assistive technology gets for that field: its labels, `aria-labelledby`, `aria-label`, `aria-describedby`, `aria-errormessage` and `title`.

Error summaries at the top of a form are not tied to a single field and are not reported here.

## Who it affects

Screen reader users who move to the field hear "Card number, edit text, invalid entry" and never the reason. People navigating by form fields never land on the error text at all.

## Tier

`likely`: the association check is exact, but tying a message to a field is a layout heuristic.

- [Understanding 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) requires the error to be described in text; programmatic association is how that reaches screen reader users on the field.
- [Understanding 1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) covers the visual relationship being lost.

## How to fix

```html
<label for="card-number">Card number</label>
<input id="card-number" aria-describedby="card-number-error" aria-invalid="true" />
<span id="card-number-error">Enter the 16 digits on the front of your card.</span>
```

## Examples

- Barrier: [`fixtures/site/at/error-not-associated.html`](../../../fixtures/site/at/error-not-associated.html) and [`fixtures/site/states/form-errors.html`](../../../fixtures/site/states/form-errors.html)
- Correct pattern: [`fixtures/site/at/error-not-associated-ok.html`](../../../fixtures/site/at/error-not-associated-ok.html)
