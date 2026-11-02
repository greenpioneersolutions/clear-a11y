---
title: Fixtures and benchmark
description: How fixture pages, expected findings and the benchmark work, and how to add a fixture.
---

Fixtures are how Clear A11Y is measured. Every detection change adds fixtures and runs the benchmark, and no detection change merges without a benchmark result. The method and the latest numbers are on [How coverage is measured](/concepts/coverage/).

## Layout

```text
fixtures/
  site/<area>/<page>.html        A page with seeded barriers, or a correct pattern (ok.html, *-ok.html)
  expected/<area>/<page>.json    What a human auditor would log for that page
  repos/<name>/                  Sample source repos for repo scanning, with expected.json
  personas.json                  Persona tasks run on site/persona/*
```

Browse the site locally with `pnpm nx run fixtures:serve` (it serves `http://127.0.0.1:4173/`).

## Expected findings

```json
{
  "page": "keyboard/focus-order-backward.html",
  "title": "Shipping form: focus order jumps backward",
  "correctPattern": false,
  "issues": [
    {
      "id": "keyboard/focus-order-backward#1",
      "wcag": ["2.4.3", "1.3.2"],
      "selector": "#last-name | #country",
      "layer": "keyboard",
      "description": "Tab goes First name, Country, then back up to Last name."
    }
  ]
}
```

- `wcag`: the first success criterion is the primary one (used for recall by criterion); the others are accepted alternatives.
- `selector`: alternatives are separated by `|`. A finding matches when its selector equals or contains one of them, or the reverse.
- `layer`: the engine layer expected to catch it: `static`, `keyboard`, `states`, `visual`, `at`, `widgets`, `ai`, `persona` or `repo`.
- Correct-pattern pages have `"correctPattern": true` and no issues. Any finding on them counts as noise.

## Add a fixture

To reproduce a missed issue or a false positive without writing a new rule:

```sh
pnpm nx g @clear-a11y/workspace-plugin:fixture <area>/<page> --wcag=<sc> --layer=<layer>
pnpm nx g @clear-a11y/workspace-plugin:fixture keyboard/skip-link-missing --wcag=2.4.1 --layer=keyboard
pnpm nx g @clear-a11y/workspace-plugin:fixture at/popover-menu-ok --correctPattern
```

Keep fixtures minimal. Anything derived from a real audit must be sanitized: no real names, brands, URLs or screenshots. `pnpm nx test fixtures` validates every expected file.

## Run the benchmark

```sh
pnpm nx run bench:run
```

It scans every fixture page with every deterministic engine (AI off) and writes `bench-results/latest.json` and `latest.md`: recall overall, by success criterion and by layer, precision of `violation`, which layer found what, missed issues and noise on correct-pattern pages. It takes a few minutes and needs no network.

The rules a pull request must keep:

- Precision of `violation` at or above **0.95**.
- Zero findings, of any tier, on correct-pattern pages you touch.
- Paste the before and after numbers into the pull request.

When an engine finds a real issue on a barrier page that isn't listed yet, add it to the page's expected file (only if a human auditor would log it) instead of suppressing the finding.
