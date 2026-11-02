# GitHub Action

`apps/action` is a GitHub Action that scans what a pull request changed: the routes of a running app or preview, the Storybook stories of changed components, and the changed source files. It writes SARIF for code scanning, an HTML report and a Markdown job summary, and fails the job on `violation` findings by default. User-facing setup (example workflow, inputs, outputs, permissions) is in [`apps/action/README.md`](../apps/action/README.md); this page covers how it is built.

## Flow

```
GITHUB_EVENT_PATH ──> base/head SHAs ──> git diff --name-only base...head      (repo: changedFilesFromGit)
                                              │
routes JSON, storybook-static/index.json ─────┤
Next.js detection (detectRepo)                ▼
                                    targetsForChanges()                         (repo: pure)
                                    routes · stories · source files · notes
                                              │
              ┌───────────────────────────────┼─────────────────────────┐
              ▼                               ▼                         ▼
   runner.scan(page URLs)          runner.scanRepo(changed folders,  default targets / nothing
                                     matched stories via storyFilter)
                                   + limitResultToFiles(keep stories)
              └───────────────┬───────────────┘
                              ▼
               mergeScanResults() ──> writeReports (SARIF, HTML, JSON)
                                  ──> toMarkdownSummary ──> $GITHUB_STEP_SUMMARY
                                  ──> outputs, exit code from fail-on
```

The app stays thin: `src/inputs.ts` parses and validates inputs, `src/event.ts` reads the event payload, `src/main.ts` calls `@clear-a11y/repo`, `@clear-a11y/runner` and `@clear-a11y/reporter`, and `src/outputs.ts` holds the fail-on logic and the optional PR comment. Target selection is pure and unit tested in `packages/repo/src/changes/`.

## Decisions

- **JavaScript action, `node24`, bundled with esbuild.** GitHub runs `dist/index.js` without installing dependencies, so everything is inlined into one ESM file. `playwright-core` is the exception: it locates `package.json`, `browsers.json` and its `lib/` files from `__dirname` at runtime, so the build copies the package to `dist/node_modules/playwright-core` (it has no dependencies of its own). A small esbuild plugin replaces `require.resolve("<pkg>")` probes in bundled CommonJS code with the package name, since there is no `node_modules` to resolve against. The output has no timestamps or absolute paths, so it can be committed for releases and diffed.
  - _Composite action running `npx clear-a11y`_: simpler to build, but it downloads the CLI and its dependencies on every run (network, slower, version drift), and the CLI has no changed-files or job-summary logic.
  - _Docker action_: can include browsers, but only runs on Linux runners, pulls a large image on every run and is slower to start.
- **The bundle ships on a release branch, not on `main`.** `dist/` is about 37 MB (mostly `playwright-core`), so committing it to `main` would grow every clone with each release. The release workflow (`.github/workflows/release.yml`) builds it from the `v<version>` tag and commits only `action.yml`, `dist/`, a minimal `package.json` (the bundle reads its version from it and needs `"type": "module"`), `LICENSE` and `NOTICE` to the `action-v<major>` branch, tagged `action-v<version>`. Users reference `@action-v0` or `@action-v<version>`. See [the release process](release.md).
  - _Commit `apps/action/dist` to `main` at release_: the usual pattern for JavaScript actions, but it puts tens of megabytes into `main`'s history per release and makes `dist/` easy to forget or to edit by hand.
  - _A separate `clear-a11y/action` repository_: cleanest for the Marketplace, but the release workflow would need a cross-repository token.
- **Browsers come from the workflow.** The user installs Chromium with `npx playwright@<version> install --with-deps chromium` before the action (cacheable, and `--with-deps` needs `sudo` on the runner, which belongs in the workflow). The version must match the bundled Playwright; when the browser is missing, the action fails with the exact command.
- **Changed files from local git, not the API.** `git diff --name-only base...head` against the SHAs in the event payload works offline, needs no token and behaves the same in tests (temp git repos) and CI. It needs `fetch-depth: 0`; when the base commit or merge base is missing, the error says so and mentions shallow clones.
- **Route maps can't leave the base URL.** Routes are paths resolved against `base-url`; anything that resolves to another origin is rejected. The route map lives in the repo, so a pull request could edit it, and the action must not scan hosts nobody listed.
- **Job summary escaping.** `toMarkdownSummary` escapes every page-derived string: HTML special characters become entities, Markdown punctuation is backslash-escaped, selectors and URLs go into code spans with a long enough fence and escaped `|`, newlines are collapsed, and `@`/`#` get a zero-width space so page text can't mention people or link issues in a PR comment.
- **One repo scan for lint and stories.** `scanRepo` from `@clear-a11y/runner` lints the shallowest folders that contain the changed source files and scans the matched stories through the Storybook runtime layer (S10): `repo.storybookStatic` is the `storybook-static` input made repo-relative, `repo.storyFilter` lists the matched story ids (Storybook ids are `[a-z0-9-]`, so each id is a glob that matches only itself) and `repo.maxStories` is what is left of `max-pages` after the pages. `limitResultToFiles(..., { keepUrl })` then keeps lint findings in the changed files plus everything on the scanned story pages (`repo:storybook-static/iframe.html?id=…`). Repo-wide coverage notices are kept.
- **Stories get source locations.** Because stories go through the runtime layer, their findings are mapped to source (Clear A11Y source attributes, React debug info, a literal search, and finally the story file at the story's export line), so they appear in code scanning at a file and line instead of only as page URLs. A `storybook-static` folder outside `repo-path` can't be mapped; the action then scans no stories and says so in the summary.
  - _Stories as plain pages from a local static server_ (before wave 7): same engines, but no source mapping, so story findings never reached code scanning annotations.
- **PR comment is optional and off.** `comment: true` with `github-token` creates or updates one comment (marked with a hidden HTML comment). It is the only network call the action can make, it is never used in tests (they inject a fake `fetch`), and a failure is a warning, not a failed job.

## Testing

- Unit tests: `packages/repo/src/changes/*.test.ts` (route maps, Next.js conventions, story matching, fallbacks, git diff against a temp repo), `packages/reporter/src/markdown/summary.test.ts` (counts, caps, hostile payloads), `apps/action/src/action.test.ts` (inputs, events from `fixtures/action/*.json`, fail-on, PR comment with a fake `fetch`, `action.yml` inputs in sync with the parser).
- Integration (`pnpm nx test-integration action`): builds a temp git repo whose pull request touches files mapped to fixture routes and a fake built Storybook, serves `fixtures/site`, sets `GITHUB_EVENT_PATH`, `GITHUB_STEP_SUMMARY`, `GITHUB_OUTPUT` and `INPUT_*`, and runs `run()` in-process. It asserts that only mapped targets were scanned, that story findings carry the story file as their source location (and reach the SARIF file there), the summary, the outputs and the exit code. A second case copies `dist/` outside the workspace and runs the bundle with `node` to prove it works without `node_modules`.

No test makes network requests beyond the local fixture server, and no token is needed.
