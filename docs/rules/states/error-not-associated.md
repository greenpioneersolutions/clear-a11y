---
id: states/error-not-associated
title: Error message not associated with its field
engine: engine-states
wcag: [3.3.1, 1.3.1]
tier: violation
---

# Error message not associated with its field

**Rule:** `states/error-not-associated` · **WCAG:** 3.3.1, 1.3.1 · **Tier:** `violation` (or `likely`, see below) · **Engine:** `engine-states`

## What it catches

The states engine submits each form on the page twice: once empty, and once with values that a correct form must reject (`not-an-email` in an email field, a number below `min`, text that breaks `pattern` or `minlength`). After each submit it looks for new visible text in the area around each field (its label, hint and message area).

When an error message appears next to a field but nothing in the code ties it to that field, the rule reports it:

- `violation`: the message is visible, the field has no `aria-invalid="true"`, and neither `aria-describedby` nor `aria-errormessage` (nor the field's `<label>`) contains the message. This is deterministic: the engine saw the text appear and checked every association.
- `likely`: the field is marked `aria-invalid="true"` but the message is still not linked. Screen reader users learn that the field is wrong but not why.

The finding's state is the form state where the error was seen (`form-empty#<form>` or `form-invalid#<form>`), and its evidence lists the message text and the value that was typed.

WCAG references: [Understanding SC 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) asks that the item in error is identified and the error is described in text. [Understanding SC 1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) asks that relationships shown visually (this message belongs to this field) are also available in code. See also technique [ARIA21: Using aria-invalid to indicate an error field](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21).

## Who it affects

Screen reader users. They usually move from field to field, and a message printed under a field is not read when the field gets focus. They submit, nothing seems to happen, and they have to hunt through the page to find out what went wrong. Voice control and screen magnifier users who only see part of the page have the same problem.

## How to fix

Mark the field invalid and point it at its message. Remove both when the error is fixed.

```html
<label for="email">Email</label>
<input id="email" type="email" aria-invalid="true" aria-describedby="email-error" />
<p id="email-error">Enter an email address like name@example.com</p>
```

`aria-errormessage="email-error"` works too, but some screen readers do not announce it yet, so also make the message a live region or reference it from `aria-describedby`. Moving focus to the first invalid field, or showing an error summary with `role="alert"`, helps people find the errors quickly.

## Examples

- Barrier: [`fixtures/site/states/error-not-associated.html`](../../../fixtures/site/states/error-not-associated.html) (the phone error only appears with an invalid value) and [`fixtures/site/states/form-errors.html`](../../../fixtures/site/states/form-errors.html)
- Correct pattern: [`fixtures/site/states/error-not-associated-ok.html`](../../../fixtures/site/states/error-not-associated-ok.html) and [`fixtures/site/states/ok.html`](../../../fixtures/site/states/ok.html)
