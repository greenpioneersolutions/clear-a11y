---
id: at/link-text-generic
title: Same generic link text for different destinations
engine: engine-at
wcag: [2.4.4]
tier: likely
---

# Same generic link text for different destinations

**Rule:** `at/link-text-generic` · **WCAG:** 2.4.4 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

Two or more links with the same generic name ("Click here", "Read more", "More", "Here", "Learn more", "Details"...) that go to different places, when nothing in their programmatically determined context tells them apart.

The engine groups generic links by their accessible name plus their context:

- the rest of the text in the same paragraph, list item or table cell, if there is any;
- otherwise the nearest heading before the link.

A group whose links point to two or more different URLs is reported, one finding per link. Links with an `aria-describedby` description are left out (the description is context), and so are links whose `aria-label` or `aria-labelledby` makes the name specific ("Read more about the 2025 annual report").

Whether a single "Read more" link is clear enough in its sentence is a judgment call for the AI layer's `ai/link-purpose` judge.

## Who it affects

- Screen reader users who pull up a list of links, or tab from link to link, hear "Read more, Read more, Read more" with no way to tell the destinations apart.
- Speech-input users who say "click Read more" get a list of identical choices.

## Tier

`likely`: the measurement is exact, but context outside what code reads (a table header cell, an image right before the link) can occasionally make the purpose clear. [Understanding 2.4.4 Link Purpose (In Context)](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html) accepts context from the same sentence, paragraph, list item, table cell or preceding heading (technique [H80](https://www.w3.org/WAI/WCAG22/Techniques/html/H80)); this rule only reports links where none of these differ.

## How to fix

Make the link text say where it goes, or give each link distinguishing context:

```html
<!-- Before -->
<li><a href="/news/new-office">Read more</a></li>
<li><a href="/news/award">Read more</a></li>

<!-- After: descriptive link text -->
<li><a href="/news/new-office">We opened a new office</a></li>
<li><a href="/news/award">We won a design award</a></li>

<!-- Or: context in the same list item -->
<li>We opened a new office. <a href="/news/new-office">Read more</a></li>
```

## Examples

- Barrier: [`fixtures/site/at/link-text-generic.html`](../../../fixtures/site/at/link-text-generic.html) and [`fixtures/site/ai/link-purpose.html`](../../../fixtures/site/ai/link-purpose.html)
- Correct pattern: [`fixtures/site/at/link-text-generic-ok.html`](../../../fixtures/site/at/link-text-generic-ok.html)
