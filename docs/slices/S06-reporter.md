# S06: SARIF and HTML reports

## Goal

Extend `@clear-a11y/reporter` with SARIF 2.1.0 output (for GitHub code scanning and IDEs) and a self-contained, accessible HTML report that a developer new to accessibility can act on: findings grouped by severity and WCAG criterion, screenshot crops, a focus-path overlay with numbered arrows (backward jumps in red and dashed), and a needs-review queue of yes/no questions. The report itself must pass Clear A11Y with zero `violation`s. Read the ground rules in "Notes" first.

## Wave

Wave 3, **parallel** with S07. Runs in its own git worktree.

## Projects

| Project                | Path                | Package                | Tags                                               | Status                                           |
| ---------------------- | ------------------- | ---------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `@clear-a11y/reporter` | `packages/reporter` | `@clear-a11y/reporter` | `type:feature`, `scope:reporter`, `publish:public` | touched                                          |
| `cli`                  | `apps/cli`          | `clear-a11y`           | `type:app`, `scope:cli`, `publish:public`          | touched (`--format` flag only)                   |
| `@clear-a11y/runner`   | `packages/runner`   | `@clear-a11y/runner`   | `type:feature`, `scope:runner`, `publish:public`   | touched (`allRules()` aggregate, if not present) |

## Depends on

S01 (reporter JSON, `ScanResult`), Wave 2 merged (findings with focus paths, screenshots, states to display).

## Scope

**Rule metadata**: runner exports `allRules(): RuleMeta[]` aggregating each engine's `rules` export (runner already imports engines). The reporter receives rules as input (`render(result, { rules })`), so it doesn't import engines.

**SARIF** `toSarif(result, { rules, toolVersion, repoRoot? }): SarifLog`:

- `version: "2.1.0"`, `$schema` URL, one run; `tool.driver` = `{ name: "Clear A11Y", informationUri, version, rules: [{ id, name, shortDescription, fullDescription, helpUri (docs/rules/<engine>/<rule>.md on GitHub), properties: { tags: ["accessibility", "wcag2.2", "wcag-1.4.3"], tier } }] }` limited to rules that have results.
- Results: `ruleId`, `level` (`violation` → `error`, `likely` → `warning`, `needs-review` → `note`), `message.text` (+ `fix`), `partialFingerprints.clearA11yFindingId/v1 = finding.id`, `properties` (tier, confidence, engine, wcag, page, state, viewport, selector).
- Locations: when `finding.source` exists → `physicalLocation` with repo-relative `artifactLocation.uri` and `region.startLine`; otherwise `physicalLocation.artifactLocation.uri = page URL` plus `logicalLocations: [{ name: selector, kind: "element" }]`. Document that GitHub code scanning only displays results with repo file locations.
- Validated against the official SARIF 2.1.0 JSON schema, vendored at `packages/reporter/test/schemas/sarif-2.1.0.json` (no network), using a JSON-schema validator from the catalog.

**HTML** `toHtml(result, { rules, embedArtifacts: true }): string`, one file, no external requests:

- Structure: `<html lang="en">`, skip link, `header`/`nav`/`main`/`footer` landmarks, one `h1`, logical heading levels (h2 per tier, h3 per SC, h4 per finding), summary table (counts by tier and engine, pages scanned, benchmark-style coverage if provided).
- Each finding: tier badge with text (never color alone), rule title + id, SC links to W3C Understanding docs, page/state/viewport, selector in `<code>`, message, fix, source location, evidence: screenshot crop (`<img>` with alt describing the crop, embedded as `data:` URI, capped size), `axTree`/`announcement` in `<pre>`, HTML snippet escaped.
- **Focus path overlay**: an SVG over the page screenshot with numbered circles at each stop's rect center and arrows between stops; backward jumps drawn red **and** dashed **and** labeled "backward" in the stop's title; plus a visible ordered-list text alternative ("3. Country (select) — backward jump from 2. First name"). `role="img"` with `aria-labelledby` on the SVG.
- **Needs-review queue**: one section listing every `needs-review` question with a native `<fieldset>`/`<legend>` and Yes/No radio buttons; answers kept in `localStorage` keyed by finding id and exportable as JSON via a "Download answers" button (blob URL). Works without JS: all content visible; JS only adds filters and saving.
- Filters (tier, SC, engine) as a `<form>` that hides non-matching findings; results count announced via a `role="status"` region.
- CSS: inline, AA contrast in light and dark (`prefers-color-scheme`), visible focus styles, `prefers-reduced-motion` respected, reflows at 320px, targets ≥ 24px.
- Security: every page-derived string (messages, names, selectors, snippets, URLs) goes through one `escapeHtml`; URLs rendered as text or validated `http(s)` links only; a strict CSP `<meta>` (`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-…'`).
- Templating: plain TypeScript template functions, no framework, no runtime deps.

**CLI**: `clear-a11y scan ... --format json,sarif,html` (default `json`) writes `findings.json`, `findings.sarif`, `report.html` in `--out`. Rendering logic stays in reporter.

## Out of scope

PR comments and job summaries (S11), report hosting, interactive editing of findings, PDF.

## Files to create/change

- `packages/reporter/src/sarif/{to-sarif.ts,levels.ts}` + tests
- `packages/reporter/src/html/{to-html.ts,escape.ts,layout.ts,finding.ts,focus-path.ts,review-queue.ts,styles.css.ts,client.js.ts}` + tests
- `packages/reporter/test/{sarif.integration.test.ts,html-dogfood.integration.test.ts,schemas/sarif-2.1.0.json}`
- `packages/runner/src/rules.ts` (`allRules()`), `apps/cli/src/commands/scan.ts` (flag wiring)
- `fixtures/site/report/**`, `fixtures/expected/report/**`
- `NOTICE` (SARIF schema license if vendored, OASIS)

## Tests

- Unit: level mapping, fingerprint, physical vs logical locations, `escapeHtml` against an XSS corpus (`<script>`, `"><img onerror>`, `javascript:` URLs, `</style>`), focus-path geometry (arrow endpoints, backward marking), deterministic output snapshot with injected clock and fixed findings.
- Integration: generate SARIF for a scan of the full fixture site and validate against the vendored schema; generate HTML for the same scan.
- **Dogfood**: serve the generated `report.html` with the test-utils fixture server, scan it with `runner.scan` (all deterministic engines), assert zero `violation`s; triage `likely` findings and fix or document each.

## Fixtures + expected findings

- `fixtures/site/report/report-sample.html` is a committed, generated report (regenerate with a script) used as a correct-pattern page (`correctPattern: true`, `issues: []`) so the benchmark keeps the report honest.
- `fixtures/site/report/xss-finding.html`: a fixture page whose text, alt and ids contain HTML/script payloads; the HTML report test proves they render inert. Its expected file lists one seeded issue: an input without a label whose surrounding text and `id` carry the payloads (1.3.1, 4.1.2, `layer: "static"`).

## Docs to update

`packages/reporter/README.md` (formats, SARIF mapping table, HTML features, security model), CLI README (`--format`), `docs/DECISIONS.md` (location strategy for URL-only findings, localStorage for answers, CSP).

## Acceptance criteria

- [ ] SARIF validates against the vendored 2.1.0 schema; results carry fingerprints and correct levels.
- [ ] HTML is one file with no network requests (assert via Playwright request interception in the dogfood test).
- [ ] Dogfood scan of the report: zero `violation`s; `likely` findings fixed or documented.
- [ ] Backward focus jumps are distinguishable without color (dash + label + text list).
- [ ] XSS corpus renders inert.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; reporter `test-integration` passes; `pnpm nx sync:check` passes.
- [ ] `pnpm nx run bench:run` delta recorded (expected: unchanged recall; the new correct-pattern page must not lower precision).

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- The canonical output is the JSON finding list; SARIF and HTML are derived from it and must not add or drop findings.
- `Finding` (core): `id, ruleId, wcag[], tier, confidence, engine, page{url,state,viewport}, target{selector,role?,name?}, evidence{screenshot?,focusPath?,axTree?,announcement?,html?}, source?, message, fix?, question?`; `FocusStop { index, selector, name?, rect, backward? }`.
- **Tags/boundaries:** feature → feature, engine, data-access, util; app → feature, engine, data-access, util. Reporter must not import engines; take rules as input. `publish:public` → public only. Test files may import `test-utils`.
- No rendering or analysis logic in `apps/cli`; only flag wiring.
- **Tiers:** `violation`, `likely`, `needs-review` (with question). The report must explain tiers in plain words.
- **Practice what we test:** the report must pass Clear A11Y with zero `violation`s.
- **Offline:** vendored schema, no CDN fonts or scripts.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`.

### Pitfalls and hints

- Page content is untrusted. A finding's `target.name` comes straight from the scanned page; treat it like user input.
- Screenshot paths in findings are relative to the artifacts dir; resolve and embed at render time; skip missing files gracefully.
- Keep output deterministic (stable sort, no timestamps except `result.startedAt`/`finishedAt`) so snapshots and diffs are useful.
- Large scans: cap embedded images (e.g. 200) and say so in the report.
