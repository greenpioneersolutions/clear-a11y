# S00d: Open-source skeleton

## Goal

Give the repo the files and automation of a healthy open-source project: community documents, issue forms that turn bug reports into fixtures, a PR checklist that enforces "fixture + benchmark + docs", dependency updates, and fork-safe CI (`ci.yml`) plus CodeQL. Bring the AGENTS.md Commands section up to date. Read the ground rules in "Notes" first.

## Wave

Wave 1, **serial** (after S00c; may overlap with nothing that touches root files).

## Projects

| Project     | Path            | Package | Tags | Status  |
| ----------- | --------------- | ------- | ---- | ------- |
| (repo root) | `/`, `.github/` | n/a     | n/a  | touched |

No Nx projects are created.

## Depends on

S00a (commands exist), S00c (`bench:run`, `fixtures:serve`, `test-integration` exist).

## Scope

**Root files**

- `README.md` (draft): one-paragraph pitch, why (axe-only coverage vs human audits), status "pre-alpha", planned quickstart (`npx clear-a11y scan <url>`), "How we measure" with a benchmark table placeholder filled from `bench-results/latest.md`, links to CONTRIBUTING, docs, ROADMAP, license.
- `LICENSE`: full Apache-2.0 text, copyright "The Clear A11Y Authors".
- `NOTICE`: project notice plus third-party attributions: axe-core (MPL-2.0, file-level copyleft, used unmodified), Playwright (Apache-2.0), WCAG 2.2 titles and Understanding links (W3C Software and Document License), IBM Equal Access checker (Apache-2.0, optional). Add a line that new runtime dependencies with notice requirements must be listed.
- `CONTRIBUTING.md`: prerequisites (Node LTS, pnpm via corepack, `pnpm exec playwright install chromium`), setup, the command list, contribution flow (issue first for rules/engines, RFC for large changes, fork + branch + generators, PR template), **DCO** (`git commit -s`, no CLA), how to add a rule with `pnpm nx g @clear-a11y/workspace-plugin:rule`, fixtures and benchmark expectations, how to report false positives/negatives (minimal HTML repro → becomes a fixture), conventional commits with scope = project name.
- `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1, full text, enforcement contact `TODO-maintainer-email` (clearly marked to replace).
- `SECURITY.md`: report privately via GitHub Security Advisories ("Report a vulnerability"); never in public issues; scope includes prompt injection that steers AI verdicts, credential handling, SSRF in the server; supported versions table (pre-1.0: latest only).
- `GOVERNANCE.md`: maintainers list placeholder, decisions via issues/ADRs/RFCs, approvals (one maintainer; two for Finding schema, provider policy, security-sensitive changes), how to become a maintainer, conflict resolution.
- `SUPPORT.md`: questions → GitHub Discussions; bugs/false positives → issue forms; security → SECURITY.md.

**`.github/`**

- `ISSUE_TEMPLATE/config.yml` (blank issues off, links to Discussions and security).
- Issue forms (YAML): `bug.yml`, `false-positive.yml` (rule id, finding JSON, minimal HTML repro **required**, why it's wrong with WCAG reference), `missed-issue.yml` (WCAG SC, minimal HTML repro **required**, how a human found it), `rule-proposal.yml` (SC, detection approach, deterministic or AI, expected tier, fixture idea), `feature-request.yml`. Apply labels automatically.
- `PULL_REQUEST_TEMPLATE.md`: checklist — tests added; barrier fixture + correct-pattern fixture + expected entries; benchmark delta pasted (precision of violation, recall); docs updated (rule page, README, CLI ref, ADR if decision); conventional commit title; DCO sign-off; no `violation` from AI.
- `CODEOWNERS`: placeholder team `@clear-a11y/maintainers` (commented as placeholder); extra owners for `packages/core/` and `packages/ai/`.
- Dependency updates: **Renovate** (`renovate.json`) is recommended because it understands pnpm catalogs and can group Nx and Playwright packages (Playwright npm version and the server's Docker image tag must move together). If you pick Dependabot instead, justify in `docs/DECISIONS.md`.
- `labels.yml`: `good first issue`, `help wanted`, `rule-proposal`, `false-positive`, `false-negative`, `needs-repro`, `bug`, `enhancement`, `security`, `docs`, `benchmark`.
- `workflows/ci.yml`:
  - Triggers `pull_request` and `push` to `main`; **never** `pull_request_target`. `permissions: contents: read`. `concurrency` with cancel-in-progress per ref.
  - Steps: checkout with `fetch-depth: 0`; `pnpm/action-setup`; `actions/setup-node` (version from `.nvmrc` or `package.json` engines, pnpm cache); `pnpm install --frozen-lockfile`; `nrwl/nx-set-shas` for affected base/head.
  - Playwright: cache `~/.cache/ms-playwright` keyed on the Playwright version from the lockfile; `pnpm exec playwright install chromium` on miss; `pnpm exec playwright install-deps chromium` always (system libraries aren't cached).
  - `pnpm nx sync:check`, `pnpm nx format:check`, `pnpm nx affected -t lint typecheck test build e2e test-integration`.
  - Bench job: run `pnpm nx run bench:run` when `bench` is affected (`pnpm nx show projects --affected` contains `bench`), upload `bench-results/` as an artifact, append `latest.md` to `$GITHUB_STEP_SUMMARY`.
  - No secrets, no Nx Cloud token; must pass on forks.
- `workflows/codeql.yml`: `javascript-typescript`, on push to main, PRs and weekly schedule; `permissions: security-events: write, contents: read`.

**AGENTS.md Commands**: update the block to the real commands, adding `pnpm exec playwright install chromium`, `pnpm nx affected -t lint typecheck test build e2e test-integration`, `pnpm nx sync:check`, `pnpm nx format:check`, `pnpm nx build workspace-plugin` (if generators need it). Do not change other AGENTS.md sections.

## Out of scope

`release.yml` and npm provenance (wave 7), `docs.yml` (S15), the dogfood scan workflow (wave 7), label-sync automation, DCO enforcement bot setup (maintainers install the DCO app; document only).

## Files to create/change

`README.md`, `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, `SUPPORT.md`, `.nvmrc`, `.github/ISSUE_TEMPLATE/*.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/labels.yml`, `renovate.json` (or `.github/dependabot.yml`), `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `AGENTS.md` (Commands block only), `docs/DECISIONS.md`.

## Tests

- Validate every YAML file parses (a small script or `pnpm dlx` is not allowed offline; use a Node one-liner with a YAML parser already in the lockfile, or `actionlint` if installed locally; record what you used).
- Issue forms: required fields present; labels exist in `labels.yml`.
- Dry-run CI logic locally where possible: run each command from `ci.yml` in order from a clean checkout.

## Fixtures + expected findings

None. The issue forms are designed so reports become fixtures under `fixtures/site/<area>/` with expected entries.

## Docs to update

All of the files above; `docs/DECISIONS.md` (Renovate vs Dependabot, Node version in `.nvmrc`).

## Acceptance criteria

- [ ] All root files exist; LICENSE is unmodified Apache-2.0; CODE_OF_CONDUCT is Contributor Covenant 2.1 with the TODO contact.
- [ ] Five issue forms + config, PR template, CODEOWNERS, labels, dependency-update config, `ci.yml`, `codeql.yml` exist and parse.
- [ ] `ci.yml` uses no secrets, no `pull_request_target`, read-only permissions, Playwright cache, `sync:check`, and runs `test-integration`.
- [ ] Every command in `ci.yml` succeeds locally from a clean install.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `pnpm nx sync:check` passes.
- [ ] `pnpm nx run bench:run` unchanged (no detection change; note "n/a").
- [ ] AGENTS.md Commands matches reality.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- Principles the docs must state: deterministic first, AI second; tiers `violation` / `likely` / `needs-review` and AI never `violation`; evidence on every finding; every detection change ships fixtures and a benchmark delta; open and self-hostable (no required SaaS, Nx Cloud or secrets); bring your own model, never consumer chat-subscription login; everything with a UI passes Clear A11Y itself.
- Architecture facts docs may cite: engine contract `run(ctx: PageContext): Promise<Finding[]>` (types in `@clear-a11y/browser`); engines never import engines, `runner` coordinates; apps are thin; module boundaries enforced by `lint` from `type:*`/`scope:*`/`publish:*` tags.
- Offline: CI may download Playwright browsers (that's the contributor's own install step), but tests must not reach the network.

### Pitfalls and hints

- Write plainly for a web developer new to accessibility (AGENTS.md documentation standards).
- The README benchmark table must say the numbers come from seeded fixtures, not yet from real audits.
- `nx affected` needs full history (`fetch-depth: 0`) and correct SHAs; `nrwl/nx-set-shas` handles PRs and pushes.
- Don't add workflow steps that need `GITHUB_TOKEN` write scopes in `ci.yml`.
- Pin third-party actions to a major version tag at minimum; Renovate can bump them.
