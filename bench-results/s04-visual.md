# Clear A11Y benchmark: s04-visual

Generated 2026-10-31T22:06:51.325Z. Fixture pages: 51 (21 correct-pattern).

| Metric | Value |
|---|---|
| Recall (any tier) | 57.6% (19/33) |
| Precision of `violation` | 100.0% (23/23) |
| Findings | 32 (violation 23, likely 5, needs-review 4) |
| Noise on correct-pattern pages | 1 |

## Recall by expected layer

| Layer | Recall | Matched / expected |
|---|---|---|
| ai | 0.0% | 0/2 |
| at | 0.0% | 0/4 |
| keyboard | 0.0% | 0/6 |
| states | 0.0% | 0/1 |
| static | 100.0% | 4/4 |
| visual | 100.0% | 15/15 |
| widgets | 0.0% | 0/1 |

## Issues found, by the layer that found them

| Layer | Issues |
|---|---|
| static | 7 |
| visual | 15 |

## Recall by WCAG success criterion

| SC | Title | Recall | Matched / expected |
|---|---|---|---|
| 1.1.1 | Non-text Content | 50.0% | 1/2 |
| 1.4.3 | Contrast (Minimum) | 100.0% | 3/3 |
| 1.4.4 | Resize Text | 100.0% | 2/2 |
| 1.4.10 | Reflow | 100.0% | 4/4 |
| 1.4.11 | Non-text Contrast | 100.0% | 1/1 |
| 1.4.12 | Text Spacing | 100.0% | 2/2 |
| 1.4.13 | Content on Hover or Focus | 100.0% | 3/3 |
| 2.1.1 | Keyboard | 0.0% | 0/2 |
| 2.1.2 | No Keyboard Trap | 0.0% | 0/1 |
| 2.4.3 | Focus Order | 0.0% | 0/3 |
| 2.4.4 | Link Purpose (In Context) | 0.0% | 0/1 |
| 2.4.7 | Focus Visible | 0.0% | 0/1 |
| 2.5.8 | Target Size (Minimum) | 100.0% | 1/1 |
| 3.1.1 | Language of Page | 100.0% | 1/1 |
| 3.3.1 | Error Identification | 0.0% | 0/1 |
| 3.3.2 | Labels or Instructions | 0.0% | 0/1 |
| 4.1.2 | Name, Role, Value | 50.0% | 1/2 |
| 4.1.3 | Status Messages | 0.0% | 0/2 |

## Findings on correct-pattern pages

- `visual/ok.html` static/color-contrast [needs-review] on `h2`

## Missed issues

- `ai/alt-filename.html` (1.1.1, ai): Alt text is a file name (IMG_2041.jpg), not a description of the photo.
- `ai/link-purpose.html` (2.4.4, ai): Three identical Click here links go to different places with no context.
- `at/disclosure-no-state.html` (4.1.2, at): FAQ toggle shows and hides content but never exposes aria-expanded.
- `at/status-message.html` (4.1.3, at): Added to cart confirmation is not a live region, so it is not announced.
- `keyboard/clickable-div.html` (2.1.1, 4.1.2, keyboard): Pay now is a div with a click handler: it cannot be reached or activated with a keyboard.
- `keyboard/focus-not-visible.html` (2.4.7, keyboard): Navigation links have outline: none and no replacement, so keyboard focus is invisible.
- `keyboard/focus-order-backward.html` (2.4.3, 1.3.2, keyboard): Tab goes First name, Country (row 2), then back up to Last name: focus order does not follow the visual order.
- `keyboard/keyboard-trap.html` (2.1.2, keyboard): The comment editor swallows Tab and Shift+Tab; keyboard users cannot leave it.
- `states/form-errors.html` (3.3.1, states): After submitting empty, the error text is not associated with the fields (no aria-invalid or aria-describedby).
- `states/form-errors.html` (4.1.3, at): Error messages are injected silently: no live region and focus does not move, so screen reader users are not told.
- `states/modal-focus.html` (2.4.3, keyboard): Opening the settings dialog leaves focus on the trigger behind it; focus is not moved into the dialog.
- `states/modal-focus.html` (2.4.3, keyboard): Closing the dialog drops focus to the document instead of returning it to Open settings.
- `static/form-missing-label.html` (3.3.2, 1.3.1, 4.1.2, at): Email field has no visible label; the placeholder is the only hint and disappears as soon as you type. Rules scanners accept the placeholder as a name.
- `widgets/tabs-no-arrow-keys.html` (2.1.1, widgets): Inactive tabs have tabindex=-1 and there is no arrow-key handler, so they cannot be reached by keyboard.
