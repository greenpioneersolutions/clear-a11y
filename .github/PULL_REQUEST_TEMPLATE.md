## What and why

<!-- What does this change do, and why? Link the issue: "Closes #123". For new rules or engines, link the issue where the approach was agreed (and the RFC, if any). -->

Closes #

## Benchmark delta

<!-- Required when engines, rules or fixtures change. Run `pnpm nx run bench:run` on main and on your branch, and paste the numbers from bench-results/latest.md. Write "n/a: no detection change" otherwise. -->

| Metric                  | Before | After |
| ----------------------- | ------ | ----- |
| Precision (`violation`) |        |       |
| Recall (overall)        |        |       |
| Recall (affected SC)    |        |       |

## Checklist

**Tests**

- [ ] Unit tests for the pure analysis functions (no browser).
- [ ] Integration tests against `fixtures/` for engine behavior.

**Fixtures and measurement**

- [ ] A fixture page with the seeded barrier.
- [ ] A correct-pattern page that produces no findings.
- [ ] Entries in `fixtures/expected/` for both pages.
- [ ] Benchmark delta pasted above (precision of `violation` stays at or above 0.95).

**Docs**

- [ ] Docs updated in this PR: rule page, README, CLI reference, as relevant.
- [ ] An ADR in `docs/adr/` if this makes an architecture, Finding schema, provider policy or public API decision.

**Commits**

- [ ] PR title and commits follow Conventional Commits, with scope = project name without `@clear-a11y/` (for example `feat(engine-keyboard): ...`).
- [ ] Every commit is signed off for the DCO (`git commit -s`).

**Architecture and trust**

- [ ] No detection logic in `apps/`.
- [ ] No engine imports another engine (coordination lives in `runner`).
- [ ] No AI-only `violation`: AI findings are `likely` or `needs-review` unless a deterministic check confirms them.
- [ ] If this changes a UI we ship (report, docs site, desktop), I opened it, used it with a keyboard, and scanned it with Clear A11Y (zero `violation` findings).
