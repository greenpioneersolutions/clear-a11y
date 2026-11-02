---
id: keyboard/skip-link-missing
title: No way to bypass repeated blocks
engine: engine-keyboard
wcag: [2.4.1]
tier: needs-review
---

# No way to bypass repeated blocks

**Rule:** `keyboard/skip-link-missing` · **WCAG:** 2.4.1 · **Tier:** `needs-review` · **Engine:** `engine-keyboard`

## What it catches

A block of navigation links comes before the content (five or more Tab stops), and the page has no skip link, no `main` landmark and no headings to jump past it.

## Who it affects

Keyboard-only and switch users press Tab through the same links on every page. Screen reader users have no landmark or heading to jump to.

## WCAG and tier

[2.4.1 Bypass Blocks](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html) can be met with a skip link, landmarks ([ARIA11](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA11)) or headings ([H69](https://www.w3.org/WAI/WCAG22/Techniques/html/H69)). Because landmarks and headings count, and because what is "repeated" depends on the rest of the site, this is never a violation. A human answers "Can keyboard users skip this repeated navigation block some other way?".

## How to fix

```html
<a class="skip" href="#main">Skip to main content</a>
<header>
  <nav aria-label="Main">...</nav>
</header>
<main id="main" tabindex="-1">
  <h1>Page title</h1>
  ...
</main>
```

## How it's detected

Only in the default state. The engine counts the consecutive Tab stops from the start of the page that sit inside `nav`, `header`, `[role=navigation]` or `[role=banner]`. With five or more, no skip link among the first stops, no `main`/`[role=main]` and no headings, it asks for review. The finding targets the first navigation container.

## Limitations

- Navigation built without `nav`/`header` markup isn't recognized as navigation.
- It cannot tell whether the block repeats across pages; it only sees one page.

## Examples

- Barrier: [`fixtures/site/keyboard/skip-link-missing.html`](../../../fixtures/site/keyboard/skip-link-missing.html)
- Correct pattern: [`fixtures/site/keyboard/skip-link-missing-ok.html`](../../../fixtures/site/keyboard/skip-link-missing-ok.html)
