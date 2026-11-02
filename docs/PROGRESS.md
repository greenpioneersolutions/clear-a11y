# Clear A11Y bootstrap progress

## Run summary (2026-11-01)

**Status: all waves complete (0–7). Nothing is marked BLOCKED.** One item is skipped by the offline policy (Electron smoke test, see below). `main` is green: `run-many -t lint typecheck test build e2e`, `sync:check`, `format:check`, `nx release 0.1.0 --dry-run --first-release --yes`, every `test-integration` suite (17 projects, including the self-scans of the HTML report, docs site and desktop UI) and `bench:run`.

### What was built

- Nx monorepo (pnpm workspaces + TS project references, ESM, strict TS, catalog), 24 projects, every one tagged; module boundaries enforced by lint; local generators for engines, rules and fixtures.
- Deterministic engines: static (axe-core), keyboard, states, visual, at, widgets; 58 registered rules plus axe-core's WCAG rules, the repo lint rule map and 7 AI judges. ADR 0003 pass records resolve needs-review findings that another deterministic engine verified.
- AI (off by default): BYO providers (Anthropic, OpenAI, Azure, Ollama; Bedrock/Vertex config-only), 7 judges with versioned prompts and prompt-injection hardening, keyboard-only and screen-reader persona agents.
- Repo scanning: jsx-a11y / vuejs-accessibility lint without running repo code, Storybook story scanning, opt-in `--boot` dev server, runtime-to-source mapping.
- Shells: CLI (`clear-a11y scan|bench|report`), MCP server + SKILL.md, GitHub Action, NestJS server with SQLite/BullMQ queue and Dockerfile, Electron desktop app, Astro Starlight docs site with generated references.
- Reports: canonical JSON, SARIF 2.1.0, self-contained accessible HTML.
- Open-source skeleton, CI (affected checks, integration, bench summary), CodeQL, dogfood, docs and release workflows (npm provenance, CI only).

### Benchmark (final, seeded fixtures)

|                                                                         | Recall             | Precision of `violation` | Noise on correct pages |
| ----------------------------------------------------------------------- | ------------------ | ------------------------ | ---------------------- |
| axe-core only, S01 (22 issues)                                          | 0.273 (6/22)       | 1.000 (8/8)              | 1                      |
| axe-core only, final fixture set (113 issues, all 55 WCAG 2.2 A/AA SCs) | 0.142 (16/113)     | 1.000 (14/14)            | 1                      |
| **Clear A11Y, final (no AI provider)**                                  | **0.858 (97/113)** | **1.000 (72/72)**        | **0 of 120 pages**     |
| Repo layer (React, Vue, Storybook samples)                              | 1.000 (20/20)      | 1.000 (7/7)              | 0                      |

By layer (final): at 31/31, keyboard 16/16, states 8/8, widgets 11/11, visual 18/20, static 8/9, persona 3/9, ai 2/9. Missed: 1.3.1 (table with bold-cell headers), 1.3.2 (reading order), 2.3.1 (flashes), judgment-only SCs needing a model (1.1.1 and 2.4.4 on the prompt-injection page, 1.3.3, 1.4.5, 2.4.6, 3.1.2, 3.3.3) and multi-page SCs needing persona tasks (2.4.5, 3.2.3, 3.2.4, 3.2.6, 3.3.4, 3.3.7). Reports: `bench-results/final.md`, `bench-results/axe-only/final-axe-only.md`, per-wave files `bench-results/wave*.md`.

**Caveat:** fixtures were written alongside the engines that detect them. These numbers show the engines catch the barriers we designed; they are not yet recall against human audits, and the 80% target is not yet proven.

### Skipped / blocked and why

- **Electron smoke test and packaging:** skipped. The Electron binary downloads from GitHub releases, which the bootstrap's network policy (package registries only) forbids. `pnpm nx run desktop:fetch-electron` enables it (users, CI).
- **Bedrock and Vertex providers:** config validation only; they need AWS SigV4 / Google auth.
- **Real Redis for BullMQ:** tests skip unless `REDIS_URL` is set (contract tests run against a fake).
- **Docker image:** Dockerfile and `docker-build` target exist; the image was not built offline.

### Open TODO placeholders

- `CODE_OF_CONDUCT.md`: contact `TODO-maintainer-email`; text written from memory, diff against the official Contributor Covenant 2.1.
- `.github/CODEOWNERS`: `@TODO-*` handles; `GOVERNANCE.md` maintainers table.
- Repo settings before the first release: `npm` environment with `NPM_TOKEN` and reviewers, GitHub Pages enabled, Actions allowed to push to protected `main`.
- `v0.1.0` is tagged in git with every public package at 0.1.0, but nothing is on npm yet. The first npm publish is the Release workflow with **Publish only** ticked (see `docs/release.md`).

### Top 5 next steps before announcing publicly

1. **Measure against real audits.** Seed fixtures from sanitized human audit reports and the alphagov accessibility-tool-audit page (needs network beyond registries), score them, and only then talk about the 80% target.
2. **Run the CI-only paths once with network:** Electron smoke test + packaging, Docker image build, BullMQ against real Redis, the release workflow in dry-run mode, and the docs Pages deploy.
3. **Close the deterministic gaps:** a reading-order vs visual-order check (1.3.2), a header-row heuristic for tables axe treats as layout (1.3.1), a flash detector (2.3.1), and persona tasks for the multi-page fixture sets.
4. **Validate the AI layer with a real provider** (opt-in, recorded) to measure judge precision on the ai/ fixtures, keeping AI findings capped at `likely`.
5. **Finish the community setup:** maintainers, CODEOWNERS, contact email, verified Code of Conduct text, the server's SSRF guard for redirects (browser request filter), and the reports showing `resolved` (pass-record) items.

---

This file is the run's memory. Resume from the first unticked task. Do not redo ticked work.

Status legend: `[ ]` todo, `[x]` done, `[~]` in progress, `BLOCKED` = failed 3 times (see notes).

## Benchmark progression

| Wave                                         | Precision (violation) | Recall (overall) | Notes                                                                                                                             |
| -------------------------------------------- | --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S01 baseline (axe only)                      | 1.000 (8/8)           | 0.273 (6/22)     | static 4/4, visual 2/4, all other layers 0. 1 needs-review on visual/ok (gradient contrast).                                      |
| W2 + S02 keyboard                            | 1.000 (15/15)         | 0.500 (15/30)    | keyboard 9/14; original 22 issues: 10/22. Modal issues wait for S03.                                                              |
| W2 + S03 states                              | 1.000 (24/24)         | 0.750 (27/36)    | states 7/7; dialog states now feed keyboard checks; noise 1 (axe gradient needs-review).                                          |
| W2 + S04 visual                              | 1.000 (39/39)         | 0.851 (40/47)    | visual 15/15 + 4 new; cross-slice FPs fixed at merge (65% -> 100%); noise 6 (axe contrast needs-review).                          |
| **Wave 2 final** (+ S05 at/widgets)          | 1.000 (63/63)         | 0.970 (65/67)    | static/keyboard/states/visual/at/widgets 100%; ai 0/2 (wave 3). Seeded, self-authored fixtures: not yet a human-audit number.     |
| W3 + S06 reporter (+ strict-CSP fixture)     | 1.000 (64/64)         | 0.971 (66/68)    | unchanged detection; bypassCSP regression page added.                                                                             |
| **Wave 3 final** (+ S07 ai)                  | 1.000 (64/64)         | 0.973 (72/74)    | provider none; 2 deterministic ai-layer rules in engine-at; misses = 2 judgment calls on ai/prompt-injection (need a real model). |
| W4 + S09 repo static + S08 personas          | 1.000 (65/65)         | 0.974 (75/77)    | persona 3/3; repo layer (separate): recall 14/14, violation precision 4/4.                                                        |
| **Wave 4 final** (+ S10 repo runtime)        | 1.000 (65/65)         | 0.974 (75/77)    | repo layer: 20/20 recall, 7/7 precision, 0 noise (storybook-sample stand-in).                                                     |
| **Wave 5 final** (action, queue/server, mcp) | 1.000 (65/65)         | 0.974 (75/77)    | shells only, numbers unchanged.                                                                                                   |
| **Wave 6 final** (desktop, docs)             | 1.000 (65/65)         | 0.974 (75/77)    | +3 correct-pattern pages from docs dogfood FPs (all silent); noise 6.                                                             |
| W7a hardening                                | 1.000 (65/65)         | 0.974 (75/77)    | noise 0 (10 needs-review resolved by pass records); 139 pages.                                                                    |
| W7c-2 behaviour (3.2.1, 3.2.2, 2.2.2, 1.3.4) | 1.000 (69/69)         | 0.976 (81/83)    | 4 new rules, noise 0; bench now ~9 min; found + fixed a real 3.2.2 bug in the desktop UI.                                         |
| **Wave 7 final** (+ W7c-1: all 55 A/AA SCs)  | 1.000 (72/72)         | 0.858 (97/113)   | recall drops by design (judgment-only and multi-page SCs now expected); 225 pages, noise 0; axe-only on same set: 0.142 (16/113). |

## Wave 0: Plan (serial)

- [x] W0 ROADMAP, ADR 0001 architecture, ADR 0002 Nx workspace, slice files S00–S15

## Wave 1: Foundation (serial)

- [x] S00a Workspace (pnpm + TS project refs, ESM, catalog, Nx plugins, ESLint boundaries, Prettier, named inputs, nx release dry-run)
- [x] S00b Workspace plugin (engine, rule, fixture generators + tests)
- [x] S00c Core, test-utils, fixtures, bench
- [x] S00d Open-source skeleton (root files, .github, ci.yml, codeql.yml, AGENTS.md commands)
- [x] S01 First scan (browser, crawler, engine-static, reporter JSON, runner, cli scan/bench, axe-only baseline)

## Wave 2: Behavioral engines (parallel)

- [x] S02 engines/keyboard (merged; 10 rules; bench recall 0.500 = 15/30, precision 1.000 = 15/15)
- [x] S03 engines/states (merged; state explorer + runner replay; bench with S02: recall 0.750 = 27/36, precision 1.000 = 24/24)
- [x] S04 engines/visual (merged; 11 rules; with S02+S03: recall 0.851 = 40/47, precision 1.000 = 39/39)
- [x] S05 engines/at + engines/widgets (merged; 18 rules)
- [x] Wave 2 merge + bench (recall 0.970 = 65/67, precision 1.000 = 63/63, noise 6 needs-review)

## Wave 3: Reports and AI foundation (parallel)

- [x] S06 reporter SARIF + HTML (merged; dogfood: report.html scanned by every engine, zero findings)
- [x] S07 packages/ai providers + judges (merged; 7 judges, BYO providers, injection hardening; bedrock/vertex config-only)
- [x] Wave 3 merge + bench (recall 0.973 = 72/74, precision 1.000 = 64/64, noise 6 needs-review; AI recall not measured offline)

## Wave 4: Personas and repos (parallel)

- [x] S08 Persona agents (merged; keyboard-only + screen-reader personas, deterministic + AI planners; persona layer 3/3)
- [x] S09 packages/repo static layer (merged; repo bench recall 1.000 = 14/14, violation precision 1.000 = 4/4)
- [x] S10 Repo runtime layer (merged; Storybook stories + opt-in --boot dev server; repo layer 20/20)
- [x] Wave 4 merge + bench (site recall 0.974 = 75/77, precision 1.000 = 65/65; repo recall 1.000 = 20/20, precision 1.000 = 7/7)

## Wave 5: Shells (parallel)

- [x] S11 apps/action (merged; node24 esbuild bundle, changed files -> routes/stories/files, SARIF + job summary)
- [x] S12 packages/queue + apps/server (merged; memory + node:sqlite + BullMQ queues, NestJS API with SSRF guard, Dockerfile)
- [x] S13 apps/mcp (merged; 5 tools over stdio, SKILL.md, AI forced off, untrusted page text marked)
- [x] Wave 5 merge + bench (no detection change: site 0.974 / 1.000, repo 20/20 / 7/7)

## Wave 6: Desktop and docs site (parallel)

- [x] S14 apps/desktop (merged; renderer dogfood 0 findings; Electron smoke test SKIPPED offline: binary from GitHub releases; run desktop:fetch-electron)
- [x] S15 apps/docs (merged; Astro Starlight, generated rule/CLI/config references with drift checks, docs.yml, dogfood 0 findings)
- [x] Wave 6 merge + bench (site 0.974 / 1.000 on 136 pages; repo 20/20 / 7/7; 3 engine FPs fixed via docs dogfood)

## Wave 7: Harden and finish (serial)

- [x] W7a engine hardening (merged: ADR 0003 pass records, closed-details / re-render / 2.4.11 exception fixes, action via Storybook layer, ConfigSchema descriptions; noise 6 -> 0)
- [x] W7c fixture expansion across WCAG 2.2 A/AA (merged: 76 + 9 pages, 13 new rules; every A/AA SC has expected issues)

- [x] Retry BLOCKED tasks (none marked BLOCKED; Electron smoke test remains skipped by offline policy)
- [x] Expand fixtures across WCAG 2.2 A/AA; final bench vs S01 baseline (0.858 vs axe-only 0.142 on the same 113 issues)
- [x] Release readiness (merged: 16 public packages verified with pnpm pack; CLI published as `clear-a11y`; release.yml with provenance; action ships from `action-v0` branch; dogfood.yml; `nx release 0.1.0 --dry-run --first-release --yes` passes)
- [x] Final README
- [x] Repo hygiene pass (root clean; no build output, secrets or real-site screenshots tracked (only synthetic test keys in redaction tests and one generated texture); 24/24 projects tagged; graph acyclic (enforced by lint); 0 broken relative doc links; tmp/ ignored)
- [x] Final full checks + run summary at top of this file

## Notes

- Open follow-up: browser request filter so the server's SSRF guard also covers redirects/DNS changes during a scan (S12 request).

- S01 baseline by layer: static 100% (4/4), visual 50% (2/4), ai 0/2, at 0/4, keyboard 0/6, states 0/1, widgets 0/1. Report: bench-results/s01-axe-baseline.md.
- Playwright pinned to 1.61.1 to match locally cached Chromium 1228 (see DECISIONS.md).
