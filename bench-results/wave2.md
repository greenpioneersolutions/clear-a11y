# Clear A11Y benchmark

Generated 2026-10-31T23:00:01.805Z. Fixture pages: 120 (58 correct-pattern).

| Metric | Value |
|---|---|
| Recall (any tier) | 97.0% (65/67) |
| Precision of `violation` | 100.0% (63/63) |
| Findings | 132 (violation 63, likely 42, needs-review 27) |
| Noise on correct-pattern pages | 6 |

## Recall by expected layer

| Layer | Recall | Matched / expected |
|---|---|---|
| ai | 0.0% | 0/2 |
| at | 100.0% | 14/14 |
| keyboard | 100.0% | 14/14 |
| states | 100.0% | 7/7 |
| static | 100.0% | 4/4 |
| visual | 100.0% | 15/15 |
| widgets | 100.0% | 11/11 |

## Issues found, by the layer that found them

| Layer | Issues |
|---|---|
| at | 17 |
| keyboard | 17 |
| states | 7 |
| static | 11 |
| visual | 15 |
| widgets | 14 |

## Recall by WCAG success criterion

| SC | Title | Recall | Matched / expected |
|---|---|---|---|
| 1.1.1 | Non-text Content | 50.0% | 1/2 |
| 1.4.3 | Contrast (Minimum) | 100.0% | 4/4 |
| 1.4.4 | Resize Text | 100.0% | 2/2 |
| 1.4.10 | Reflow | 100.0% | 4/4 |
| 1.4.11 | Non-text Contrast | 100.0% | 1/1 |
| 1.4.12 | Text Spacing | 100.0% | 2/2 |
| 1.4.13 | Content on Hover or Focus | 100.0% | 3/3 |
| 2.1.1 | Keyboard | 100.0% | 8/8 |
| 2.1.2 | No Keyboard Trap | 100.0% | 1/1 |
| 2.4.1 | Bypass Blocks | 100.0% | 2/2 |
| 2.4.3 | Focus Order | 100.0% | 6/6 |
| 2.4.4 | Link Purpose (In Context) | 50.0% | 1/2 |
| 2.4.7 | Focus Visible | 100.0% | 2/2 |
| 2.4.11 | Focus Not Obscured (Minimum) | 100.0% | 1/1 |
| 2.5.3 | Label in Name | 100.0% | 1/1 |
| 2.5.8 | Target Size (Minimum) | 100.0% | 1/1 |
| 3.1.1 | Language of Page | 100.0% | 1/1 |
| 3.3.1 | Error Identification | 100.0% | 5/5 |
| 3.3.2 | Labels or Instructions | 100.0% | 2/2 |
| 4.1.2 | Name, Role, Value | 100.0% | 12/12 |
| 4.1.3 | Status Messages | 100.0% | 5/5 |

## Findings on correct-pattern pages

- `visual/hover-content-not-dismissible-ok.html` static/color-contrast [needs-review] on `p:nth-child(3)`
- `visual/hover-content-not-hoverable-ok.html` static/color-contrast [needs-review] on `#shipping-tip`
- `visual/hover-content-not-hoverable-ok.html` static/color-contrast [needs-review] on `p`
- `visual/hover-content-not-persistent-ok.html` static/color-contrast [needs-review] on `#password-tip`
- `visual/hover-content-not-persistent-ok.html` static/color-contrast [needs-review] on `p`
- `visual/ok.html` static/color-contrast [needs-review] on `h2`

## Missed issues

- `ai/alt-filename.html` (1.1.1, ai): Alt text is a file name (IMG_2041.jpg), not a description of the photo.
- `ai/link-purpose.html` (2.4.4, ai): Three identical Click here links go to different places with no context.
