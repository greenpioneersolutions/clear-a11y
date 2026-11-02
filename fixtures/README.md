# fixtures

Seeded-barrier pages, correct-pattern pages and the expected findings the benchmark scores against. Private project (`fixtures`), never published.

```
site/<area>/<page>.html        A page with one seeded barrier (or a correct pattern: ok.html)
expected/<area>/<page>.json    What a human auditor would log for that page
repos/                         Sample repositories for repo scanning
personas.json                  Persona tasks the benchmark runs on site/persona/* (see docs/personas.md)
```

## Expected findings format

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

- `wcag`: the first SC is the primary one (used for recall by SC). Others are accepted alternatives.
- `selector`: alternatives are separated by `|`. A finding matches when its selector equals or contains one of them (or vice versa). `*` matches any element.
- `layer`: the engine layer we expect to catch it: `static`, `keyboard`, `states`, `visual`, `at`, `widgets`, `ai`, `persona`, `repo`.
- Correct-pattern pages have `"correctPattern": true` and no issues. Any finding on them is noise.

A finding counts toward recall when it is on the same page, shares a success criterion and matches the selector. A `violation` finding that matches no expected issue is a false positive.

## WCAG 2.2 A/AA area (`site/wcag/`)

One barrier page and one correct-pattern page per WCAG 2.2 Level A/AA success criterion that the engine-specific areas don't already cover, so the benchmark reports recall across the whole standard and not only where we have detections. Pages are named after the criterion: `wcag/2-4-2-page-titled.html` and `wcag/2-4-2-page-titled-ok.html`.

- Each barrier page contains **one** seeded barrier, written from a human auditor's point of view: the expected issue's first SC is the criterion, the selector is the element an auditor would point at, and `layer` is the layer that _should_ catch it, whether or not it does today. Judgment-only criteria (1.3.3, 1.4.5, 2.4.6, 3.1.2, 3.3.3) are `ai`; criteria that need several pages or a whole flow (2.4.5, 3.2.3, 3.2.4, 3.2.6, 3.3.4, 3.3.7) are `persona`. Every other engine must stay silent on a barrier page except for that issue, and silent on every `-ok` page.
- Criteria that need a set of pages live in a folder: `wcag/<slug>/` (the barrier set) and `wcag/<slug>-ok/` (the correct set). The issue is on the page where an auditor would log it (for 3.2.3, the page whose navigation differs); the other pages of a barrier set are clean on their own and marked `correctPattern`.
- Media is offline and tiny: `_assets/media/` holds placeholder `.mp3`/`.mp4` files that don't play (the markup is what the checks read) and real WebVTT tracks. The live-stream pages make a `MediaStream` from a canvas, so no network is needed.
- `wcag/2-3-1-three-flashes.html` flashes only after its button is pressed. Don't press it if you are sensitive to flashing light.
- `wcag/2-4-2-page-titled.html` has no `<title>` on purpose; the fixtures test exempts it, like `static/missing-lang.html` for `lang`.
- `wcag/ok.html` is an index of the area.

The coverage table (SC, fixture, which engine and rule catches it, or which layer should) is in `docs/decisions-pending/W7c1.md` until it is merged into the docs. Criteria owned by other areas (3.2.1, 3.2.2, 2.2.2, 1.3.4 and everything the engine areas already seed) are not repeated here.

## Sample repos (`repos/`)

Each `repos/<name>/` is a tiny source tree (never installed or built, no `node_modules`) with seeded source-level barriers and correct-pattern files, plus `repos/<name>/expected.json`:

```json
{
  "repo": "react-sample",
  "title": "React + TypeScript shop with seeded source-level barriers",
  "correctFiles": ["src/components/ProductCardOk.tsx"],
  "issues": [
    {
      "id": "react-sample#product-image-no-alt",
      "file": "src/components/ProductCard.tsx",
      "line": 14,
      "rule": "jsx-a11y/alt-text",
      "wcag": ["1.1.1"],
      "layer": "repo",
      "description": "Product image has no alt attribute."
    }
  ]
}
```

A repo finding matches an issue when it is in the same `file`, within ±2 lines of `line`, and shares a success criterion. Any finding in a `correctFiles` entry is noise. Prettier, ESLint and Nx project inference skip `fixtures/repos/` so line numbers never shift and sample `package.json`/`tsconfig.json`/`eslint.config.js` files never become workspace projects. `react-sample/eslint.config.js` throws when executed on purpose: it proves the scanner never loads a repo's config.

Repos with Storybook stories also list **story issues**, scored by the runtime layer: `"story": "<story id>"` and `"selector"` instead of `file`/`line`, matched like site issues on that story's page; `correctStories` lists stories where any finding is noise.

| Repo                   | What it is for                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-sample`         | Static lint of React + TypeScript (jsx-a11y).                                                                                                                                                                                                                                            |
| `vue-sample`           | Static lint of Vue single-file components (vuejs-accessibility).                                                                                                                                                                                                                         |
| `storybook-sample`     | Runtime layer on Storybook stories: icon-only button without a name, tabs without arrow keys, a dialog without focus management and low-contrast card text, each next to a correct story. Also one source-level issue (`Tabs.tsx`). `.storybook/main.ts` throws if anything executes it. |
| `static-app-sample`    | `--boot`: `"dev": "node server.mjs --port 0"`, a dependency-free `node:http` server that prints its URL and serves `/` (unnamed icon link) and `/form` (unlabelled input). Used by integration tests only (no `expected.json`, never booted by the benchmark).                           |
| `framework-manifests/` | One `package.json` per dev-server framework (Vite, Next.js, CRA, Nuxt, SvelteKit, Angular) for the framework-detection table test. Nothing is installed.                                                                                                                                 |

### The fake Storybook (`storybook-sample/storybook-static/`)

It is a **hand-written, format-compatible stand-in** for `storybook build` output, not a real Storybook build: there is no React, no bundle and no addon code, so tests and the benchmark stay offline and light. It follows the parts of the Storybook 8 contract the runtime layer relies on:

- `index.json` with `"v": 5` and `entries` keyed by story id, each `{ id, title, name, importPath, type: "story" | "docs", tags }` (two `docs` entries prove docs pages are skipped);
- `iframe.html?id=<story id>&viewMode=story` renders that story **asynchronously** (after 150 ms) into `#storybook-root`, using plain inline JavaScript keyed by the `id` query parameter; the markup mirrors what the React components in `src/components/` render;
- an unknown id shows Storybook's error display (`body.sb-show-errordisplay`, `#error-message`).

To add a story: add the entry to `index.json`, a renderer to the `STORIES` table in `iframe.html`, the CSF export in the matching `*.stories.tsx`, and its issues (or the id in `correctStories`) to `expected.json`.

## Commands

```sh
pnpm nx run fixtures:serve               # http://127.0.0.1:4173/
pnpm nx test fixtures                    # validates every expected file against the schema
pnpm nx g @clear-a11y/workspace-plugin:fixture <area>/<page>   # add a page + expected file
```

Every new barrier needs a correct-pattern counterpart that proves the check has no false positive. Fixtures derived from real audits must be sanitized and minimal.
