---
id: keyboard/focus-obscured
title: Focused element hidden by other content
engine: engine-keyboard
wcag: [2.4.11]
tier: violation
---

# Focused element hidden by other content

**Rule:** `keyboard/focus-obscured` · **WCAG:** 2.4.11 · **Tier:** `violation` · **Engine:** `engine-keyboard`

## What it catches

A control receives keyboard focus but is completely covered by a sticky header, sticky footer or banner, so nobody can see it.

## Who it affects

Keyboard-only and switch users can't see what they are about to activate. Screen magnifier users lose the focus entirely.

## WCAG and tier

[2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) requires that a focused component is not entirely hidden by author-created content. Partly covered is allowed at level AA, so the rule only fires when every sample point is covered. That is deterministic, so the tier is `violation`.

The Understanding document makes an exception for **content opened by the user**: if the user can reveal the focused component without moving keyboard focus (for example by pressing Escape to close a panel they opened), the component is not considered hidden. The rule applies it: in any state the user opened (not the default page load), it focuses each covered stop again, presses Escape and samples again. When focus stayed on the element and it is no longer entirely covered, nothing is reported.

## How to fix

Reserve room for sticky content so focused elements scroll clear of it:

```css
html {
  scroll-padding-top: 4rem; /* sticky header height */
  scroll-padding-bottom: 45vh; /* sticky footer height */
}
```

Or make the banner smaller, non-overlapping, or dismissible.

## How it's detected

At each stop of the Tab walk (after the browser has scrolled the element into view), the engine samples a 3 x 3 grid of points inside the on-screen part of the element's box with `elementFromPoint`. A point counts as covered when it hits an element inside a `position: fixed` or `sticky` container that is not the focused element, its label, an ancestor or a descendant. If all nine points are covered, the element is entirely obscured.

## Limitations

- Only fixed and sticky content counts as covering, which is the case 2.4.11 describes. Overlap caused by other layout bugs is not reported.
- In an overlay state (an open dialog or menu), only stops inside the overlay are checked: content behind a modal is expected to be covered.
- The user-opened-content exception is tested with Escape only (up to five covered stops per state). Content that can only be dismissed some other way without moving focus is still reported; check it by hand.
- Content shown on page load (a cookie banner, a promo bar) is not opened by the user, so the exception never applies to the default state.
- Covering elements with `pointer-events: none` are invisible to `elementFromPoint`.

## Examples

- Barrier: [`fixtures/site/keyboard/focus-obscured.html`](../../../fixtures/site/keyboard/focus-obscured.html)
- Correct pattern: [`fixtures/site/keyboard/focus-obscured-ok.html`](../../../fixtures/site/keyboard/focus-obscured-ok.html)
- Correct pattern (user-opened panel that Escape closes): [`fixtures/site/keyboard/focus-obscured-dismissible-ok.html`](../../../fixtures/site/keyboard/focus-obscured-dismissible-ok.html)
