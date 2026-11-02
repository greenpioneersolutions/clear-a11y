---
id: visual/text-spacing-clipped
title: Text clipped under text-spacing overrides
engine: engine-visual
wcag: [1.4.12]
tier: violation
---

# Text clipped under text-spacing overrides

**Rule:** `visual/text-spacing-clipped` · **WCAG:** 1.4.12 · **Tier:** `violation` (clipped) / `likely` (overlap) · **Engine:** `engine-visual`

## What it catches

Some people apply their own text spacing with a user stylesheet or browser extension. SC 1.4.12 requires that nothing is lost when they set:

- line height to 1.5 times the font size,
- spacing after paragraphs to 2 times the font size,
- letter spacing to 0.12 times the font size,
- word spacing to 0.16 times the font size.

This rule catches text that gets cut off (`violation`) or runs into other text (`likely`) with those settings.

## Who it affects

People with dyslexia, low vision or cognitive disabilities who read better with more space between lines, words and letters.

## How it's measured

The engine injects the same overrides as the W3C-referenced text spacing bookmarklet:

```css
*,
*::before,
*::after {
  line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important;
}
p {
  margin-bottom: 2em !important;
}
```

It compares every clipping element (`overflow: hidden | clip` with visible text) before and after. When an element hides more than 2px more content than before, that's a `violation`. It also compares the line boxes of every text element: text that overlaps another element's text or a control after the override, but not before, is `likely` (overlap can sometimes leave the text readable). The style is removed afterwards.

**Limits.** Text in `::before`/`::after` content, canvas or images of text isn't measured.

## How to fix

Don't give text containers a fixed height (or a fixed width with `white-space: nowrap`) combined with `overflow: hidden`:

```css
/* Before */
.note {
  height: 1.2em;
  line-height: 1.1;
  overflow: hidden;
}
/* After */
.note {
  min-height: 1.2em;
  line-height: 1.1;
}
```

## WCAG

[SC 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) (AA).

## Examples

- Barrier: [`fixtures/site/visual/text-spacing-clipped.html`](../../../fixtures/site/visual/text-spacing-clipped.html), [`fixtures/site/visual/text-spacing.html`](../../../fixtures/site/visual/text-spacing.html)
- Correct pattern: [`fixtures/site/visual/text-spacing-clipped-ok.html`](../../../fixtures/site/visual/text-spacing-clipped-ok.html)
