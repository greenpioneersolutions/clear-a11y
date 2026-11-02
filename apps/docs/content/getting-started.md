---
title: Getting started
description: Build Clear A11Y, run your first scan of a local site, read the results and understand the tiers.
---

This guide takes about ten minutes. You will build Clear A11Y, scan a page with a few seeded barriers, and learn how to read what it finds. You don't need to know much about accessibility yet: every finding explains what is wrong, who it affects and how to fix it.

## What you need

- **Node.js 22 (22.23.4 or newer), 24 or 26** (an LTS release).
- **pnpm 9**, through Corepack, which ships with Node: run `corepack enable` once.
- **Chromium for Playwright.** Clear A11Y tests pages in a real headless browser.

## Install

Clear A11Y is pre-alpha and not published to npm yet, so you run it from a clone of the repository:

```sh
git clone https://github.com/greenpioneersolutions/clear-a11y.git
cd clear-a11y
corepack enable
pnpm install
pnpm exec playwright install chromium
pnpm nx run cli:build
```

Once it is released, you will be able to skip the clone and run `npx clear-a11y scan <url>` instead. The commands and options stay the same.

## Your first scan

The repository includes a small local site full of seeded barriers, used to test Clear A11Y itself. Start it in one terminal:

```sh
pnpm nx run fixtures:serve
```

It serves the pages on `http://127.0.0.1:4173/`. In a second terminal, scan a shipping form whose focus order jumps around and which doesn't fit on a narrow screen:

```sh
node apps/cli/dist/main.js scan http://127.0.0.1:4173/keyboard/focus-order-backward.html --format json,html
```

To scan your own site, start its dev server and pass its URL instead. Clear A11Y only scans the URLs you give it; add `--crawl` to also follow same-origin links (up to `--max-pages`, 20 by default).

## Reading the results

The command prints a summary, grouped by tier:

```text
Scanned 1 page view(s): 3 finding(s) — 2 violation, 1 likely, 0 needs review.

VIOLATION (2)
  visual/reflow-horizontal-scroll  #country-field
    At 320 CSS px wide the page scrolls horizontally (330px of content in a 320px
    viewport) because #country-field is 322px wide. People who zoom in have to
    scroll sideways to read every line.
    WCAG 1.4.10 Reflow · http://127.0.0.1:4173/keyboard/focus-order-backward.html
  visual/reflow-horizontal-scroll  #last-name-field
    ...

LIKELY (1)
  keyboard/focus-order-backward  #last-name
    Tab moves from "Country" back up to "Last name", against the visual reading
    order. Keyboard-only and switch users lose their place, and screen magnifier
    users have to search for focus.
    WCAG 2.4.3 Focus Order; 1.3.2 Meaningful Sequence · http://127.0.0.1:4173/keyboard/focus-order-backward.html
Wrote json: .clear-a11y/report.json
Wrote html: .clear-a11y/report.html
```

The command exits with code `1`, because there are `violation` findings.

Each finding has:

- a **rule id** (`keyboard/focus-order-backward`). Look it up in the [rules reference](/reference/rules/) for what it catches, who it affects and how to fix it;
- the **element** (a CSS selector), and the **page and state** it was found in. A state is something like an open menu or a form showing errors: Clear A11Y opens these and tests them too;
- the **WCAG success criterion** it fails. WCAG is the international standard most accessibility laws point to. Each success criterion has a W3C "Understanding" page that explains it;
- a **message** in plain language, and usually a **fix**.

Open `.clear-a11y/report.html` in your browser for the full picture: screenshots of each element, a diagram of the focus path with the backward jump highlighted, and a review queue for the findings that need a person to decide. The [reports guide](/guides/reports/) explains every format. `report.json` is the canonical output that everything else is derived from.

## Tiers: how much to trust a finding

Automated tools lose trust fast when they cry wolf. Every Clear A11Y finding has one of three tiers, so you know what to act on:

| Tier           | What it means                                                                                                         | What to do                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `violation`    | Measured by a deterministic check with high certainty. Allowed to fail CI.                                            | Fix it.                                                               |
| `likely`       | A strong signal with a small chance of a false positive.                                                              | Check it, then fix it. Most findings that involve judgment land here. |
| `needs-review` | Code can't decide; a person must. The finding carries a yes/no question, for example "Is this text an image of text?" | Answer the question. The HTML report has a review queue for this.     |

AI judges, when you turn them on, never produce a `violation` on their own: only a deterministic check can confirm one.

## Use it in CI

The exit code is `1` when there is a finding at or above `--fail-on` (default `violation`), so a CI step fails on real barriers and not on items waiting for review:

```sh
node apps/cli/dist/main.js scan http://localhost:3000/ --fail-on violation --format sarif,html
```

On GitHub, the [GitHub Action](/guides/github-action/) does this for you and scans only what a pull request changed.

## Next steps

- [CLI guide](/guides/cli/): viewports, crawling, config files and engines.
- [Repo scanning](/guides/repo-scanning/): lint a source repo and scan its Storybook stories, with file and line for each finding.
- [Coding agents (MCP)](/guides/mcp/): let Claude Code or another agent scan, fix and re-scan.
- [AI providers](/guides/providers/): optional AI judges for alt text, link purpose and other judgment calls.
