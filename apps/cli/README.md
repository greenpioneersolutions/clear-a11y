# clear-a11y

Command line for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y): accessibility testing that works like a human expert. It checks keyboard focus order, hidden states, reflow and the accessibility tree, not only rules.

## Install

```sh
npm install -g clear-a11y
npx playwright install chromium
```

## Scan a site

```sh
clear-a11y scan https://localhost:3000/ --format json,html --out reports
clear-a11y scan https://localhost:3000/ --crawl --max-pages 20
clear-a11y scan https://localhost:3000/ --fail-on violation   # exit 1 in CI when violations exist
```

Only the URLs you pass are scanned (plus same-origin links with `--crawl`). No page content leaves your machine: the AI provider defaults to `none`.

## Scan a source repo

```sh
clear-a11y scan ./my-app                              # any existing directory is treated as a repo
clear-a11y scan ./my-app --format sarif --fail-on violation
clear-a11y scan ./my-app --max-stories 100            # built Storybook: scan up to 100 stories
clear-a11y scan ./my-app --storybook-url http://localhost:6006/
clear-a11y scan ./my-app --boot                       # no Storybook: start the dev server (runs repo code)
```

When the target is an existing local directory, Clear A11Y scans it in two layers and writes one report:

1. **Source lint.** It detects the frameworks (React, Next.js, Vue, Nuxt, Angular, Svelte, Vite...) and lints the source with accessibility rules under its own fixed configuration. Every finding has a file and line, and SARIF output shows them in GitHub code scanning. The repo's own code, scripts and lint config are never run; inline `eslint-disable` comments are ignored.
2. **Runtime.** When the repo has a built Storybook (`storybook-static/`, from your own `storybook build`), every story is opened in a headless browser and tested with the full engine set: keyboard, states, reflow, contrast, the accessibility tree and widget patterns. Findings point at the component file when it can be found reliably, otherwise at the story. Without Storybook, `--boot` starts the app's dev script and crawls it like a site.

| Flag                       | What it does                                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--storybook-static <dir>` | Built Storybook folder inside the repo (default: a detected `storybook-static/`).                                                                                                                                           |
| `--storybook-url <url>`    | Read stories from a Storybook already running on this machine (`localhost` or `127.0.0.1` only).                                                                                                                            |
| `--max-stories <n>`        | Scan at most `n` stories (default 50). Use `repo.storyFilter` in the config file to pick which.                                                                                                                             |
| `--boot`                   | Start the repo's `dev` (or `start`, `serve`) script and crawl it (`--max-pages`, default 20). **Runs the repo's code on your machine**: only for repos you trust. Never installs dependencies; stops the server afterwards. |
| `--trust-repo-plugins`     | Load the Angular template rules from the repo's own `node_modules`. Runs code from the repo: only for repos you trust.                                                                                                      |

- Scan one repo directory at a time; don't mix a directory with URLs. A target that is neither an existing directory nor an http(s) URL is a usage error (exit code 2).
- Without a Storybook and without `--boot`, only the source is linted; the summary says how to enable runtime checks.
- Options such as `include`, `exclude`, `maxFiles`, `storyFilter`, `bootScript` and `bootTimeoutMs` go in the `repo` section of the `--config` file.

Details: [docs/repo-scanning.md](../../docs/repo-scanning.md).

## Report formats

`--format` takes a comma-separated list (default `json`). Files are written to `--out` (default `.clear-a11y`):

| Format  | File           | What it is                                                                                                                                                 |
| ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `json`  | `report.json`  | The canonical finding list. Everything else is derived from it.                                                                                            |
| `sarif` | `report.sarif` | SARIF 2.1.0 for GitHub code scanning and IDE viewers.                                                                                                      |
| `html`  | `report.html`  | One self-contained, accessible page: findings by tier and WCAG criterion, screenshots, focus-path diagrams and a yes/no review queue. No network requests. |

Screenshot crops go to `<out>/artifacts/` and are embedded into `report.html`.

## Re-render a report

```sh
clear-a11y report .clear-a11y/report.json --format html,sarif --out site/
```

Reads an existing `report.json` (screenshots from its folder) and writes the requested formats. `--out` defaults to the folder of the input file; `--format` defaults to `html`.

## Benchmark

```sh
clear-a11y bench --site fixtures/site --expected fixtures/expected
```

Prints precision of `violation` findings and recall by WCAG success criterion and engine layer.

Exit codes: `0` success, `1` findings at or above `--fail-on`, `2` usage or runtime error.

## Documentation

- Getting started: https://greenpioneersolutions.github.io/clear-a11y/getting-started/
- Full CLI reference (every command and option): https://greenpioneersolutions.github.io/clear-a11y/reference/cli/
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/apps/cli

## License

Apache-2.0
