---
id: at/label-in-name
title: Visible label not in accessible name
engine: engine-at
wcag: [2.5.3]
tier: likely
---

# Visible label not in accessible name

**Rule:** `at/label-in-name` · **WCAG:** 2.5.3 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

A control whose visible label is not contained in its accessible name. Only author-supplied names can drift, so the engine checks controls whose name comes from `aria-label` or `aria-labelledby` (read from the accessibility tree). The visible label is the control's rendered text, or its `<label>` text for form fields. Both are compared after ignoring case, whitespace and punctuation, as whole words.

Icon-only controls and one-character symbols ("X", "+", "→") are skipped: whether their name fits is a judgment call for the AI layer. axe-core's `label-content-name-mismatch` rule is experimental and not run by `engine-static`.

## Who it affects

Speech-input users (Dragon, Voice Control) say what they see: "click Search". If the accessible name is "Find products", nothing happens. Screen reader users who can see the screen hear words that don't match it.

## Tier

`likely`: the comparison is deterministic, but [Understanding 2.5.3 Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html) leaves room for judgment (for example, which text counts as the label when a control has several pieces of text).

## How to fix

Start the accessible name with the visible text, or drop the `aria-label`:

```html
<!-- before -->
<button aria-label="Find products">Search</button>
<!-- after -->
<button aria-label="Search products">Search</button>
```

## Examples

- Barrier: [`fixtures/site/at/label-in-name.html`](../../../fixtures/site/at/label-in-name.html)
- Correct pattern: [`fixtures/site/at/label-in-name-ok.html`](../../../fixtures/site/at/label-in-name-ok.html)
