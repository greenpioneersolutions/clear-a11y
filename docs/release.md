# Release process

Releases are automated and happen **only in CI**, from the `Release` workflow (`.github/workflows/release.yml`). Nobody publishes packages from their own machine; locally you only ever run `nx release --dry-run`.

## Versions come from commits

We use [Conventional Commits](https://www.conventionalcommits.org/), and `nx release` reads them since the last `v<version>` tag to pick the next version and write the changelog:

- The scope is the project name without the `@clear-a11y/` prefix: `feat(engine-keyboard): ...`, `fix(cli): ...`. Use `repo` for root files.
- While we are below 1.0, `feat` and `fix` make a **patch** release and a `BREAKING CHANGE:` footer (or `feat!:`) makes a **minor** release, following SemVer's rules for 0.x versions. From 1.0 on: `fix` is patch, `feat` is minor, breaking is major.
- `docs`, `test`, `ci`, `chore` and similar commits appear in the changelog only when they matter to users; they don't bump the version on their own.
- Every commit is signed off for the DCO (`git commit -s`), see [CONTRIBUTING.md](../CONTRIBUTING.md).

Changes to the Finding schema, provider policy or other public APIs need an ADR and must be called out in the commit body so they land in the changelog.

## What is released

**npm packages.** Every project tagged `publish:public` is released, and they all share **one version** (a fixed release group in `nx.json`) until 1.0:

| Package                                                                               | What it is                                    |
| ------------------------------------------------------------------------------------- | --------------------------------------------- |
| `clear-a11y`                                                                          | The CLI (`npx clear-a11y scan <url>`)         |
| `@clear-a11y/mcp`                                                                     | The MCP server for coding agents (+ SKILL.md) |
| `@clear-a11y/core`                                                                    | Finding schema, tiers, WCAG map, config       |
| `@clear-a11y/browser`, `@clear-a11y/crawler`                                          | Playwright sessions, URL discovery            |
| `@clear-a11y/engine-{static,keyboard,states,visual,at,widgets}`, `@clear-a11y/ai`     | The engines and the AI judges                 |
| `@clear-a11y/runner`, `@clear-a11y/repo`, `@clear-a11y/reporter`, `@clear-a11y/queue` | Orchestration, repo scanning, reports, queues |

Each package ships its built `dist/`, its README and the root `LICENSE` (plus `prompts/` for `@clear-a11y/ai` and `SKILL.md` for `@clear-a11y/mcp`), never sources, tests or fixtures. `pnpm publish` replaces `workspace:*` and `catalog:` ranges with real versions. Published packages need Node.js 22.13 or newer (`engines.node`); developing in this repo needs a newer floor because of the build tools (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

**The GitHub Action** is built from the same release and pushed to the `action-v<major>` branch with an `action-v<version>` tag (see below).

**Never published to npm:** the docs site (GitHub Pages), the server (Docker image), the desktop app (GitHub Releases), `test-utils`, `fixtures`, `bench` and `workspace-plugin`. They are `private: true`.

## Preview a release locally

```sh
pnpm nx release --dry-run --yes                       # next version from commits
pnpm nx release 0.1.0 --dry-run --yes --first-release # the very first release
```

This builds the public packages, then prints the version bump for each `package.json`, the `CHANGELOG.md` entry, the commit and tag it would create, and a `pnpm publish --dry-run` listing of every tarball (`--yes` answers the "publish now?" question, which a dry run otherwise skips). Nothing is written, committed, tagged or published. To check one package's tarball contents, run `pnpm pack` in its folder after `pnpm nx build <project>`.

## Publishing v0.1.0 for the first time

`v0.1.0` was tagged in git with every public `package.json` already at `0.1.0`, before anything was on npm. So the first publish does not version anything: once the `npm` environment and `NPM_TOKEN` exist, run **Actions → Release → Run workflow** on `main` with **Publish only** ticked and **Dry run** unticked. It publishes 0.1.0 to npm with provenance and pushes the built action to `action-v0` (tagged `action-v0.1.0`). Later releases use the normal flow below; the next version is computed from the commits since `v0.1.0`.

## Run a release

1. Make sure `main` is green (CI, Dogfood, CodeQL).
2. In GitHub, open **Actions → Release → Run workflow** on `main`. Leave **Dry run** ticked first and read the preview in the log.
3. Run it again with **Dry run** unticked. Fill **Version** only to override the computed one (`0.1.0`, `patch`, `minor`...). Tick **First release** for the very first one.

The workflow then:

1. Lints, type-checks, tests and builds every public package.
2. Runs `nx release`: bumps the version in every public `package.json`, prepends the entry to `CHANGELOG.md`, commits `chore(release): v<version>`, tags `v<version>`, pushes both to `main` and creates the GitHub release with the changelog.
3. Publishes every public package to npm **with provenance** (`NPM_CONFIG_PROVENANCE=true`, using the job's OIDC `id-token`), so anyone can verify on npmjs.com that a package was built from this repository by this workflow.
4. Builds the GitHub Action from the `v<version>` tag and pushes it to `action-v<major>`, tagged `action-v<version>`.

If publishing fails after the tag was pushed (for example an npm outage or an expired token), don't start a normal release again: the version and tag already exist. Fix the cause, then run the workflow with **Publish only** ticked (and **Dry run** unticked). It builds the packages and runs `pnpm nx release publish` for the version already in the `package.json` files; packages that were published before the failure are skipped. The action job runs after it too and does nothing if `action-v<version>` already exists. If only the action step failed, re-run that job.

## The GitHub Action release branch

The action's bundle (`apps/action/dist`, about 37 MB with `playwright-core`) is never committed to `main`. For each release the workflow commits only what GitHub needs to run the action to the `action-v<major>` branch:

```
action.yml   dist/   package.json (version + "type": "module")   LICENSE   NOTICE   README.md
```

and tags that commit `action-v<version>`. Users write `uses: greenpioneersolutions/clear-a11y@action-v0` (latest 0.x) or `@action-v0.1.0` (one release). The branch's history only ever contains built releases, one commit each.

## Credentials

- The npm token (`NPM_TOKEN`, an npm automation or granular token with publish rights to the `clear-a11y` package and the `@clear-a11y` scope) is stored in the repository's **`npm` environment**, and only the release job of `release.yml` uses that environment. Protect the environment with required reviewers so a release needs a maintainer's approval.
- The workflow's own `GITHUB_TOKEN` (with `contents: write`) pushes the release commit, the tags and the action branch, and creates the GitHub release. If `main` is protected, allow GitHub Actions to push the release commit, or the push step fails.
- **Contributors never need any of this.** CI, Dogfood, Docs and CodeQL run without secrets and work on forks. Building, testing and benchmarking need no accounts.

## Rules

- Never run `npm publish`, `pnpm publish` or `nx release` without `--dry-run` on your machine.
- Never edit versions or `CHANGELOG.md` by hand; `nx release` owns them.
- Keep public packages free of runtime dependencies on private projects (`publish:public` must not depend on `publish:private`).
- New runtime dependencies whose licenses require attribution go into `NOTICE` in the same change.
