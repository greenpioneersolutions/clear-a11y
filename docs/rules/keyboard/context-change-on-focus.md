---
id: keyboard/context-change-on-focus
title: Focus causes a change of context
engine: engine-keyboard
wcag: [3.2.1]
tier: likely
---

# Focus causes a change of context

**Rule:** `keyboard/context-change-on-focus` · **WCAG:** 3.2.1 · **Tier:** `violation` (navigation, new window) / `likely` (the rest) · **Engine:** `engine-keyboard`

## What it catches

Something big happens just because keyboard focus moved onto an element, before the user activated anything:

- the page loads another page (`violation`);
- a new window opens (`violation`);
- a form is submitted (`likely`);
- a modal dialog opens (`likely`);
- a script moves focus to another element, or removes focus so it falls back to the page (`likely`).

Showing a hint, expanding a menu or highlighting a field on focus is a change of _content_, not of context, and is fine.

## Who it affects

Keyboard-only users, switch users and screen reader users. They explore a page by pressing Tab to find out what's on it. If tabbing onto a link loads its page, they can never get past that link: the new page starts at the top again. If focus opens a window or a dialog, or is moved away, they lose their place and may not know where they are.

## How it's measured

During the real Tab walk (the same one the other keyboard rules use), a recorder in the page logs what each Tab press caused. The log starts over on every Tab keydown, so the engine's own blur and refocus between presses are never blamed on a stop.

- **Navigation:** a route answers main-frame requests for another document with a local `204 No Content`, so the browser stays on the page, the walk continues and nothing reaches the server. A navigation counts only if the page also announced it (`beforeunload`) during that press. Changes of only the `#hash` are ignored.
- **New window:** `window.open()` is replaced by a recorder that returns `null`, so no window really opens.
- **Form submitted:** a `submit` event during the press.
- **Modal opened:** a `<dialog>` opened with `showModal()` or a visible `aria-modal="true"` element that wasn't there before the press.
- **Focus moved or removed:** the element Tab landed on is not what has focus at the end of the press. Focus moved into a descendant (composite widgets that delegate focus to their active item) and hidden 1-pixel sentinels (focus traps that wrap focus around a dialog) are not reported.

Navigation and new windows are certain changes of context, so they are `violation`. The others are `likely`: a submit handler may only validate, and moving focus is sometimes part of a pattern a person should confirm. Changes made later by a timer (after the press has finished) are not caught.

## How to fix

Change context only when the user activates a control or submits a form. Show help inline instead of opening a window or dialog on focus, and never move or remove focus from a `focus` handler.

```html
<!-- Before: tabbing onto the field opens a window -->
<input id="email" type="email" onfocus="window.open('privacy.html')" />

<!-- After: a hint appears on focus; the policy opens only when the link is activated -->
<input id="email" type="email" aria-describedby="email-hint" />
<p id="email-hint">We only use it for the newsletter.</p>
<a href="privacy.html" target="_blank">Privacy policy (opens in a new window)</a>
```

## WCAG

[SC 3.2.1 On Focus](https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html) (A): "When any user interface component receives focus, it does not initiate a change of context." The Understanding document lists opening a new window, moving focus to a different component, going to a new page and significantly re-arranging the page as changes of context. Related failures: [F52](https://www.w3.org/WAI/WCAG22/Techniques/failures/F52) (opening a new window without the user asking) and [F55](https://www.w3.org/WAI/WCAG22/Techniques/failures/F55) (removing focus when it is received).

## Examples

- Barrier: [`fixtures/site/keyboard/context-change-on-focus.html`](../../../fixtures/site/keyboard/context-change-on-focus.html) (the Email field opens a window on focus)
- Barrier: [`fixtures/site/keyboard/context-change-on-focus-navigation.html`](../../../fixtures/site/keyboard/context-change-on-focus-navigation.html) (section links load their page on focus)
- Correct pattern: [`fixtures/site/keyboard/context-change-on-focus-ok.html`](../../../fixtures/site/keyboard/context-change-on-focus-ok.html)
