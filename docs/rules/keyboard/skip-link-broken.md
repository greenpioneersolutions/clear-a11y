---
id: keyboard/skip-link-broken
title: Skip link is broken
engine: engine-keyboard
wcag: [2.4.1]
tier: violation
---

# Skip link is broken

**Rule:** `keyboard/skip-link-broken` · **WCAG:** 2.4.1 · **Tier:** `violation` · **Engine:** `engine-keyboard`

## What it catches

A "Skip to main content" link that points at an element that doesn't exist, or that doesn't actually move the keyboard past the navigation when activated.

## Who it affects

Keyboard-only and switch users still have to Tab through every navigation link on every page, and they were promised a shortcut.

## WCAG and tier

[2.4.1 Bypass Blocks](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html) requires a way to skip repeated blocks; a skip link is the common technique ([G1](https://www.w3.org/WAI/WCAG22/Techniques/general/G1)). A skip link that goes nowhere fails the technique and misleads users. Both checks are deterministic, so the tier is `violation`.

## How to fix

Point the link at an element that exists. Give the target `tabindex="-1"` so browsers move focus to it reliably.

```html
<a class="skip" href="#main">Skip to main content</a>
...
<main id="main" tabindex="-1">...</main>
```

## How it's detected

Only in the default state. Among the first three Tab stops, an in-page link (`href="#..."`) whose name talks about skipping (skip, jump, bypass, "go to content", "main content") is a skip link. The engine checks that an element with that id (or name) exists. If it does, it activates the link with Enter, presses Tab, and checks that focus landed inside or after the target in document order.

## Limitations

- Skip links further down than the third stop, or with unusual names, are not recognized.
- Pages without a skip link are covered by `keyboard/skip-link-missing`.

## Examples

- Barrier: [`fixtures/site/keyboard/skip-link-broken.html`](../../../fixtures/site/keyboard/skip-link-broken.html)
- Correct pattern: [`fixtures/site/keyboard/skip-link-broken-ok.html`](../../../fixtures/site/keyboard/skip-link-broken-ok.html)
