# Clear A11Y GitHub Action

Accessibility testing for pull requests. The action works out what a pull request changed and scans only that:

- **Pages**: the routes of your running app (or preview deployment) that the changed files render.
- **Stories**: Storybook stories of the changed components, from a built Storybook.
- **Source**: accessibility lint of the changed source files (the [repo static layer](../../docs/repo-scanning.md)).

It writes **SARIF** for GitHub code scanning, a self-contained **HTML report**, a **job summary** on the run page, and outputs you can gate on. It needs no Clear A11Y account, no API key and no token beyond what your workflow already has. The default AI provider is `none`; nothing leaves the runner.

## Quick start

```yaml
name: Accessibility
on:
  pull_request:

permissions:
  contents: read

jobs:
  clear-a11y:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # only for upload-sarif
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0 # needed: the action diffs base...head locally

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      - name: Build and serve the app
        run: |
          npm run build
          npx --yes serve@14 --listen 4173 dist &
          npx --yes wait-on@8 --timeout 60000 http://localhost:4173

      - run: npx --yes playwright@1.61.1 install --with-deps chromium

      - uses: greenpioneersolutions/clear-a11y@action-v0
        id: a11y
        with:
          base-url: http://localhost:4173
          routes: .github/clear-a11y-routes.json
          default-targets: /

      - uses: github/codeql-action/upload-sarif@v4
        if: always() && steps.a11y.outputs.sarif-path != '' && github.event.pull_request.head.repo.full_name == github.repository
        with:
          sarif_file: ${{ steps.a11y.outputs.sarif-path }}
          category: clear-a11y

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: clear-a11y-report
          path: clear-a11y-report/
```

A complete version with a Storybook build is in [`examples/workflow.yml`](examples/workflow.yml).

### Versions

The built action is published to its own branch and tags, not to `main` (the bundle is large):

- `clear-a11y/clear-a11y@action-v0`: the latest 0.x release (a branch that moves with each release).
- `clear-a11y/clear-a11y@action-v0.1.0`: exactly one release. For the strongest pinning, use the commit SHA of that tag.

Action releases share the version of the npm packages (`v0.1.0` on `main` is built into `action-v0.1.0`). Each release's changes are in the GitHub release notes and `CHANGELOG.md`.

`.github/clear-a11y-routes.json` tells the action which pages each source file affects:

```json
{
  "src/pages/checkout/**": ["/checkout", "/checkout/payment"],
  "src/components/Header.tsx": ["/", "/about"],
  "src/components/**": ["/"]
}
```

Keys are globs relative to the repo (`**` any depth, `*` within a folder, `{a,b}` alternatives). Values are paths on `base-url`; they are resolved against it and may not point at another host.

## How targets are chosen

1. **Changed files.** For `pull_request` events the action reads `pull_request.base.sha` and `head.sha` from the event payload and runs `git diff --name-only base...head` (only what the branch changed, like the "Files changed" tab; deleted files are skipped). `push` uses `before..after`, `merge_group` uses its base and head. Other events, or a push that creates a branch, scan everything configured instead (set `base-sha` and `head-sha` to force a range). No GitHub API call is made.
2. **Routes.** Every glob in `routes` that matches a changed file adds its routes. In a Next.js repo, `app/**/page.tsx` (and `layout`, `loading`, `error`...) and `pages/**` files map to their route automatically; route groups are dropped, and dynamic segments (`[id]`) are listed in the summary because they need a concrete URL in `routes`.
3. **Stories** (with `storybook-static`). A story is scanned when its story file changed, when Storybook recorded the changed file as its component, or when it sits next to the changed component with the same name (`Button.tsx` and `Button.stories.tsx`). Stories that import the component from elsewhere are not found. Each story is scanned in isolation (`iframe.html?id=<story>&viewMode=story`) through the Storybook layer of repo scans (the same one `clear-a11y scan <repo>` uses), so its findings point at a source file and line (the component, or the story's export in its story file) and show up as code scanning annotations. `storybook-static` must be inside `repo-path`.
4. **Source files.** Changed `.jsx`, `.tsx`, `.js`, `.vue` and Angular `.html` files inside the detected source folders are linted. Tests, stories, build output and dot-folders are skipped.
5. **Nothing mapped?** If no changed file maps to a route or story, the `default-targets` are scanned. Without default targets no pages are scanned and the summary says so; changed source files are still linted.

At most `max-pages` pages and stories are scanned per run. With `changed-only: false` the action scans every route in `routes`, the default targets and every story, lints the whole repo, and crawls `base-url` (up to `max-pages` same-origin pages) when no routes are configured.

## Inputs

| Input              | Default             | Description                                                                                                            |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `base-url`         |                     | Base URL of the running app or preview. Without it, only stories and source files are scanned.                         |
| `routes`           |                     | Route map: inline JSON or the path of a JSON file (see above).                                                         |
| `default-targets`  |                     | Paths on `base-url` (newline or comma separated) scanned when nothing maps.                                            |
| `repo-path`        | `.`                 | Repository checkout to scan.                                                                                           |
| `config`           |                     | Path to a Clear A11Y JSON config (engines, viewports, `repo` options such as `include`/`exclude`).                     |
| `storybook-static` |                     | Path to a built Storybook (`storybook build`).                                                                         |
| `changed-only`     | `true`              | `false` scans everything configured (see above).                                                                       |
| `fail-on`          | `violation`         | Fail the job when a finding at or above this tier exists: `violation`, `likely`, `needs-review` or `never`.            |
| `formats`          | `sarif,html`        | Reports to write: `sarif`, `html`, `json`.                                                                             |
| `out-dir`          | `clear-a11y-report` | Folder for `report.sarif`, `report.html`, `report.json` and screenshots.                                               |
| `max-pages`        | `25`                | Most pages and stories scanned in the browser.                                                                         |
| `base-sha`         |                     | Compare from this commit instead of the event's (with `head-sha`).                                                     |
| `head-sha`         |                     | Compare to this commit instead of the event's (with `base-sha`).                                                       |
| `artifact-name`    | `clear-a11y-report` | The artifact name your workflow uploads the report as; only used in the summary text.                                  |
| `comment`          | `false`             | Also post the summary as a pull request comment, updated on each run. Needs `github-token` and `pull-requests: write`. |
| `github-token`     |                     | Token for `comment`, e.g. `${{ github.token }}`. Not used otherwise.                                                   |

## Outputs

| Output            | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `violations`      | Number of `violation` findings.                                         |
| `likely`          | Number of `likely` findings.                                            |
| `needs-review`    | Number of `needs-review` findings.                                      |
| `sarif-path`      | Path of `report.sarif` (empty when `sarif` is not in `formats`).        |
| `report-path`     | Path of `report.html` (empty when `html` is not in `formats`).          |
| `json-path`       | Path of `report.json` (empty when `json` is not in `formats`).          |
| `scanned-targets` | JSON array of the page and story URLs scanned in the browser.           |
| `changed-files`   | Number of changed files considered (empty when not limited to changes). |

The job fails (exit code 1) when findings reach `fail-on`. Only `violation` findings fail by default: they are deterministic and high certainty. `likely` and `needs-review` findings are reported but don't fail the job unless you lower `fail-on`.

## What you get

- **Job summary** (`$GITHUB_STEP_SUMMARY`): counts by tier, the top 50 findings with links to the W3C Understanding page of each WCAG criterion, where they are (page URL or `file:line`), the needs-review questions in a collapsed list, scan errors, and what was scanned (changed files, routes, fallbacks). Text that comes from your pages is escaped, so page content can't inject HTML, links, images or @-mentions into the summary.
- **SARIF** (`report.sarif`): upload it with `github/codeql-action/upload-sarif`. Code scanning shows results that point at a file and line in the repo, i.e. source lint findings and runtime findings that could be mapped to source. Findings that only have a page URL stay in the SARIF file but GitHub does not display them; the summary and the HTML report cover them.
- **HTML report** (`report.html`): one accessible, self-contained file with screenshots, focus paths and the needs-review queue. Upload `out-dir` with `actions/upload-artifact`.

## Browsers

The action runs Chromium through Playwright but does not download browsers itself. Install Chromium in a step before the action, with the Playwright version the action ships so the browser build matches:

```yaml
- run: npx --yes playwright@1.61.1 install --with-deps chromium
```

If Chromium is missing, the action fails with that exact command. Cache `~/.cache/ms-playwright` to save time. Runs that only lint source files (no `base-url` and no stories) don't need a browser.

## Permissions and pull requests from forks

- `contents: read` is all the scan needs.
- `security-events: write` is needed only by `upload-sarif`.
- `pull-requests: write` only if you turn on `comment`.

Use the `pull_request` event, **not** `pull_request_target`: the action builds and runs the pull request's code (your app), which must never run with write permissions or secrets. Pull requests from forks get a read-only token, so `upload-sarif` and `comment` can't write there; skip the upload for forks (as in the example) and rely on the job summary and the report artifact.

## How it runs

`runs.using: node24` with `main: dist/index.js`: one esbuild bundle with every JavaScript dependency inlined, plus `dist/node_modules/playwright-core` copied next to it (Playwright reads its own files at runtime, so it can't be inlined). GitHub runs it without installing anything. `dist/` is never committed to `main`: the release workflow builds it and pushes `action.yml`, `dist/`, `package.json`, `LICENSE` and `NOTICE` to the `action-v<major>` branch with an `action-v<version>` tag (see [the release process](../../docs/release.md)). See [how the action works](../../docs/github-action.md) for the reasoning.

## Development

```sh
pnpm nx build action              # bundle to apps/action/dist
pnpm nx test action               # unit tests (inputs, events, outputs)
pnpm nx test-integration action   # runs the action on a temp git repo against the fixture site, in-process and as the bundle
```

The changed-files logic lives in `@clear-a11y/repo` (`targetsForChanges`, `changedFilesFromGit`) and the summary in `@clear-a11y/reporter` (`toMarkdownSummary`); this app only reads inputs, calls them and writes outputs.
