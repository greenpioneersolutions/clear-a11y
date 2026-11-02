---
id: at/auth-paste-blocked
title: Password or code field blocks paste or password managers
engine: engine-at
wcag: [3.3.8]
tier: likely
---

# Password or code field blocks paste or password managers

**Rule:** `at/auth-paste-blocked` · **WCAG:** 3.3.8 · **Tier:** `likely` · **Engine:** `engine-at`

## What it catches

On a fresh load, the engine dispatches a cancelable `paste` event on every visible password field and one-time-code field (`autocomplete="one-time-code"`). If the page cancels it (`preventDefault()`, or an `onpaste="return false"` attribute), the field blocks paste. It also reports `autocomplete="off"` on the only password field of a form that is not a sign-up form (no `new-password`), at a lower confidence.

## Who it affects

- People who rely on a password manager or copy codes from another app: many people with memory, dyslexia, dyscalculia or motor disabilities.
- Blocking paste turns sign-in into a cognitive function test (remember and transcribe a secret), which 3.3.8 does not allow without an alternative.

## Tier

`likely`. Another sign-in method on the page (a passkey, an email link) can satisfy 3.3.8, and some browsers ignore `autocomplete="off"` on password fields. See [Understanding 3.3.8 Accessible Authentication (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html).

## How to fix

Never cancel paste on password or code fields, and use the right tokens:

```html
<input id="password" type="password" autocomplete="current-password" />
<input id="code" inputmode="numeric" autocomplete="one-time-code" />
```

## Examples

- Barrier: [`fixtures/site/wcag/3-3-8-accessible-authentication.html`](../../../fixtures/site/wcag/3-3-8-accessible-authentication.html)
- Correct pattern: [`fixtures/site/wcag/3-3-8-accessible-authentication-ok.html`](../../../fixtures/site/wcag/3-3-8-accessible-authentication-ok.html)
