# ADR 0003: Engines can report verified passes

- Status: Accepted
- Date: 2026-10-31

## Context

The engine contract (ADR 0001) lets an engine return only `Finding[]`. An engine that measured something and found it compliant has nowhere to say so. That costs trust in one specific, recurring way: axe-core reports `static/color-contrast` as `needs-review` whenever it cannot work out the background ("background gradient", "partially overlaps other elements", "overlapped by another element"), while engine-visual measures the real rendered pixels behind exactly that kind of text. On the benchmark, six such `needs-review` items stayed on correct-pattern pages (`visual/ok.html` and the three `visual/hover-content-not-*-ok.html` tooltip pages), asking a human a question the tool had already answered.

Constraints:

- Engines never import each other (ADR 0001); coordination happens in `runner`.
- An AI verdict must never settle anything on its own (AGENTS.md principle 2).
- `violation` and `likely` findings carry their own deterministic or strong evidence; a pass from a different measurement must not hide them.
- The Finding schema and `ScanResult` are public APIs.

## Decision

### Engine contract (`@clear-a11y/browser`)

`PageContext` gains an optional callback:

```ts
interface PassInput {
  ruleId: string; // the rule that measured, e.g. "visual/contrast-over-background"
  wcag: string[]; // the success criteria the measurement verified
  selector: string; // built with selectorFor / window.__clearA11y.selector
  evidence?: Evidence; // the measurement (ratios, sample counts)
}

interface PageContext {
  // ...unchanged fields
  recordPass?: (pass: PassInput) => void;
}
```

Engines call it as `ctx.recordPass?.(...)`. They record a pass only when the measurement covers the whole success criterion for that element in that state (for contrast: every glyph of the element's text was in the screenshot and enough glyph pixels were measured), never for a partial or sampled check.

### Runner

The runner creates one `PageContext` per engine run and binds `recordPass` to it, so it stamps each pass with the engine it actually called plus the page URL, state and viewport (`PassRecord` in core). An engine cannot record a pass under another engine's name, and passes arriving after the engine's run settled (for example after a timeout) are ignored.

After all engines ran for a URL (and after the per-state dedupe), `resolveWithPasses(findings, passes)` from core drops a finding when **all** of these hold:

- the finding's tier is `needs-review`;
- a pass has the same selector, page URL, state and viewport;
- the pass shares at least one WCAG success criterion with the finding;
- the pass came from a different engine than the finding;
- the pass came from a deterministic engine (not `ai-*` or `persona-*`, see `isAiEngine`).

`violation` and `likely` findings are never dropped.

### Auditable output (`@clear-a11y/core`, `ScanResult`)

Additive, optional fields; `schemaVersion` stays `1`:

- `ScanResult.resolved?: ResolvedFinding[]`, each `{ finding, resolvedBy: PassRecord }`: the full finding as it would have been reported and the pass (with its measurement) that settled it.
- `ScanSummary.resolved?: number`: how many findings were resolved.
- `summarize(findings, resolved?)` fills the count when given the list.

The runner's `scan()` and `scanRepo()` always set both (an empty list and 0 when nothing was resolved). Older results and other producers omit them, and readers must treat a missing field as "not recorded". Pass records themselves are not part of the report (they are per-element and numerous); only the passes that resolved something appear, inside `resolved`.

### Shared selectors for static findings

Matching is by selector string, so every engine must use the shared selector convention from ADR 0001 Amendment 1. engine-static used axe's own selectors (`p:nth-child(3)`), which never matched engine-visual's (`body > main > p:nth-of-type(2)`). engine-static now rewrites each plain axe target that resolves to exactly one element to `window.__clearA11y.selector(el)` (`#id` when unique); targets inside shadow roots or frames, and ambiguous ones, keep axe's form. The original is kept in `evidence.data.axeSelector` when it differs. For the same reason the change also makes cross-engine dedupe line up.

### First producer

engine-visual records a pass for each complete real-pixel text contrast measurement (`visual/contrast-over-background`, SC 1.4.3). Its candidate selection now also covers the cases axe gives up on: text partly covered by another element (`obscured`) and text whose box is drawn over other content, like an absolutely positioned tooltip (`overlap`), in addition to background images and gradients.

## Consequences

- The six `static/color-contrast` `needs-review` items on the benchmark's correct-pattern pages are resolved by real-pixel passes and listed in `resolved` instead of `findings`.
- Public API changes (changelog): `PageContext.recordPass` and `PassInput` (browser); `PassRecord`, `ResolvedFinding`, their schemas, `resolveWithPasses`, `passResolving`, the optional `ScanResult.resolved` and `ScanSummary.resolved`, and the optional second parameter of `summarize` (core). All additive; existing engines and consumers keep working unchanged.
- engine-static finding ids change where axe's selector differed from the shared form (the id hashes the selector). Results compared across this upgrade may show those findings as "new" once.
- Engines that build their own contexts (tests, other hosts) simply don't get passes; nothing breaks.
- Follow-up: pass records can later feed coverage reporting ("what was verified, not just what failed").

## Alternatives considered

- **`run()` returns `Finding[] | { findings; passes }`** (proposed in S04's request): every caller of `engine.run` (runner, tests, the persona and AI engines' wrappers) would need to handle a union, and the engine could still name any engine in its passes. The callback is additive and the runner controls attribution.
- **Encoding passes as findings** (a tier like `pass`): the Finding schema is "something to look at"; a pass tier would leak into every reporter, SARIF and CI threshold.
- **A runner rule special-casing `static/color-contrast` and engine-visual**: works for one pair, hides a contract inside the runner and doesn't generalize to other measured passes (target size, reflow).
- **Matching passes to findings by element identity in a live page**: exact, but the runner would have to keep pages open after engines finish and re-query selectors; aligning selectors at the source is simpler and also fixes cross-engine dedupe.
- **Letting AI passes resolve `needs-review`**: rejected by principle 2; an AI verdict never settles a question on its own.
