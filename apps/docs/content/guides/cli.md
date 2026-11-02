---
title: CLI guide
description: Everyday use of the clear-a11y command line - scanning sites, viewports, crawling, config files, engines and CI.
---

The `clear-a11y` command has three commands: `scan` finds barriers, `report` re-renders a saved report, and `bench` scores Clear A11Y against a fixture site. This guide covers everyday use; every option is listed in the generated [CLI reference](/reference/cli/).

Until the first release, run it from a clone as `node apps/cli/dist/main.js` (or `pnpm nx run cli:scan -- <url>`) after `pnpm nx run cli:build`. The examples below write `clear-a11y` for short.

## Scan a site

```sh
clear-a11y scan http://localhost:3000/
clear-a11y scan http://localhost:3000/ http://localhost:3000/checkout   # several pages
clear-a11y scan http://localhost:3000/ --crawl --max-pages 50           # follow same-origin links
```

Only the URLs you list are scanned. With `--crawl`, Clear A11Y also follows links on the same origin, up to `--max-pages` (20 by default). It never scans a site you didn't point it at.

For every page, Clear A11Y:

1. runs **axe-core** on the page as it loads;
2. **explores hidden states**: opens menus, dialogs, accordions, tabs, tooltips and popovers, and puts forms into their error state;
3. runs every engine on each state: **keyboard** (focus order, focus visible, traps, skip links), **visual** (reflow at 320 px, text resize and spacing, real-pixel contrast, target size, hover content), the **accessibility tree** (names, roles, states, error messages, announcements) and **ARIA widget** keyboard patterns.

Duplicates found in several states are merged, so one barrier is reported once.

## Viewports

```sh
clear-a11y scan http://localhost:3000/ --viewport desktop,mobile
clear-a11y scan http://localhost:3000/ --viewport 1024x768
```

`desktop` is 1280×800, `mobile` is 375×812 and `reflow` is 320×256 (the size WCAG's reflow criterion uses). The visual engine always checks reflow at 320 px wide, even with the default desktop viewport.

## Reports

```sh
clear-a11y scan http://localhost:3000/ --format json,sarif,html --out reports
clear-a11y report reports/report.json --format html --out site
```

`json` is the canonical report, `sarif` is for GitHub code scanning and IDEs, and `html` is a single accessible page with screenshots, focus-path diagrams and a review queue. See [Reports](/guides/reports/). Add `--json` to print the JSON to stdout instead of a summary, and `--no-screenshots` to skip screenshot crops.

## Choose engines

```sh
clear-a11y scan http://localhost:3000/ --engines static,keyboard
```

Engine keys: `static`, `keyboard`, `states`, `visual`, `at`, `widgets`, plus `ai` and `personas` when configured. You can also switch engines off in the config file (`"engines": { "visual": false }`).

## Config file

Put options you use every time in a JSON file and pass it with `--config`:

```json
{
  "targets": ["http://localhost:3000/", "http://localhost:3000/checkout"],
  "viewports": [
    { "name": "desktop", "width": 1280, "height": 800 },
    { "name": "mobile", "width": 375, "height": 812 }
  ],
  "output": { "dir": "reports", "formats": ["json", "html"] },
  "failOn": "violation"
}
```

```sh
clear-a11y scan --config clear-a11y.json http://localhost:3000/about
```

Flags override the file. Every option is listed in the [configuration reference](/reference/configuration/).

## Pages behind a login

Save a logged-in session with Playwright (a storage-state file) and point `auth.storageState` at it in the config file. Never commit that file: it contains your session cookies.

## Use it in CI

`--fail-on` sets the lowest tier that makes the command exit with code `1`:

```sh
clear-a11y scan http://localhost:3000/ --fail-on violation   # default: only deterministic barriers fail the build
clear-a11y scan http://localhost:3000/ --fail-on likely      # stricter
```

Exit codes: `0` success, `1` a finding at or above `--fail-on`, `2` usage or runtime error. On GitHub, prefer the [GitHub Action](/guides/github-action/), which scans only what a pull request changed and uploads SARIF.

## Scan a repo

Pass a directory instead of a URL to lint the source and scan its Storybook stories:

```sh
clear-a11y scan ./my-app
clear-a11y scan ./my-app --boot   # no Storybook: start the dev server (runs the repo's code)
```

See [Repo scanning](/guides/repo-scanning/).

## AI judges

AI is off by default (`ai.provider` is `none`): no page content leaves your machine. To turn on the AI judges for judgment calls such as "is this alt text meaningful?", configure your own provider. See [AI providers](/guides/providers/).
