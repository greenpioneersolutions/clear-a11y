# Contributing to Clear A11Y

Thanks for helping. You don't need to be an accessibility expert to contribute: the generators, fixtures and benchmark are designed so that every change is checked by measurement, not by trust. This guide covers setup, how the repo is organized, how a change gets merged, and how to add rules and fixtures.

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). AI coding agents should also read [AGENTS.md](AGENTS.md), which is the full technical contract.

## Setup

You need:

- **Node.js 22 (22.23.4 or newer), 24 or 26**, an LTS release. `.nvmrc` names the version CI uses (`nvm use`). Astro (docs site), Vitest and `node:sqlite` set this floor.
- **pnpm 9**, through Corepack, which ships with Node: `corepack enable`. The exact version is pinned in the `packageManager` field of `package.json`.
- **Chromium for Playwright**, used by integration tests and the benchmark.

```sh
git clone https://github.com/<you>/clear-a11y.git
cd clear-a11y
corepack enable
pnpm install
pnpm exec playwright install chromium
pnpm nx run-many -t lint typecheck test build
```

No accounts, secrets or Nx Cloud are needed. After `pnpm install` and the Playwright download, everything builds, tests and benchmarks offline.

### Everyday commands

```sh
pnpm nx affected -t lint typecheck test build  # check only what your change touches
pnpm nx run-many -t test-integration           # browser tests against fixtures/
pnpm nx run fixtures:serve                     # browse the seeded-barrier site on http://127.0.0.1:4173/
pnpm nx run bench:run                          # precision/recall report in bench-results/
pnpm nx graph                                  # see how projects depend on each other
pnpm nx sync                                   # update TypeScript project references
pnpm format                                    # format with Prettier
```

## A short tour of the repo

Clear A11Y is an [Nx](https://nx.dev) monorepo using pnpm workspaces and TypeScript project references.

- **`apps/`** holds thin shells: the CLI, MCP server, GitHub Action, server, desktop app and docs site. An app parses input, calls `runner` and `reporter`, and renders output. **Detection logic never goes in `apps/`.**
- **`packages/`** holds all real logic: `core` (the Finding schema, WCAG map and config), `browser` (Playwright sessions), `engines/*` (static, keyboard, states, visual, at, widgets), `ai`, `crawler`, `runner` (which wires everything together), `reporter`, and more.
- **`fixtures/`** holds seeded-barrier web pages and the findings a human auditor would expect on each one. See [fixtures/README.md](fixtures/README.md).
- **`tools/`** holds the benchmark harness (`bench`) and our Nx generators (`workspace-plugin`).
- **`docs/`** holds the roadmap, architecture decision records ([docs/adr](docs/adr/README.md)) and proposals ([docs/rfcs](docs/rfcs/README.md)).

Every project has `type:*`, `scope:*` and `publish:*` tags. ESLint enforces which project types may depend on which (for example, engines may depend on `core` and `browser` but **never on another engine**; `runner` coordinates engines). If `lint` reports a module-boundary violation, move the code to the right package rather than loosening the rule. The full table is in [ADR 0001](docs/adr/0001-architecture.md).

## How a change gets merged

1. **Start with an issue.** Open one, or comment on an existing one to say you're picking it up. For a **new rule or engine**, agree on the approach on the issue before writing code (use the "Rule proposal" form). **Large new capabilities** start as an RFC in [docs/rfcs](docs/rfcs/README.md).
2. **Fork and branch.** Work on a branch in your fork.
3. **Use the generators** for new engines, rules and fixtures (see below), so tags, boundaries, tests and doc stubs are right from the start.
4. **Open a pull request** and fill in the template checklist: tests, fixtures, benchmark delta, docs.
5. **CI must be green**, including the benchmark when engines, rules or fixtures change.
6. **Review.** One maintainer approval merges a change. Two approvals are needed for changes to the Finding schema, AI provider policy, or anything security-sensitive.

### Sign your commits (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/) (DCO) instead of a Contributor License Agreement. There is **no CLA**.

The DCO is a short statement that you wrote the change, or otherwise have the right to submit it under the project's open-source license. You agree to it by adding a `Signed-off-by` line to each commit, which Git does for you:

```sh
git commit -s -m "feat(engine-keyboard): detect backward focus jumps"
```

This adds `Signed-off-by: Your Name <you@example.com>` using your Git name and email. If you forget, fix the last commit with `git commit --amend -s`, or a whole branch with `git rebase --signoff main`.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). They drive version numbers and the changelog.

```
<type>(<scope>): <summary>

feat(engine-keyboard): detect focus traps in modal dialogs
fix(core): keep finding ids stable when the selector has whitespace
docs(contributing): explain DCO sign-off
```

- **type**: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
- **scope**: the project name without the `@clear-a11y/` prefix, for example `core`, `engine-keyboard`, `runner`, `cli`, `bench`, `fixtures`, `workspace-plugin`. Use `repo` for root files.

## Adding a rule

A rule is one specific check inside an engine, such as `keyboard/focus-order-backward`. Agree on the rule on its issue first, then scaffold it:

```sh
pnpm nx g @clear-a11y/workspace-plugin:rule --engine=<engine> --name=<rule> --wcag=<sc>
# example
pnpm nx g @clear-a11y/workspace-plugin:rule --engine=keyboard --name=focus-order-backward --wcag=2.4.3
```

Add `--tier=needs-review` when the WCAG interpretation is ambiguous. The generator creates:

- `packages/engines/<engine>/src/rules/<rule>.ts`: the rule's metadata (id, WCAG criteria, tier, description, fix) and a **pure check function** stub (`detect<Rule>`), registered in the engine's `src/rules/index.ts`.
- `packages/engines/<engine>/src/rules/<rule>.test.ts`: a unit test for the pure check.
- `fixtures/site/<engine>/<rule>.html`: a page with the seeded barrier.
- `fixtures/site/<engine>/<rule>-ok.html`: a correct-pattern page that must produce no findings.
- `fixtures/expected/<engine>/<rule>.json` and `<rule>-ok.json`: what a human auditor would log on each page.
- `docs/rules/<engine>/<rule>.md`: the rule's documentation page stub.

Then:

1. **Write the fixtures.** Make the barrier page show the problem plainly, and the `-ok` page show the correct pattern. Fill in the expected entries (selector, WCAG criteria, layer, description).
2. **Write the failing unit test**, then implement the pure check. Keep analysis in small pure functions (for example `isBackwardJump(prev, next)`) that run without a browser. Browser I/O lives in the engine, separate from the decision.
3. **Write an integration test** (`test/**/*.integration.test.ts`) that runs the engine against both fixture pages: one finding on the barrier page, none on the `-ok` page.
4. **Fill in the rule doc page**: what it catches, WCAG criterion, tier, who is affected, how to fix it, and examples.
5. **Run the benchmark** (`pnpm nx run bench:run`) and paste the before and after precision and recall into your PR.

If a check can't be made deterministic, say so on the issue and propose it for the AI layer instead of shipping a flaky heuristic. When in doubt, use `needs-review` rather than `violation`.

## Adding a fixture

Fixtures are how we measure. To add a page without a new rule (for example, to reproduce a missed issue):

```sh
pnpm nx g @clear-a11y/workspace-plugin:fixture <area>/<page>
# example
pnpm nx g @clear-a11y/workspace-plugin:fixture keyboard/skip-link-missing --wcag=2.4.1 --layer=keyboard
```

This creates `fixtures/site/<area>/<page>.html` and `fixtures/expected/<area>/<page>.json`. Use `--correctPattern` for a page that must produce zero findings. Keep fixtures minimal, and sanitize anything derived from a real audit (no real names, brands, URLs or screenshots). `pnpm nx test fixtures` validates every expected file.

## Reporting false positives and missed issues

These reports are among the most valuable contributions. Use the issue forms:

- **False positive**: Clear A11Y reported something that isn't a barrier.
- **Missed issue**: a human found a barrier that Clear A11Y didn't.

Both forms ask for a **minimal HTML reproduction**: the smallest page that shows the problem. That snippet becomes a fixture in `fixtures/site/`, so the fix is measured and the problem can't quietly come back.

## Before you open a PR

Run these locally. CI runs the same checks.

```sh
pnpm nx affected -t lint typecheck test build
pnpm nx sync:check
pnpm format:check
pnpm nx run bench:run   # when engines, rules or fixtures changed
```

And check that:

- [ ] New detection has a barrier fixture, a correct-pattern fixture and expected entries.
- [ ] The benchmark delta is in the PR description.
- [ ] Docs are updated in the same change: the rule page, the README, the CLI reference, and an ADR if you made an architecture decision.
- [ ] AI findings are never `violation` on their own.

## Documentation

User documentation is the docs site in `apps/docs` (Astro Starlight, deployed to GitHub Pages). Preview it with `pnpm nx run docs:dev`.

- **Hand-written site pages** (home, getting started, CLI guide, concepts, contributor guides) are in `apps/docs/content/`.
- **Guides that live next to their code** (`docs/*.md`, `apps/*/README.md`, `apps/mcp/SKILL.md`, this file, the ADRs) are imported into the site on every build. Edit them where they are; relative links between them become links between pages.
- **Reference pages are generated**: the rules reference from the rule metadata in the code plus `docs/rules/<engine>/<rule>.md`, the CLI reference from the CLI's own definition, the configuration reference from the config schemas, and the benchmark tables from `bench-results/`. The build fails when a rule has no doc page, a doc page has no rule, a page's tier or WCAG criteria differ from the code, or a relative link is broken.

See [apps/docs/README.md](apps/docs/README.md) for details.

## Practice what we test

Everything we ship with a user interface (the HTML report, the docs site, the desktop app) must pass Clear A11Y itself with zero `violation` findings. If you change one of them, open it, use it with a keyboard, and scan it with Clear A11Y before asking for review.
