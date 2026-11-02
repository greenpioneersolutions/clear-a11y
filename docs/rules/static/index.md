---
engine: engine-static
---

# Static rules (axe-core)

The static layer runs [axe-core](https://github.com/dequelabs/axe-core) on every page and state, limited to rules tagged with a WCAG 2.0, 2.1 or 2.2 success criterion at level A or AA. Best-practice rules without a success criterion are not run.

| axe result                  | Clear A11Y tier                        | Confidence |
| --------------------------- | -------------------------------------- | ---------- |
| violation                   | `violation`                            | 0.95       |
| incomplete ("needs review") | `needs-review`, with a yes/no question | 0.5        |

Rule ids are `static/<axe rule id>`, for example `static/image-alt` or `static/color-contrast`. Each finding links to the Deque University page for the rule in its `fix` text.

## Why axe isn't enough on its own

axe checks what can be decided from the DOM and computed styles. It can't tell whether focus moves in a sensible order, whether a modal traps focus, whether content reflows at 320px or whether an error message is announced. Those are covered by the keyboard, states, visual, accessibility-tree and widget engines. The benchmark's "found by" table shows which layer caught each issue.

## What axe catches on the WCAG 2.2 fixtures

The `fixtures/site/wcag/` area has one barrier per WCAG 2.2 A/AA criterion. axe-core finds these on its own:

| Criterion               | Fixture                                      | axe rule                               | Tier           |
| ----------------------- | -------------------------------------------- | -------------------------------------- | -------------- |
| 2.4.2 Page Titled       | `wcag/2-4-2-page-titled.html` (no `<title>`) | `document-title`                       | `violation`    |
| 2.2.1 Timing Adjustable | `wcag/2-2-1-timing-adjustable.html`          | `meta-refresh`                         | `violation`    |
| 1.4.1 Use of Color      | `wcag/1-4-1-use-of-color.html`               | `link-in-text-block`                   | `violation`    |
| 1.2.2 Captions          | `wcag/1-2-2-captions.html`                   | `video-caption` (incomplete)           | `needs-review` |
| 1.2.4 Captions (Live)   | `wcag/1-2-4-live-captions.html`              | `video-caption` (incomplete, as 1.2.2) | `needs-review` |
| 1.4.2 Audio Control     | `wcag/1-4-2-audio-control.html`              | `no-autoplay-audio` (incomplete)       | `needs-review` |

axe does **not** catch the 1.3.1 fixture (`wcag/1-3-1-info-relationships.html`, a data table whose header row is bold `<td>` cells): its data-table heuristics treat the table as a layout table, so `td-has-header` never runs. `autocomplete-valid` only reports invalid tokens, not missing ones (`at/autocomplete-missing` covers those), and axe has no rule for 3.1.2 Language of Parts beyond checking that `lang` values are valid.

## Fixtures

- Barriers: `fixtures/site/static/*.html`
- Correct pattern: `fixtures/site/static/ok.html`
