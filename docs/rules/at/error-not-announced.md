---
id: at/error-not-announced
title: Form error not announced
engine: engine-at
wcag: [4.1.3]
tier: likely
---

# Form error not announced

**Rule:** `at/error-not-announced` · **WCAG:** 4.1.3 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

Error messages that appear after a failed submit without being announced. With the announcement recorder installed, the engine:

- in the default state, submits each form empty by pressing its submit button (forms whose browser validation blocks the submit are skipped, because browsers announce their own messages; forms the page doesn't handle are stopped before they navigate);
- in a `form-invalid` or `form-empty` state from the state explorer, replays the state (`stateMeta.replay`) with the recorder watching.

It reports when error text appeared outside live regions, nothing was announced, and focus did not move: it stayed on the submit button or the page, rather than going to a field, an error summary or the message. Evidence `announcement` holds the recorded queue, or "nothing announced".

## Who it affects

Screen reader users press "Create account" and hear nothing. They don't know the form was rejected, or which fields to fix.

## Tier

`likely`: the recording is deterministic, but a page can tell users about errors in ways the recorder can't see (for example, a new page title). See [Understanding 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) and [technique ARIA19](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19).

## How to fix

After a failed submit, do one of these:

- move focus to an error summary (`tabindex="-1"`) that lists the problems;
- move focus to the first invalid field, with its error linked through `aria-describedby`;
- write a short summary into a `role="alert"` or `role="status"` region that is in the page from load.

```html
<div id="error-summary" role="status"></div>
```

## Examples

- Barrier: [`fixtures/site/at/error-not-announced.html`](../../../fixtures/site/at/error-not-announced.html) and [`fixtures/site/states/form-errors.html`](../../../fixtures/site/states/form-errors.html)
- Correct pattern: [`fixtures/site/at/error-not-announced-ok.html`](../../../fixtures/site/at/error-not-announced-ok.html) and [`fixtures/site/states/ok.html`](../../../fixtures/site/states/ok.html)
