---
id: at/character-key-shortcut
title: Single-character keyboard shortcut
engine: engine-at
wcag: [2.1.4]
tier: needs-review
---

# Single-character keyboard shortcut

**Rule:** `at/character-key-shortcut` · **WCAG:** 2.1.4 · **Tier:** `needs-review` · **Engine:** `engine-at`

## What it catches

Only on pages with a key listener on `window`, `document`, `<html>` or `<body>`: the engine reloads the page, removes focus from everything and presses each letter, digit and `/ ? . ,` once, with no modifier. Browsers do nothing for these keys when the page body has focus, so a key that moves focus, changes the page, scrolls or changes the URL is a single-character shortcut. If the page changes on its own (timers, animations), DOM changes are ignored and only focus, scroll and URL changes count.

## Who it affects

- Speech input users: dictated words are typed as letters, and each letter can fire a shortcut.
- Keyboard users with tremors, who hit keys by accident.

## Tier

`needs-review`. 2.1.4 allows single-key shortcuts that can be turned off, remapped to include a modifier, or that only work while a specific component has focus; a settings page elsewhere can't be seen from here. See [Understanding 2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html).

## How to fix

Require a modifier, or offer a setting to turn shortcuts off or remap them:

```js
document.addEventListener('keydown', (event) => {
  if (!event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'j') nextStory();
});
```

## Examples

- Barrier: [`fixtures/site/wcag/2-1-4-character-key-shortcuts.html`](../../../fixtures/site/wcag/2-1-4-character-key-shortcuts.html)
- Correct pattern: [`fixtures/site/wcag/2-1-4-character-key-shortcuts-ok.html`](../../../fixtures/site/wcag/2-1-4-character-key-shortcuts-ok.html)
