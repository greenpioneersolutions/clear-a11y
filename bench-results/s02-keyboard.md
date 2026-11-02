# Clear A11Y benchmark: s02-keyboard

Generated 2026-10-31T21:59:58.687Z. Fixture pages: 49 (21 correct-pattern).

| Metric | Value |
|---|---|
| Recall (any tier) | 50.0% (15/30) |
| Precision of `violation` | 100.0% (15/15) |
| Findings | 24 (violation 15, likely 3, needs-review 6) |
| Noise on correct-pattern pages | 1 |

## Recall by expected layer

| Layer | Recall | Matched / expected |
|---|---|---|
| ai | 0.0% | 0/2 |
| at | 0.0% | 0/4 |
| keyboard | 64.3% | 9/14 |
| states | 0.0% | 0/1 |
| static | 100.0% | 4/4 |
| visual | 50.0% | 2/4 |
| widgets | 0.0% | 0/1 |

## Issues found, by the layer that found them

| Layer | Issues |
|---|---|
| keyboard | 9 |
| static | 6 |

## Recall by WCAG success criterion

| SC | Title | Recall | Matched / expected |
|---|---|---|---|
| 1.1.1 | Non-text Content | 50.0% | 1/2 |
| 1.4.3 | Contrast (Minimum) | 100.0% | 2/2 |
| 1.4.10 | Reflow | 0.0% | 0/1 |
| 1.4.12 | Text Spacing | 0.0% | 0/1 |
| 2.1.1 | Keyboard | 50.0% | 2/4 |
| 2.1.2 | No Keyboard Trap | 100.0% | 1/1 |
| 2.4.1 | Bypass Blocks | 100.0% | 2/2 |
| 2.4.3 | Focus Order | 20.0% | 1/5 |
| 2.4.4 | Link Purpose (In Context) | 0.0% | 0/1 |
| 2.4.7 | Focus Visible | 100.0% | 2/2 |
| 2.4.11 | Focus Not Obscured (Minimum) | 100.0% | 1/1 |
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
- `keyboard/escape-does-not-close.html` (2.1.1, keyboard): Pressing Escape does not close the Filters dialog; keyboard users have to find the Close button.
- `keyboard/focus-not-returned.html` (2.4.3, keyboard): Closing the Share dialog (Escape or Close) drops focus to the page body instead of returning it to the Share button.
- `keyboard/overlay-focus-not-moved.html` (2.4.3, keyboard): Opening the Get help dialog leaves focus on the trigger behind it; focus is not moved into the dialog.
- `states/form-errors.html` (3.3.1, states): After submitting empty, the error text is not associated with the fields (no aria-invalid or aria-describedby).
- `states/form-errors.html` (4.1.3, at): Error messages are injected silently: no live region and focus does not move, so screen reader users are not told.
- `states/modal-focus.html` (2.4.3, keyboard): Opening the settings dialog leaves focus on the trigger behind it; focus is not moved into the dialog.
- `states/modal-focus.html` (2.4.3, keyboard): Closing the dialog drops focus to the document instead of returning it to Open settings.
- `static/form-missing-label.html` (3.3.2, 1.3.1, 4.1.2, at): Email field has no visible label; the placeholder is the only hint and disappears as soon as you type. Rules scanners accept the placeholder as a name.
- `visual/reflow.html` (1.4.10, visual): A fixed 1100px content column forces horizontal scrolling at 320 CSS px.
- `visual/text-spacing.html` (1.4.12, visual): With WCAG text-spacing overrides the plan description is clipped by a fixed height.
- `widgets/tabs-no-arrow-keys.html` (2.1.1, widgets): Inactive tabs have tabindex=-1 and there is no arrow-key handler, so they cannot be reached by keyboard.
