---
id: at/placeholder-only-label
title: Placeholder used as the only label
engine: engine-at
wcag: [3.3.2, 1.3.1, 4.1.2]
tier: likely
---

# Placeholder used as the only label

**Rule:** `at/placeholder-only-label` · **WCAG:** 3.3.2, 1.3.1, 4.1.2 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

A text field (textbox, searchbox, combobox, spinbutton) whose accessible name comes from its `placeholder` (or `aria-placeholder`) and from nothing else. The engine reads the name source the browser actually used from the accessibility tree, so a field with a `<label>`, `aria-label`, `aria-labelledby` or `title` is never reported.

axe-core accepts a placeholder as an accessible name, so `engine-static` passes these fields. Human auditors log them, which is why this rule exists.

## Who it affects

- People with memory or attention difficulties: the hint disappears as soon as they start typing, and is gone when they review the form.
- Low-vision users: placeholder text is usually light grey and hard to read.
- Screen reader users: not every screen reader and browser combination reads placeholders reliably.

## Tier

`likely`: the measurement is exact, but whether a placeholder is an adequate label is a matter of interpretation. The W3C [Understanding 3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html) asks for labels that stay available; most auditors treat a placeholder-only field as a failure, a few accept it for one-field search forms.

## How to fix

Add a visible label and keep the placeholder for an example at most:

```html
<label for="site-search">Search products</label>
<input id="site-search" type="search" placeholder="e.g. trail shoes" />
```

## Examples

- Barrier: [`fixtures/site/at/placeholder-only-label.html`](../../../fixtures/site/at/placeholder-only-label.html) and [`fixtures/site/static/form-missing-label.html`](../../../fixtures/site/static/form-missing-label.html)
- Correct pattern: [`fixtures/site/at/placeholder-only-label-ok.html`](../../../fixtures/site/at/placeholder-only-label-ok.html)
