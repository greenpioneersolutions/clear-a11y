# S04: Visual engine

## Goal

Build `@clear-a11y/engine-visual`, which measures what sighted low-vision and mobile users experience: reflow at 320 CSS px, 200% text resize, text-spacing overrides, clipping and overlap, real-pixel contrast where axe can't compute it (images, gradients, overlapping layers), target size, and content on hover or focus. Measurements come from rendered pixels and geometry, not from markup guesses. Read the ground rules in "Notes" first.

## Wave

Wave 2, **parallel** with S02, S03, S05. Runs in its own git worktree.

## Projects

| Project                     | Path                      | Package                     | Tags                                             | Status                      |
| --------------------------- | ------------------------- | --------------------------- | ------------------------------------------------ | --------------------------- |
| `@clear-a11y/engine-visual` | `packages/engines/visual` | `@clear-a11y/engine-visual` | `type:engine`, `scope:visual`, `publish:public`  | created (engine generator)  |
| `@clear-a11y/runner`        | `packages/runner`         | `@clear-a11y/runner`        | `type:feature`, `scope:runner`, `publish:public` | touched (one registry line) |

## Depends on

S01 (browser contracts, `VIEWPORTS.reflow`, runner registry, bench baseline).

## Scope

The engine may change the viewport (`page.setViewportSize`) and inject CSS; the runner gives it a fresh page. Restore the original viewport before returning.

| Rule ID                                | SC            | Tier                                                                   | Detection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual/reflow-horizontal-scroll`      | 1.4.10        | `violation`                                                            | At 320×256 CSS px: `scrollWidth > clientWidth + 1` on the document. Report the culprits (elements whose right edge exceeds the viewport and are not inside an allowed scroll container).                                                                                                                                                                                                                                                                                                                                               |
| `visual/reflow-two-dimensional`        | 1.4.10        | `needs-review`                                                         | Content inside a horizontally scrolling container that is not a data table, `pre`/code, map, diagram, video or toolbar (SC exceptions). Question: "Does this content need two-dimensional layout to be understood?"                                                                                                                                                                                                                                                                                                                    |
| `visual/text-resize-clipped`           | 1.4.4         | `violation` (zoom) / `likely` (text-only)                              | (a) 200% zoom equivalent: 640×400 viewport at 1280 baseline; (b) text-only resize: scale every text element's computed `font-size` ×2 via injected inline styles. Then find text clipped by `overflow: hidden/clip` (`scrollHeight > clientHeight + 1` or `scrollWidth > clientWidth + 1` on an ancestor with fixed size) or truncated with `text-overflow: ellipsis` where the full text isn't available otherwise.                                                                                                                   |
| `visual/text-spacing-clipped`          | 1.4.12        | `violation` (clipped) / `likely` (overlap)                             | Inject `* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important } p { margin-bottom: 2em !important }`; compare against the baseline layout: new clipping as above, or new overlap between text boxes of sibling elements.                                                                                                                                                                                                                                                                   |
| `visual/text-overlap`                  | 1.4.4, 1.4.10 | `likely`                                                               | Text boxes (Range rects of text nodes) intersecting other text or interactive elements after resize/reflow but not before.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `visual/contrast-over-background`      | 1.4.3         | `violation` when the median fails / `likely` when only a portion fails | Only for text whose effective background is not a single solid color (ancestor `background-image`, gradients, overlapping positioned elements, video/canvas behind). Screenshot the text box twice: normal and with `color: transparent` on the element; the diff gives glyph pixels, the second shot the background under the glyphs. Pure `contrastRatio(fg, bg)` per sampled glyph-adjacent background pixel; threshold 4.5:1, or 3:1 for large text (≥ 24px, or ≥ 18.66px and weight ≥ 700). Evidence: crop + worst/median ratios. |
| `visual/non-text-contrast`             | 1.4.11        | `likely`                                                               | Visual boundaries of form inputs and icon-only buttons vs adjacent background (sample ring pixels just inside/outside the border box); < 3:1 and no other identifying cue (fill, text label inside).                                                                                                                                                                                                                                                                                                                                   |
| `visual/target-size`                   | 2.5.8         | `violation`                                                            | Interactive targets (`a[href]`, `button`, inputs, `[role=button                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | link | checkbox | radio | tab | menuitem | switch]`, `[onclick]`) smaller than 24×24 CSS px that fail the spacing exception: a 24px-diameter circle centered on the target's box intersects another target or another undersized target's circle. Exempt: inline links within a sentence or block of text, user-agent-styled controls, `[aria-hidden]`duplicates. "Equivalent control elsewhere" cannot be known → those become`needs-review` only when flagged by a config list. |
| `visual/hover-content-not-dismissible` | 1.4.13        | `violation`                                                            | Hover or focus a trigger; new content appears (visible-set diff); Escape does not hide it while pointer/focus stay.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `visual/hover-content-not-hoverable`   | 1.4.13        | `likely`                                                               | Move the pointer from trigger to the new content in small steps; content disappears before the pointer reaches it.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `visual/hover-content-not-persistent`  | 1.4.13        | `likely`                                                               | Content disappears within ~2s while pointer/focus stay and no dismissal happened.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Shared pure modules: `geometry.ts` (rect math, circle-intersection spacing test, overlap), `color.ts` (sRGB relative luminance, `contrastRatio`, large-text check), `pixels.ts` (diff, sampling, percentile), `clipping.ts` (decide clipped from measured numbers).

## Out of scope

Plain solid-color contrast (axe in engine-static already does it; do not duplicate), focus indicator contrast (S02), meaning conveyed by color alone (S07 AI judge), orientation lock 1.3.4 (candidate for wave 7), animation 2.3.x.

## Files to create/change

- `packages/engines/visual/src/lib/{engine.ts,reflow.ts,resize.ts,spacing.ts,contrast.ts,targets.ts,hover.ts}`
- `packages/engines/visual/src/rules/<rule>.ts` + tests; pure modules above + tests
- `packages/engines/visual/test/*.integration.test.ts`
- `packages/runner/src/engines.ts` (one line)
- `fixtures/site/visual/**`, `fixtures/expected/visual/**`, `docs/rules/visual/*.md`

## Tests

- Unit: luminance/contrast against known WCAG values (#777 on #fff ≈ 4.48), large-text boundary, circle-spacing test (two 16px targets 8px apart fail, 30px apart pass), overlap/clipping decisions from numbers, percentile sampling on synthetic buffers.
- Integration: each rule against its barrier and `-ok` page. Contrast tests use a CSS gradient and a local PNG in the fixture (no remote images). Hover tests use real `page.mouse.move` steps.
- Stability: fonts are local (`font-family: system-ui` is not deterministic across OSes; ship a small open-licensed WOFF2 in `fixtures/site/_assets/` or use generic metrics tolerant thresholds).

## Fixtures + expected findings

Under `fixtures/site/visual/` (barrier → correct pattern):

- `reflow-fixed-width.html` (`width: 960px` container) → `reflow-fixed-width-ok.html`; `reflow-data-table-ok.html` (wide data table in a scroll container; exception, at most needs-review is acceptable but not violation)
- `text-resize-clipped.html` (fixed-height button with `overflow: hidden`) → `-ok`
- `text-spacing-clipped.html` → `-ok`
- `contrast-over-image.html` (white text over a light photo) → `contrast-over-image-ok.html` (scrim overlay); `contrast-gradient.html` → `-ok`
- `non-text-contrast-input.html` (#ddd input border on white) → `-ok`
- `target-size-small.html` (16×16 icon buttons packed together) → `target-size-ok.html` (16px icons with 24px spacing), `target-size-inline-link-ok.html`
- `hover-tooltip-not-dismissible.html` → `-ok`; `hover-tooltip-not-hoverable.html` → `-ok`

Expected files in `fixtures/expected/visual/`, `layer: "visual"`, real selectors, `ruleId`.

## Docs to update

`docs/rules/visual/<rule>.md` for each rule (include the measurement method and its limits), `packages/engines/visual/README.md`, `docs/DECISIONS.md` (thresholds, text-only resize method, why solid-color contrast is left to axe).

## Acceptance criteria

- [ ] Every rule has rule file, unit test, barrier + `-ok` fixture, expected entries, integration test and doc.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; engine-visual `test-integration` passes twice in a row with identical findings.
- [ ] `pnpm nx sync:check` passes; engine-visual depends only on core and browser.
- [ ] `pnpm nx run bench:run`: recall improves for 1.4.3, 1.4.4, 1.4.10, 1.4.11, 1.4.12, 1.4.13, 2.5.8 vs the S01 baseline; precision of `violation` ≥ 0.95. Record the delta.
- [ ] No duplicate of axe's solid-color contrast findings on `fixtures/site/static/low-contrast-text.html`.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract:** `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`. `PageContext { page, url, state, viewport, config, artifacts, log, stateMeta? }`/`Engine` live in `@clear-a11y/browser`; `Finding`, `RuleMeta`, WCAG map, config in `@clear-a11y/core`. Engine name `engine-visual`. Read your config from `ctx.config.visual` with your own Zod schema.
- **Tags/boundaries:** engine → data-access, util only; `publish:public` → public only; test files may import `test-utils`.
- **Engines never import other engines**; coordination in `runner`. No detection logic in `apps/`.
- **Tiers:** `violation` deterministic, high certainty; `likely`; `needs-review` with a yes/no `question`. Ambiguous SC exceptions → `needs-review`.
- **Generators:** `nx g @clear-a11y/workspace-plugin:engine visual`, `:rule <name> --engine=visual --wcag=...`. Run `pnpm nx sync`.
- **Offline:** localhost fixtures, local images and fonts only.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`. Only one line in `runner/src/engines.ts`.

### Pitfalls and hints

- Screenshot at `deviceScaleFactor: 1` for pixel math, or scale rects accordingly.
- Anti-aliased glyph edges blend fg and bg; sample background pixels adjacent to glyphs rather than glyph pixels, and use percentiles, not min.
- 1.4.10 is measured at 320 CSS px **width**; height 256 applies to horizontally scrolling content. Don't flag vertical scroll.
- Text-only resize has no native Chromium switch; the inline-style method can itself break layouts that use `em` heavily. That's why text-only results are `likely`.
- `axe` (engine-static) has a `target-size` rule too; the runner merges duplicates by selector + SC, so build selectors with `selectorFor` from `@clear-a11y/browser`.
- Restore injected styles if you run several checks on one page, or reload between checks.
