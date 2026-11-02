---
title: How coverage is measured
description: The benchmark behind Clear A11Y's numbers - method, matching rule, precision and recall, today's results and their limits.
---

Clear A11Y's goal is to find **80% or more of what a human accessibility audit finds**. A goal like that is only worth something if it is measured, the method is public and anyone can reproduce it. This page explains the method and shows the latest results, generated from `bench-results/latest.json` every time this site is built.

## Read this first: what the numbers mean today

The numbers below come from **seeded fixtures that we wrote ourselves**: small pages, each with known barriers, built alongside the engines that detect them. They prove that each check works and keep it from regressing. They are **not yet a measurement against real human audits**, and a high recall on our own fixtures does not mean Clear A11Y finds that share of the barriers on your site. Measuring against sanitized findings from real audits is the next milestone on the [roadmap](/roadmap/).

## The method

1. **Fixtures.** `fixtures/site/` holds small web pages. A barrier page contains one or more seeded barriers, such as a focus order that jumps backward or an error message that isn't announced. A correct-pattern page shows the accessible way to build the same thing and must produce **no findings at all**.
2. **Expected findings.** For every page, `fixtures/expected/` lists what a human auditor would log: the WCAG success criterion, the element (CSS selector, with accepted alternatives), the engine layer we expect to catch it, and a description.
3. **Scan.** The benchmark scans every page with every deterministic engine, the same way `clear-a11y scan` does. AI judges are off (the provider is `none`), so the numbers need no API key and are reproducible offline.
4. **Match.** A finding matches an expected issue when it is on the same page, shares a WCAG success criterion and its selector matches one of the accepted selectors.
5. **Score.**
   - **Recall** = matched expected issues ÷ expected issues, counting findings of **any tier**. It is reported overall, by WCAG success criterion and by engine layer, so we know which layer earned what.
   - **Precision of `violation`** = `violation` findings that match an expected issue ÷ all `violation` findings. Only `violation`s can fail CI, so they must be right: precision must stay at or above **0.95**.
   - **Noise** = findings of any tier on correct-pattern pages. It should be zero; every item erodes trust.

The repo layer (source scanning) is scored separately on sample repositories in `fixtures/repos/`, matched by file and line instead of selector.

## Reproduce it

```sh
pnpm install
pnpm exec playwright install chromium
pnpm nx run bench:run
```

The results are written to `bench-results/latest.json` and `latest.md`. A run takes a few minutes and needs no network access. To score your own pages, use `clear-a11y bench --site <dir> --expected <dir>` (see the [CLI reference](/reference/cli/#clear-a11y-bench)).

## Latest results

{{benchmark}}

## What's next

- **Real audits.** Seed fixtures from sanitized findings of real human audits, and add the open [alphagov accessibility tool audit](https://alphagov.github.io/accessibility-tool-audit/) page as an external baseline.
- **Wider WCAG coverage.** Add fixtures across all WCAG 2.2 A and AA success criteria, including the ones no rule checks yet.
- **AI judges.** Measure the judges with real models (they need an API key or a local model, so they are not part of the offline benchmark).

If Clear A11Y misses a barrier on your site, or reports one that isn't there, please [open an issue with a minimal HTML reproduction](/contributing/#reporting-false-positives-and-missed-issues). It becomes a fixture, so the fix is measured and can't quietly regress.
