# S02: Keyboard engine

## Goal

Build `@clear-a11y/engine-keyboard`, which tests a page the way an auditor does with only a keyboard: walk the Tab order and compare it with the visual reading order, check that focus is visible and not hidden, detect traps and mouse-only controls, check Escape and focus return on overlays, and verify skip links. Every finding carries a focus path as evidence. Read the ground rules in "Notes" first.

## Wave

Wave 2, **parallel** with S03, S04, S05. Runs in its own git worktree.

## Projects

| Project                       | Path                        | Package                       | Tags                                              | Status                      |
| ----------------------------- | --------------------------- | ----------------------------- | ------------------------------------------------- | --------------------------- |
| `@clear-a11y/engine-keyboard` | `packages/engines/keyboard` | `@clear-a11y/engine-keyboard` | `type:engine`, `scope:keyboard`, `publish:public` | created (engine generator)  |
| `@clear-a11y/runner`          | `packages/runner`           | `@clear-a11y/runner`          | `type:feature`, `scope:runner`, `publish:public`  | touched (one registry line) |

## Depends on

S01 (browser `PageContext`/`StateMeta`, runner registry and per-engine fresh navigation, bench baseline). Not on S03: overlay checks use `ctx.stateMeta` when present and are tested by building the context by hand.

## Scope

Walker (browser I/O): press Tab from the top of the document up to `keyboard.maxStops` (default 150) or until focus returns to the first stop/`body`; for each stop record `FocusStop { index, selector, name, rect, backward? }`, plus visibility and the element's role. Repeat with Shift+Tab for trap detection. Disable transitions/animations (`reducedMotion: 'reduce'` + a style tag setting only `transition-duration`/`animation-duration` to `0s`), and hide the text caret, before screenshots.

Rules (create each with the rule generator):

| Rule ID                          | SC     | Tier                                                                                                                                                                                                                                   | Detection                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyboard/focus-order-backward`  | 2.4.3  | `likely`                                                                                                                                                                                                                               | Pure `isBackwardJump(prev, next, opts)`: next stop is above prev by more than a row tolerance (≈ half the smaller height), or on the same row and left by more than a threshold (LTR; skip when `dir=rtl`). Ignore jumps between distinct layout regions (different landmark or a multi-column container where the jump goes to the next column's top) and jumps into newly opened overlays. Mark `backward: true` on the stop. Example: first name → country → last name. |
| `keyboard/focus-not-visible`     | 2.4.7  | `violation` when focused vs unfocused crops are pixel-identical; `needs-review` when the change is tiny or its contrast against the unfocused state is below 3:1 (ask "Can you see where focus is on this control?", also cite 1.4.11) | Element crop (padded 4px) before and after focus; pure `diffStats(a, b)` and `maxContrastChange(a, b)`.                                                                                                                                                                                                                                                                                                                                                                    |
| `keyboard/focus-obscured`        | 2.4.11 | `violation`                                                                                                                                                                                                                            | After focus and scroll, sample a grid of points in the focused rect with `elementFromPoint`; if every point hits author content outside the element (sticky header/footer, cookie banner), it is entirely hidden. Partial cover is not a 2.4.11 failure.                                                                                                                                                                                                                   |
| `keyboard/keyboard-trap`         | 2.1.2  | `violation`                                                                                                                                                                                                                            | Forward and backward Tab cycles both stay inside a strict subset of stops and Escape does not leave. Not a trap: focus contained in an open modal (`dialog[open]` via `showModal`, or `[role=dialog][aria-modal=true]`) that Escape or an in-dialog close button closes.                                                                                                                                                                                                   |
| `keyboard/click-not-focusable`   | 2.1.1  | `likely` (listener) / `needs-review` (pointer cursor only)                                                                                                                                                                             | Elements with `click`/`mousedown`/`pointerdown` listeners (CDP `DOMDebugger.getEventListeners`, ignoring `document`/`body`/`window` delegation) or `onclick`, that are not focusable, have no focusable ancestor/descendant with the same action, and are visible.                                                                                                                                                                                                         |
| `keyboard/escape-does-not-close` | 2.1.1  | `needs-review`                                                                                                                                                                                                                         | When `ctx.stateMeta.kind` is `modal`/`menu`/`popover`: press Escape; overlay still visible. If there is no keyboard way out at all, report `keyboard/keyboard-trap` instead.                                                                                                                                                                                                                                                                                               |
| `keyboard/focus-not-returned`    | 2.4.3  | `likely`                                                                                                                                                                                                                               | Close the overlay (Escape, else its close button); `document.activeElement` should be the trigger (`stateMeta.triggerSelector`) or inside it; landing on `body` or the top of the page is a finding.                                                                                                                                                                                                                                                                       |
| `keyboard/skip-link-broken`      | 2.4.1  | `violation`                                                                                                                                                                                                                            | An in-page link among the first 3 stops whose `#target` does not exist, or after activation the next Tab does not land inside or after the target.                                                                                                                                                                                                                                                                                                                         |
| `keyboard/skip-link-missing`     | 2.4.1  | `needs-review`                                                                                                                                                                                                                         | No skip link, no `main` landmark and no headings while repeated navigation (≥ 5 stops) precedes main content. Landmarks or headings can satisfy 2.4.1, so never a violation.                                                                                                                                                                                                                                                                                               |

Evidence: every finding includes `evidence.focusPath` (the full or windowed path with `backward` marks) and a screenshot crop where relevant. `message` says who is affected (keyboard and switch users, screen magnifier users).

## Out of scope

APG widget keyboard contracts (S05), discovering and opening states (S03), visual contrast of non-focus content (S04), AI judgment on whether an order "makes sense" (S07 focus-order judge consumes this engine's focus path).

## Files to create/change

- `packages/engines/keyboard/src/lib/{engine.ts,walker.ts,screenshot.ts,overlay.ts}`
- `packages/engines/keyboard/src/rules/<rule>.ts` + `<rule>.test.ts` for each rule; pure modules `geometry.ts` (`isBackwardJump`, `rowOf`, `readingOrder`), `pixels.ts` (`diffStats`, `contrastRatio`, `maxContrastChange`), `trap.ts` (`detectCycle`)
- `packages/engines/keyboard/test/*.integration.test.ts`
- `packages/runner/src/engines.ts` (add one line)
- `fixtures/site/keyboard/**`, `fixtures/expected/keyboard/**`, `docs/rules/keyboard/*.md`

## Tests

- Unit: `isBackwardJump` (same row left/right, up, column-wrap exception, RTL skip), `readingOrder`, `detectCycle`, `diffStats`/`contrastRatio` on small synthetic RGBA buffers, skip-link target resolution.
- Integration: one test per rule against its barrier and `-ok` page. For overlay rules, the test opens the dialog itself and builds `PageContext` with `stateMeta = { kind: 'modal', triggerSelector: '#open', replay }`.
- Determinism: run each integration test twice in CI mode; no `waitForTimeout` beyond a single animation frame.

## Fixtures + expected findings

Barrier → correct pattern under `fixtures/site/keyboard/`:

- `focus-order-backward.html` (form fields ordered by `tabindex` 1,3,2) → `focus-order-backward-ok.html`; `focus-order-two-column-ok.html` (legit column wrap, no finding)
- `focus-not-visible.html` (`outline: none`, no replacement) → `focus-not-visible-ok.html`; `focus-low-contrast.html` (1px light-gray outline on white, needs-review)
- `focus-obscured.html` (sticky footer covers the focused link) → `focus-obscured-ok.html` (`scroll-padding-bottom`)
- `keyboard-trap.html` (custom widget that refocuses itself on blur) → `keyboard-trap-ok.html`; `modal-contained-ok.html`
- `click-div-button.html` → `click-div-button-ok.html`
- `modal-escape.html` (dialog ignores Escape, has close button) → `modal-escape-ok.html`
- `focus-not-returned.html` → `focus-not-returned-ok.html`
- `skip-link-broken.html` → `skip-link-ok.html`

Each with `fixtures/expected/keyboard/<page>.json`, `layer: "keyboard"`, real selectors, `ruleId`.

## Docs to update

`docs/rules/keyboard/<rule>.md` for every rule (what, who, SC, tier and why, how to fix with code, how detected, limitations), `packages/engines/keyboard/README.md`, `docs/DECISIONS.md` for thresholds.

## Acceptance criteria

- [ ] All rules above exist with rule file, unit test, barrier + `-ok` fixture, expected entries, integration test and doc.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `pnpm nx run @clear-a11y/engine-keyboard:test-integration` passes.
- [ ] `pnpm nx sync:check` passes; engine-keyboard depends only on core and browser.
- [ ] `pnpm nx run bench:run`: recall for 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7, 2.4.11 improves over the S01 baseline; precision of `violation` stays ≥ 0.95. Paste the delta table in the PR/progress notes.
- [ ] No `-ok` page produces a keyboard finding.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract:** `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`. `PageContext { page, url, state, viewport, config, artifacts, log, stateMeta? }` and `Engine` live in `@clear-a11y/browser`; `Finding`, `RuleMeta`, WCAG map, config, `findingId` in `@clear-a11y/core`. Engine name `engine-keyboard`.
- **Tags/boundaries:** engine → data-access, util only. `publish:public` → public only. Test files may also import `@clear-a11y/test-utils` (devDependency).
- **Engines never import other engines** (not `engine-states`, not `engine-widgets`). The runner replays states and passes `stateMeta`. No detection logic in `apps/`.
- **Tiers:** `violation` deterministic and high certainty; `likely`; `needs-review` with a yes/no `question`. When the WCAG reading is ambiguous, use `needs-review`.
- **Generators:** `nx g @clear-a11y/workspace-plugin:engine keyboard`, then `:rule <name> --engine=keyboard --wcag=...` for each rule. Run `pnpm nx sync`.
- **Offline:** localhost fixtures only.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`. Write needed changes under "Pending core changes" in `docs/DECISIONS.md`. Your only runner change is one line in `src/engines.ts`.

### Pitfalls and hints

- The runner navigates fresh before your `run`, so you may mutate the page freely; still reset focus with `page.focus('body')`/`blur` before the walk.
- Don't predict the Tab order from `tabindex` or DOM order; walk it with real `keyboard.press('Tab')` calls (shadow DOM, `inert`, `display: contents` and iframes all change it). Run in Chromium; WebKit skips links by default.
- Build every selector with `selectorFor` from `@clear-a11y/browser` so dedupe and benchmark matching line up across engines.
- Focus-indicator diffs pick up caret blink, hover styles and lazy images; screenshot with the mouse moved to (0,0) and after `document.fonts.ready`.
- Keep `focus-order-backward` at `likely`: auditors disagree on borderline layouts, and the S07 AI judge will review sensibility.
- Scroll containers and `position: fixed` change rect math; use `getBoundingClientRect` plus scroll offsets consistently.
