---
id: widgets/tabs-selected-state
title: aria-selected follows the shown tab panel
engine: engine-widgets
wcag: [4.1.2]
tier: violation
---

# aria-selected follows the shown tab panel

**Rule:** `widgets/tabs-selected-state` · **WCAG:** 4.1.2 · **Tier:** `violation` · **Engine:** `engine-widgets`

## What it catches

Tabs whose `aria-selected` does not match the panel on screen. The engine clicks each inactive tab (up to three, each on a fresh page) and checks that the clicked tab's panel appeared, that the clicked tab now has `aria-selected="true"`, and that no other tab still claims to be selected. It also checks the state at load. Panels are matched to tabs through `aria-controls`, or a `role="tabpanel"` labelled by the tab.

Only activations that visibly worked are judged (the tab's panel appeared), and tabs without a panel mapping are skipped, so the rule only fires when the page itself contradicts its own ARIA.

## Who it affects

Screen reader users hear "Delivery, tab, selected" while they are reading the Returns panel. They lose track of where they are and may not realise the content changed.

## Tier

`violation` under WCAG [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html): the selected state of a user interface component must be programmatically determinable and kept up to date. A stale `aria-selected` reports the wrong state, which is a deterministic failure.

## How to fix

Update every tab whenever a tab is activated:

```js
function activate(tab) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  }
}
```

Styling the selected tab with `[aria-selected='true']` instead of a separate class keeps the visual and programmatic state from drifting apart.

## Examples

- Barrier: [`fixtures/site/widgets/tabs-selected-state.html`](../../../fixtures/site/widgets/tabs-selected-state.html)
- Correct pattern: [`fixtures/site/widgets/tabs-selected-state-ok.html`](../../../fixtures/site/widgets/tabs-selected-state-ok.html)
