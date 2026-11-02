---
id: at/state-missing
title: Required widget state missing
engine: engine-at
wcag: [4.1.2]
tier: violation
---

# Required widget state missing

**Rule:** `at/state-missing` · **WCAG:** 4.1.2 · **Tier:** `violation` · **Engine:** `engine-at`

## What it catches

A custom widget that does not expose the state its role needs. Today the engine checks tab lists: when no tab in a visible `role="tablist"` has `aria-selected="true"`, browsers expose every tab as "not selected". The active tab is usually shown only with a CSS class.

The engine keeps a full required-state table (`required-states.ts`: `aria-checked` for checkbox, switch and checkable menu items, `aria-expanded` for combobox, `aria-valuenow` for slider). Those roles are already reported by axe-core's `aria-required-attr` rule in `engine-static`, so engine-at skips them to avoid duplicate findings.

## Who it affects

Screen reader users hear "Monthly, tab, 1 of 2" and "Yearly, tab, 2 of 2", never "selected". They cannot tell which panel is showing without reading the whole page.

## Tier

`violation`: the attribute values are read straight from the DOM. A tab list always has one active tab, and [WCAG 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) requires that state to be programmatically determinable.

## How to fix

Mark the active tab and keep it in sync:

```html
<div role="tablist" aria-label="Billing period">
  <button role="tab" aria-selected="true" aria-controls="panel-monthly">Monthly</button>
  <button role="tab" aria-selected="false" aria-controls="panel-yearly" tabindex="-1">
    Yearly
  </button>
</div>
```

When the user switches tabs, set `aria-selected="false"` on the old tab and `"true"` on the new one. See the [APG tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

## Examples

- Barrier: [`fixtures/site/at/state-missing.html`](../../../fixtures/site/at/state-missing.html)
- Correct pattern: [`fixtures/site/at/state-missing-ok.html`](../../../fixtures/site/at/state-missing-ok.html)
