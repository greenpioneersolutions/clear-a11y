# Clear A11Y

An open-source accessibility testing engine that tests like a human accessibility expert, not just a rules scanner. Point it at a live website or a source repo and it finds the barriers people with disabilities actually run into: focus that jumps backward, menus that trap the keyboard, error messages a screen reader never hears, layouts that break at 320 pixels.

> **Status: alpha (0.x).** Everything below works and is tested, but APIs and the finding format may still change before 1.0. Read [How we measure](#how-we-measure) before quoting any coverage number.

## Why

Automated rules scanners such as [axe-core](https://github.com/dequelabs/axe-core) are excellent, but they only see part of the picture. Deque's own data says axe-core finds roughly 57% of real-world issues by volume; practitioners usually report 20–40% of what a manual audit finds. The rest only shows up through behavior: where keyboard focus actually goes, what a screen reader announces, whether content still works when zoomed, whether a dialog gives focus back when it closes.

Clear A11Y's goal is to find **80% or more of what a human accessibility audit finds**. That's a target, not a claim: we measure against seeded barriers today and will measure against real (sanitized) human audits, and we publish the method and the numbers.

## How it works

- **Deterministic engines first.** Anything that can be measured is measured in code, in a real browser:
  - `static`: axe-core, limited to WCAG A/AA rules
  - `keyboard`: focus order vs visual order, visible focus, traps, unreachable controls, skip links, focus return
  - `states`: opens menus, dialogs, accordions, tooltips and form error states so every other engine checks them too
  - `visual`: reflow at 320 px, 200% text, text spacing, real-pixel contrast over images and gradients, target size, hover content
  - `at`: the accessibility tree, names, roles and states, live regions and error announcements
  - `widgets`: ARIA Authoring Practices keyboard contracts (tabs, menus, combobox, listbox, dialog, disclosure, grid)
  - `repo`: accessibility lint of React and Vue source, and scanning of Storybook stories
- **AI second, and only for judgment calls.** Is this alt text meaningful? Is this link's purpose clear? AI is **off by default** and you bring your own model ([providers](#ai-providers)). Persona agents can also try a task keyboard-only or screen-reader-only and report where they got stuck.
- **Every finding has a trust tier:**
  - `violation`: deterministic and high certainty. Allowed to fail CI.
  - `likely`: a strong signal with a small chance of a false positive.
  - `needs-review`: a person decides, answering a short yes/no question.

  AI findings are never `violation` on their own.

- **Evidence or it didn't happen.** Every finding carries the WCAG success criterion, the selector, the page, state and viewport, evidence (a screenshot crop, the focus path, an accessibility-tree snippet or the announcement), the engine that produced it, its confidence and, for repos, the source file and line.
- **Open and self-hostable.** No required SaaS, accounts or secrets. A fresh fork installs, builds, tests and benchmarks offline.

## Quickstart

### 1. Install

You need Node.js 22.23.4+, 24 or 26, and [pnpm](https://pnpm.io) through Corepack. Version 0.1.0 is tagged here but not on npm yet, so for now you run it from a clone:

```sh
git clone https://github.com/greenpioneersolutions/clear-a11y.git
cd clear-a11y
corepack enable
pnpm install
pnpm exec playwright install chromium     # the browser the engines drive
pnpm nx run cli:build
alias clear-a11y="node $PWD/apps/cli/dist/main.js"
```

Once it is published, `npm install -g clear-a11y` followed by `npx playwright install chromium` replaces all of that.

### 2. Try it on the seeded-barrier site

In one terminal, start the local test site (`pnpm nx run fixtures:serve`, port 4173). In another:

```sh
B=http://localhost:4173/keyboard
clear-a11y scan $B/keyboard-trap.html $B/focus-order-backward.html $B/focus-not-returned.html
```

axe-core alone finds nothing on these three pages. Clear A11Y presses the keys a person would:

```
VIOLATION  keyboard/keyboard-trap  #editor
  Keyboard focus gets stuck in "Comment": Tab, Shift+Tab and Escape do not move it out ...
LIKELY     keyboard/focus-order-backward  #last-name
  Tab moves from "Country" back up to "Last name", against the visual reading order ...
LIKELY     keyboard/focus-not-returned  #share-dialog
  After closing the dialog with Escape, focus lands on the page body instead of returning to
  the control that opened it (`#open-share`) ...
```

### 3. Scan your own site

```sh
clear-a11y scan https://your-site.example/ --format json,html --out reports
clear-a11y scan https://your-site.example/ --crawl --max-pages 20 --viewport desktop,mobile
clear-a11y scan http://localhost:3000/ --fail-on violation    # exit code 1 for CI
```

- Only the URLs you pass are scanned, plus same-origin links when you add `--crawl`.
- It's safe to run against a live site. While it opens menus and submits forms empty to see their error states, every form post and every navigation away from the page is blocked in the browser, so nothing reaches your server.
- Open `reports/report.html`. It's an accessible report with screenshot crops, focus-path diagrams and a yes/no queue for the `needs-review` items. `report.json` is the canonical output, and SARIF is available for code scanning.
- For pages behind a login, save a Playwright storage state and pass it with a config file: `{ "auth": { "storageState": "auth.json" } }` and `--config clear-a11y.json`. Never commit that file.
- `clear-a11y scan --help` lists every option. The docs site has the full CLI and configuration reference.

### 4. Scan your repo

```sh
clear-a11y scan ./my-app                                      # source lint of React and Vue (never runs your code)
clear-a11y scan ./my-app --storybook-static storybook-static  # plus every Storybook story, in the browser
clear-a11y scan ./my-app --boot                               # opt-in: start the dev server and crawl it
```

Repo findings point at the file and line. See [docs/repo-scanning.md](docs/repo-scanning.md).

### From your coding agent (MCP)

```sh
pnpm nx run mcp:build
claude mcp add clear-a11y -- node /path/to/clear-a11y/apps/mcp/dist/main.js
# once published: claude mcp add clear-a11y -- npx -y @clear-a11y/mcp
```

Your agent can scan, walk the keyboard focus path, judge `needs-review` items, fix the code and re-scan. Your own agent is the judge, so no API key is needed. See [docs/mcp.md](docs/mcp.md) and the bundled [SKILL.md](apps/mcp/SKILL.md).

### In pull requests (GitHub Action)

Available once the first release publishes the `action-v0` branch:

```yaml
- run: npx playwright@1.61.1 install --with-deps chromium
- uses: greenpioneersolutions/clear-a11y@action-v0
  with:
    base-url: http://localhost:3000
    routes: '{ "src/pages/checkout/**": ["/checkout"] }'
```

It scans what the pull request changed and writes SARIF for code scanning plus a job summary. See [docs/github-action.md](docs/github-action.md).

### Self-hosted server and desktop app

- **Server**: a NestJS API with a SQLite (or Redis/BullMQ) job queue and a Docker image. See [docs/self-hosting.md](docs/self-hosting.md).
- **Desktop**: an Electron app to manage targets, run scans, view reports and answer review questions. See [docs/desktop.md](docs/desktop.md).

## AI providers

AI is optional and **off by default** (`ai.provider: none`): no page content leaves your machine unless you configure a provider. Keys are read only from environment variables you name; they are never stored in config.

| Provider        | Config                                                                         | Key from               |
| --------------- | ------------------------------------------------------------------------------ | ---------------------- |
| Anthropic       | `{ "ai": { "provider": "anthropic" } }`                                        | `ANTHROPIC_API_KEY`    |
| OpenAI          | `{ "ai": { "provider": "openai", "model": "..." } }`                           | `OPENAI_API_KEY`       |
| Azure OpenAI    | `{ "ai": { "provider": "azure", "baseUrl": "...", "model": "<deployment>" } }` | `AZURE_OPENAI_API_KEY` |
| Ollama (local)  | `{ "ai": { "provider": "ollama", "model": "..." } }`                           | none                   |
| Bedrock, Vertex | planned                                                                        |                        |

We don't support consumer chat-subscription logins. If you don't want an API key, use the MCP server from your own agent. Details: [docs/providers.md](docs/providers.md).

## How we measure

`fixtures/site/` holds small pages, each with one seeded barrier, plus correct-pattern pages that must produce no findings. `fixtures/expected/` lists what a human auditor would log for each page. `pnpm nx run bench:run` scans every page and reports recall (any tier) overall, by WCAG success criterion and by engine layer, and the precision of `violation` findings, which must stay at or above 0.95.

<!-- BENCH:START -->

|                                                                                            | Recall (any tier) | Precision of `violation` | Noise on correct pages |
| ------------------------------------------------------------------------------------------ | ----------------- | ------------------------ | ---------------------- |
| axe-core only, same 113 issues                                                             | 14.2% (16/113)    | 100% (14/14)             | 1                      |
| axe-core only (first scan, 22 issues)                                                      | 27.3% (6/22)      | 100% (8/8)               | 1                      |
| Clear A11Y, deterministic engines, no AI (113 issues across all 55 WCAG 2.2 A/AA criteria) | 85.8% (97/113)    | 100% (72/72)             | 0 of 120 pages         |
| Repo layer (sample React, Vue and Storybook repos)                                         | 100% (20/20)      | 100% (7/7)               | 0                      |

By layer: accessibility tree 31/31, keyboard 16/16, states 8/8, widgets 11/11, visual 18/20, static 8/9, persona 3/9, AI 2/9 (the AI layer is measured with no provider configured; judgment-only criteria such as 1.3.3, 1.4.5, 2.4.6, 3.1.2 and 3.3.3 need a model, and multi-page criteria such as 3.2.3 and 3.3.7 need persona tasks).

<!-- BENCH:END -->

**Read this before quoting these numbers.** The fixtures were written alongside the engines that detect them, so a high recall shows the engines catch the barriers we designed; it does not yet show 80% of a real audit. The next milestone is scoring against sanitized real-world audit findings. The full method, per-layer and per-criterion tables are on the docs site ("How coverage is measured") and in [`bench-results/latest.md`](bench-results/latest.md).

## Documentation

Start with [STRATEGY.md](STRATEGY.md) for the reasoning behind the project: what axe-core catches, what it can't, and how each engine closes the gap. Rolling it out across an organization? Read [ENTERPRISE.md](ENTERPRISE.md).

The documentation site lives in [`apps/docs`](apps/docs/README.md) and deploys to GitHub Pages from `main` (`pnpm nx run docs:dev` locally): getting started, guides, architecture, the generated CLI, configuration and rules references, and contributor guides.

## Development

```sh
corepack enable
pnpm install
pnpm exec playwright install chromium
pnpm nx run-many -t lint typecheck test build   # everything
pnpm nx run-many -t test-integration            # browser tests against fixtures/
pnpm nx run bench:run                           # precision/recall report
```

```
apps/       Thin shells: CLI, MCP server, GitHub Action, server, desktop, docs site
packages/   All real logic: core, browser, engines/*, ai, runner, reporter, repo, queue, ...
fixtures/   Seeded-barrier pages, sample repos and expected findings
tools/      Benchmark harness and Nx generators
docs/       Roadmap, decisions, ADRs, RFCs, rule pages
```

See [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Contributions are welcome, especially false-positive and missed-issue reports with a minimal HTML reproduction, because those become fixtures. Read [CONTRIBUTING.md](CONTRIBUTING.md) (new rules start with `pnpm nx g @clear-a11y/workspace-plugin:rule`), and please follow our [Code of Conduct](CODE_OF_CONDUCT.md). Questions go to [SUPPORT.md](SUPPORT.md); security issues to [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). Third-party attributions are in [NOTICE](NOTICE).
