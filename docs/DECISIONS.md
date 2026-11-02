# Decisions log

Small decisions made during the bootstrap run. Decisions that change architecture or the Finding schema also have an ADR in `docs/adr/`.

Format: date, decision, why, alternatives considered.

## 2026-10-31: Toolchain versions

- **Decision:** Node 26 (local), pnpm 9.15.4, Nx 24.0.x, Vitest, Playwright 1.64.x, TypeScript (latest stable at bootstrap).
- **Why:** Latest stable at bootstrap time; Playwright browsers for this version were already cached locally, so the run stays offline-safe after install.
- **Alternatives:** Pinning to an older Nx major; rejected because AGENTS.md asks for Nx's current recommended setup.

## 2026-10-31: Slice file format

- **Decision:** AGENTS.md mentions a slice format but does not define one. Slices use: Goal, Projects (name, path, tags), Depends on, Scope, Out of scope, Files, Tests, Fixtures + expected findings, Docs, Acceptance criteria, Notes for a subagent.
- **Why:** Each slice must work as a standalone prompt for a subagent.
- **Alternatives:** Free-form slice notes; rejected because they don't make acceptance testable.

## 2026-10-31: Renovate for dependency updates

- **Decision:** Use Renovate (`.github/renovate.json`) for dependency updates: `config:recommended`, weekly schedule, `dependencies` label, grouped PRs for Nx, Playwright (npm packages and the Docker image) and Vitest.
- **Why:** Renovate understands pnpm catalogs in `pnpm-workspace.yaml`, so it updates the single version policy in one place. It can also group packages that must move together, like all `@nx/*` packages, or the Playwright npm version and the server's Playwright Docker image tag.
- **Alternatives:** Dependabot; rejected because it doesn't update pnpm `catalog:` entries reliably and offers weaker grouping across ecosystems (npm and Docker).

## 2026-10-31: Static server lives in @clear-a11y/browser

- **Decision:** The localhost static server moved from `test-utils` to `@clear-a11y/browser`; `test-utils` re-exports it.
- **Why:** The CLI's `bench` command and repo scanning (serving `storybook-static`) need it at runtime, and apps may not import `type:test` projects.
- **Alternatives:** A copy in `runner`; rejected as duplication. Slice S00c's text predates this.

## 2026-10-31: Playwright pinned to 1.61.x

- **Decision:** `playwright` and `@playwright/test` are pinned to 1.61.1 in the catalog.
- **Why:** 1.61 uses Chromium build 1228, which was already cached locally, so the bootstrap stays offline-safe (browser downloads come from a CDN, not a package registry). CI installs browsers itself, so Renovate can bump the pin later.
- **Alternatives:** 1.64.1 (latest); needs a browser download outside the package registries.

## 2026-10-31: CLI is built like a library with a bin

- **Decision:** `apps/cli` (package `clear-a11y`, project `cli`, `type:app`) was generated with `@nx/js:library` (tsc) and exposes `bin`.
- **Why:** It is published to npm and should depend on our packages rather than bundle them; `@nx/node:application` bundles for deployment.
- **Alternatives:** `@nx/node:application` with esbuild.

## 2026-10-31: Contracts added in S01 for parallel slices

- **Decision:** `PageContext.stateMeta` (`kind`, `triggerSelector`, `replay`), `Engine.mutatesPage`, `selectorFor`, `getCdpSession`, `VIEWPORTS` in `@clear-a11y/browser`; loose per-engine config sections (`config.keyboard`, `config.visual`, ...) and the canonical `ScanResult` schema in `@clear-a11y/core`. Amendment recorded in ADR 0001.
- **Why:** Wave 2 engines must not need serial changes to `core` or `browser`.
- **Alternatives:** Strict per-engine schemas in core; would force a core change for every new option.

## 2026-10-31: Placeholder-only labels are not an axe finding

- **Decision:** `fixtures/static/form-missing-label` expects a 3.3.2 issue owned by the `at` layer, not `static`.
- **Why:** axe-core counts `placeholder` as an accessible name, so it passes the field. Human auditors log it (label disappears on input). A deterministic AT-layer check should catch it.
- **Alternatives:** Treat it as out of scope; rejected because the benchmark measures what humans log.

## 2026-10-31: Runtime DOM types per project

- **Decision:** `lib: ["es2023", "dom", "dom.iterable"]` is set in projects that run code inside the page (browser, crawler, engines, runner, test-utils, cli), not in `tsconfig.base.json`.
- **Why:** Keeps `core` and other Node-only code from accidentally using DOM globals.

<!-- From slice S02 (keyboard) -->

## 2026-10-31: Overlay rules run on stateMeta and score only after S03

- **Decision:** `keyboard/overlay-focus-not-moved`, `keyboard/escape-does-not-close` and `keyboard/focus-not-returned` run only when `ctx.stateMeta.kind` is an overlay kind (`modal`, `dialog`, `alertdialog`, `menu`, `popover`, `overlay`; focus-moved only for the dialog kinds). The engine finds the open overlay (trigger `aria-controls` target, else visible `dialog[open]`, `[role=dialog]`, `[aria-modal=true]`, `[role=menu]`, `[role=listbox]`, open popover), records where focus is before touching anything, then closes it with Escape (focus moved inside first) or Enter on a close control, and checks focus returned to `stateMeta.triggerSelector`. It then reloads (`gotoAndSettle`) and calls `stateMeta.replay` so the Tab walk sees the overlay open.
- **Why:** S03 (built in parallel) owns discovering and replaying states. Integration tests pass `stateMeta` by hand through `fixtureHarness().open(path, { state, stateMeta })` and prove both `states/modal-focus.html` issues are found (`#settings-dialog` focus not moved, `#close-settings` focus not returned). **In the benchmark these issues, and the new `keyboard/escape-does-not-close.html`, `keyboard/focus-not-returned.html`, `keyboard/overlay-focus-not-moved.html` barriers, stay "missed" until S03 is merged and the runner hands over `modal` states.**
- **Alternatives:** Let the keyboard engine click triggers itself; rejected because it duplicates S03 and breaks the "engines don't discover states" contract.

## 2026-10-31: New rule keyboard/overlay-focus-not-moved

- **Decision:** Added `keyboard/overlay-focus-not-moved` (2.4.3, `likely`), not in the slice table, targeting the dialog element.
- **Why:** `states/modal-focus.html#1` (focus not moved into the dialog) needs its own rule; reporting it under `focus-not-returned` on the trigger would match both modal issues with one finding. Targets were chosen so the two issues stay distinct: focus-not-moved targets the overlay, focus-not-returned targets the close control used (or the overlay when Escape closed it). Menus and popovers are not checked because disclosure menus correctly keep focus on the button.
- **Alternatives:** One combined "dialog focus management" rule; rejected because the two failures have different fixes.

## 2026-10-31: Focus indicator thresholds

- **Decision:** Crops are the element box padded by 8 px (viewport-clipped), focused (reached with Tab) vs after `blur()`. A pixel is changed when a channel differs by more than 8. A changed pixel is strong when its before/after colors have at least 3:1 contrast. Visible = strong pixels >= max(6, ceil(short side / 2)). `violation` only when the crop is identical **and** a full-viewport comparison is identical too; otherwise faint/tiny changes are `needs-review` (2.4.7 + 1.4.11, question "Can you see where focus is on this control?"). Skipped: elements under 4 px or visually hidden, elements that re-grab focus on blur, stops entirely covered by sticky content (reported as 2.4.11 instead), and stops behind an open overlay. Transitions/animations are zeroed and the caret hidden with an injected style; the mouse is parked at (0, 0) and `document.fonts.ready` awaited.
- **Why:** Slice suggested 4 px padding, but a 3 px outline with 2 px offset reaches 5 px outside the box. The viewport fallback keeps `violation` deterministic when an indicator is drawn on a distant container. Without skipping obscured stops, the benchmark showed two false-positive violations on `focus-obscured.html` (the ring is hidden because the element is).
- **Alternatives:** Contrast between changed pixels and their neighbours; rejected as noisier than before/after contrast, which is also how WCAG 2.4.13 defines change of contrast.

## 2026-10-31: Focus order, obscured and trap heuristics

- **Decision:**
  - Backward jump: next stop's vertical center is above prev by more than half the smaller height, or same row and more than 8 px left (LTR). Ignored: different region (closest landmark/dialog, or a fixed/sticky container), fixed/sticky stops, invisible stops, column wraps (moving up to a box entirely to the right). RTL skips same-row checks and mirrors the column wrap. The rule cites 2.4.3 and 1.3.2.
  - Obscured: 3 x 3 `elementFromPoint` grid over the on-screen part of the focused box; a point is covered only by content inside a fixed/sticky container (not the element, its label, an ancestor or descendant). All nine covered = violation. In overlay states only stops inside the overlay are checked.
  - Trap: walk stops at the first repeated stop; `detectCycle` + strict subset of tabbable count; then Shift+Tab (loop size + 2 presses) and Escape followed by Tab must both fail to leave; loops inside an open modal (`dialog[open]`, `[aria-modal=true]`) with a button are not traps.
- **Why:** Each keeps `violation` deterministic and stays at zero findings on every correct-pattern page, including `modal-contained-ok.html` (script focus trap that Escape closes) and `keyboard-trap-ok.html` (documented Escape-then-Tab exit).
- **Alternatives:** Predicting order from tabindex/DOM order; rejected (shadow DOM, inert, iframes and CSS change it).

## 2026-10-31: Click-not-focusable and skip-link scope

- **Decision:** Click candidates come from CDP `DOMDebugger.getEventListeners` (depth -1, pierce) for click/mousedown/pointerdown/mouseup/pointerup, plus `onclick` and the topmost element of each `cursor: pointer` region. Listeners on window/document/body are delegation and ignored. Any element with a `tabindex` attribute counts as focusable, so roving-tabindex widgets (`tabindex="-1"`) are left to the widgets engine (S05). Skip links require a skip-like name (skip, jump, bypass, "go to content", "main content") in addition to an in-page `href` among the first three stops.
- **Why:** The slice's "any in-page link among the first 3 stops" would flag ordinary nav links like `href="#home"` on `focus-not-visible.html` and `keyboard/ok.html` as broken skip links (violations).
- **Alternatives:** Flagging `tabindex="-1"` elements with click listeners; rejected because correct APG tabs/menus use exactly that pattern.

## 2026-10-31: In-house PNG decoder

- **Decision:** `packages/engines/keyboard/src/lib/png.ts` decodes Chromium screenshots (8-bit gray/RGB/RGBA, filters 0-4, no interlace) with `node:zlib`. No image dependency was added.
- **Why:** Keeps the lockfile and catalog untouched while four slices run in parallel.
- **Alternatives:** `pngjs` from the catalog; reasonable later, especially if S04 needs the same thing (see requested changes).

## 2026-10-31: Fixture names follow the rule generator

- **Decision:** Fixture pages are named by the rule generator (`<rule>.html` / `<rule>-ok.html`): `click-not-focusable.html` (slice: `click-div-button.html`), `escape-does-not-close.html` (slice: `modal-escape.html`), `skip-link-broken-ok.html` (slice: `skip-link-ok.html`), plus `overlay-focus-not-moved*.html`, `skip-link-missing*.html`. Extra pages via the fixture generator: `focus-low-contrast.html`, `focus-order-two-column-ok.html`, `modal-contained-ok.html`. Overlay fixture triggers carry `aria-haspopup="dialog"` but no `aria-controls` (axe reports `aria-valid-attr-value` as needs-review when it points at a hidden element, which was noise on correct pages).
- **Why:** The generator is the source of truth for rule scaffolding.
- **Alternatives:** Renaming generated files by hand.

## 2026-10-31: Generator collision with existing barrier pages

- **Decision:** For `focus-order-backward`, `focus-not-visible` and `keyboard-trap`, the existing barrier page and expected file were moved aside with `git mv`, the rule generator was run, and the originals were restored byte-for-byte over the generated barrier stubs (the generated `-ok` pages were kept and filled in). Their expected files gained `ruleId`.
- **Why:** The rule generator refuses to overwrite an existing fixture.
- **Alternatives:** Editing the generator in this slice; out of scope (see requested changes).

## Requested core/browser changes

- **None required.** The engine works against the current `@clear-a11y/browser` and `@clear-a11y/core` contracts.
- Optional, for the coordinator: if S04 (visual) also decodes screenshots, move `decodePng` and the pixel helpers (`contrastRatio`, `diffStats`, `focusChange`) into `@clear-a11y/browser` (or a small shared util) so both engines use one implementation.
- Optional, tooling: give the workspace-plugin rule generator a flag such as `--existing-fixture` that skips writing the barrier page when it already exists.

<!-- From slice S03 (states) -->

## 2026-10-31: State ids and kinds

- **Decision:** Ids are `<kind>:open#<target>` for widgets (`dialog:open#settings-dialog`, `menu:open#site-menu`) and `form-empty#<form>` / `form-invalid#<form>` for forms. Kinds: `menu`, `dialog`, `accordion`, `tab`, `tooltip`, `disclosure`, `popover`, `form-empty`, `form-invalid`. The target is the revealed content's id, else the trigger's id or name, sanitized; collisions get `-2`, `-3`.
- **Why:** Matches the ids used in the S03 task brief and the `StateMeta.kind` examples in `@clear-a11y/browser` (`dialog`, not the slice text's `modal`). Expected issues can match by prefix (`"state": "menu:open"`).
- **Alternatives:** `form:invalid#signup` (slice text); rejected to keep the kind visible as a single token.

## 2026-10-31: Discovery limits and default viewports

- **Decision:** `states.maxStates` defaults to 10 (slice text said 20), `maxCandidates` 60, `maxForms` 5, `candidateTimeoutMs` 2000, `settleMs` 150, total `budgetMs` 80% of `timeoutMs`. Discovery runs on every viewport the scan uses; `states.viewports` can restrict it. It does not add a mobile viewport the user did not ask for.
- **Why:** Cost is states x engines x viewports. The task brief asked for a default of 10. Silently scanning a viewport outside `config.viewports` would surprise users and double the cost of the default desktop-only scan.
- **Alternatives:** Slice text's default of `['desktop', 'mobile']` for discovery; rejected for the reasons above (users who want mobile menus add the mobile viewport to `config.viewports`).

## 2026-10-31: Safety while exploring

- **Decision:** A route guard is installed on every page the explorer touches (discovery, the engine's own run, every replayed state) and stays for the life of the page. It aborts non-GET/HEAD requests and answers main-frame navigations to any other URL (ignoring the hash) with a local `204 No Content`. Controls and submit buttons with destructive names (delete, remove, log out, sign out, buy, pay, purchase, checkout, unsubscribe, cancel subscription, reset, transfer, donate, ...) are never activated; links to other documents are never candidates.
- **Why:** Live sites will be scanned. A 204 keeps the browser on the current document; aborting the navigation instead replaces the page with a Chrome error page, which broke replay. Blocking any other path or query (not just other origins) is stricter than the slice text and is allowed ("configurable only to stricter").
- **Alternatives:** Abort-only (error page problem); allow same-origin navigations (a GET form or a link could leave the state being tested).

## 2026-10-31: Discovery runs on its own page load

- **Decision:** The runner runs discovery on a separate page and closes it, instead of reusing and reloading the default-state page.
- **Why:** The mouse position survives a reload, so the last hover-tooltip stayed open in the "default" state and was reported there (found by the first benchmark run on `states/tooltip-contrast.html`). A separate page also keeps the route guard off the default state.
- **Alternatives:** Reset the mouse and blur after discovery; fragile against other leftovers (focus, storage, guard).

## 2026-10-31: engine-states findings and duplication of exploration

- **Decision:** `engine-states.run(ctx)` re-explores what it needs (aria-expanded triggers and forms) on its own fresh page in the default state, and returns nothing in replayed states. The runner skips `engine-states` for replayed states. Three rules: `states/error-not-associated` (3.3.1 + 1.3.1; `violation` when visible error text appears next to a field and nothing programmatic ties it, `likely` when only `aria-invalid` is set), `states/error-not-in-text` (3.3.1 + 1.4.1, `likely`: style change or new `aria-invalid` with no text anywhere), `states/expanded-state-mismatch` (4.1.2; `violation` with `aria-controls`, `likely` without).
- **Why:** Engines stay independent of the discoverer (no shared cache between the runner's discoverer and the engine). The extra cost is small: only `aria-expanded` triggers and forms, capped by the same limits.
- **Alternatives:** A per-scan cache shared by the discoverer and the engine; more coupling for a small saving.

## 2026-10-31: Dedupe of state findings

- **Decision:** A finding from a replayed state is dropped when the default state of the same page and viewport has a finding with the same `ruleId` and selector (`dropStateDuplicates` in runner). The existing runner test that returned the same rule and selector in every state now uses a per-state rule id.
- **Why:** Slice requirement; a barrier visible in every state is one issue.
- **Alternatives:** Dedupe by stable id (includes the state, so it never matches).

## 2026-10-31: `aria-errormessage` correct pattern also uses a live region

- **Decision:** `fixtures/site/states/error-not-associated-ok.html` keeps `aria-errormessage` on the email field and makes its message element `aria-live="polite"`.
- **Why:** axe-core (`aria-valid-attr-value`) reports `aria-errormessage` whose target is not announced by another technique; without the live region the correct-pattern page produced two `violation`s once static scanned the form-error states.
- **Alternatives:** Use only `aria-describedby`; rejected so the fixture still exercises the `aria-errormessage` association path.

## Requested core/browser changes

None required. Nice to have later:

- `ScannedPage` in `@clear-a11y/core` could carry a `stateLabels` map (state id to human label) so reports can show "Dialog opened by click on Open settings" instead of the raw id. The runner currently only logs labels.

## 2026-10-31: Correct-pattern menu closes on Escape

- **Decision:** `states/menu-hidden-link-no-name-ok.html` closes its menu on Escape and returns focus to the toggle.
- **Why:** After merging S02 + S03, the keyboard engine's needs-review Escape check fired on this correct-pattern page. Correct patterns model the APG disclosure-navigation behavior.
- **Alternatives:** Exempting disclosure menus from the Escape check; rejected because Escape-to-close is the expected pattern.

<!-- From slice S04 (visual) -->

## 2026-10-31: Real-pixel contrast measures the background under each glyph

- **Decision:** `visual/contrast-over-background` takes two screenshots of a text box (as is, and with `color: transparent` on the element, transitions disabled). Pixels that differ by at least 3 levels are glyph pixels; the second shot is the exact background under each one. The CSS text color (with alpha and the product of ancestor opacities) is composited over each background pixel and the WCAG ratio computed. Median below threshold is `violation`, 10th percentile below threshold is `likely`, fewer than 20 glyph pixels gives no verdict. Threshold 4.5:1, or 3:1 for large text (>= 24px, or >= 18.66px and weight >= 700).
- **Why:** Anti-aliased glyph edges blend text and background, so measuring glyph pixel colors underestimates contrast. The background under the glyph is known exactly from the second shot, so no edge sampling or color guessing is needed. A low diff threshold is required: white on #f6f5f4 differs by only about 9 levels per channel (an earlier threshold of 24 missed the S00 fixture entirely). Chromium renders both shots identically apart from the glyphs, so a low threshold adds no noise.
- **Alternatives:** Sampling a ring of pixels around the glyphs (picks up unrelated background); estimating the text color from the darkest/lightest glyph pixels (wrong for thin fonts); using the minimum ratio (one stray pixel decides).

## 2026-10-31: Solid-color text contrast stays with axe

- **Decision:** The visual engine only measures text whose background is not one solid color: an ancestor (up to the first opaque background) has a `background-image`, or a non-ancestor element (media, background image, painted box) sits between the text and its opaque ancestor at the text's position (`elementsFromPoint`).
- **Why:** axe-core already computes solid-color contrast deterministically; measuring it again would duplicate every finding. Verified: no visual finding on `static/low-contrast.html`.
- **Alternatives:** Measuring all text by pixels (slower, duplicates axe).

## 2026-10-31: Text-only resize doubles computed font sizes and is `likely`

- **Decision:** 1.4.4 runs two checks. (a) Zoom equivalent: lay the page out at half the viewport (640 x 400 from the 1280 x 800 desktop viewport), only when the scan viewport is at least 1024px wide; new clipping is `violation`. (b) Text-only: read every element's computed `font-size` (html and body included, so `rem` scales), then set `font-size: <2x>px !important` inline on each; new clipping is `likely`. Inline styles are restored afterwards.
- **Why:** Chromium has no text-only zoom switch. Setting explicit pixel sizes on every element avoids compounding `em` sizes. The method can break layouts that browser zoom would handle (fixed `px` line heights stay fixed), so it can't be a `violation`.
- **Alternatives:** CDP `Emulation.setPageScaleFactor` or `deviceScaleFactor` (scales pixels, not CSS layout); changing only the root font size (misses `px` font sizes, which is exactly where text-only resize fails).

## 2026-10-31: Clipping is "more hidden content than before"

- **Decision:** For elements with `overflow: hidden | clip` (per axis) that contain visible text, the engine measures `scrollWidth - clientWidth` and `scrollHeight - clientHeight` before and after a change. A finding needs the hidden amount to grow by more than 2px. Already-clipped text that gets clipped further counts. Visually hidden elements (client size <= 2px, `clip: rect(0...)`, `clip-path: inset(50%)`), form controls and media are skipped; elements the page re-creates during the change are ignored.
- **Why:** "New clipping" alone missed the S00 `text-spacing.html` fixture, whose text is already cut off at baseline and loses another line under the spacing overrides. The 2px margin absorbs rounding.
- **Alternatives:** Comparing only clipped/not clipped (misses growth); measuring glyph rects outside the box (expensive, same result).

## 2026-10-31: Target size circle test treats touching circles as passing

- **Decision:** A 24px circle centered on an undersized target's box fails when the distance from its center to another target's box is under 12px, or to another undersized target's center under 24px (0.01px tolerance). Exactly 24px apart (two 16px targets 8px apart) passes. Inline-in-sentence targets and inputs/selects whose size equals the unstyled browser default (measured in an `all: initial` shadow root) are exempt. Targets listed in `visual.targetSizeEquivalent` become `needs-review`.
- **Why:** SC 2.5.8 says the circles must "not intersect"; tangent circles share no area. The slice's example ("two 16px targets 8px apart fail") is that boundary case; the unit test documents it as passing and uses 4px apart for the failing case.
- **Alternatives:** Treating tangency as failure (stricter than the SC text).

## 2026-10-31: Hover/focus triggers come from CSS, ARIA and data attributes

- **Decision:** Triggers are elements matched by `:hover`/`:focus*` rules whose selector continues after the pseudo-class (something else is revealed) and that change display, visibility, opacity, transform, clip or position/size; elements whose `aria-describedby` points at hidden content; and `[data-tooltip]`, `[data-tippy-content]`, `[data-bs-toggle="tooltip"]`. Max 6 per page; each costs about 2.5s. New content is the outermost newly visible elements with text or images (visible-set diff). Order per trigger: persistence (wait `hoverPersistMs`, default 1000ms) -> dismissal (Escape, only when the content covers other text/controls and isn't `role="alert"`) -> hoverability (real mouse to the nearest edge of the content, then its center; skipped for focus-only and non-persistent content). Visibility is re-checked as "any new visible content vs the snapshot", which survives tooltips that are re-created on each show.
- **Why:** Hovering every focusable element would blow the runner's 30s per-state timeout. The CSS filter keeps `a:hover { color }` rules out. Moving straight from trigger center to content center crosses empty space that real users avoid, which flagged correct wrapper-based tooltips; heading for the nearest edge first matches how people move.
- **Alternatives:** Hover every interactive element (too slow); only `role="tooltip"` (misses most real tooltips).

## 2026-10-31: Time budget inside the engine

- **Decision:** The engine plans to use at most 80% of `config.timeoutMs` (minimum 5s). Contrast, non-text contrast and hover checks stop when the remaining budget is below their per-item cost and log a debug message.
- **Why:** The runner wraps each engine run in `withTimeout(config.timeoutMs)`; a timeout would drop all findings of the run.

## 2026-10-31: A small PNG decoder instead of a dependency

- **Decision:** `src/lib/png.ts` decodes the 8-bit RGB/RGBA non-interlaced PNGs Chromium produces, using `node:zlib`. Unit tested with all five filter types.
- **Why:** Avoids adding `pngjs` to the catalog (and a merge conflict with other parallel slices). Screenshots are always this format.
- **Alternatives:** `pngjs`; decoding in the page via canvas (sends large buffers through CDP, and canvas color management varies).

## 2026-10-31: Fixture changes outside the visual area

- **Decision:** `keyboard/ok.html` gets `min-width: 0` on its grid items, and `keyboard/focus-order-backward.json` gets a second expected issue (1.4.10, layer visual).
- **Why:** At 320px both pages scrolled sideways by 10px: the two-column grid could not shrink below the inputs' default width. That is a real 1.4.10 failure. The correct-pattern page must be correct, so it is fixed; on the barrier page a human auditor would log it, so it is listed (the brief says to add real issues rather than suppress them). The CSS change doesn't affect the desktop layout or focus order.
- **Alternatives:** A tolerance of a few px in the reflow rule (would hide real failures).

## 2026-10-31: Rule-named fixtures; S00 target-size page kept

- **Decision:** Fixture pages are named after their rule (the generator's convention) rather than the slice's suggested names (`reflow-fixed-width.html`, ...). The rule generator refuses to overwrite the existing `visual/target-size.html`, so the S00 page and its expected file were moved aside while generating `visual/target-size` and restored afterwards; only `target-size-ok.html` is new. `visual/target-size-inline-link-ok.html` was added with the fixture generator. A small generated texture, `fixtures/site/_assets/pale-photo.png` (240 x 120, made by a deterministic script, no third-party content), backs the image contrast fixtures.

## Coordination idea: drop axe's gradient needs-review when real pixels pass (not implemented)

- **Idea:** axe reports `static/color-contrast` as `needs-review` for text on gradients and images (the remaining benchmark noise: `visual/ok.html` `h2`). The visual engine measures exactly those elements. When it measured a selector and the text passes, the runner could drop axe's `needs-review` for the same selector, page and state as a small pure post-processing step in `packages/runner`.
- **Why not now:** The engine contract returns only `Finding[]`, so passing measurements have nowhere to go. Encoding passes as findings would be wrong, and a side channel on the engine object would be a hidden contract. It needs the small contract change requested below.

## Requested core/browser changes

- **Engine pass records (browser + core):** let `Engine.run` optionally report what it measured and found compliant, e.g. `run(ctx): Promise<Finding[] | { findings: Finding[]; passes?: PassRecord[] }>` with `PassRecord { ruleId; wcag: string[]; selector; page; evidence? }` in core. The runner could then drop `static/color-contrast` `needs-review` findings that a deterministic real-pixel pass covers (and later use passes for coverage reporting). Needs an ADR (Finding-adjacent public API).
- **Optional, browser:** `PageHelpers.isVisible` ignores ancestor opacity and visually-hidden clipping. The visual engine works around it with its own `isRendered()` check; a shared helper would help other engines (AT, states) too.

## 2026-10-31: Cross-slice fixes at the S04 merge

- **Decision:** (1) Fixtures from S02/S04 that overflowed at 320 CSS px were fixed (nav lists wrap, two-column forms stack, tooltips capped at the viewport) so each fixture holds only its seeded barrier. (2) `keyboard/skip-link-broken` no longer reports when nothing focusable exists in or after the target (the check can't be verified there). (3) The visual probe treats content outside an open modal, and anything under `[inert]`, as not rendered.
- **Why:** After merging, each engine ran on the other slices' fixtures and on states opened by S03: violation precision fell to 65%. All three were real defects (fixture hygiene, an unverifiable check reported as a failure, measuring inert content behind a modal backdrop).
- **Alternatives:** Suppressing `visual/reflow-horizontal-scroll` in non-default states; rejected because an opened state that breaks reflow is a real barrier.

## 2026-10-31: Deferred: engines reporting verified passes

- **Decision:** Deferred to wave 7. S04 asked for a way for engines to report passes (`PassRecord`) so the runner can drop axe `color-contrast` needs-review where real-pixel contrast verified a pass.
- **Why:** It changes the engine contract (needs an ADR) and only affects needs-review noise (6 items on correct pages), not violation precision.

<!-- From slice S05 (at + widgets) -->

## 2026-10-31: APG deviations are needs-review; WCAG failures are violations

- **Decision:** In both engines, `violation` is used only when keyboard operation is actually blocked (2.1.1), or when the state exposed to assistive technology is wrong or missing (4.1.2: stale `aria-selected`/`aria-expanded`, an active option shown only visually, a nameless dialog, a disclosure with no expanded state, no selected tab). Other deviations from the ARIA Authoring Practices are `needs-review` with a yes/no question: Tab-only widgets, missing Space or Down Arrow, Escape not closing a menu or combobox. Focus not moved into a dialog is `likely`.
- **Why:** The APG is guidance, not a WCAG requirement. Keeping violations to observed failures keeps violation precision high.
- **Alternatives:** Treat every APG deviation as a violation. Rejected: too many false positives on widgets that work.

## 2026-10-31: engine-at skips what axe-core already reports

- **Decision:** engine-at has no `at/name-missing` rule. `at/state-missing` checks only tab lists (no tab `aria-selected="true"`). The full required-state table (`required-states.ts`) marks checkbox, switch, menuitemcheckbox, menuitemradio, combobox and slider as `coveredByAxe`, and the engine leaves those to `engine-static`.
- **Why:** axe's `button-name`, `link-name`, `aria-command-name`, `aria-input-field-name`, `aria-toggle-field-name` and `aria-required-attr` already report the same nodes (open shadow DOM and every state included, since the runner runs axe per state). The runner's dedupe is by finding id (rule + target + state), so an engine-at copy under another rule id would be a duplicate in reports. engine-at spends its effort on what axe can't see: behavior (toggles, announcements, errors), name sources (placeholder) and label-in-name (experimental in axe, not run).
- **Alternatives:** Implement the slice's `at/name-missing` for "custom roles / shadow DOM / names emptied after state changes". Rejected for now: no fixture showed a case axe misses. Revisit with a real false negative.

## 2026-10-31: Extra engine-at rules beyond the slice table

- **Decision:** Three rules were added on top of the S05 table:
  - `at/expanded-state-missing` (4.1.2, violation): a button whose second press undoes the first, so it toggles a section, with no `aria-expanded`/`aria-pressed`.
  - `at/placeholder-only-label` (3.3.2 + 1.3.1, 4.1.2, likely): the accessible name comes only from the placeholder.
  - `at/status-message-not-announced` (4.1.3, likely): short text appears after a button press, nothing is announced, and focus does not move to it.
- **Why:** These are the existing benchmark issues owned by the `at` layer: `at/disclosure-no-state`, `static/form-missing-label` (see the 2026-10-31 "Placeholder-only labels" decision) and `at/status-message`. The S05 coordinator brief lists them explicitly.
- **Alternatives:** Fold the toggle check into `at/state-missing`. Rejected: one is a behavior probe, the other a static attribute check. They have different evidence and different false-positive profiles.

## 2026-10-31: engine-at probes buttons and forms itself in the default state

- **Decision:** In the default state, engine-at reloads the page with the announcement recorder (`page.addInitScript` installs a `MutationObserver`, so it runs before page scripts). It then presses up to `at.probeButtons` (default 20) plain buttons, and submits up to `at.probeForms` (default 3) forms empty. In `form-invalid`/`form-empty` states it replays `stateMeta.replay` with the recorder instead. Other states run only the accessibility-tree checks.
  - Buttons excluded: submit/reset buttons inside forms, `aria-haspopup`, and buttons inside dialogs and composite widgets.
  - Forms whose native constraint validation blocks the submit are skipped, because browsers announce their own messages.
  - A submit the page doesn't handle is stopped by a bubbling `submit` listener on `window` (it runs after the page's own handlers and only acts when none of them called `preventDefault`), so nothing navigates.
- **Why:** S03's state explorer runs in parallel and isn't merged, and the benchmark has no `form-invalid` states yet. Probing in the default state finds `states/form-errors` issue #2 now. Probing from a fresh load keeps results independent of other engines.
- **Alternatives:** Only analyze `form-invalid` states. That finds nothing until S03 lands. Once S03 produces `form-invalid` states, the same form issue is reported in both states with different ids. The coordinator may set `probeForms: 0` when the state explorer is on, or make runner-level dedupe ignore state for engine-at form rules.

## 2026-10-31: Disclosures are detected by pressing twice

- **Decision:** A button counts as a disclosure only when the first press shows or hides content and the second press undoes it. Content that is or contains a dialog, menu, listbox, tooltip, tree or grid doesn't count, and neither do changes inside the button itself.
- **Why:** A toggle observed in both directions is deterministic evidence of a two-state control. That justifies a `violation` tier when no state is exposed. One-way actions such as "Load more" or "Add to cart" are not disclosures.
- **Alternatives:** Infer disclosures from `aria-controls` or from class names. Rejected: authors who forget `aria-expanded` usually forget `aria-controls` too, and class names are guesswork.

## 2026-10-31: Guidepup is an adapter seam only

- **Decision:** `config.at.guidepup` (default `false`, already in core's config) enables `loadGuidepup()`. It dynamically imports `@guidepup/guidepup` with a computed specifier, only on macOS or Windows. The package is not a dependency. The adapter interface (`ScreenReaderAdapter`) and a pure `confirmWithScreenReader(confidence, confirmed)` helper exist. The engine logs that a reader is available, but doesn't drive it yet. The real-reader test is skipped unless `CLEAR_A11Y_GUIDEPUP=1`.
- **Why:** Screen-reader automation can't run in CI or on Linux, and the slice asks only for an opt-in seam. Findings must stay deterministic.
- **Alternatives:** Wire VoiceOver into every probe now. Rejected: it can't be tested here and would make results machine-dependent.

## 2026-10-31: engine-widgets runs only in the default state

- **Decision:** `runsInState` is true only for state `default` (or `stateMeta.kind === 'default'`). Every widget script starts from a reload of `ctx.url`, replaying `stateMeta` if present.
- **Why:** The scripts start from a fresh load, so they give the same answer in every state. Running them per state would duplicate findings under different ids.
- **Alternatives:** Run in every state, which duplicates findings. Or drive only widgets that first appear in a state, which needs default-state detection results passed between runs.

## 2026-10-31: engine-widgets merges problems into one finding per rule and target

- **Decision:** Problems with the same rule and selector become one finding. The most severe tier and its SCs lead. Less severe problems are added to the message ("Also worth reviewing: ...") and kept in `evidence.data.problems`. Key/step traces become `evidence.focusPath`.
- **Why:** The finding id is hash(rule, selector, state), so the runner's dedupe would otherwise silently drop all but one.
- **Alternatives:** Custom ids per problem. Rejected: it would break id stability across runs.

## 2026-10-31: engine-widgets probes for orphan dialog triggers

- **Decision:** When a page has hidden dialogs and no linked trigger (`aria-controls` or `aria-haspopup="dialog"`), engine-widgets presses Enter on up to `widgets.maxDialogProbes` (default 8) visible plain buttons to find the one that opens them. Submit buttons, links and buttons inside composite widgets are excluded.
- **Why:** S03 state discovery isn't available yet, and real sites rarely link their triggers. Leaving out submit buttons and links avoids destructive or navigating actions.
- **Alternatives:** Rely only on S03's `stateMeta.triggerSelector`. That finds nothing until S03 lands. It can be switched over later.

## 2026-10-31: engine-widgets checks dialog names

- **Decision:** `widgets/dialog-initial-focus` reports a dialog with no accessible name as a 4.1.2 violation.
- **Why:** axe's `aria-dialog-name` is tagged best-practice only, so `engine-static` (WCAG tags only) never runs it.
- **Alternatives:** Leave it to axe best-practice rules, which are off by default.

## 2026-10-31: Time budgets and navigation guards in both engines

- **Decision:** Both engines stop starting new probes or widget scripts after a budget (`at.budgetMs` and `widgets.budgetMs`, default 20 s; engine-at also caps it at 70% of `config.timeoutMs`). If a press or key navigates the main frame, the current probe or widget is discarded and the page reloaded.
- **Why:** The runner's per-engine timeout is 30 s, and observations from another document would be wrong.
- **Alternatives:** None considered.

## 2026-10-31: Fixture names follow the rule generator

- **Decision:** New fixtures are named `<rule>.html` / `<rule>-ok.html`, as the rule generator creates them, instead of the slice's names (`tabs-ok.html`, `menu-button-broken.html`, ...). The existing seeds (`at/disclosure-no-state.html`, `at/status-message.html`, `widgets/tabs-no-arrow-keys.html`) are kept and also covered.
- **Why:** The bootstrap brief requires every rule to be created with the generator.
- **Alternatives:** Rename after generation. Rejected: no benefit, and the expected files would drift from the generator convention.

## Requested core/browser changes

None required. Nice to have later:

- `@clear-a11y/browser`: a shared `pressAndObserve(page, selector)` helper. engine-at and engine-widgets each have a small press-and-settle driver, kept separate because engines must not import each other.
- Runner: optional cross-state dedupe for findings whose rule declares itself state-independent (see the "probes buttons and forms itself" decision).

## 2026-10-31: Cross-slice fixes at the S05 merge

- **Decision:** Fixed three correct-pattern / barrier fixtures from other slices that the new AT engine and the visual engine flagged as real issues: `keyboard/click-not-focusable-ok.html` status text gets `role="status"`, `states/error-not-in-text-ok.html` moves focus to the first invalid field, and the `at/status-message-not-announced*` textareas are capped at the viewport width (reflow). Benchmark default concurrency raised to 4 (120 fixture pages; a full run takes about 5 minutes).
- **Why:** Correct-pattern pages must be correct under every engine; barrier pages hold only their seeded barrier.
- **Alternatives:** Relaxing the AT rules; rejected because both were real 4.1.3 gaps.

## 2026-10-31: Benchmark caveat: seeded fixtures are self-authored

- **Decision:** Benchmark numbers on `fixtures/` are reported as "recall on seeded barriers", not as recall against human audits.
- **Why:** Each engine's fixtures were written alongside the engine, so high recall shows the engines catch the barriers we designed, not that we reach 80% of a real audit. Independent fixtures (sanitized real audit findings, the alphagov accessibility-tool-audit page) are needed before making the 80% claim.
- **Alternatives:** Reporting the number without the caveat; rejected (AGENTS.md: proven by measurement, never by claim).

<!-- From slice S06 (reporter) -->

## 2026-10-31: SARIF location strategy for URL-only findings

- **Decision:** Findings with `source` get a `physicalLocation` (repo-relative `artifactLocation.uri`, `region.startLine`, `uriBaseId: SRCROOT` when `repoRoot` is given). Findings without `source` get `physicalLocation.artifactLocation.uri = page URL` plus a `logicalLocation { name: selector, kind: "element", fullyQualifiedName: "<url> [state: <state>] <selector>", properties: { state, viewport } }`. Every result carries `partialFingerprints["clearA11y/v1"] = finding.id`.
- **Why:** SARIF needs at least one location per result, and keeping URL findings in the file means SARIF never drops findings relative to the canonical JSON. GitHub code scanning only displays results with repo file locations; that limitation is documented in the reporter README.
- **Alternatives:** Dropping URL-only findings from SARIF (loses data, breaks "derived, never drops"); a fake file path such as `pages/<host>/<path>` (misleading in GitHub's UI).

## 2026-10-31: SARIF validated with a hand-written shape, not the vendored official schema

- **Decision:** Unit tests validate the required SARIF 2.1.0 parts (version, runs, tool.driver, rules, results, levels, locations, regions, fingerprints) with a zod shape. No schema file is vendored, so no OASIS NOTICE entry is needed.
- **Why:** The coordinator's brief allows this, it keeps the repo offline-only with no new JSON-schema validator dependency, and it covers what GitHub code scanning actually reads.
- **Alternatives:** Vendor `sarif-schema-2.1.0.json` and add Ajv to the catalog (the slice's original plan). Worth doing if SARIF output grows (fixes, code flows); a follow-up issue is reasonable.

## 2026-10-31: helpUri for SARIF rules

- **Decision:** `helpUri` is the first http(s) URL found in the rule's `fix` (axe-core findings carry a Deque link there), otherwise the W3C Understanding URL of the rule's first known SC, otherwise `docs/rules/<ruleId>.md` on GitHub.
- **Why:** Follows the coordinator brief; Understanding docs are authoritative and always resolvable from `getSuccessCriterion`.
- **Alternatives:** Always link our own `docs/rules` page (the slice's plan). Better once the docs site exists (S15); switch then.

## 2026-10-31: toSarif returns an object; writeReports file names

- **Decision:** `toSarif(result, opts): SarifLog` returns the object, `sarifToString(log)` serialises it. `writeReports` writes `report.json`, `report.sarif` and `report.html` (the slice text said `findings.json`/`findings.sarif`; the existing S01 code and the coordinator brief use `report.*`). Unknown formats throw (`parseFormats`), so `--format pdf` is a usage error instead of being silently ignored.
- **Why:** Objects are easier to test and post-process; the file names keep S01 behavior stable.
- **Alternatives:** Returning a string from `toSarif` like `toJson` does.

## 2026-10-31: Rule metadata is passed in; runner exports allRules()

- **Decision:** `@clear-a11y/runner` exports `allRules()` (all engines' `rules`, sorted by id). Reporters take `{ rules?: RuleMeta[] }`; without it, titles come from the rule id ("keyboard/focus-order-backward" -> "Focus order backward") and fixes from the finding. The CLI passes `allRules()` to `writeReports` for both `scan` and `report`.
- **Why:** Reporter is `type:feature` and must not import engines. engine-static exports no rule metadata (axe rules are dynamic), so static findings use the derived title plus axe's message.
- **Alternatives:** A rule registry in core (would make core depend on engine content).

## 2026-10-31: HTML report CSP allows inline scripts instead of a nonce

- **Decision:** The report's CSP is `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`.
- **Why:** A nonce-only `script-src` blocks Playwright's `page.addScriptTag`, which engine-static uses to inject axe-core, so Clear A11Y could not scan its own report (and cannot scan any real site with a strict CSP today). Escaping is the primary XSS defense (tested with a hostile-payload corpus); the CSP still blocks every network fetch, so nothing can be loaded or exfiltrated by request.
- **Alternatives:** Nonce-based CSP plus `bypassCSP: true` in the browser context (see requested changes below); once that lands, the report can switch to `script-src 'nonce-...'`.

## 2026-10-31: Review answers in localStorage, exported as JSON

- **Decision:** Needs-review answers are kept in `localStorage` under `clear-a11y:answers:<report key>` (report key = hash of `startedAt` and the sorted finding ids), every access wrapped in try/catch with a status message on failure. "Download answers (JSON)" exports `{ tool, report, exportedAt, answers: [{ findingId, ruleId, url, selector, question, answer }] }` via a Blob URL. Without JavaScript the radios still work but nothing is saved; a `<noscript>` note says so.
- **Why:** The report is a static file with no server; answers must never leave the machine unless the user downloads them. The export shape is what a future `clear-a11y review import` (or the server) can consume.
- **Alternatives:** Encoding answers in the URL hash (fragile, leaks into shared links); a server endpoint (out of scope; no required SaaS).

## 2026-10-31: Focus-path numbers rendered as HTML overlay with generated content

- **Decision:** The focus-path SVG (`aria-hidden`) draws the element boxes and arrows (arrowhead at the midpoint, backward jumps red and dashed). The numbered stop circles and the "backward" labels are HTML positioned over it in percentages; the digits are CSS generated content from `data-n`. The wrapper is `role="img"` labelled by the figcaption and described by a visually hidden paragraph; an ordered list after it is the full text alternative ("3. Last name (textbox) #last-name backward jump from 2. Country (combobox)").
- **Why:** As SVG `<text>`, each single-digit label made axe return "content too short to determine contrast" (13 needs-review findings on the report), and the circles shrank to illegible sizes at 320 px. HTML labels keep a fixed size, sit on opaque backgrounds (so the "backward" label's contrast is measurable), and their colors are covered by the palette contrast test. The numbers are not lost to assistive technology: the ordered list carries them.
- **Alternatives:** Keep SVG text and accept 1 needs-review per stop (noise that would train people to ignore the dogfood check); render digits as paths (heavy, still not testable).

## 2026-10-31: Dogfood test lives in apps/cli and requires zero findings of any tier

- **Decision:** `apps/cli/test/report-dogfood.integration.test.ts` scans four fixture pages (`keyboard/focus-order-backward.html` for a backward focus path, `keyboard/skip-link-missing.html` for a needs-review question, `static/img-missing-alt.html` for a screenshot, `visual/low-contrast.html`), writes the reports through the real CLI, serves the folder with `startStaticServer` and scans `report.html` with every engine via `runner.scan`. It asserts zero engine errors and zero findings (violation, likely and needs-review). It also checks that the page makes exactly one request (itself), has no page errors, renders without JavaScript at 320 px, and that the filters, answer saving (survives reload) and JSON download work.
- **Why:** The coordinator brief places it in apps/cli; requiring zero needs-review too is stricter than asked and is true today, so a regression shows up immediately.
- **Alternatives:** The slice's `fixtures/site/report/report-sample.html` committed as a correct-pattern benchmark page, plus `fixtures/site/report/xss-finding.html`. Not added: the benchmark result had to stay unchanged for this slice, a committed generated file goes stale, and the XSS corpus is covered by reporter unit tests that push hostile payloads through every page-derived field. Could be added later with a regeneration script.

## 2026-10-31: Visual check of the report

- **Decision:** The generated report was opened in Playwright at 1280 px (light and dark), at 320 px and without JavaScript, and the full-page screenshots were reviewed. Fixes made from that review: removed `loading="lazy"` (images below the fold never loaded in full-page captures and print), lists of targets as a real list, the review-queue "Details" link on its own line, the "Principle" column dropped from the SC table (headers broke mid-word at 320 px), and smaller stop circles below 34rem.
- **Why:** AGENTS.md requires looking at UI changes, not only testing them.
- **Alternatives:** None.

## 2026-10-31: Benchmark unchanged

- **Decision:** No detection change in this slice. `pnpm nx run bench:run`: recall 97.0% (65/67), precision of `violation` 100% (63/63), 132 findings (63 violation, 42 likely, 27 needs-review), noise 6 on correct-pattern pages. Identical to the Wave 2 result; only the timestamp changed, so `bench-results/` was not recommitted.
- **Why:** Reporters are derived from findings and do not affect detection.
- **Alternatives:** None.

## Requested core/browser changes

- **browser: `bypassCSP: true` in `launchBrowser().newPage()`'s `browser.newContext(...)`.** engine-static injects axe-core with `page.addScriptTag`, which a page's Content-Security-Policy can block; on such sites the static engine would fail with an engine error. Playwright's `bypassCSP` option exists for this. Once applied, the HTML report can move to a nonce-based `script-src`.

## 2026-10-31: Browser contexts bypass page CSP

- **Decision:** `launchBrowser().newPage()` creates contexts with `bypassCSP: true`. Regression fixture `fixtures/site/static/strict-csp.html` (strict meta CSP + missing alt) proves engine-static still runs; the test fails without the flag.
- **Why:** Engines inject axe-core and in-page helpers; sites with a strict Content-Security-Policy would silently block them and hide real barriers. Requested by S06.
- **Alternatives:** Loading axe via `addInitScript` only; still blocked by some CSPs and doesn't cover the helpers.

## 2026-10-31: Wave 4 ordering: S10 starts after S09 merges

- **Decision:** S08 (personas) and S09 (repo static layer) run in parallel; S10 (repo runtime layer) starts once S09 is merged, overlapping with S08 if it is still running.
- **Why:** S09 creates `packages/repo` and S10 extends it; running both in parallel would create the same project twice and conflict on every file.
- **Alternatives:** A separate `repo-runtime` package; rejected because AGENTS.md lists one `repo` package for static lint, Storybook scanning, app boot and source mapping.

<!-- From slice S07 (ai) -->
<!-- From slice S07 (ai: providers + AI judges) -->

## 2026-10-31: Provider adapters use fetch, not vendor SDKs

- **Decision:** `anthropic`, `openai`, `azure` and `ollama` call the providers' HTTP APIs with an injected `fetch` (`createProvider(config.ai, { fetch?, env? })`). No SDK is added to the catalog. Anthropic: `POST /v1/messages`, headers `x-api-key` + `anthropic-version: 2026-10-21`, structured output via `output_config.format` (`json_schema`), optional `ai.effort`. OpenAI/Azure: Chat Completions with `response_format: json_schema` (Azure: `api-key` header, deployment from `ai.model`, `ai.apiVersion` default `2024-10-21`). Ollama: `/api/chat` with the schema as `format`. Retries on 429/5xx (retry-after or 0.5s, 1s, 2s), per-request timeout through `AbortSignal`, malformed JSON and refusals become `AiProviderError`.
- **Why:** The coordinator brief asked for fetch adapters so every request shape is unit-testable with a stubbed fetch, nothing is lazily imported, and the public package stays dependency-light. It also removes a catalog merge conflict with the parallel S06 slice.
- **Alternatives:** Official SDKs, lazy-imported (the slice text). Reasonable later for Bedrock/Vertex, where request signing is the hard part.

## 2026-10-31: Default Anthropic model `claude-sonnet-5-5`; other remote providers need `ai.model`

- **Decision:** `anthropic` defaults to `claude-sonnet-5-5` (overridable with `ai.model`); `openai`, `azure` and `ollama` refuse to start without `ai.model`.
- **Why:** The coordinator brief set the Anthropic default. For the others there is no model id we can choose responsibly on the user's behalf.
- **Alternatives:** Require `ai.model` everywhere (the slice text). Kept for the non-Anthropic providers.

## 2026-10-31: Bedrock and Vertex validate config, then stop with a clear error

- **Decision:** `bedrock` checks `ai.region` and `ai.model`, `vertex` checks `ai.project`, `ai.region` and `ai.model`; both then throw `AiConfigError` ("not yet implemented: needs AWS SigV4 / Google auth (ADC); use anthropic, openai, azure or ollama").
- **Why:** Both need request signing or credential chains that the fetch adapters don't do, and the brief accepted this. Throwing at scanner creation (fail fast) beats silently skipping AI judging the user asked for.
- **Plan:** Implement with `@anthropic-ai/bedrock-sdk` / `@anthropic-ai/vertex-sdk` (lazy-imported, catalog entries) or a SigV4 signer, behind the same `AiProvider` interface.

## 2026-10-31: API keys only from the environment; key-like config fields are rejected

- **Decision:** Keys are read from the variable named by `ai.apiKeyEnv` (defaults `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`) when the provider is created, kept only in the adapter's closure, never put in error messages. `ai.apiKey`, `ai.key`, `ai.token`, `ai.secret`... are rejected with a message pointing at `ai.apiKeyEnv`. A missing key fails scanner creation with the variable's name. There is no consumer-subscription auth of any kind.
- **Why:** AGENTS.md principle 6 and Security. Users who paste a key into a committed config file are the most likely leak.

## 2026-10-31: One engine `ai-judges`, findings carry `ai-<judge>`

- **Decision:** `createAiEngine(config, provider, { judges? })` returns one `Engine` named `ai-judges` with `mutatesPage: false`; its findings use engine `ai-<judge>` and rule id `ai/<judge>` (`ai/alt-text`, `ai/label-in-name`, `ai/link-purpose`, `ai/descriptive-headings-labels`, `ai/error-clarity`, `ai/color-only`, `ai/focus-order`). The runner registers it (registry key `ai`, new optional `enabled(config)` on `EngineRegistration`) only when `config.ai.provider !== 'none'`.
- **Why:** One engine shares the per-page call cap, time budget and concurrency across judges; per-judge engine names keep `layerOf()` = `ai` and let core's `enforceTierPolicy` cap them.
- **Alternatives:** One engine per judge (the slice's `createJudgeEngines`): caps and budgets would have to be coordinated across engines.

## 2026-10-31: Verdict mapping and thresholds

- **Decision:** Verdict schema `{ verdict: pass | fail | uncertain, confidence 0..1, reason, suggestion? }` (`unsure` accepted as `uncertain`; unknown fields dropped). `fail` ≥ `ai.likelyThreshold` (0.7) → `likely`; lower `fail` → `needs-review`; `uncertain` → `needs-review` unless `ai.reportUncertain: false`; invalid output → `needs-review` ("model output invalid"); `pass` → nothing; request errors → nothing (logged once per page). Confidence of uncertain findings is capped at 0.5.
- **Why:** The brief's threshold (0.7). Reporting uncertain answers as yes/no questions matches the `needs-review` tier's purpose; the option exists for users who prefer silence.

## 2026-10-31: Caps and budgets

- **Decision:** `ai.maxCandidatesPerJudge` 8, `ai.maxCallsPerPage` 40, `ai.maxCallsPerScan` 200, `ai.concurrency` 4, `ai.maxTokens` 2048, `ai.timeoutMs` 60 s, `ai.retries` 2. The engine stops starting requests after `ai.budgetMs` (default 80% of the scan's `timeoutMs`) via an `AbortSignal`. After a 401/403 or a config error the engine is disabled for the rest of the scan. Candidates over the cap that the injection guard flagged still get their deterministic needs-review finding.
- **Why:** The runner wraps each engine run in `withTimeout(config.timeoutMs)` (30 s): a timeout would drop every finding of the run. Most pages have dozens of links; only the most suspicious candidates are sent.

## 2026-10-31: Judges run in the default state; error-clarity only in form-invalid states

- **Decision:** Six judges run when `state === 'default'`; `ai/error-clarity` runs only when `stateMeta.kind === 'form-invalid'` (or the state id starts with `form-invalid`).
- **Why:** Running every judge in every state multiplies paid requests for the same elements; the runner's `dropStateDuplicates` would discard most of the results anyway. Error messages only exist in form-invalid states.

## 2026-10-31: Focus-order judge computes the sequential focus order itself

- **Decision:** `ai/focus-order` derives the sequential focus order from the DOM (positive tabindex ascending, then DOM order; visible focusable elements only), read-only, capped at 40 stops. It asks the model only when the path is non-linear (a backward move in reading order, or two or more column switches). The finding carries the path as `evidence.focusPath`.
- **Why:** Engines can't import engine-keyboard, and engine-keyboard is a mutating engine that runs after read-only ones, so its findings aren't available to a read-only engine on the same page. Pressing Tab would make the AI engine mutating.
- **Alternatives:** A runner `runJudges` step after all deterministic engines, passing prior findings (the slice text). Deferred: it needs an engine-contract change (see below).

## 2026-10-31: Prompts are versioned files shipped in the package

- **Decision:** `packages/ai/prompts/system.v1.md` plus one `<judge>.v1.md` per judge, with frontmatter (`id`, `version`, `wcag`) and exactly one `{{page_data}}` slot; loaded with `new URL('../../prompts/…', import.meta.url)` (same depth from `src/lib` and `dist/lib`); `prompts` is in the package `files`. A prompt change is a new version file plus a `promptVersion` bump, never an edit of a released version. A unit test checks every file's name, frontmatter and placeholder.

## 2026-10-31: Prompt-injection hardening

- **Decision:** (1) Page data is JSON inside `<page_data nonce="…">…</page_data>`, with `<`, `>`, `&` escaped as JSON unicode escapes, so content can't close or open a block and the parsed value is unchanged; the nonce is random per request. (2) The system prompt declares page data untrusted and never instructions. (3) Only the schema-validated verdict is read. (4) A deterministic guard (`findInstructionLikeText`, patterns such as "ignore previous instructions", "you are now", role markers, `"verdict": "pass"`, tag injection) flags candidates; they are always at least `needs-review` with "contains text that looks like instructions to an AI" and can never yield a pass, even if the request fails. Fixture `ai/prompt-injection.html` + `test/prompt-injection.integration.test.ts` use a deliberately naive model that obeys any instruction it sees.
- **Why:** AGENTS.md Security. The guard patterns are deliberately narrow (tested against ordinary copy like "Our assistant will respond within one business day") to keep needs-review noise low.

## 2026-10-31: Deterministic first: two new engine-at rules cover the ai/* fixtures without a model

- **Decision:** `at/alt-text-suspicious` (1.1.1, likely): alt text that is a file name (`IMG_2041.jpg`, `DSC01234`, the image's own file stem), a URL, or a placeholder word alone (image, photo, picture, graphic, spacer, icon, logo, untitled...). `at/link-text-generic` (2.4.4, likely): generic link names grouped by name + context (rest of the enclosing p/li/td text, else the nearest heading); a group with two or more destinations is reported, one finding per link; links with `aria-describedby` are skipped. Both run in engine-at's tree phase as "content checks".
- **Why:** The two existing ai-layer issues (`ai/alt-filename`, `ai/link-purpose`) are decidable by code, so the default benchmark (provider `none`) finds them. The AI judges then handle only real judgment calls.

## 2026-10-31: Benchmark stays on provider none; the injection fixture's two ai issues stay unmatched there

- **Decision:** `bench:run` uses the default config (`none`). The new `ai/prompt-injection.html` has two expected issues with layer `ai` (an instruction used as alt text, 1.1.1; a lone "Click here" link whose only context is a note to an AI, 2.4.4). No deterministic rule catches them, so they show as missed in the default benchmark. No `bench --ai=mock` was added.
- **Why:** The brief: never report AI recall measured with mock responses as a real number. Recall on judgment calls must come from a real provider, reported with the provider and model named. Making a deterministic rule flag "instruction-like alt text" would put the guard's heuristics into engine-at for one fixture.
- **Alternatives:** An optional `bench --ai=mock` labelled "synthetic responses" (optional in the brief; skipped to keep scope).

## 2026-10-31: Tests are offline by construction

- **Decision:** Adapters get a stubbed `fetch`; recorded responses live in `packages/test-utils/recordings/ai/*.json` (`"source": "synthetic"`), loaded with `loadRecording` and matched by exact input hash (`recordingKey(judge, normalizedInput)`) or partial `match`; the mock provider answers unknown input with a deterministic `uncertain`. `packages/ai/test/no-network.ts` (vitest `setupFiles`, unit and integration) rejects any `fetch` that would leave localhost. Judge integration tests that need page shapes not in `fixtures/` use `page.setContent` on `blank.html`, so they add no benchmark pages.

## 2026-10-31: Benchmark result (provider none, no AI)

- **Result:** `bench-results/s07-ai.md`: recall 97.3% (71/73), violation precision 100% (63/63), noise on correct-pattern pages 6 (unchanged, all axe `color-contrast` needs-review). Before (S05 merge): 97.0% (65/67), precision 100%, noise 6. Layer `ai`: 0/2 → 2/4 (both original ai issues found by the new deterministic engine-at rules; the two misses are the new prompt-injection page's judgment-call issues). Layer `at`: 18/18 (4 new issues). 1.1.1: 5/6, 2.4.4: 3/4.
- **Caveat:** recall on seeded barriers, not against human audits. No AI recall is reported: mock responses are synthetic.

## Requested core/browser changes

None required. Nice to have:

- **Runner/engine contract (needs an ADR):** an optional way for an engine to receive the findings already produced for the same page and state (for example `run(ctx, { priorFindings })`, or a runner `runJudges` step after mutating engines). The AI focus-order judge could then use engine-keyboard's real Tab path (`evidence.focusPath`) and the AI layer could skip candidates a deterministic rule already reported.
- **core `config.ai`:** document `judges: []` as "all judges" (it is how `@clear-a11y/ai` reads it), and consider moving `AiOptionsSchema` defaults (caps, thresholds) into core's schema so the CLI can print them.
- **core `isAiEngine`:** `ai-judges` (the engine name) and `ai-<judge>` (finding engines) are both covered by the `ai-` prefix already; no change needed.

<!-- From slice S09 (repo static) -->
<!-- From slice S09 (repo static layer) -->

## 2026-10-31: Lint with ESLint's `Linter` class and an in-code flat config

- **Decision:** The repo static layer reads each source file itself (after a safe directory walk) and lints it in memory with `new Linter({ configType: 'flat' })` and flat-config objects built in `packages/repo/src/static/eslint-config.ts`, with `allowInlineConfig: false`.
- **Why:** `Linter` does no file-system config lookup at all, which is a stronger guarantee than `new ESLint({ overrideConfigFile: true })`: the repo's `eslint.config.*`, `.eslintrc*`, `package.json#eslintConfig` and `.eslintignore` can't be loaded even by accident. It also gives us the parsed AST (`getSourceCode()`), so element descriptions, spread-prop detection and the enclosing component name come from the real AST instead of text heuristics. Ignoring inline config means `eslint-disable` comments can't hide a barrier from an audit (the react-sample `Banner.tsx` fixture proves it).
- **Alternatives:** `ESLint` class with `overrideConfigFile: true` (what the slice text suggested): also safe, but loads files and ignores itself and gives no AST access; re-parsing each file with the TS parser to describe elements would duplicate work.

## 2026-10-31: Repo finding conventions

- **Decision:** `ruleId` `repo/<plugin>/<rule>` (`repo/jsx-a11y/alt-text`, `repo/vuejs-accessibility/...`, `repo/angular-template/...`), engine `repo-eslint` (as the coordinator brief and core's `layerOf` test use; the slice text said `repo-static`), `page { url: 'repo:<relative path>', state: 'source', viewport: 'none' }`, `target.selector` a short element description (`<img className="hero" src={…}>`, `:src` for Vue, `[src]` for Angular), `source { file, line, column, component }`. The finding id is `stableHash(ruleId, file, selector, occurrence)`, not the line, so ids survive edits above the element. Messages and fixes are plain-language text from the rule map; the raw lint text is kept in `evidence.data.lintMessage`.
- **Why:** Matches S00c's repo-finding conventions and keeps SARIF (`partialFingerprints`) stable across unrelated edits.
- **Alternatives:** Including `file:line` in the selector (simpler ids, but every line shift makes a "new" finding).

## 2026-10-31: Tier policy for static lint

- **Decision:** Default `likely` (confidence 0.7). `violation` (0.95) only for `alt-text` (literal `<img>`/`<area>`/`<input>`, no spread props, the "must have an alt" message, not the "prefer alt=''" advice), `html-has-lang` (literal `<html>`, no spread), `aria-role` (DOM element, string-literal invalid role) and `aria-props` (DOM element, nonexistent aria-* attribute). `needs-review` (0.5, with a question) for `no-autofocus` and `img-redundant-alt`. Documented with reasons in `docs/repo-scanning.md`.
- **Why:** Lint can't see runtime props, CSS or rendered output; only these cases are unambiguous in source. `iframe-has-title` stays `likely` because jsx-a11y flags an iframe named by `aria-label`.
- **Alternatives:** Mapping every lint error to `violation` (would break the 0.95 violation-precision bar on real repos).

## 2026-10-31: Rules enabled = recommended rules with a WCAG mapping

- **Decision:** Enable the jsx-a11y and vuejs-accessibility **recommended** sets (coordinator brief; the slice said jsx-a11y `strict`), minus `no-access-key`, `no-noninteractive-tabindex` and `no-redundant-roles`, which have no defensible WCAG failure (and `tabIndex={0}` on scrollable regions is required for 2.1.1). A unit test fails when an enabled rule has no mapping, maps to an unknown/obsolete SC, or a recommended rule is neither mapped nor listed in `SKIPPED_RULES`. `vuejs-accessibility/label-has-for` is configured to accept nesting **or** for/id (its default requires both and flagged the correct-pattern fixture).
- **Why:** Precision first; "rules without a defensible SC mapping are not enabled" (slice).
- **Alternatives:** `strict` set: stricter options on the same rules, more noise for little extra recall.

## 2026-10-31: Angular template rules load from the scanned repo, opt-in only

- **Decision:** `@angular-eslint/eslint-plugin-template` and `@angular-eslint/template-parser` are not dependencies of Clear A11Y. When Angular is detected they are resolved from the scanned repo's `node_modules`, but only when the user opts in (`repo.trustRepoPlugins: true` / `--trust-repo-plugins`), because loading them executes code from the repo. Without the opt-in, or when they aren't installed, the scan returns a clear notice (also in `result.errors`) instead of crashing. Inline templates in `.ts` components are not linted.
- **Why:** The coordinator asked to load the plugin from the target repo; AGENTS.md says repo content is untrusted and this layer must never execute it. An explicit opt-in satisfies both.
- **Alternatives:** Add the Angular plugin and parser to our catalog (no repo code executed, works out of the box, but a heavier dependency for every user; reasonable follow-up if Angular demand appears); load from the repo by default (rejected: runs untrusted code).

## 2026-10-31: `scanRepo` lives in `@clear-a11y/repo`; the CLI calls it directly

- **Decision:** `scanRepo({ path, config, toolVersion })` is exported by `@clear-a11y/repo` and returns `{ result: ScanResult, detection, notices }`; the CLI (`type:app`, may depend on `type:feature`) calls it when `scan`'s single target is an existing directory, URLs go to the runner as before, anything else is a usage error. The runner depends on `repo` only for the benchmark. Coverage gaps (Angular not linted, Svelte, file limits) are added to `result.errors` so `--json` users see them too.
- **Why:** Coordinator brief; keeps the runner free of repo logic until S10 wires runtime scanning. Extra fields (`detection`, `notices`) stay outside the canonical `ScanResult`, so the schema is unchanged.
- **Alternatives:** `runner/src/repo.ts` wrapper (slice text); adds an indirection with no logic yet. S10 may add one when it orchestrates static + runtime.

## 2026-10-31: Runtime → source mapping: attributes, React debug info, scored literal search

- **Decision:** `mapFindingsToSource(findings, repoPath, { hints, minConfidence, files })` tries (1) the attribute convention `data-clear-a11y-src="file:line[:col]"` (also `data-source-file`/`-line`/`-column` and react-dev-inspector's `data-inspector-*`) on the element or nearest ancestor, confidence 1.0; (2) React ≤ 18 `_debugSource` (0.95) or React 19 `_debugStack` (0.6, candidate only); (3) literal search for a unique id or test id (0.9), class (0.6) or text (0.5), with agreeing clues combined. `source` is set only at ≥ 0.8; otherwise the top three candidates go to `evidence.data.sourceCandidates`. Page-side probes (`sourceAttributesProbe`, `reactDebugSourceProbe`) are exported as self-contained functions for Playwright's `evaluate`; their results come in through `hints`, so `@clear-a11y/repo` has no browser dependency. Paths outside the repo or that don't exist are ignored. A Babel/SWC/Vite plugin that adds the attribute is out of scope (convention documented only).
- **Why:** Coordinator brief (search with a confidence score) plus the slice's "never guess" rule.
- **Alternatives:** Only attributes and fiber info (slice text): misses the common case of unique ids/test ids. A site fixture page with annotated attributes (`fixtures/site/repo-map/annotated.html`) was skipped to keep the site benchmark numbers unchanged; the mapping is tested against the react-sample repo instead.

## 2026-10-31: Repo benchmark expected files live next to each sample repo

- **Decision:** Ground truth is `fixtures/repos/<name>/expected.json` (`repo`, `title`, `correctFiles`, `issues[{ id, file, line, rule, wcag, layer, description }]`), validated by `RepoExpectedSchema` in `packages/runner/src/benchmark/repo.ts`. A finding matches when the file is equal, the line is within ±2 and an SC overlaps. `bench:run` prints a separate "Repo layer" table in `latest.md` and adds a `repo` key to `latest.json`; the site numbers are computed exactly as before.
- **Why:** Coordinator brief. Keeping repo truth out of `fixtures/expected/` means the site loader (which expects `ExpectedPageSchema`) is untouched and core's `ExpectedIssueSchema` needs no `source` field yet.
- **Alternatives:** `fixtures/expected/repos/<name>.json` with an optional `source` on core's `ExpectedIssue` (slice text); needs a core change (see below).

## 2026-10-31: Keep `fixtures/repos` out of Nx with per-plugin `exclude`, not `.nxignore`

- **Decision:** Every inference plugin in `nx.json` gets `"exclude": ["fixtures/repos/**"]`; `.prettierignore` ignores `fixtures/repos` (root ESLint already did). `nx show projects` does not list the sample repos.
- **Why:** The sample repos contain `package.json`, `tsconfig.json` and `eslint.config.js`, which the `@nx/js/typescript` and `@nx/eslint` plugins would otherwise turn into projects. `.nxignore` would also drop the files from Nx's file map, so the `test-integration` target's `{workspaceRoot}/fixtures/**/*` input would stop seeing fixture changes and serve stale cache hits. Prettier must not reformat the samples because expected findings are pinned to line numbers.
- **Alternatives:** `.nxignore` (slice text): breaks cache correctness as explained.

## 2026-10-31: `globals` peer of eslint-plugin-vuejs-accessibility is not declared

- **Decision:** `@clear-a11y/repo` does not list `globals`; pnpm (and npm 7+) install the plugin's peer automatically.
- **Why:** `@nx/dependency-checks` rejects a dependency our code doesn't import.
- **Alternatives:** Declaring it and suppressing the lint rule.

## Requested core/browser changes

- **core `ExpectedIssueSchema`:** optional `source: { file: string; line: number }` (and `ExpectedPage.page` values like `repos/<name>/<file>`) if we later want one expected-findings format for site and repo layers. Not needed now; the repo benchmark has its own schema in the runner.
- **core `RuleMetaSchema.id`:** the regex `^[a-z0-9-]+\/[a-z0-9-]+$` allows one slash, but repo rule ids have two (`repo/jsx-a11y/alt-text`). Repo rules are therefore not added to `allRules()` (reports fall back to finding fields, which carry title-like messages and fixes). Allowing `^[a-z0-9-]+(\/[a-z0-9-]+)+$` would let `@clear-a11y/repo` export `RuleMeta` for every mapped rule.
- **core `layerOf`:** maps `repo-eslint` to `repo-eslint`; returning `repo` for engines starting with `repo-` would make "found by" tables group repo engines (S10 will add `repo-storybook`/runtime engines).

## Benchmark result (S09)

- Site benchmark unchanged: recall 0.973 (72/74), precision of `violation` 1.0 (64/64), noise on correct-pattern pages 6 (same as main).
- New repo layer (`fixtures/repos/react-sample`, `vue-sample`, 13 source files): recall 1.0 (14/14), precision of `violation` 1.0 (4/4), 18 findings (4 violation, 12 likely, 2 needs-review), 0 findings in correct-pattern files. These are seeded barriers written alongside the rules, so they show the layer works, not real-audit recall.

## 2026-10-31: Core changes applied at the S09 merge

- **Decision:** `RuleMetaSchema.id` accepts multi-segment ids (`repo/jsx-a11y/alt-text`); `layerOf('repo-*')` returns `repo`.
- **Why:** Requested by S09: repo rule ids carry the plugin name, and S10's runtime repo engines should group under the same layer.
- **Alternatives:** Flattening repo rule ids (`repo/jsx-a11y-alt-text`); loses the plugin/rule split used in docs and SARIF.

## 2026-10-31: Wave 5 overlaps with S10

- **Decision:** Wave 5 (S11 action, S12 queue + server, S13 MCP) starts once S08 is merged, while S10 (repo runtime) is still running.
- **Why:** Wave 5 shells only call the public `scan` / `scanRepo` APIs and don't touch `packages/repo` internals; waiting would idle three slices. Any `scanRepo` option added by S10 is wired into the shells at the wave 5 merge.
- **Alternatives:** Strict wave barrier; slower with no reduction in conflict risk.

<!-- From slice S08 (personas) -->
<!-- From slice S08 (personas) -->

## 2026-10-31: Personas are a registry engine, not a separate runPersonas step

- **Decision:** `createPersonaEngine(config, provider?)` in `@clear-a11y/ai` returns an `Engine` named `persona` (`mutatesPage: true`). It runs only in the default state, and on each page runs every task whose `match` fits `ctx.url`, each on a fresh load (`gotoAndSettle` between tasks). The runner registers it in `ENGINE_REGISTRY` under key `personas` with `enabled: (config) => hasPersonaTasks(config.personas)`; the AI planner gets `createProvider(config.ai)` only when `ai.provider !== 'none'`. Successful runs produce no finding; `engine.lastRuns()` exposes every run (successes included) for tests. No `ScanResult.personas[]` field was added.
- **Why:** The coordinator's task asked for a registry engine (the `enabled` hook exists since S07), which reuses the runner's fresh-page handling, timeout, error recording, dedupe and tier policy with a one-line registry change and no `scan.ts` edit (S09/S10 also touch the runner). A `ScanResult.personas` field would be a public result change; traces of blocked runs are in `evidence.data.trace` and the trace artifact.
- **Alternatives:** The slice file's `runPersonas(browser, tasks, provider)` step after page scans, with a `url` per task and `ScanResult.personas[]` (kept as a follow-up if success traces are wanted in reports).

## 2026-10-31: Task config: `match` + explicit step hints; engine names `persona-<constraint>`

- **Decision:** `config.personas` is validated in `ai` (`PersonaOptionsSchema`): `{ planner?: 'deterministic'|'ai', tasks: [{ id, goal, match, constraint: 'keyboard-only'|'screen-reader', success: { selector?, text?, urlIncludes? }, steps?: StepHint[], inputs?, maxSteps? (40, ≤200), planner? }] }`. `match` is a URL substring, or a glob with `*` (anchored at the end of the URL, query and fragment ignored). A step hint is `{ name?: string (case-insensitive substring), namePattern?: string (case-insensitive regex), role?: string, action: 'activate'|'type', text? }`; deterministic tasks need at least one step (checked at section level, so `personas.planner: 'ai'` lets tasks omit them). Findings use engine `persona-keyboard-only` / `persona-screen-reader` (core's `isAiEngine` and `layerOf` already treat `persona-*` as AI-tier and layer `persona`) and rule id `persona/task-blocked`.
- **Why:** Hints are explicit, JSON-serializable and testable, and match how an auditor writes a test script ("tick the terms, press Pay now"). Regex as a string keeps the config pure JSON. The slice file's `ai-persona-*` engine names were superseded by the coordinator's task and core's existing `persona-*` support.
- **Alternatives:** Parsing goals into targets with a synonym list (the slice file's heuristic policy): less predictable, harder to benchmark; kept for the AI planner instead.

## 2026-10-31: Deterministic planners only read their observations; a sighted cross-check names the element

- **Decision:** Keyboard planner: Tab until the focused element's visible name matches the hint, then Enter (Space first for checkbox/radio/switch), falling back to the other key when nothing changed; `unreachable` when Tab went all the way around (focus left the document and returned to a seen stop), `trap` when focus cycles without leaving even after one Escape, `not-operable` when neither key changed anything. Screen-reader planner: look up the hint by role + name in the flattened accessibility tree, `type` / `activate` by ref; `unnamed` when nodes of that role have empty names, `not-exposed` when nothing matches. "Changed" = DOM mutation count, URL, focused element or its checked/expanded/pressed/value state, or (screen reader) the tree digest. When the planner gives up, `resolveBlock` finds the blocking element for the report: the visible DOM element whose text best matches the hint (unreachable / not-exposed), or the DOM node behind a tree ref (unnamed). If no visible element matches, the cause becomes `target-not-found` (`needs-review`).
- **Why:** The persona must not cheat with DOM access it wouldn't have, but a finding needs a selector that lines up with other engines and the benchmark. Separating "why stuck" (persona) from "which element" (report) keeps both honest.
- **Alternatives:** Letting the planner query the DOM (would mask unexposed controls); reporting `body` as target (useless to developers and the matcher).

## 2026-10-31: Tiers and WCAG per cause

- **Decision:** `likely` (confidence 0.8) only when the deterministic planner was blocked by a measured fact (visible control never focused, focused control inert to Enter and Space, unnamed node, visible element missing from the tree, trap cycle) and no instruction-like page text was seen; everything else (`budget`, `success-not-met`, `target-not-found`, `focus-lost`, screen-reader `not-operable`, every AI-planned run) is `needs-review` (0.5) with "Could a keyboard-only user complete "<goal>" on this page?". WCAG: unreachable 2.1.1; not-operable 2.1.1 (keyboard) / 4.1.2 (screen reader); trap 2.1.2; focus-lost 2.4.3; unnamed 4.1.2; not-exposed 4.1.2 + 1.3.1; others 2.1.1 (keyboard) / 4.1.2 (screen reader). A focus loss (focus fell to body after an activation that changed the DOM, same URL) is recorded in the trace and becomes the cause only if the run later fails by budget or unmet success.
- **Why:** AGENTS.md: AI-tier engines are never `violation`; `likely` needs a strong signal. A focus drop alone doesn't block a keyboard user who can Tab again from the top, so it isn't a block by itself.
- **Alternatives:** Treating any focus drop as terminal (false positives on pages that intentionally re-render).

## 2026-10-31: Screen-reader refs are outline positions; text fields show their value

- **Decision:** The screen reader's view is CDP `Accessibility.getFullAXTree` flattened in document order (ignored and `generic`/`none` nodes dropped, children kept; text nodes repeating the parent's name dropped; only the deepest focused node marked focused). Refs are `n<position>` in the current outline, mapped internally to DOM backend ids. Text fields (`textbox`, `searchbox`, `combobox`, `spinbutton`) show `value="…"` and their inner text nodes are not listed. `activate` focuses the node and calls `click()` (a screen reader's default action in browse mode); `type` focuses it and types with the keyboard. Small AX helpers are copied from engine-at, not imported.
- **Why:** Backend ids differ between page loads, so recordings for the AI planner could never match them; positions are deterministic for a given page state. Typing into a field otherwise adds a text node and renumbers every later ref (found by the mock-provider integration test).
- **Alternatives:** Backend ids as refs (non-reproducible); accessible-name refs (ambiguous for unnamed or duplicate controls).

## 2026-10-31: AI planner: versioned prompts, same hardening, mock-only tests

- **Decision:** `prompts/persona-system.v1.md` (security rules, JSON action format) plus `persona-keyboard-only.v1.md` and `persona-screen-reader.v1.md` (one `{{page_data}}` slot). Page data (goal, page path without origin/query/fragment, `inputs`, visible text or tree outline capped at 120 lines, last 8 steps) goes only in the `<page_data nonce>` block. Answers are parsed with a zod schema into actions and validated against the constraint (a keyboard model can't `activate`; refs must be `n<digits>`; a model-supplied selector is never used); three invalid answers in a row end the run with `invalid-output`. `findInstructionLikeText` runs on the observation; a hit is reported and forces `needs-review`. Mock recordings key on `step` plus `focused` (keyboard) or `page` (screen reader). AI-planned tasks are skipped with a warning when the provider is `none`.
- **Why:** Same guarantees as the S07 judges; recordings stay deterministic and readable.
- **Alternatives:** Reusing `system.v1.md` (it demands a verdict JSON, wrong for actions).

## 2026-10-31: Fixtures and benchmark wiring

- **Decision:** Layer `persona`: `checkout-keyboard-blocked.html` (Pay now is a click-only `div`, `#pay`, 2.1.1/4.1.2), `basket-keyboard-not-operable.html` (`span role=button tabindex=0` that ignores Enter/Space, `#add`, 2.1.1), `signup-screen-reader-blocked.html` (icon-only button without a name, `#signup`, 4.1.2), each with an `-ok` page, plus `persona/ok.html` (the area's required correct-pattern page; a screen-reader task follows a link there). Tasks live in `fixtures/personas.json` (glob matches run each task on its barrier and `-ok` page). `runFixtureBenchmark({ personas })` merges the section into the scan config; `tools/bench` reads `fixtures/personas.json` when present (`fixturesPersonasFile()` added to test-utils). The basket barrier is found only by the persona; `#pay` is also found by engine-keyboard and `#signup` by axe (`button-name`).
- **Why:** Shows both kinds of value: confirming known barriers block a real task, and catching one no element-level rule catches.
- **Alternatives:** The slice file's focus-lost and silent-search fixtures (focus-lost is not a terminal cause by design; announcements are out of scope for now).

## 2026-10-31: Rule generator not used for persona/task-blocked

- **Decision:** `personaRule` metadata, the rule doc `docs/rules/persona/task-blocked.md` and the fixtures were written by hand / with the fixture generator. `allRules()` in the runner now includes `personaRule` (the AI judges' rules are still not included, as before).
- **Why:** The rule generator requires an engine package under `packages/engines/<name>`; personas live in `packages/ai` per the slice. Same situation as S07's judges.
- **Alternatives:** A `persona` engine package (would split the AI provider wiring across packages).

## 2026-10-31: S08 benchmark result

- **Decision:** Recorded `bench-results/s08-personas.{json,md}`: recall 0.974 (75/77, was 72/74), persona layer 3/3, violation precision 1.0 (65/65, was 64/64; the extra true positive is axe `button-name` on `#signup`), noise on correct pages 6 (unchanged, all pre-existing `static/color-contrast` needs-review on visual pages). No new findings of any tier on the new correct-pattern pages. Still missed: the two `ai/prompt-injection` issues (need a provider).
- **Why:** Benchmark is the judge.
- **Alternatives:** None.

## Requested core/browser changes

None required. Nice to have: export Playwright's `Route` type from `@clear-a11y/browser` (the persona engine uses `Parameters<Page['route']>[1]` to type its request guard).

<!-- From slice S10 (repo runtime) -->

## 2026-10-31: Booting a repo's dev server is opt-in only (`--boot` / `repo.boot`)

- **Decision:** The runtime layer never starts repo code on the host unless the user passes `--boot` (or sets `repo.boot: true`). Default for a repo scan is static lint plus, when a built `storybook-static/` exists, scanning its stories in the headless browser. `--boot` is ignored (with a note) when a Storybook is available. Flag name follows the coordinator brief (`--boot`) rather than the slice draft (`--run-dev-server`); `repo.runtime: false` turns the runtime layer off entirely.
- **Why:** A dev script runs arbitrary code (bundler config, plugins, server code) with the user's permissions; scanning an untrusted repo must never do that implicitly (AGENTS.md: repo content is untrusted). A built Storybook is static files: we serve them ourselves from 127.0.0.1 and their JavaScript runs only inside the browser sandbox, like any website we scan, so it is a safe default.
- **Alternatives:** Auto-boot when no Storybook is found (rejected: executes untrusted code by surprise); running the dev server in a Docker sandbox (out of scope; recorded as a follow-up idea).

## 2026-10-31: Never install dependencies, never build Storybook

- **Decision:** Clear A11Y only runs `<package manager> run <one dev script>`. If the package has dependencies and no `node_modules` (package or repo root), the runtime layer stops with a message telling the user to install them. `storybook build`/`storybook dev` are never run; an unbuilt Storybook gets a notice explaining `storybook build` or `--storybook-url`.
- **Why:** Installs run lifecycle scripts (`postinstall`) and hit the network; builds run repo config. Both are the user's call. Packages with no dependencies (like `fixtures/repos/static-app-sample`) don't need the check.
- **Alternatives:** `npm ci --ignore-scripts` (still network, still slow, still surprising).

## 2026-10-31: Dev-server lifecycle: own process group, always killed, readiness from output or port

- **Decision:** The dev script is spawned `detached` (its own process group on POSIX) with `PORT`/`HOST=127.0.0.1`/`BROWSER=none`/`CI=1`, and port flags appended only when the script runs the framework's dev command directly (`vite`, `next dev`, `ng serve`...). Readiness = the first localhost URL it prints (ANSI stripped), else the free port we picked, polled until any HTTP response. Stop = SIGTERM to the group, SIGKILL after 3 s (`taskkill /T /F` on Windows), in a `finally`, on boot failure/timeout, and from `exit`/SIGINT/SIGTERM/SIGHUP hooks. Integration tests assert the group is gone after success, timeout and crash.
- **Why:** Watchers (esbuild, webpack) survive killing only the npm process; servers pick other ports when busy; wrapped scripts (`concurrently`, `&&`) would receive appended flags in the wrong place.
- **Alternatives:** Calling `node_modules/.bin/<framework>` directly (bypasses the user's script and its env setup); polling only the port (misses servers that ignore `PORT`).

## 2026-10-31: Story findings use a stable repo-relative URL for built Storybooks

- **Decision:** A built Storybook is served on a random local port; story findings, pages and errors are rebased to `repo:<storybook-static dir>/iframe.html?id=<id>&viewMode=story` (ids recomputed with `findingId`). With `--storybook-url` the real URL is kept. `page.state` stays the engine state (`default`, `dialog:open#…`) rather than `story:<id>`; the story id is in the URL (`storyIdFromUrl`).
- **Why:** `findingId` hashes `page.url`; a random port would change every id on every run and break baselines and SARIF fingerprints. Keeping engine states intact keeps state dedupe and state replay working unchanged.
- **Alternatives:** Real ephemeral URL (unstable ids); `page.state = "story:<id>"` as in the slice draft (would collide with real states such as an open dialog inside a story). Dev-server findings keep their real URL (port changes between runs): noted as a limitation.

## 2026-10-31: Story → source fallback is the story's export line

- **Decision:** Runtime findings first go through S09's `mapFindingsToSource`, with hints (source attributes on the element or an ancestor, React debug info) read from a fresh load of the story or page for every finding's selector (also for elements of other states, which usually exist hidden). Findings still without a source get `{ file: <importPath resolved in the repo>, line: <line of the story's CSF export>, component: <story title> }` and `evidence.data.sourceMatch.strategy = "story-file"` (confidence 0.5).
- **Why:** Every story finding should be actionable in SARIF; the story file is always correct as a location even when the component can't be identified, and the export line is cheap to find (`storyExportLine`).
- **Alternatives:** Line 1 (less useful); leaving `source` empty (slice asks for importPath as the fallback).

## 2026-10-31: Runtime orchestration lives in the runner; `@clear-a11y/repo` stays browser-free

- **Decision:** `@clear-a11y/repo` gets `src/runtime/` with pure or Node-only pieces (story index parsing/selection, localhost checks, framework detection, command building, process management, `planDevServer`/`startDevServer`, `chooseRuntime`). `@clear-a11y/runner` gets `src/repo.ts` with `scanRepo` (static + runtime: serves `storybook-static` with `startStaticServer`, scans with `createScanner`, crawls the dev server, maps findings, merges). `createScanner` gained one optional `prepare(page)` hook (waits for `#storybook-root`). The CLI calls the runner's `scanRepo` and no longer depends on `@clear-a11y/repo` directly. The static-only `scanRepo` in `@clear-a11y/repo` is unchanged.
- **Why:** `repo` cannot depend on `runner` (cycle) and S09 designed it to never need a browser; feature → data-access (browser) is allowed for the runner, which already owns scanning.
- **Alternatives:** A browser dependency in `repo` (duplicates scanner logic).

## 2026-10-31: Choice order and Storybook details

- **Decision:** `chooseRuntime`: explicit `storybookUrl` → built Storybook (`storybookStatic` or detected `storybook-static/`) → dev server if `boot` → none (with a reason telling the user how to enable runtime checks; not reported as a scan error). Defaults: `maxStories` 50 (coordinator brief; slice draft said 200), `storyFilter` globs on id/title with `!` exclusions, `runtimeTimeoutMs` 600 s total budget, `bootTimeoutMs` 120 s. `index.json` v4/v5 and legacy `stories.json` v3 are read; `docs` entries are skipped. A story that shows Storybook's error display is recorded as a `repo-runtime` error. Storybook URLs must be localhost.
- **Why:** An explicit flag should win over a possibly stale build; a "runtime skipped" hint is not an error and would add noise to every static-only scan.
- **Alternatives:** Static first (slice draft order): surprising when the user explicitly passes a URL.

## 2026-10-31: Fake Storybook fixture and benchmark scoring of stories

- **Decision:** `fixtures/repos/storybook-sample/storybook-static/` is a hand-written, format-compatible stand-in (Storybook 8 `index.json` `v: 5`, 8 stories + 2 docs entries; `iframe.html` renders the story by `id` asynchronously into `#storybook-root` with plain JS). `expected.json` adds story issues (`story` + `selector`, scored like site issues on that story) next to source issues (`file` + `line`), and `correctStories`. The repo benchmark now runs the runner's full `scanRepo` (never `--boot`) and reports recall by layer and the number of stories. `static-app-sample` (dev script `node server.mjs --port 0`) is used by integration tests only, not by the benchmark, so the benchmark never executes fixture code outside the browser.
- **Why:** Offline, light CI; no Storybook or framework install; same scoring rules as the site benchmark.
- **Alternatives:** A real `storybook build` output checked in (megabytes of bundles, needs a toolchain to regenerate).

## 2026-10-31: ModalOk uses a document keydown listener

- **Decision:** The correct-pattern modal in `storybook-sample` registers its Escape/Tab handler on `document` in an effect instead of `onKeyDown` on the `role="dialog"` element.
- **Why:** jsx-a11y's `no-noninteractive-element-interactions` flags `onKeyDown` on `role="dialog"` although it is the APG pattern; a correct-pattern file must have zero findings. This is a known static-layer false positive (tier `likely`) worth revisiting in the rule map: dialogs could be exempted.
- **Alternatives:** Listing it as expected (it is not a barrier).

## Requested core/browser changes

None. (The `prepare` hook was added to `createScanner` in `packages/runner`, not to `@clear-a11y/browser`.)

## Benchmark (S10)

- Site: recall 97.3% (72/74), precision of `violation` 100% (64/64), noise on correct pages 6. Unchanged from main.
- Repo layer: recall 100% (20/20, was 14/14), precision of `violation` 100% (7/7), noise in correct-pattern files and stories 0. New: `storybook-sample` 6/6 (8 stories scanned with the full engine set; 5 story issues across static, widgets and keyboard layers plus 1 source issue). Runtime adds about 75 s to `bench:run`.

<!-- From slice S12 (queue + server) -->

## 2026-10-31: SQLite queue on node:sqlite; Node >= 22.13

- **Decision:** The SQLite queue uses Node's built-in `node:sqlite` (`DatabaseSync`), imported lazily inside `createSqliteQueue`. Root `engines.node` goes from `>=22.12.0` to `>=22.13.0` (the first 22.x where `node:sqlite` works without `--experimental-sqlite`; 22.x still prints an ExperimentalWarning, Node 24+/26 does not). Verified locally on Node 26.4 (SQLite 3.53): WAL, `UPDATE ... RETURNING`, restart recovery. `@clear-a11y/queue` and the server declare the same `engines`.
- **Why:** No native addon, nothing downloaded at install (better-sqlite3 fetches prebuilt binaries from GitHub, which the offline rule forbids), and nothing to rebuild for Electron.
- **Alternatives:** better-sqlite3 (binary download, Electron rebuilds); sql.js/WASM (whole DB in memory, manual persistence).
- **Open for S14:** confirm the Electron version chosen for desktop ships a Node with `node:sqlite` enabled. If it doesn't, desktop can use `createMemoryQueue` (same interface) until it does; the lazy import means loading `@clear-a11y/queue` never requires `node:sqlite`.

## 2026-10-31: Queue interface is claim-based, with a worker loop on top

- **Decision:** `JobQueue<TPayload, TResult>` exposes `enqueue/get/list/claim/heartbeat/complete/fail/cancel/recoverStale/subscribe/close`. The slice's `process(handler)` became a separate helper, `processJobs(queue, handler, { concurrency, signal, ... })`, that works over any implementation (heartbeats, progress via `ctx.report`, abort signal on cancel, periodic stale recovery). `waitForJob` polls across processes. `attempts` counts claims; `fail(..., { retry: true })` re-queues while `attempts < maxAttempts`. Cancel of a running job is cooperative: `heartbeat` returns `{ cancelled: true }` and later `complete`/`fail` are ignored. Events (`subscribe`) are per instance; cross-process callers poll.
- **Why:** The coordinator's brief asked for claim/heartbeat/complete/fail, and a claim-based core is what lets the same loop run on memory, SQLite and BullMQ (BullMQ's manual `getNextJob` / `moveToCompleted` / `moveToFailed` / `extendLock`). One contract suite (`runQueueContract`, exported from `@clear-a11y/queue/testing`) covers all three.
- **Alternatives:** Only `process(handler)` per implementation (three copies of the loop, harder to test); BullMQ's own `Worker` processor (no claim primitive for memory/SQLite parity).

## 2026-10-31: No ResultStore abstraction; results are files, job results are summaries

- **Decision:** The slice sketched a `ResultStore` in the queue package. Instead, a job's `result` is a small `ScanJobResult` (`resultRef`, `summary`, page/error counts) and the server stores the full `ScanResult` at `DATA_DIR/scans/<id>/report.json`, next to the screenshot crops the scan writes to `artifacts/` (which the HTML report embeds).
- **Why:** Screenshots are files anyway, so results need a directory per scan; a second storage interface (SQLite blob vs Redis vs file) adds code without a user. With BullMQ and several servers, `DATA_DIR` must be a shared volume (documented).
- **Alternatives:** Results table in SQLite (screenshots would still need files); results in Redis (memory pressure for large scans).

## 2026-10-31: BullMQ 6 + ioredis as optional peers of @clear-a11y/queue

- **Decision:** Catalog `bullmq: ^6.5.0`, `ioredis: ^5.11.1`. BullMQ 6 makes `ioredis` a peer dependency. In `@clear-a11y/queue` both are optional `peerDependencies` (and devDependencies for tests), loaded with dynamic `import()` only by `createBullQueue`; the server lists them as dependencies. Cancellation is a `cancelledAt` marker in the job's data (BullMQ has no cancelled state); a cancelled waiting job is discarded when a worker fetches it, and BullMQ's stalled checker replaces `recoverStale`. The adapter is typed against a structural subset of BullMQ so a fake (in `packages/queue/test/fake-bullmq.ts`) runs the full contract suite without Redis. The Redis contract suite runs only when `REDIS_URL` is set and logs a skip line otherwise.
- **Why:** The SQLite path and the desktop app never load or install-require Redis libraries; contributors and CI never need Redis.
- **Alternatives:** `ioredis-mock` (unreliable with BullMQ's Lua scripts, per the slice); hard dependencies (heavier installs for everyone).

## 2026-10-31: Server is an ESM tsc build, not the generated webpack bundle

- **Decision:** `apps/server` was generated with `@nx/nest:application` (`@nx/nest` 24.0.3 in the catalog; Nest 11, the range `@nx/nest` 24 supports), then switched from the generated webpack bundle to the same inferred `tsc --build tsconfig.lib.json` ESM build the CLI uses. The generator's webpack/`@nx/webpack`/`@nx/web`/`@nx/node` root devDependencies, the `@nx/webpack/plugin` entry in `nx.json`, and the root-level Nest dependencies it added were removed; Nest packages live in the catalog and in `apps/server/package.json`. Decorator flags (`experimentalDecorators`, `emitDecoratorMetadata`) are set only in `apps/server/tsconfig.*.json`. All constructor injection uses explicit `@Inject(TOKEN)`, so nothing depends on emitted type metadata (Vitest's transform doesn't need to emit it).
- **Why:** Our workspace libraries are ESM and use `import.meta.url` (runner reads its package.json); bundling them into CJS with webpack breaks that and adds a second build system. Nest 11 runs fine from ESM (verified: built server answers `/health` and validation requests).
- **Alternatives:** Keep webpack (CJS bundle + `require(esm)` of workspace packages; extra toolchain); Nest 12 (outside `@nx/nest` 24's peer range).

## 2026-10-31: Server API, env names and security defaults

- **Decision:** Endpoints: `POST /scans` (202), `GET /scans`, `GET /scans/:id`, `DELETE /scans/:id`, `GET /scans/:id/results` (canonical JSON), `GET /scans/:id/findings?tier=&wcag=`, `GET /scans/:id/report?format=html|sarif|json`, `GET /health`. Env: `HOST` (default 127.0.0.1), `PORT`, `CLEAR_A11Y_TOKEN` (alias `CLEAR_A11Y_API_TOKEN`, from the slice text; >= 16 chars; required when HOST is not loopback, else startup fails), `DATA_DIR`, `CLEAR_A11Y_DB`, `REDIS_URL`, `CLEAR_A11Y_WORKERS` (0-16), `ALLOWED_TARGETS`, limits (`CLEAR_A11Y_MAX_TARGETS` 20, `CLEAR_A11Y_MAX_PAGES` 50, `CLEAR_A11Y_MAX_TIMEOUT_MS` 120000, `CLEAR_A11Y_MAX_BODY_BYTES` 100000, `RATE_LIMIT_PER_MINUTE` 30), `CLEAR_A11Y_AI_KEY_ENVS`, `TRUST_PROXY`.
- **SSRF defaults:** http(s) only, no URL credentials; with `ALLOWED_TARGETS` only listed origins (`*.` wildcard for subdomains) and those may be private; without it, every resolved IP must be public (node:net `BlockList` of loopback/private/link-local/CGNAT/multicast/doc/6to4/NAT64/ULA ranges, IPv4-mapped IPv6 unwrapped). Checked at submission and again in the worker right before scanning. `config.targets` are checked too.
- **Config policy over the API:** core `ConfigSchema` strict at the top level; refused: `auth.storageState` (server file), `output.dir`, `crawl.sameOrigin: false`, `ai.baseUrl`, `ai.recordingsDir`, unknown `ai` keys (so pasted keys are refused, and never echoed). Remote AI only for `anthropic`/`openai` with `ai.apiKeyEnv` in `CLEAR_A11Y_AI_KEY_ENVS`; empty list = only `none`/`mock`. Other providers (bedrock, vertex, azure, ollama) can't be chosen over the API for now.
- **Why:** A scan server is an SSRF and secret-exfiltration target by design (a request picks URLs, and AI config could point the server's keys at another host). Defaults keep a laptop install private and make exposing it a deliberate step.
- **Alternatives:** Hostname-only checks (DNS rebinding); per-request AI keys (secrets in requests and logs).
- **Residual risk:** Redirects and DNS changes during a scan are followed by the browser and not re-checked per request. Fixing that needs a request hook in `@clear-a11y/browser` (below). Documented in the server README and docs/self-hosting.md.

## 2026-10-31: Runner gains onProgress and signal

- **Decision:** `ScanOptions` in `@clear-a11y/runner` gets optional `onProgress({ done, total, url? })` (before each page and at the end; observer errors ignored) and `signal` (checked before each page; `scan` rejects when aborted). Covered by a runner integration test.
- **Why:** The server reports per-page progress and stops cancelled scans between pages. Runner is not core, so this is in scope for the slice.
- **Alternatives:** Progress only per job (no feedback for long scans).

## 2026-10-31: Docker

- **Decision:** `apps/server/Dockerfile`, two stages on `mcr.microsoft.com/playwright:v1.61.1-noble` (matches catalog `playwright`/`@playwright/test` 1.61.1; Renovate's existing "playwright" group already covers the image), pnpm 9.15.4 via corepack, `pnpm nx run server:build`, `pnpm --filter @clear-a11y/server deploy --prod`, runtime as `pwuser`, `VOLUME /data`, `EXPOSE 3000`, `HEALTHCHECK` with `fetch` on `/health`. Ignore rules live in `apps/server/Dockerfile.dockerignore` (BuildKit's per-Dockerfile ignore file) so the repository root gets no new file. A `docker-build` target exists on `server` but is not part of any default target set and is never run in tests. Not built in this run (no network for base images).
- **Why:** Same browsers as the library, small runtime, non-root, offline-friendly build steps.
- **Alternatives:** Root `.dockerignore` (another root file; would affect other future images).

## Requested core/browser changes

- **`@clear-a11y/browser`: optional request filter on sessions.** e.g. `launchBrowser({ requestFilter?: (url: URL) => boolean | Promise<boolean> })` installed with `context.route('**/*', ...)`, plus the runner passing it through from `ScannerOptions`. The server would pass its SSRF check, closing the redirect / DNS-rebinding gap during scans (navigation, redirects and subresources would all be checked against the resolved IP). Not needed for correctness of S12; it hardens the exposed-server case.
- No `packages/core` changes needed.

<!-- From slice S13 (mcp) -->

## 2026-10-31: MCP SDK version and API

- **Decision:** `@modelcontextprotocol/sdk` `^1.32.2` (latest stable on the registry, added to the pnpm catalog), with `McpServer.registerTool` / `registerResource` and `StdioServerTransport`. Input schemas are zod v4 raw shapes (the SDK turns them into JSON Schema); every tool also declares an `outputSchema` and returns `structuredContent` plus a short human-readable text block.
- **Why:** 1.32 supports zod v4 (our catalog version) and output schemas, and validates arguments for us: invalid input comes back as an `isError` tool result the agent can read, not a protocol error. The text block is compact prose (not a JSON dump of `structuredContent`) so clients that show both don't pay twice for the same tokens.
- **Alternatives:** The low-level `Server` class with hand-written JSON Schemas (more code, schemas drift from validation); no output schemas (clients lose typed results). Output schemas use loose objects for findings so new Finding fields don't break clients that validate strictly.

## 2026-10-31: apps/mcp built like the CLI (library with a bin)

- **Decision:** Generated with `@nx/js:library` (tsc, vitest, eslint) at `apps/mcp`, package `@clear-a11y/mcp`, project `mcp`, tags `type:app scope:mcp publish:public`, `bin: clear-a11y-mcp -> dist/main.js`. `SKILL.md` and `README.md` ship in the package (`files`) and `SKILL.md` is in the `exports` map.
- **Why:** Same reasoning as the CLI: it is published to npm and should depend on our packages rather than bundle them. Runtime deps are public only (core, browser, runner, repo, reporter); `test-utils` is a devDependency used by the integration test.
- **Alternatives:** `@nx/node:application` (bundles; wrong for an npm package).

## 2026-10-31: keyboardWalk lives in runner

- **Decision:** `packages/runner/src/keyboard-walk.ts` exports `keyboardWalk(url, { viewport?, maxStops?, timeoutMs?, session? })` and the pure `backwardJumpsOf(stops)`. It loads the page, installs the browser helpers and runs engine-keyboard's `walkFocus`, marking backward stops with engine-keyboard's `isBackwardJump` (the same check its rule uses) and reporting `detectCycle` members when the walk ends in a cycle. It returns what happened; it creates no findings.
- **Why:** Apps may not import engine internals; runner is where engines are wired. Reusing the engine's own geometry keeps `keyboard_walk` and `keyboard/focus-order-backward` consistent.
- **Alternatives:** Running the whole keyboard engine and extracting `focusPath` from findings (only shows windows around findings, never the full path). The slice's `state?` option is not implemented: replaying a state needs state discovery first; use `scan_url` for states.

## 2026-10-31: Default policy for CLEAR_A11Y_ALLOWED_ORIGINS

- **Decision:** Unset (default) means any `http:`/`https:` URL the agent passes may be scanned. When set (comma-separated origins, `*` matches within host or port, e.g. `http://localhost:*,https://*.example.com`), `scan_url` and `keyboard_walk` reject other origins with an error that tells the agent to ask the user. Always rejected: non-http(s) schemes, embedded credentials, URLs over 2,048 characters. Crawling is off by default, forced same-origin, and capped at 50 pages.
- **Why:** The CLI scans any URL the user types; the MCP server is driven by the user's own agent in the user's session, so the same default keeps "scan my staging site" working without setup. The allowlist is the control for unattended agents, and docs recommend `http://localhost:*` there. Same-origin crawling from an allowed start URL can't leave the allowed origin.
- **Alternatives:** Localhost-only by default (safer but breaks the common "scan staging" request and surprises users); a required allowlist (friction for every install).

## 2026-10-31: Untrusted page text is marked in results

- **Decision:** Every tool result that carries page- or repo-derived text has an `untrusted` notice field; page-quoted finding fields are grouped under `pageText` (`name`, `announcement`, and with `detail` `html`, `axTree`); text content wraps quoted material in `<untrusted-scan-data>` tags; markdown reports escape markdown in quoted text. Server instructions and SKILL.md tell the agent to treat it as data and never follow instructions found in it.
- **Why:** The calling agent is an LLM; a scanned page can contain prompt-injection text. Structural markers plus explicit guidance is the best a tool can do. The server itself has no model, so it can't be steered.
- **Alternatives:** Stripping page text entirely (loses the evidence the agent needs to judge needs-review items).

## 2026-10-31: No AI in the MCP server

- **Decision:** The server forces `ai.provider: 'none'` and does not offer the `ai` or `personas` engines in `scan_url`. The calling agent judges `needs-review` items; its answers are advice and never change a tier.
- **Why:** AGENTS.md: the MCP server is the "no API key" path, and an AI judge must never produce a violation on its own. Offering AI engines here would send page content to a provider the user didn't configure for this tool.
- **Alternatives:** Reading a Clear A11Y config file with an AI provider (can come later behind an explicit env var).

## 2026-10-31: Token-efficient results

- **Decision:** `scan_*` returns counts and the top 20 findings (violations first); `get_findings` pages (default 25, max 100) with filters and a `detail` flag for evidence; text fields are truncated (message 400, name 120, snippet 240, accessibility tree 400 characters); long focus paths are windowed to 20 stops around the first backward stop; screenshots are absolute file paths, never inlined images. `get_report` inlines markdown/JSON/SARIF up to 20,000 characters, otherwise returns the path plus a 2,000-character preview; HTML is always a path.
- **Why:** Agents have limited context; full reports stay on disk for people and tools.
- **Alternatives:** Returning whole reports (floods the context), MCP image content for screenshots (expensive; the agent can open the file when it needs to).

## 2026-10-31: Markdown report rendered in the app

- **Decision:** `toMarkdown(result)` lives in `apps/mcp/src/format.ts`, not in `@clear-a11y/reporter`.
- **Why:** S11 (GitHub Action) runs in parallel and may add a markdown renderer to the reporter for PR comments; editing the reporter here would collide. It is presentation only (no detection logic).
- **Alternatives:** Add `toMarkdown` to the reporter now. Follow-up: once S11 merges, move to a shared reporter function if one exists and delete this copy.

## 2026-10-31: Scan store and artifacts

- **Decision:** In-memory LRU of recent scans (default 20, `CLEAR_A11Y_MCP_MAX_SCANS`); artifacts and reports on disk under `CLEAR_A11Y_MCP_OUT_DIR` (default `<cwd>/.clear-a11y/mcp/<scanId>/`), each scan writing `report.json`. Eviction forgets the scan in memory but keeps its files. Scan ids are `s-<base36 time>-<6 hex>`. Recent scans are also MCP resources (`clear-a11y://scans/{scanId}`, list-changed notifications after each scan), and `SKILL.md` is the resource `clear-a11y://skill`. One shared headless browser is launched on first use and closed on SIGINT/SIGTERM/stdin close.
- **Why:** Matches the slice; keeps tool calls fast after the first launch; resources let agents that don't load skills still find the workflow.
- **Alternatives:** Persisting the index across restarts (not needed yet; the files are there).

## 2026-10-31: scan_repo runtime options pass through config

- **Decision:** `scan_repo { storybookStatic?, runDevServer? }` validates the inputs (storybookStatic must be an existing directory; resolved inside the repo when relative) and passes them as `config.repo.storybookStatic` and `config.repo.runtime: 'dev-server'` (only on an explicit `true`). Today's `scanRepo` is static only, so the result says "Runtime repo scanning ... is not available in this version" when they were requested, and "source lint only" otherwise (detected by whether any scanned page has a real viewport).
- **Why:** S10 (repo runtime layer) runs in parallel and its slice names exactly these config keys. The notice adapts automatically once runtime pages appear.
- **Alternatives:** Waiting for S10. **Merge note:** S10's slice puts the runtime phase in `packages/runner/src/repo.ts`; when it lands, point `apps/mcp/src/tools/scan-repo.ts` at that runner entry point (one call) instead of `@clear-a11y/repo`'s `scanRepo`.

## 2026-10-31: stdout hygiene

- **Decision:** `main.ts` redirects `console.log/info/debug/trace/dir` to stderr before dynamically importing the server and scanner; the logger writes to stderr (`CLEAR_A11Y_LOG_LEVEL`, default `warn`). The stdio integration test fails on any protocol parse error.
- **Why:** stdout is the JSON-RPC channel; one stray log line from a dependency breaks the client.

## Requested core/browser changes

None.

## 2026-10-31: MCP scan_repo uses the runner's combined scanRepo

- **Decision:** At the S13 merge, `apps/mcp` `scan_repo` calls `scanRepo` from `@clear-a11y/runner` (S10: static + Storybook + opt-in dev server). `runDevServer: true` maps to `repo.boot: true`; when no runtime layer ran, the notice includes S10's reason. `@clear-a11y/repo` is no longer a direct dependency of the MCP app.
- **Why:** S13 was built in parallel against the static-only `scanRepo`; S10 moved the combined entry point into the runner.

<!-- From slice S11 (action) -->

## 2026-10-31: The action is a node24 JavaScript action bundled with esbuild

- **Decision:** `apps/action/action.yml` uses `runs.using: node24` with `main: dist/index.js`. `pnpm nx build action` (an explicit `nx:run-commands` target running `scripts/bundle.mjs`) produces one ESM bundle with every JS dependency inlined, read from workspace TypeScript sources via the `@clear-a11y/source` condition. `playwright-core` is kept external and copied to `dist/node_modules/playwright-core`; imports of `playwright` are redirected to it (it is a pure re-export). The bundle is ~23 MB (TypeScript, ESLint and axe-core dominate), `dist/` ~37 MB with playwright-core. Type checking stays on the inferred `typecheck` target (tsconfig.lib.json now emits to `out-tsc/lib` so it never writes into `dist/`).
- **Why:** GitHub runs `main` without installing anything, so a self-contained bundle is the only way to run without network installs per run. node24 is supported by GitHub-hosted runners (node20 actions are deprecated). Playwright reads `package.json`, `browsers.json` and `lib/` files relative to `__dirname`, so inlining it breaks; copying the zero-dependency package next to the bundle works and is verified by an integration test that runs a copy of `dist/` outside the workspace.
- **Alternatives:** Composite action running `npx clear-a11y` (downloads the CLI every run, needs network, version drift, and the CLI has no changed-files or summary logic). Docker action (Linux only, large image pull per run, slow start). Bundling `playwright-core` with an esbuild plugin that rewrites its `__dirname` lookups (fragile across Playwright releases).

## 2026-10-31: Bundling workarounds

- **Decision:** The bundle banner defines `require`, `__filename` and `__dirname` for bundled CommonJS code; a small esbuild plugin replaces `require.resolve("<bare package>")` in bundled node_modules files with the package name (eslint-plugin-vuejs-accessibility's legacy config and fdir's picomatch probe call it at load time); `mainFields` is left at esbuild's Node default (`main` first) because esquery's ESM build breaks ESLint's `require("esquery")`.
- **Why:** Each was a runtime failure found by running the bundle outside the workspace. The `require.resolve` calls only record or probe a path; the package is inlined anyway.
- **Alternatives:** Shipping a production `node_modules` with the action (large, slow checkout of the action repo, platform-specific binaries).

## 2026-10-31: Browsers are installed by the workflow, pinned to the bundled Playwright

- **Decision:** The action does not download browsers. Users add `npx --yes playwright@1.61.1 install --with-deps chromium` before it. When Chromium can't be launched, the action fails with that exact command, with the version read from the bundled playwright-core.
- **Why:** Browser downloads are large and cacheable in the workflow; `--with-deps` needs `sudo`, which belongs in the workflow, not inside an action. The browser build must match the bundled Playwright, hence the pinned version. Runs that only lint source files need no browser.
- **Alternatives:** Installing browsers inside the action via the bundled Playwright CLI (≈150 MB per run unless the user configures caching, and OS packages still need a separate step).

## 2026-10-31: Changed files come from local git, not the GitHub API

- **Decision:** `changedFilesFromGit` (`packages/repo/src/changes/git.ts`) runs `git diff --name-only -z --diff-filter=d base...head` with the SHAs from the event payload (`pull_request.base/head.sha`; `push` uses `before..after`; `merge_group` uses base/head). Refs are validated so they can't be read as git options. Missing history produces an error that mentions `fetch-depth: 0` and shallow clones. Unsupported events (or `base-sha`/`head-sha` not set for them) fall back to scanning everything configured, with a summary note and a warning.
- **Why:** Works offline, needs no token, and is identical in tests (temp git repos) and CI. Three-dot diff matches the pull request's "Files changed" view. Deleted files have nothing left to scan.
- **Alternatives:** `GET /repos/{owner}/{repo}/pulls/{n}/files` (needs a token and network, paginates at 3000 files, untestable offline).

## 2026-10-31: Target mapping rules

- **Decision:** `targetsForChanges` maps changed files to (1) routes from the route map globs (`globToRegExp` from the repo layer), (2) Next.js routes from `app/**/page|layout|template|loading|error|not-found|default.*` and `pages/**` when Next.js is detected (route groups dropped; dynamic segments, parallel slots, intercepted routes and API routes skipped with a note), (3) stories whose importPath is the changed file, whose recorded `componentPath` is the changed file, or that are a `*.stories.*` sibling with the same base name (or any story next to a changed `index.*`), and (4) changed lintable files (`jsx, tsx, js, vue, html`) under the detected source folders that are not tests, stories, build output or dot-folders. When nothing maps to a route or story, `defaultTargets` are used; otherwise nothing is scanned and the summary says so. Story index paths are resolved relative to the folder that contains `storybook-static`.
- **Why:** Deterministic, cheap and explainable in the summary. Import-graph analysis ("which stories import Button") would need a module resolver for every bundler setup; the sibling convention covers the common case and the route map covers the rest.
- **Alternatives:** Scanning every route on every PR (slow, noisy); a dependency graph via TypeScript's module resolution (heavy, fragile in monorepos; can be added later behind the same function).

## 2026-10-31: Route maps cannot leave the base URL origin

- **Decision:** Routes and default targets must be paths starting with `/`; they are resolved against `base-url` (keeping its path prefix) and anything resolving to another origin is rejected.
- **Why:** The route map lives in the repo and a pull request can edit it. AGENTS.md: never crawl sites without the user's explicit target list.
- **Alternatives:** Allow absolute URLs (would let a PR point the runner at arbitrary hosts).

## 2026-10-31: Static lint of changed files reuses scanRepo unchanged

- **Decision:** The action calls `scanRepo` with `repo.include` set to the shallowest folders containing the changed source files, then `limitResultToFiles` keeps findings, pages and parse errors of the changed files (repo-wide notices are kept).
- **Why:** Avoids touching S09/S10 files in `packages/repo` while S10 runs in parallel. Linting a few folders is fast.
- **Alternatives:** A `files` option on `scanRepo`/`lintRepo` that lints exactly the given files (cleaner; suggested as a follow-up once S10 has merged).

## 2026-10-31: Stories are scanned as pages from a local server

- **Decision:** With `storybook-static`, the action serves it with `startStaticServer` and scans each matched story's `iframe.html?id=<id>&viewMode=story` in the same `runner.scan` call as the routes (one browser session, capped by `max-pages`). Runtime findings are not source-mapped by the action.
- **Why:** S10 (the Storybook runtime layer in `@clear-a11y/repo`) is being built in parallel; this works today with the existing engines and can be swapped for S10's story scanner (plus `mapFindingsToSource`) at merge without changing inputs.
- **Alternatives:** Waiting for S10 (blocks the action), or skipping stories.

## 2026-10-31: Markdown summary escaping policy

- **Decision:** `toMarkdownSummary` (reporter) escapes page-derived text with `escapeMarkdown` (HTML specials to entities, all Markdown-significant ASCII punctuation backslash-escaped, whitespace collapsed, zero-width space after `@` and `#`, truncated) and `markdownCode` (code span with a fence longer than any backtick run, `|` escaped inside tables). Only links we generate (W3C Understanding URLs) are Markdown links. The only HTML in the output is our own `<details>`/`<summary>`.
- **Why:** Job summaries and PR comments render GitHub Markdown; page text must not inject HTML, links, images, table cells, headings or mentions. Code spans show selectors exactly while rendering nothing.
- **Alternatives:** Stripping characters (loses information people need to find the element); HTML-only escaping (leaves Markdown links and mentions).

## 2026-10-31: Optional PR comment, off by default

- **Decision:** `comment: true` plus `github-token` creates or updates one bot comment identified by a hidden marker, using `fetch` against `GITHUB_API_URL`. Failures (for example the read-only token of fork PRs) are warnings. Tests inject a fake `fetch`.
- **Why:** The task allows it behind a token; it is the only network call the action can make and it stays opt-in.
- **Alternatives:** `@actions/github` (Octokit; larger bundle for two requests).

## 2026-10-31: Inputs differ slightly from the slice text

- **Decision:** Inputs follow the coordinator's task: `base-url` (slice: `url`), `routes` as a JSON route map or JSON file path (slice: newline `routes` + `route-map`), `out-dir` holding `report.sarif`/`report.html` (slice: `sarif-file` + `report-dir`), outputs `sarif-path`/`report-path`. Added `default-targets`, `base-sha`/`head-sha`, `artifact-name`, `comment`/`github-token`, `json-path`, `changed-files`, `scanned-targets`. YAML route maps are not supported (JSON only; no YAML parser dependency). A unit test keeps `action.yml` inputs in sync with the parser.
- **Why:** The task is the more recent instruction; one route map input is simpler than two.
- **Alternatives:** Supporting both naming schemes (more surface, no benefit before 1.0).

## 2026-10-31: New third-party dependencies

- **Decision:** Added to the pnpm catalog: `@actions/core` ^3.0.1 (inputs, outputs, annotations; ESM) and `esbuild` ^0.28.2 (devDependency of the action, bundling only).
- **Why:** `@actions/core` is GitHub's own toolkit for the runner's file commands (`GITHUB_OUTPUT` delimiters etc.). esbuild is the standard bundler for JavaScript actions; Vite 8 (rolldown) is not set up for Node CLI bundles here.
- **Alternatives:** Hand-written output file commands (easy to get the delimiter handling wrong); `@vercel/ncc` (wraps webpack, slower, less control over externals).

## Notes for the coordinator

- `docs/repo-scanning.md` and `packages/repo/README.md` were not edited, to avoid conflicts with S10. After merge, add a short "Change sets" section pointing at `targetsForChanges`, `allTargets`, `changedFilesFromGit`, `limitResultToFiles` and `mergeScanResults` (documented in `docs/github-action.md`).
- When S10 lands: consider replacing the action's story scanning with S10's Storybook runtime layer plus `mapFindingsToSource`, so story findings get source locations in SARIF; and consider a `files` option on `scanRepo` instead of include + filter.
- Committing `apps/action/dist` for releases (wave 7) must also commit `dist/node_modules/playwright-core`.

## Requested core/browser changes

None.

<!-- From slice S14 (desktop) -->

## 2026-10-31: Project created with @nx/js:library; explicit run-commands targets

- **Decision:** `apps/desktop` (package `@clear-a11y/desktop`, project `desktop`, tags `type:app scope:desktop publish:private`) was generated with `@nx/js:library` (vitest, eslint), then its `tsconfig.lib.json` was replaced by `tsconfig.app.json` (main, preload, shared), `tsconfig.renderer.json` (Preact UI, DOM lib) and `tsconfig.spec.json`, so the `@nx/js/typescript` plugin infers `typecheck` but not a `tsc` build. Explicit `nx:run-commands` targets: `build-main` (esbuild), `build-renderer` (Vite), `build` (noop depending on both), `start`, `package`, `fetch-electron`; `test-integration` depends on `build`.
- **Why:** Nx has no official Electron plugin. The app needs three bundles (ESM main, CommonJS sandboxed preload, browser renderer), which is custom work AGENTS.md allows as explicit targets.
- **Alternatives:** Community `nx-electron` (unofficial, lags Nx majors); Electron Forge (its own build pipeline and plugins duplicate Vite/esbuild).

## 2026-10-31: Electron 45.2.1; the binary is never downloaded by pnpm install

- **Decision:** Catalog `electron: 45.2.1` (exact, Electron convention), `electron-builder: 26.18.0`, `preact: ^10.29.8`. Root `package.json` sets `"pnpm": { "neverBuiltDependencies": ["electron"] }`. Verified with pnpm 9.15.4 that the setting is honoured (a local package with a postinstall listed there did not run its script; without the setting it did). The binary is fetched only by `pnpm nx run desktop:fetch-electron` (`node node_modules/electron/install.js`). No mirrors, no GitHub fetches anywhere in install, build or tests.
- **Finding:** Electron 45's npm package has **no install script at all**. Instead `index.js` downloads the binary the first time anything calls `require('electron')` from plain Node (and Playwright's `_electron.launch()` without `executablePath` does exactly that). So `scripts/electron.mjs` and the smoke test locate the binary via `node_modules/electron/path.txt` + `dist/<path>` and never require the package; the main bundle keeps `electron` external (resolved by the Electron runtime itself).
- **Why:** The offline policy (registry access only). `neverBuiltDependencies` still guards against a future Electron version bringing a postinstall back.
- **Alternatives:** `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in every environment (easy to forget, and irrelevant for Electron 45's lazy download).

## 2026-10-31: node:sqlite in Electron 45: expected, not verified here; runtime fallback

- **Decision:** The main process uses `createSqliteQueue` (queue name `desktop-scans`) and a `calibration_answers` table in `userData/clear-a11y.db`, both via `node:sqlite` loaded lazily. If loading fails, the app falls back to `createMemoryQueue` and a JSON calibration file, and Settings > About says history lasts until quit. The smoke test logs Electron's `process.versions.node` and asserts the answer lands in SQLite.
- **Why:** Electron 45 bundles a Node 22.x/24.x line (both have `node:sqlite` unflagged since 22.13), but whether Electron compiles the module in could not be checked offline: the npm package carries no version manifest, the binary is not on this machine, and the release metadata lives on GitHub/electronjs.org (outside the allowed network). The fallback keeps the app usable either way. Answer this when the smoke test first runs with the binary (the log line prints the Node version).
- **Alternatives:** `better-sqlite3` (native module, needs rebuilding for Electron's ABI and a download or compiler).

## 2026-10-31: API keys are never stored (env var names only); no safeStorage

- **Decision:** Settings hold provider, model, base URL and the **name** of the environment variable with the key (`apiKeyEnv`); keys are read from the environment at scan time by `@clear-a11y/ai`. The UI shows only whether each relevant variable is set. Messages are scrubbed of key values. The slice's `safeStorage` key entry was not built.
- **Why:** The coordinator's task says keys are never stored by the app, which matches docs/providers.md ("Keys come from the environment only") and the CLI/server. Storing secrets would add an encrypted-at-rest code path, a renderer input for secrets and a second policy to document.
- **Alternatives:** `safeStorage` (slice text): rejected for the reasons above; it can be proposed later as an RFC if users ask for it.

## 2026-10-31: Providers offered: none (default), anthropic, openai, azure, ollama

- **Decision:** Bedrock and Vertex are left out of the picker (the AI package throws "not yet implemented" for them) and `mock` is test-only. "Test connection" validates the config through `createProvider`, refuses with the variable name when the key is missing (nothing sent), and otherwise sends one 16-token request with no page content, only when the user presses the button.
- **Why:** Offering providers that always fail is confusing; a connection test must not send page data.

## 2026-10-31: UI with Preact 10 + Vite; renderer talks only to window.clearA11y

- **Decision:** Preact 10 (native elements first, hooks), built by the workspace's Vite 8 (oxc JSX transform, no plugin). The renderer imports no Node or core runtime code; main enriches data (WCAG titles via `getSuccessCriterion`, focus layout via the reporter's `layoutFocusPath`, screenshots via `screenshotDataUri`). One `createBridge(invoke, subscribe)` builds `window.clearA11y` for the preload and for the test stand-ins.
- **Why:** Small (about 15 kB gzipped JS), no extra build plugins; one bridge implementation keeps tests honest.
- **Alternatives:** React 19 (bigger, needs `@vitejs/plugin-react` for the usual setup); plain DOM code (more code for the same views).

## 2026-10-31: Custom app scheme, CSP and the embedded HTML report

- **Decision:** The renderer is served from a privileged `clear-a11y://app/` scheme (`protocol.handle`, files only inside `dist/renderer`), with the CSP as a response header and a meta tag. The full HTML report is an `<iframe sandbox="" srcdoc>`; because a srcdoc frame inherits the parent's CSP and the report uses inline styles, `style-src` includes `'unsafe-inline'`. `script-src` is `'self'` only, and the report frame runs no scripts at all (`sandbox=""`; the report is fully readable without JavaScript). Frame navigation is allowed only for `about:srcdoc` (plus in-page fragments); http(s) links go to the system browser.
- **Why:** Electron's checklist recommends custom protocols over `file://`. A separate `BrowserWindow`/`WebContentsView` for the report would be untestable without the Electron binary.
- **Alternatives:** CSP hashes for each inline style attribute (the report's focus-path overlay uses per-stop `style` attributes; impractical).

## 2026-10-31: Browser install is a user-triggered child process

- **Decision:** "Install browser" runs `<playwright>/cli.js install chromium` with `process.execPath` and `ELECTRON_RUN_AS_NODE=1`, parsing its progress lines. Offline errors become a plain message pointing at "Use an existing browser folder", which stores a Playwright browsers folder in settings; `main.ts` sets `PLAYWRIGHT_BROWSERS_PATH` from it before Playwright loads (Playwright reads it at load), so it applies after a restart.
- **Why:** The Playwright CLI is a public interface; its registry internals are not exported. Tests inject a stub installer; nothing downloads in tests.
- **Alternatives:** Importing `playwright-core/lib/server/registry` (not in the package's exports map).

## 2026-10-31: Hash routes in the app, ?view= deep links for the dogfood scan

- **Decision:** In-app navigation uses `#/<view>/<scanId>`; the router also accepts `?view=<view>&scan=<id>` when there is no hash. The dogfood scan uses the `?view=` form.
- **Why:** See "Engine issues found while dogfooding" below: engines reload between probes with `page.goto(url)`, which does not reload a page whose URL already matches including the fragment.

## 2026-10-31: Dogfood result: zero findings of any tier on all six views

- **Decision:** `test/dogfood.integration.test.ts` scans Targets, Scans, Report, Focus path, Review and Settings (fake bridge with real scan data) with all engines and asserts zero findings of any tier (the requirement is zero violations). Fixes made on the way: the scan picker made the page 633px wide at 320px (1.4.10 violation); focus-path numbers became CSS generated content like the HTML report's (they overlapped at small scale); `<details>` replaced by button disclosures; zero counts and empty messages rendered as strings or nothing (see below).
- **Why:** Practice what we test.

## 2026-10-31: Engine issues found while dogfooding (follow-ups, not fixed here)

- **Decision:** Recorded for the engine owners; the UI was adjusted instead of changing engines in this slice.
  1. **Fragment URLs are not reloaded between probes.** `gotoAndSettle(page, url)` on a page already at `url` (same fragment) is a same-document navigation, so "fresh page" probes in engine-at (button probe) and engine-widgets (disclosure Enter/Space/click on a fresh page) see the state left by the previous probe. Symptom here: `widgets/disclosure-keyboard` "responds to Enter but not to Space" on a working native button. Hash-routed SPAs will hit this. Fix belongs in `@clear-a11y/browser` (see request below).
  2. **Text inside a closed `<details>` is measured as laid out.** engine-visual reported `visual/text-overlap` and `visual/text-spacing-clipped` for `<dd>`/`<li>` inside closed `<details>` at 320px (Chrome's closed details content is `content-visibility: hidden`, which `checkVisibility()` without `contentVisibilityAuto`/rect checks does not treat as hidden). Likely false positives on any page with collapsed details.
  3. **Preact rewrites falsy text nodes on every render** (`0`, `''`), which engine-at's recorder (a MutationObserver) reports as `at/status-message-not-announced` ("shows '0'"). Not an engine bug, but worth a note in the rule docs: re-setting identical text is reported. The UI renders counts as strings and empty messages as nothing.

## 2026-10-31: Packaging configured, not run; `nx build desktop` builds bundles only

- **Decision:** `electron-builder.yml` targets an unpacked `--dir` build; `desktop:package` passes `electronDist` (the fetched binary) so electron-builder does not download Electron. `pnpm nx build desktop` produces the three bundles, not an unpacked app (the slice's acceptance item), because packaging needs the Electron binary. Packaging was not run here.
- **Why:** Offline policy; no binary on this machine.
- **Open:** electron-builder with pnpm's symlinked workspace packages may need `node-linker=hoisted` or a deploy step (`pnpm deploy`) when packaging is first exercised in the release wave.

## 2026-10-31: Electron smoke test: skipped here (blocked by the offline policy)

- **Decision:** `test/electron.integration.test.ts` (Playwright `_electron`: web preferences, blocked navigation, add target, scan, answer a review question, read it from SQLite) runs only when the binary exists, and is otherwise skipped with a logged reason. It **did not run on this machine**: the Electron binary is not installed and fetching it from GitHub releases is outside the allowed network. `xvfb-run` is not available here either (macOS); on Linux without a display the test skips and the README documents `xvfb-run -a pnpm nx run desktop:test-integration`.
- **Why:** Everything except the Electron shell (main services, IPC handlers and validation, security settings, renderer, real scans) is covered without the binary by unit tests, the renderer integration test and the dogfood scan.

## 2026-10-31: Small reporter export

- **Decision:** `@clear-a11y/reporter` now exports `screenshotDataUri` (and `MAX_SCREENSHOT_BYTES`), already used internally by `toHtml`.
- **Why:** The desktop main process inlines screenshot crops for the report and focus views with the same path-escape and size checks as the HTML report, instead of duplicating them in an app.

## Requested core/browser changes

- **browser:** `gotoAndSettle` (or a new `freshPage`/`reload` helper used by engine probes) should force a real reload when the target URL equals the current URL including its fragment, for example `page.goto('about:blank')` first or `page.reload()` when `page.url() === url`. See "Engine issues found while dogfooding", item 1.
- **browser:** `LaunchOptions.executablePath` (passed to `chromium.launch`), so the desktop app can use a browser the user located without restarting to set `PLAYWRIGHT_BROWSERS_PATH`.

## 2026-10-31: Browser fixes applied at the S14 merge

- **Decision:** `gotoAndSettle` forces a real reload (via `about:blank`) when the target URL differs from the current one only by its fragment (`isSameDocument`); `LaunchOptions.executablePath` lets callers use a located Chromium build.
- **Why:** Found while dogfooding the desktop renderer: in hash-routed apps, engines' "fresh page" probes saw leftover state and produced a false `widgets/disclosure-keyboard` finding. Integration test proves leftover state is gone after a same-document reload.
- **Alternatives:** Fixing each engine's probe; the bug is in the shared helper.

## 2026-10-31: Electron smoke test skipped (offline policy)

- **Decision:** The Electron smoke test and packaging are configured but skipped here: the Electron binary comes from GitHub releases, which the bootstrap's network policy forbids. `pnpm nx run desktop:fetch-electron` fetches it (users, CI).
- **Why:** AGENTS.md / run mode: network only to package registries.

<!-- From slice S15 (docs site) -->

## 2026-10-31: Docs framework is Astro Starlight

- **Decision:** `apps/docs` uses Astro 7.4 with `@astrojs/starlight` 0.42 (both through the pnpm catalog). Telemetry is off (`ASTRO_TELEMETRY_DISABLED=1` on every target and in the workflow).
- **Why:** static HTML with accessible defaults (skip link, landmarks, keyboard-friendly sidebar and search dialog, light/dark themes, reduced JS), Pagefind search indexed locally at build time, system font stack (no remote fonts), no analytics. Astro 7 uses Vite 8 and Zod 4, the versions already in the catalog. It builds 80+ pages in about a second, offline.
- **Alternatives:** Docusaurus (React runtime on every page, default search is Algolia, a hosted service; local search needs third-party plugins); VitePress (Vue runtime, good local search, less documented accessibility track record); Eleventy or a hand-rolled generator (most control, but we'd rebuild navigation, search and theming ourselves).
- **Note:** Astro 7.4 requires Node >= 22.23.4. CI's `node-version: 22` resolves to the latest 22.x, so it is fine; the root `engines` field (>= 22.13) is looser than what the docs site needs.

## 2026-10-31: apps/docs is created by hand, with explicit nx:run-commands targets

- **Decision:** there is no official Nx Astro plugin or generator, and the workspace-plugin generators only create engines, rules and fixtures, so `apps/docs` is hand-made with tags `type:app`, `scope:docs`, `publish:private`. Targets: `generate` (dependsOn `^build` and `cli:docs-json`), `build` (dependsOn `generate`, outputs `dist`), `dev`/`serve` (continuous), `preview`, inferred `test` (Vitest, generator unit tests), `test-integration` (dependsOn `build`), inferred `typecheck` and `lint`. Inputs use `dependentTasksOutputFiles` for gitignored artifacts (the generated Markdown, `cli-reference.json`) and declare the env vars that change output (`DOCS_SITE`, `DOCS_BASE`, `DOCS_REPO_URL`, `DOCS_REPO_REF`).
- **Why:** inferred-first is the rule, but nothing infers Astro; explicit targets with accurate inputs/outputs keep caching correct.
- **Typecheck scope:** `tsconfig.scripts.json` covers `scripts/` and `test/` (all generator code). `src/content.config.ts` uses Astro's virtual modules and is checked by the Astro build, not tsc; `astro check` would add `@astrojs/check` and a language server for one 7-line file.
- **Lint:** `@nx/dependency-checks` only reads files in the `build` target's inputs, so `build` lists `scripts/**` (minus tests) as an input. That is honest: the build runs the generator through `generate`.
- **Scripts run with Node's built-in TypeScript type stripping** (`node scripts/generate.ts`, `.ts` import specifiers, `allowImportingTsExtensions`), importing workspace packages from their built `dist/`. No tsx/ts-node dependency.

## 2026-10-31: All site content is generated into a gitignored folder

- **Decision:** `apps/docs/src/content/docs/` is generated by `docs:generate` and gitignored. Hand-written site pages live in `apps/docs/content/` and are copied through the same pipeline; guides that already live next to their code (`docs/*.md`, `apps/action/README.md`, `apps/mcp/{README,SKILL}.md`, `apps/server/README.md`, `CONTRIBUTING.md`, `docs/ROADMAP.md`, `docs/adr/*`) are imported, not duplicated (manifest: `apps/docs/scripts/lib/routes.ts`). Output is sorted and has no timestamps except the benchmark's own `generatedAt`, so it is deterministic.
- **Why:** one copy of every guide (slices keep editing the file next to their code), no merge conflicts on generated files, and one place for link rewriting and drift checks. Relative links between published files become page links; links to other repository files become GitHub links (`DOCS_REPO_URL`, `DOCS_REPO_REF`).
- **Trade-off:** `astro dev` does not hot-reload edits to `apps/docs/content/`; re-run `docs:generate` (or restart `docs:dev`). Linked repository files outside the declared inputs (for example fixture pages) are existence-checked but not hashed, so deleting one may be caught one cache miss late.
- **Alternatives:** committing generated pages (reviewable diffs, but they drift and conflict across parallel slices); pointing Starlight at several source folders (Astro's glob loader takes one base per collection).
- **Desktop page:** `docs/desktop.md` (S14) is imported when it exists; until then the generator writes a "coming soon" page. No code change is needed when S14 merges.

## 2026-10-31: Generated references fail on drift

- **Decision:** `docs:generate` exits 1 when: a rule from `allRules()` has no `docs/rules/<id>.md`; a doc page with a `tier` in its frontmatter has no registered rule; a doc's tier differs from the rule's, its `wcag` misses one of the rule's criteria, or its frontmatter `id` mismatches; a rule doc still contains `TODO`; a config option has no description or a description has no option; a relative link points to a missing file; two pages claim one route. Docs without a `tier` (`static/index.md`, `repo/index.md`, `ai/judges.md`) are layer overview pages.
- **Rules reference:** one page per rule (metadata block from the code with W3C Understanding links from core's `getSuccessCriterion`, then the hand-written body), an index by engine, an index by WCAG SC (sorted with `compareSc`), and the repo lint rules table from `RULE_MAP`/`SKIPPED_RULES` exported by `@clear-a11y/repo`. Individual rule pages are reachable from the indexes, not the sidebar (50+ links on every page buried the navigation and multiplied the states the dogfood scan explores).
- **CLI reference:** `apps/cli/src/reference.ts` (`describeProgram`, unit tested) and `apps/cli/src/docs-json.ts`; target `cli:docs-json` writes `apps/cli/dist/cli-reference.json`; docs reads the file (apps never import apps). Named `docs-json` rather than the slice's `docs:cli` (a target name with a colon reads badly as `cli:docs:cli`).
- **Config reference:** types and defaults from `z.toJSONSchema(ConfigSchema | RepoConfigSchema, { io: 'input' })`; plain-language descriptions in `apps/docs/scripts/config-descriptions.ts` with the two-way drift check. The schemas carry JSDoc comments, which aren't available at runtime (see requested change below).
- **Benchmark:** tables from `bench-results/latest.json`; the progression from `s01-axe-baseline.json` and `wave*.json`, ordered by `generatedAt`, with recall deltas in percentage points. The coverage page states plainly that the fixtures are self-authored and not yet a human-audit number.

## 2026-10-31: Base path is applied at generation time

- **Decision:** `DOCS_BASE` (from `actions/configure-pages` in the workflow) sets Astro's `base`, and the generator prefixes it to root-relative links in page bodies (`scripts/lib/base-links.ts`).
- **Why:** Astro 7's default Markdown processor (Sätteri) doesn't run rehype plugins without adding `@astrojs/markdown-remark`; doing it in the generator needs no extra dependency and is unit tested. Starlight's own navigation already respects `base`. The dogfood test serves `dist/` under `DOCS_BASE` when it's set, and the link checker verifies every internal link and anchor resolves under the base.

## 2026-10-31: The docs site must pass Clear A11Y with zero findings of any tier

- **Decision:** `docs:test-integration` scans home, getting started, the CLI guide, the CLI reference, the rules index, a rule page, rules by WCAG and the coverage page, at 1280×800 and 320×640, with every engine and state exploration, and asserts zero findings of any tier; plus the home page with the search dialog open and showing results. It also checks every internal link and anchor in `dist/`, asserts no request leaves the local origin and no script error occurs, takes full-page screenshots at 1280 and 320 px (`apps/docs/test-output/screenshots/`) and asserts no sideways scrolling at 320 px. `docs.yml` runs it before deploying.
- **Theme fixes (in `src/styles/custom.css` and a small `head` script):** the search button's visible "Ctrl K" hint is hidden so its visible label matches its accessible name (2.5.3; the shortcut stays and is exposed with `aria-keyshortcuts`); the theme select gets a 3:1 border (1.4.11); the site title may wrap at 200% text instead of being clipped (1.4.4); tables are real tables whose cells wrap instead of scrolling blocks that keyboard users couldn't scroll (2.1.1); the code copy button moves to the bottom right so Tab order matches reading order (2.4.3) and the focusable code area gets a strong focus outline (2.4.7); the mobile "On this page" menu closes when focus leaves it (2.4.11). In the search dialog: the clear button's clipped "Clear" text takes no space (1.4.4; its accessible name is unchanged), and decorative masked pseudo-element icons plus the transparent "whole card is clickable" overlay are removed because they stopped axe from measuring the contrast of results (needs-review); the result title is still the link.
- **Result:** zero findings of any tier on all 8 pages at both sizes and on the open search dialog; no broken internal links or anchors across all 82 built pages; no request leaves the local origin; no page is wider than 320 px.

## 2026-10-31: Three engine false positives found by scanning the docs site, fixed with fixtures

- **at/expanded-state-missing (violation):** a `popovertarget` button was reported for missing `aria-expanded`. Browsers expose the expanded state of popover invokers from the popover's open state (HTML-AAM); verified in Chromium's accessibility tree (`expanded: false` → `true`). `declaresExpandedState()` now counts `popovertarget`. Unit test + correct-pattern fixture `at/popover-toggle-ok.html` + engine-at integration test.
- **visual/text-overlap and visual/text-spacing-clipped (likely):** controls were compared by their bounding box, so an inline link wrapping onto a second line "overlapped" the words beside it. Controls now use one box per line fragment (`getClientRects()`), like text already did. Correct-pattern fixture `visual/wrapped-links-ok.html`.
- **visual/hover-content-not-dismissible (violation):** a hover-revealed heading anchor icon (Starlight's, and many other docs themes') "covered" the heading because the sample point hit the heading's end-of-line padding. Covered text now counts only where the point lies on the text's own line boxes, and only elements painted below the revealed content count (with the mobile table of contents open, the menu above the anchor was counted as "covered" by it). Content with `pointer-events: none` is absent from `elementsFromPoint`, so it keeps the previous behavior. Correct-pattern fixture `visual/heading-anchor-hover-ok.html` (the stacking case is covered by the docs dogfood test; a fixture for it would need an overlay above a focusable element, which other rules rightly flag).
- All barrier fixtures of these rules are still found (engine integration tests and the benchmark).
- **Benchmark after S15:** 136 fixture pages (67 correct-pattern; +3 new, all silent), recall 0.974 (75/77), precision of `violation` 1.000 (65/65), noise 6 (the same axe color-contrast needs-review items); repo layer unchanged (20/20, 7/7). Identical to wave 5 apart from the new pages.

## 2026-10-31: Follow-ups for wave 7

- **keyboard/focus-obscured** doesn't apply the 2.4.11 exception for content the user opened that can be dismissed without moving focus (Understanding 2.4.11). The docs site avoids the case (the mobile table of contents now closes on focus out), but an Escape-dismissible user-opened panel should not be a `violation`.
- **CLI package name:** `apps/cli/package.json` is `@clear-a11y/clear-a11y`, while ADR 0001, AGENTS.md and the READMEs say the public package is `clear-a11y`. The docs say `npx clear-a11y` (once released), matching the ADR; the package name should be settled at release readiness.
- Publish the site URL in the README once Pages is enabled for the repository.

## Requested core/browser changes

- **core (optional):** add `.describe()` text to `ConfigSchema` fields (today they are JSDoc comments). The docs generator would then read descriptions from the schema itself (they appear in `z.toJSONSchema`) and `apps/docs/scripts/config-descriptions.ts` could shrink to the engine-owned loose sections. Not required: the current two-way drift check already keeps the table honest.

## 2026-10-31: Wave 7 split into parallel tracks

- **Decision:** Wave 7 runs 7a (engine hardening: owns core/browser/engines) and 7b (release readiness: owns package metadata, workflows, root config) in parallel worktrees; fixture expansion (7c) runs after 7a merges; README, hygiene and the final summary are done by the coordinator last.
- **Why:** The tracks touch disjoint files; the "serial" intent (no parallel core changes) is kept because only 7a changes core/browser.

## 2026-10-31: Repository home is greenpioneersolutions/clear-a11y

- **Decision:** All `repository`, `homepage`, `bugs`, docs and Action `uses:` references point at `github.com/greenpioneersolutions/clear-a11y` (docs: `greenpioneersolutions.github.io/clear-a11y`), matching the checkout's git remote.
- **Why:** Placeholders used `clear-a11y/clear-a11y`, which would make npm, docs and Action links fail. If the project moves to a dedicated org later, it is one search-and-replace.
- **Alternatives:** Keeping the placeholder org; rejected because links must resolve at first release.

<!-- From wave 7b (release readiness) -->

## 2026-10-31: The CLI is published as unscoped `clear-a11y`

- **Decision:** `apps/cli/package.json` is renamed from `@clear-a11y/clear-a11y` to `clear-a11y`; the Nx project name stays `cli`, the bin stays `clear-a11y`. No other project depended on the old name, so only the manifest changed (the lockfile keys importers by path).
- **Why:** ADR 0001, AGENTS.md, the READMEs and the docs already promise `npm install -g clear-a11y` / `npx clear-a11y`. The `@clear-a11y/*` scope stays for libraries and the MCP server.
- **Alternatives:** Keep `@clear-a11y/clear-a11y` and change the docs (`npx @clear-a11y/clear-a11y` is long and stutters); publish both (two packages to keep in sync).

## 2026-10-31: Package metadata for every public package

- **Decision:** Every `publish:public` manifest has `license`, `repository` (with `directory`), `homepage` (`https://greenpioneersolutions.github.io/clear-a11y/`, the docs site), `bugs` (GitHub issues), `keywords`, `engines.node: ">=22.13.0"`, `publishConfig.access: public`, `files` (dist + README, plus `prompts/` for ai and `SKILL.md` for mcp) and `sideEffects`. Libraries are `sideEffects: false` (checked: no top-level statements with side effects in any `dist/*.js`); the CLI and MCP server list their entry scripts (`./dist/main.js`, plus `./dist/docs-json.js` for the CLI). The engine generator template writes the same fields, so new engines start correct. Every public README has install, a minimal example and absolute documentation links (npm renders READMEs outside the repo); the core README replaced the Nx stub.
- **Why:** Required for a credible first publish; `pnpm pack` of each package shows dist + README + LICENSE only (pnpm adds the root LICENSE), every `exports`/`types`/`bin` target exists in the tarball, `workspace:*`/`catalog:` ranges are rewritten to real versions, and bins keep their shebang and are packed executable.
- **Alternatives:** Per-package docs URLs (the site has no per-package pages yet); an `author` field (the copyright holder is "The Clear A11Y Authors" in NOTICE, enough for now).
- **Open point:** the git remote in this checkout is `greenpioneersolutions/clear-a11y`, while every manifest, README and doc uses `clear-a11y/clear-a11y`. Changelog and GitHub release links come from the actual remote, so they are right either way; if the canonical repository is not `clear-a11y/clear-a11y`, update `repository`, `homepage` and `bugs` (one search and replace) before the first real release.

## 2026-10-31: Keep the `@clear-a11y/source` export condition in published manifests

- **Decision:** Published `exports` maps keep the workspace-only `@clear-a11y/source` condition (pointing at `./src/index.ts`, which is not in the tarball). Nothing strips it at release time.
- **Why:** Node, TypeScript and bundlers only apply a custom condition when the consumer opts into that exact name, which no consumer does, so resolution falls through to `types`/`import`/`default` (verified: every one of those targets exists in each packed tarball). Stripping it would need either a duplicated `publishConfig.exports` in every manifest (drifts) or a script that rewrites manifests between `nx release version` and `publish` (a second moving part in the release). This is the setup Nx's TypeScript solution style uses.
- **Alternatives:** `publishConfig.exports` per package (pnpm applies it at pack time); a pre-publish rewrite step. Revisit if a tool (for example publint in CI) starts failing on the dangling condition.

## 2026-10-31: Node.js floor: `^22.23.4 || ^24.0.0 || >=26.0.0` for the repo, `>=22.13.0` for published packages

- **Decision:** Root `engines.node` is `^22.23.4 || ^24.0.0 || >=26.0.0`; `.nvmrc` says `22`; CI, Dogfood, Docs and Release workflows read `.nvmrc` (shared `.github/actions/setup`). Published packages declare `>=22.13.0`. CONTRIBUTING, README and getting-started say "Node.js 22 (22.23.4 or newer), 24 or 26".
- **Why:** Checked the `engines` of every tool in the catalog: Astro 7.4.4 needs `>=22.23.4` (the highest floor), Vitest 5 `^22.12.0 || ^24.0.0 || >=26.0.0` (no odd majors), commander 15 and Electron 45 `>=22.12.0`, Playwright `>=18`, and `node:sqlite` is unflagged from 22.13. The repo floor is their intersection. Published packages don't carry Astro or Vitest; their own floor is commander's 22.12 and the queue's `node:sqlite` 22.13. CI runs the lowest supported major (22) so newer-only APIs are caught.
- **Alternatives:** `>=22.23.4` for everything (would reject Node 22.13 to 22.22 users of the CLI for a docs-site tool they never install); CI on 24 (would hide 22-only incompatibilities); a CI matrix on 22/24/26 (triples CI time for a pre-alpha project; revisit at 1.0).

## 2026-10-31: Release configuration

- **Decision:** `nx release` keeps one fixed group (`tag:publish:public`, 16 packages), tag `v{version}`, workspace `CHANGELOG.md` only, GitHub release. Added: `adjustSemverBumpsForZeroMajorVersion: true` (explicit: below 1.0 `feat`/`fix` bump patch and breaking changes bump minor), `preserveLocalDependencyProtocols: true` (explicit: `workspace:*` stays in git, `pnpm publish` rewrites it), `git.commitArgs: "--signoff"` (the release commit carries a DCO sign-off like every other commit) and `git.push: true`. The first release is `nx release 0.1.0 --first-release` (conventional commits alone would give 0.0.1). `pnpm nx release 0.1.0 --dry-run --first-release --yes` succeeds: 16 manifests to 0.1.0, a CHANGELOG preview from conventional commits (features and fixes by scope), and `pnpm publish --dry-run` for all 16 tarballs. Note that a dry run skips the publish preview unless `--yes` is passed.
- **Why:** Matches ADR 0002 (fixed versioning until 1.0, CI-only publishing). Nx publishes with the detected package manager (`pnpm publish --no-git-checks`), which rewrites `workspace:` and `catalog:` ranges; npm provenance comes from `NPM_CONFIG_PROVENANCE=true` plus the job's OIDC token.
- **Alternatives:** Per-project changelogs (noise with one fixed version); independent versions (rejected in ADR 0002).

## 2026-10-31: Release workflow

- **Decision:** `.github/workflows/release.yml` is `workflow_dispatch` only, with inputs `version` (empty, `patch|minor|major|prerelease` or an exact version, validated by a regex and passed through `env`, never interpolated into the script), `first-release`, `dry-run` (default true) and `publish-only` (recovery after a failed publish: `nx release publish` for the version already on disk; Nx skips versions that already exist). A dry run uses no environment and no secrets. The real release job runs only on `main`, uses the `npm` environment (holds `NPM_TOKEN`; protect it with required reviewers), has `contents: write` and `id-token: write`, lints/typechecks/tests/builds the public packages, then runs `nx release` with `NODE_AUTH_TOKEN` and `NPM_CONFIG_PROVENANCE=true`. Workflow-level permissions are `contents: read`.
- **Why:** Releases need a human decision and a reviewable preview; the token is scoped to one job in one workflow, so CI, forks and contributors never see or need it.
- **Alternatives:** Release on every push to main (no human gate before 1.0); npm trusted publishing via OIDC without a token (needs npm CLI 11.5+ and per-package setup on npmjs.com; worth switching to once the packages exist, and then `NPM_TOKEN` can be deleted).

## 2026-10-31: The GitHub Action ships on an `action-v<major>` branch, not on `main`

- **Decision:** After a real release, the `action` job checks out the `v<version>` tag, builds `apps/action` (35 MB, mostly `playwright-core`) and commits `action.yml`, `dist/`, a minimal `package.json` (`version` set to the release, `"type": "module"`: the bundle reads `../package.json` and is ESM), `LICENSE`, `NOTICE` and a short README to the `action-v<major>` branch (orphan on first use, one commit per release), tagged `action-v<version>`. Users write `uses: greenpioneersolutions/clear-a11y@action-v0` or pin `@action-v<version>`. `apps/action/README.md`, `examples/workflow.yml` and `docs/github-action.md` were updated. The branch step was exercised against a local bare remote (first release creates the orphan branch, the second adds a commit on top, tags both).
- **Why:** Keeps `main` free of a large generated bundle (the earlier plan was to commit `apps/action/dist` to main at release, which grows main's history by tens of MB per release and invites hand edits). The action stays in the same repository, so the workflow's own `GITHUB_TOKEN` can push it.
- **Alternatives:** Commit `dist/` to `main` (see above); a separate `clear-a11y/action` repository (best for the Marketplace, which wants `action.yml` at a repository root on the default branch, but needs a cross-repo token); a Docker action (Linux only, slow).
- **Trade-off:** clones fetch all branches and tags, so the action branch's objects still reach full clones; consecutive releases delta-compress well because each commit builds on the previous one.

## 2026-10-31: Dogfood workflow and CI cleanup

- **Decision:** New `.github/workflows/dogfood.yml` runs on every pull request and push to main: `cli:test-integration -- report-dogfood` (writes a sample `report.html` from fixture pages and scans it), `docs:test-integration -- dogfood` (builds the site, scans every page, checks links) and `desktop:test-integration -- dogfood` (builds the renderer, scans every view). `docs.yml` now only builds, scans and deploys from `main` (dogfood covers pull requests), and `ci.yml` excludes `docs` from `affected -t test-integration e2e` to avoid scanning the site twice per PR. A composite `.github/actions/setup` (pnpm from `packageManager`, Node from `.nvmrc`, frozen install, optional Chromium) is shared by all workflows; the Playwright cache key is the pinned Playwright version (`playwright --version`, 1.61.1) instead of the lockfile hash, so unrelated dependency changes don't throw away the browser cache.
- **Why:** Engine changes can break our own UIs without touching them, so the dogfood scans must run on every change, not only when a UI is affected (Principle 7). CI stays fork-safe: no secrets, no Nx Cloud, read-only token.
- **Alternatives:** A dogfood job inside `ci.yml` (one long serial job; a separate workflow runs in parallel and shows up as its own check).

## 2026-10-31: NOTICE and the release docs

- **Decision:** NOTICE lists every direct third-party runtime dependency of the published packages (axe-core MPL-2.0 with its own third-party notices, Playwright Apache-2.0 with its NOTICE text, zod, tslib 0BSD, commander, the MCP SDK, ESLint and the a11y plugins, vue-eslint-parser, typescript-eslint, TypeScript), of the shipped apps (@actions/core, NestJS, BullMQ, ioredis, reflect-metadata, RxJS, Electron, Preact) and the build tools whose output ships (esbuild, electron-builder, Vite, Astro, Starlight, Nx), each checked against the installed package's license file. It also says where redistributed code's notices are (the action's `dist/index.js.LEGAL.txt` and `playwright-core`'s own files; Electron's license files). The old entry "typescript-eslint parser: BSD-2-Clause" was wrong for the installed 8.x (MIT) and was corrected. `docs/release.md` is the release process and is imported into the docs site as `contributing/release-process` (replacing the hand-written page, which described the process less precisely).
- **Why:** AGENTS.md requires attributions for runtime dependencies; one source of truth for the release process.
- **Alternatives:** Copy NOTICE into every npm package (pnpm only adds the root LICENSE automatically; duplicating NOTICE into 16 folders invites drift. Revisit if a downstream distributor asks).

## Requested core/browser changes

None.

<!-- From wave 7a (engine hardening) -->
<!-- From wave 7a (engine hardening) -->

## 2026-10-31: Engine pass records via a ctx.recordPass callback (ADR 0003)

- **Decision:** Engines report verified passes through an optional `PageContext.recordPass({ ruleId, wcag, selector, evidence? })` (browser). The runner binds it per engine run, stamps engine, URL, state and viewport (`PassRecord`, core), and after the per-state dedupe calls core's `resolveWithPasses`: a `needs-review` finding is dropped when a different, deterministic engine (not `ai-*`/`persona-*`) recorded a pass with the same selector, URL, state and viewport and an overlapping SC. `violation` and `likely` are never dropped. Dropped findings go to the new optional `ScanResult.resolved` (`{ finding, resolvedBy }`) and `summary.resolved`; `schemaVersion` stays 1.
- **Why:** Closes the S04 request. A callback is additive (no engine or caller changes), and the runner, not the engine, decides attribution, so an engine cannot speak for another and AI passes can be ignored reliably. Keeping the full dropped finding plus the measurement makes every resolution auditable.
- **Alternatives:** `run()` returning `Finding[] | { findings, passes }` (every caller handles a union, attribution by the engine); passes as a finding tier (leaks into SARIF, CI thresholds and every reporter); a runner special case for axe contrast (hidden contract). See ADR 0003.

## 2026-10-31: engine-static rewrites axe selectors to the shared convention

- **Decision:** Plain axe targets that resolve to exactly one element are rewritten to `window.__clearA11y.selector(el)`; shadow-root/frame targets and ambiguous selectors keep axe's form. The axe selector is kept in `evidence.data.axeSelector` when it differs. Finding ids change for those findings (the id hashes the selector).
- **Why:** Pass records match by selector string, and axe's `p:nth-child(3)` never equals engine-visual's `body > main > p:nth-of-type(2)` for the same element. ADR 0001 Amendment 1 already says every engine uses the shared helper; static was the exception, which also hurt cross-engine dedupe. No benchmark selector changed (expected selectors are mostly `#id`, which both produce).
- **Alternatives:** Matching by element identity in a live page in the runner (pages would have to stay open after engines finish); alias selectors on findings (schema change).

## 2026-10-31: Which real-pixel measurements count as a verified contrast pass

- **Decision:** engine-visual records a 1.4.3 pass only when the measurement would produce no finding (median and 10th percentile at or above the threshold), at least 20 glyph pixels were measured, and the screenshot covered the element's whole text box (long text that is only sampled from the top never counts).
- **Why:** A pass must settle the question for the whole element, or it would hide a real failure further down a long paragraph.
- **Alternatives:** Also requiring the worst pixel to pass (anti-aliasing on gradients would make passes rare without improving trust); recording passes for partial samples (unsafe).

## 2026-10-31: Contrast candidates now include text axe gives up on

- **Decision:** Besides background images/gradients and painted layers between text and its background, engine-visual measures text that another element covers in part (`obscured`: an `elementFromPoint` sample on the text's line boxes hits an element that is not the text's own element, a descendant or an ancestor) and text whose box is drawn over other content (`overlap`: `elementsFromPoint` at five points of the box finds a non-ancestor, non-descendant below it, e.g. an absolutely positioned tooltip). Only the visible glyphs are measured (covered glyphs produce no screenshot difference).
- **Why:** These are axe's "partially overlaps other elements" and "overlapped by another element" incomplete cases, which made up five of the six benchmark noise items (tooltip states). The measurement is the same real-pixel method, so a failure there is a real 1.4.3 failure.
- **Alternatives:** Asking the runner to pass axe's incomplete selectors to engine-visual (cross-engine coupling inside an engine run).

## 2026-10-31: Closed details and content-visibility: hidden are not rendered

- **Decision:** engine-visual's render check treats everything inside a closed `<details>` except its own summary, and the contents of any element with `content-visibility: hidden` (`hidden="until-found"`), as not rendered.
- **Why:** S14 dogfood: Chrome lays out closed details content under `content-visibility: hidden`, so the boxes look real and produced `text-overlap` / `text-spacing-clipped` false positives. Fixture `visual/details-closed-ok.html` reproduced four `likely` findings before the fix.
- **Alternatives:** `checkVisibility({ contentVisibilityAuto: true })` (did not hide this content in the S14 investigation); fixing the shared `PageHelpers.isVisible` too (affects every engine; not needed for this fix, left as a possible follow-up).

## 2026-10-31: Status messages must be human-readable text that changed

- **Decision:** engine-at's recorder snapshots every element's text when a probe starts. A changed element (or an element created during the probe, judged by its nearest pre-existing ancestor) whose text equals its text before the press is not a candidate; elements shown again after being hidden still are. Candidates also need at least one letter or digit (`isReadableText`).
- **Why:** S14 dogfood: Preact rewrites `0` and empty text nodes on every render, reported as `at/status-message-not-announced`. Fixture `at/status-rerender-ok.html` reproduced it. Digit-only changes still count when the value changed (a cart badge going from 2 to 3 is a status message in the sense of Understanding 4.1.3).
- **Alternatives:** Requiring a letter (would miss count-only badges); ignoring characterData mutations (misses real messages written into an existing text node).

## 2026-10-31: 2.4.11 exception for user-opened content, tested with Escape

- **Decision:** In any non-default state, keyboard/focus-obscured re-focuses each entirely covered stop (up to five per state), presses Escape and samples again; when focus stayed on the element and it is no longer entirely covered, the stop is not reported. If the stop is no longer covered before Escape (an earlier Escape closed the state), the state is replayed first; if it still can't be verified, the finding stays. The check runs after every other keyboard check because Escape may close the state. Never applied to the default state.
- **Why:** Understanding 2.4.11: content opened by the user that the user can dismiss without moving focus does not make the focused component "hidden". The default page load is not user-opened (cookie banners, promo bars stay failures). Fixture `keyboard/focus-obscured-dismissible-ok.html`; the integration test also blocks Escape on the same page and expects the violation.
- **Alternatives:** Skipping obscured stops in every non-default state (would hide panels that can't be dismissed); `needs-review` instead of dropping (the exception is verified deterministically).

## 2026-10-31: The action scans stories through the runner's Storybook layer

- **Decision:** `apps/action` scans matched stories with `scanRepo` from `@clear-a11y/runner` (`repo.storybookStatic` = the input made repo-relative, `repo.storyFilter` = the matched story ids in changed-only mode, `repo.maxStories` = what is left of `max-pages` after pages, `storybookUrl` cleared, `boot: false`), in the same call as the lint of changed folders. `limitResultToFiles` (repo) gained `{ keepUrl }` so the scanned story pages survive the changed-files filter. A `storybook-static` outside `repo-path` scans no stories and says so.
- **Why:** Story findings now get source locations and reach code scanning annotations, the gap noted in S11. Pages still go through `scan()`.
- **Alternatives:** Keeping plain-page story scans and mapping afterwards (duplicates the runtime layer's mapping); two repo scans (lint and stories separately; the static layer can't be switched off in the runner's `scanRepo`).

## 2026-10-31: ConfigSchema describes its own fields

- **Decision:** Every `ConfigSchema` field (and `ViewportSchema`) carries a `.describe()` text, moved verbatim from `apps/docs/scripts/config-descriptions.ts`, which now holds only the `repo.*` fallback entries. The generator prefers schema descriptions, falls back to the file, and fails on an undescribed option, an orphan fallback or a fallback that duplicates a schema description.
- **Why:** S15 request; one source of truth for config descriptions that also shows up in `z.toJSONSchema`. The generated configuration reference is byte-for-byte the same.
- **Alternatives:** Describing `RepoConfigSchema` too (packages/repo; possible follow-up, kept out of scope).

## Changelog note (public API)

- `@clear-a11y/browser`: `PageContext.recordPass?` and the `PassInput` type (additive).
- `@clear-a11y/core`: `PassRecord`, `ResolvedFinding` (+ schemas), `resolveWithPasses`, `passResolving`; optional `ScanResult.resolved` and `ScanSummary.resolved`; `summarize(findings, resolved?)`; `.describe()` texts on `ConfigSchema`. All additive, `schemaVersion` stays 1.
- `@clear-a11y/engine-static`: finding selectors use the shared convention; ids of affected findings change once.
- `@clear-a11y/repo`: `limitResultToFiles(result, files, { keepUrl })`, and `mergeScanResults` keeps `resolved`.

## Requested core/browser changes

None outstanding (this wave owned core and browser). Possible follow-ups:

- `PageHelpers.isVisible` (browser) could treat closed `<details>` content and `content-visibility: hidden` subtrees as hidden for every engine, like engine-visual now does.
- S14's fragment-URL reload issue is already handled by `gotoAndSettle` (`isSameDocument`); the SSRF request filter for redirects (S12) is still open.

<!-- From wave 7c-2 (behaviour detections) -->
<!-- From wave 7c-2 (WCAG 2.2 behaviour detections: 3.2.1, 3.2.2, 2.2.2, 1.3.4) -->

## 2026-11-01: 3.2.1 is detected during the real focus walk, per Tab press

- **Decision:** `keyboard/context-change-on-focus` hooks the existing Tab walk (new optional `onPress` hook in `walkFocus`, called right after each press). An in-page recorder logs what the press caused: elements that received focus, `window.open()` calls (replaced by a recorder that returns `null`), `submit` events, modals that appeared (`dialog:modal`, visible `aria-modal="true"`) and cross-document navigations (Navigation API `navigate` event, with `beforeunload` plus the route's request log as a fallback). The log restarts on every Tab keydown, so the engine's own blur/refocus between presses (focus-indicator crops) is never blamed on a stop. A page route answers every main-frame navigation with a local `204` for the rest of the keyboard run, so the walk continues and nothing reaches the server. Tiers: navigation and new window `violation`; form submit, modal, focus moved/removed `likely`. Focus moved into a descendant (composite widgets) and hidden sentinels (< 4 px, focus-trap wrap-around) are not reported.
- **Why:** The brief asks for detection "while walking focus"; a second walk would double the cost and could see a different order. Attribution by press needs in-page timing: route events reach Node after the press resolves (a first version blamed the next stop). Navigation and window opening caused by focus alone are deterministic and unambiguous changes of context (Understanding 3.2.1, F52); moving focus can be legitimate in patterns a person should confirm.
- **Alternatives:** Focusing each element with `element.focus()` on a fresh page (one reload per element; misses Tab-only handlers); observing navigation through `page.on('request')` only (no reliable press attribution); hooking `HTMLElement.prototype.focus` (misses blur-on-focus and timing).

## 2026-11-01: 3.2.2 changes each form control on a fresh, route-guarded page

- **Decision:** `states/context-change-on-input` runs in engine-states' default-state run after the form checks. For up to `states.maxInputs` (10) visible, enabled controls (single selects, checkboxes, one unchecked radio per group, text-like inputs), on a freshly loaded page: focus, reset the recorder (what focus alone does is 3.2.1's job), change the value (choose another non-destructive option, click, or type; short `maxlength` fields are filled to the max to trigger auto-submit/auto-tab), read focus, blur so `change` fires, then record submits (`submit` event and `HTMLFormElement.prototype.submit`), main-frame navigations (`page.on('request')`, also same-URL reloads and history-API URL changes), `window.open()` calls (answered with `null`), popups, modals, moved focus and how much of the page stopped being visible. `likely` by default; `needs-review` when text around the control (label, hint, describedby, legend, form or container) matches a broad "acts immediately" pattern (G13); most of the page replaced (>= 60% of >= 20 visible elements) is always `needs-review`.
- **Why:** The existing route guard already guarantees no non-GET request and no navigation leaves the browser; submit buttons are never pressed and destructive names/options are skipped. 3.2.2 allows the change when users were advised beforehand, and the engine can't prove it saw every warning, so it never emits `violation`.
- **Alternatives:** Only selects (misses F36 auto-submit and F37 new window on radio/checkbox); `violation` for navigation (the "advised beforehand" clause is not machine-decidable).

## 2026-11-01: 2.2.2 is measured on a second page with no-preference, then reduce

- **Decision:** `visual/motion-without-pause` runs on the default state only, on a second page of the same browser context (`ctx.page.context().newPage()`), in parallel with the other visual checks, and closes it afterwards. It loads the page with `prefers-reduced-motion: no-preference`, watches `document.getAnimations()` (running, infinite or > 5 s) and a MutationObserver (`style`, `class`, `hidden`, `src`, text, children) for `visual.motionObserveMs` (2100 ms; 5500 ms when a carousel/slider/ticker/marquee is present without a running animation to explain it). A pause/stop/hide-like control near the moving content (closest container first) is activated and the content watched again: stopped or hidden = pass. For the rest it reloads with `reduce` and watches again. Verdict: no control and still moving with reduce = `likely`; no control but stops with reduce = `needs-review`; control found but motion continued = `needs-review`. Loading indicators, < 16 px dots and content shown on its own are exempt.
- **Why:** The scanner's contexts use `reducedMotion: 'reduce'`, so most motion is invisible to it; most users never set reduce, and scripts often read the media query only at load, so a reload under `no-preference` is needed. WCAG lists no technique accepting `prefers-reduced-motion` alone as the 2.2.2 mechanism (it is C39 for 2.3.3), and practitioners disagree, so it lowers the tier instead of passing (CLAUDE.md: ambiguous means needs-review). A second page keeps the main page untouched for the other checks and hides most of the observation time behind them.
- **Alternatives:** Re-emulating `no-preference` on the main page (other checks would see motion; scripts that read the query at load would not change); fake timers / virtual time to fast-forward carousels (timers created before installation are not controlled); a 6 s+ watch on every page (too slow).
- **Cost:** about +2 s of wall time per page on small pages where the other visual checks finish sooner (the side page runs in parallel); pages with a carousel watch longer. Together with the 3.2.2 probes (one reload per form control, up to 10), the full fixture benchmark went from about 6 to about 9 minutes. Knobs: `visual.motion: false`, `visual.motionObserveMs`, `states.maxInputs`. A follow-up could share the motion watch across viewports or skip it on pages without animations, timers or carousel markup.

## 2026-11-01: Clipping checks skip containers of endless animations

- **Decision:** engine-visual's clipping measurement (used by `text-spacing-clipped` and `text-resize-clipped`) skips overflow-clipping containers that hold a running animation lasting more than 5 s or forever.
- **Why:** A ticker or marquee clips its moving content by design, and the content's position changes between the before/after measurements, so the new ticker fixture produced two `violation` false positives (`#news-ticker`). The motion itself is reported by `visual/motion-without-pause`.
- **Alternatives:** Pausing animations before measuring (positions still differ from the base snapshot taken earlier; would hide clipping that exists with the animation off too, which the reduced-motion layout already measures).

## 2026-11-01: 1.3.4 compares portrait and landscape at phone and tablet sizes

- **Decision:** `visual/orientation-locked` (default state) lays the page out at 375×812 / 812×375 and 768×1024 / 1024×768 and compares visible text, rotate messages (text pattern, 5×5 viewport coverage) and a ~90° transform on `html`, `body` or a large top-level element. A rotate message present in only one orientation that leaves < 25% of the other orientation's text (or covers >= 60% of the viewport) is a `violation` (F100: content hidden and the message proves intent); a 90° turn in one orientation only, or < 10% of the text without a message, is `likely`. A rotate tip next to content that stays usable is not reported.
- **Why:** The CSS `orientation` media feature follows the viewport's aspect ratio, so resizing is enough; phone and tablet pairs catch locks written with width limits. The scan's default desktop viewport is always landscape, so a lock is invisible without this comparison.
- **Alternatives:** Screen Orientation API locks (only apply to installed/full-screen apps; not testable in a normal page); flagging any rotate message (advice is not a restriction).

## 2026-11-01: Extra barrier fixtures

- **Decision:** Besides the generated barrier/ok pairs, added `keyboard/context-change-on-focus-navigation.html` (section links load their page on focus; `violation` path) and `visual/motion-without-pause-carousel.html` (timer carousel that only reduced motion stops; `needs-review` path), both with the fixture generator.
- **Why:** Each tier path the rules can take is exercised end-to-end by the benchmark, not only by unit tests.
- **Alternatives:** Unit tests only for those paths.

## 2026-11-01: Desktop scan pickers keep focus (found by the new 3.2.2 rule)

- **Decision:** The desktop renderer moves focus to the view heading (and announces the view) only when the view changes, no longer when only the scan changes. Choosing another scan in the Focus path and Review pickers now keeps focus on the picker.
- **Why:** The desktop dogfood scan failed with two `states/context-change-on-input` findings: changing the "Scan" select moved focus to `#view-heading`. That is a real 3.2.2 problem (keyboard users arrowing through the select were thrown to the heading after the first change), and our UI must pass Clear A11Y with zero findings.
- **Alternatives:** Excluding focus moves to headings from the rule (would hide the same problem on other sites).

## Requested core/browser changes

None. (`Route`/`Request` types are derived from `Page` in the engines because `@clear-a11y/browser` re-exports only `Page`, `BrowserContext`, `CDPSession`, `Locator` and `ElementHandle`; re-exporting `Route` and `Request` from browser would be a small nicety, not a need.)

<!-- From wave 7c-1 (WCAG fixtures + static/at rules) -->
<!-- From wave 7c-1 (WCAG 2.2 A/AA fixture expansion + engine-at detections) -->

## 2026-11-01: A wcag/ fixture area with one barrier and one correct page per criterion

- **Decision:** `fixtures/site/wcag/` holds a barrier page and a `-ok` page for each of the 30 WCAG 2.2 A/AA criteria that had no seeded issue yet (all except 3.2.1, 3.2.2, 2.2.2 and 1.3.4, which wave 7c-2 owns). Expected issues are written as a human auditor would log them, with the layer that _should_ catch the barrier: `ai` for judgment-only criteria (1.3.3, 1.4.5, 2.4.6, 3.1.2, 3.3.3), `persona` for criteria that need several pages or a whole flow (2.4.5, 3.2.3, 3.2.4, 3.2.6, 3.3.4, 3.3.7), `visual` for 1.3.2 (reading order versus visual order) and 2.3.1 (flash analysis), and `static`/`at` where a deterministic check exists or is added here. Multi-page criteria use a small set under `wcag/<slug>/` with the issue on the page an auditor would log it; the other pages of a barrier set are `correctPattern` on their own.
- **Why:** The benchmark only covered 21 of 55 A/AA criteria as a primary SC, so "recall on seeded barriers" said nothing about the other 34. Seeding undetected criteria makes the gap visible in the per-SC and per-layer tables (recall drops on purpose).
- **Alternatives:** Seeding only what we can detect (keeps recall high, hides the gap); one combined page per criterion group (barriers interfere with each other and selectors get ambiguous).

## 2026-11-01: Rule-generated fixtures live in wcag/, not at/<rule>

- **Decision:** The rule generator's `fixtures/site/at/<rule>.html` and `-ok.html` stubs were removed for the nine new engine-at rules; each rule's barrier and correct pattern are the `wcag/` pages for its criterion, and the rule docs link there.
- **Why:** The same barrier twice (once under `at/`, once under `wcag/`) would count one issue twice in recall and double the scan time for no new information.
- **Alternatives:** Keeping both (duplicated issues); generating the `wcag/` pages from the rule generator (it only knows the `<engine>/<rule>` layout).

## 2026-11-01: engine-at gets a listener spy for interaction probes

- **Decision:** A third init script (`installListenerSpy`, after the helpers and the announcement recorder so their own listeners are not counted) wraps `EventTarget.prototype.addEventListener`/`removeEventListener` and records listener types per target, plus `on*` properties and attributes. It also has a small side-effect watcher (DOM mutations, focus, scroll, URL). Five rules use it on a fresh load in the default state: `at/motion-actuation`, `at/drag-without-alternative`, `at/auth-paste-blocked`, `at/pointer-down-action`, `at/character-key-shortcut`.
- **Why:** These criteria are about behaviour, not markup. Knowing which element has a `mousedown` but no `click` listener, or whether `document` has a key listener at all, lets the probes stay cheap (the key probe only runs on pages with a document-level key listener) and precise. CDP `DOMDebugger.getEventListeners` (what engine-keyboard uses) needs one round trip per element; the spy answers in one `evaluate`.
- **Cost:** one extra reload per page (default state only). The key probe first presses every key in a row under one watch and only goes key by key when something happened, so pages whose key listener ignores letters (Escape handlers, Ctrl+K search, the docs site) pay one pass. The full benchmark went from about 6 to about 10 minutes, mostly from the 76 new pages.
- **Alternatives:** CDP per element (slow on big pages); guessing from markup (`onmousedown` attributes only; misses `addEventListener`). Limitation, documented in the rule pages: delegated listeners (one listener on a parent, as React uses) are seen on the parent, so `at/pointer-down-action` only covers directly attached handlers.

## 2026-11-01: Tiers for the new engine-at rules

- **Decision:**
  - `at/media-captions-missing` (1.2.2, 1.2.4): `needs-review`; `likely` only when the browser reports an audio track and no transcript is offered. Live sources (`srcObject` MediaStream or infinite duration) report 1.2.4 only.
  - `at/media-alternative-missing` (1.2.1, 1.2.3, 1.2.5): `needs-review`; skipped for live sources and hidden background audio.
  - `at/audio-autoplay-no-control` (1.4.2): `likely`.
  - `at/autocomplete-missing` (1.3.5): `likely`; invalid tokens are left to axe `autocomplete-valid`.
  - `at/auth-paste-blocked` (3.3.8): `likely` (0.85 for cancelled paste, 0.6 for `autocomplete="off"` on a login password).
  - `at/character-key-shortcut` (2.1.4), `at/motion-actuation` (2.5.4), `at/drag-without-alternative` (2.5.7, 2.5.1): `needs-review` with a yes/no question.
  - `at/pointer-down-action` (2.5.2): `likely`.
- **Why:** None of these is unambiguous enough for `violation`: captions can be burned in or in-stream, a video may need no description, another sign-in method can satisfy 3.3.8, 2.1.4 allows shortcuts that can be turned off, 2.5.2 exempts essential down-events, 2.5.4/2.5.7 depend on whether an equivalent control exists. AGENTS.md: ambiguous interpretation means `needs-review` or `likely`.
- **Alternatives:** `violation` for cancelled paste on password fields (Understanding 3.3.8 names it as a failure, but an alternative method on the same page passes the criterion).

## 2026-11-01: A toggle is only "reverted" when both halves are undone

- **Decision:** The announcement recorder now reports `reverted` only when what the previous press showed is hidden again **and** what it hid is shown again (either list may be empty). Before, either half was enough.
- **Why:** The 2.5.1 correct pattern (a carousel with Previous/Next buttons) produced two `at/expanded-state-missing` **violations**: pressing Next twice hides slide 2 again (what the first press showed) but never brings slide 1 back. That is not a disclosure. Disclosures (show/hide one panel) and swaps (A/B) still count as reverted.
- **Alternatives:** Excluding buttons with `aria-controls` pointing at a live region (narrower, misses other step-through controls).

## 2026-11-01: 2.4.2 fixture without a title

- **Decision:** `wcag/2-4-2-page-titled.html` has no `<title>`; the fixtures test that requires a title on every page exempts this one file, as it already exempts `static/missing-lang.html` from the `lang` check.
- **Why:** A missing title is the barrier axe can decide; an unhelpful title ("Untitled") is a judgment call already representable by the AI layer.
- **Alternatives:** A vague title (no deterministic detection, so the static layer's recall on 2.4.2 would be untestable).

## 2026-11-01: The 2.3.1 fixture flashes only after a button press

- **Decision:** `wcag/2-3-1-three-flashes.html` starts its ~6 Hz red/white flash only when "Play the sale animation" is pressed, with a warning comment in the page and the fixtures README.
- **Why:** Contributors open fixture pages in a browser; a page that flashes on load is a real photosensitivity risk. The barrier is still a 2.3.1 failure (content that flashes when played).
- **Alternatives:** Flashing on load (risky); a fixture without a real flash (would not test a future flash analyser).

## 2026-11-01: autocomplete-missing skips custom comboboxes

- **Decision:** `at/autocomplete-missing` ignores fields with `role="combobox"` or `aria-autocomplete`, along with fields in a search landmark and fields about someone else (recipient, friend, gift, colleague).
- **Why:** The scan of every fixture flagged `widgets/combobox-keyboard-ok.html` (a "Country" combobox). Custom comboboxes turn browser autofill off on purpose so it doesn't cover their own listbox; a token there is allowed but not what auditors expect. The other new hits on existing fixtures were real 1.3.5 issues on pages meant to have a single barrier, so those pages got the token instead: `static/form-missing-label.html` (`autocomplete="email"`) and the Storybook modal stories (`newsletter-email`, inline attribute, no line numbers moved).
- **Alternatives:** Adding `autocomplete="country-name"` to the widget fixture (owned by another area, and it would teach a pattern that breaks real comboboxes).

## 2026-11-01: Benchmark result for wave 7c-1: recall drops, by design

- **Decision:** Recorded as `bench-results/w7c1-wcag-fixtures.*`. Site: recall 97.4% (75/77) -> **85.0% (91/107)**; `violation` precision 100% (65/65 -> 68/68: three new axe violations on 1.4.1, 2.2.1 and 2.4.2 barriers, all true positives); noise on correct-pattern pages 0 (116 correct pages, was 70). By layer: at 31/31, static 8/9, visual 15/17, ai 2/9, persona 3/9 (keyboard, states, widgets unchanged at 100%). Repo layer unchanged (20/20, noise 0 after the Storybook fix).
- **Why:** The 14 newly missed issues are exactly the criteria with no deterministic check (ai, persona) plus three honest gaps: 1.3.1 (axe treats a table with a bold `<td>` header row as a layout table), 1.3.2 (no DOM-versus-visual reading-order check yet) and 2.3.1 (no flash analysis). The table below is the coverage map.
- **Alternatives:** Not seeding undetected criteria (keeps the 97% headline but measures less of WCAG).

### Coverage: WCAG 2.2 A/AA criteria added in this wave

| SC                                              | Fixture (`fixtures/site/`)                                        | Detected by                                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1.2.1 Audio-only and Video-only                 | `wcag/1-2-1-audio-only.html`                                      | engine-at `at/media-alternative-missing` (needs-review)                                                                        |
| 1.2.2 Captions (Prerecorded)                    | `wcag/1-2-2-captions.html`                                        | engine-at `at/media-captions-missing` (needs-review); engine-static `static/video-caption` (needs-review)                      |
| 1.2.3 Audio Description or Media Alternative    | `wcag/1-2-3-media-alternative.html`                               | engine-at `at/media-alternative-missing` (needs-review)                                                                        |
| 1.2.4 Captions (Live)                           | `wcag/1-2-4-live-captions.html`                                   | engine-at `at/media-captions-missing` (needs-review, live source: 1.2.4 only); engine-static `static/video-caption` (as 1.2.2) |
| 1.2.5 Audio Description (Prerecorded)           | `wcag/1-2-5-audio-description.html`                               | engine-at `at/media-alternative-missing` (needs-review, 1.2.5 only)                                                            |
| 1.3.1 Info and Relationships                    | `wcag/1-3-1-info-relationships.html`                              | not detected (static layer: axe's data-table heuristics skip it)                                                               |
| 1.3.2 Meaningful Sequence                       | `wcag/1-3-2-meaningful-sequence.html`                             | not detected (visual layer: reading order vs visual order)                                                                     |
| 1.3.3 Sensory Characteristics                   | `wcag/1-3-3-sensory-characteristics.html`                         | not detected (ai layer)                                                                                                        |
| 1.3.5 Identify Input Purpose                    | `wcag/1-3-5-input-purpose.html`                                   | engine-at `at/autocomplete-missing` (likely)                                                                                   |
| 1.4.1 Use of Color                              | `wcag/1-4-1-use-of-color.html`                                    | engine-static `static/link-in-text-block` (violation)                                                                          |
| 1.4.2 Audio Control                             | `wcag/1-4-2-audio-control.html`                                   | engine-at `at/audio-autoplay-no-control` (likely); engine-static `static/no-autoplay-audio` (needs-review)                     |
| 1.4.5 Images of Text                            | `wcag/1-4-5-images-of-text.html`                                  | not detected (ai layer)                                                                                                        |
| 2.1.4 Character Key Shortcuts                   | `wcag/2-1-4-character-key-shortcuts.html`                         | engine-at `at/character-key-shortcut` (needs-review)                                                                           |
| 2.2.1 Timing Adjustable                         | `wcag/2-2-1-timing-adjustable.html`                               | engine-static `static/meta-refresh` (violation)                                                                                |
| 2.3.1 Three Flashes or Below Threshold          | `wcag/2-3-1-three-flashes.html`                                   | not detected (visual layer: flash analysis)                                                                                    |
| 2.4.2 Page Titled                               | `wcag/2-4-2-page-titled.html`                                     | engine-static `static/document-title` (violation)                                                                              |
| 2.4.5 Multiple Ways                             | `wcag/2-4-5-multiple-ways/index.html` (3-page set)                | not detected (persona layer)                                                                                                   |
| 2.4.6 Headings and Labels                       | `wcag/2-4-6-headings-labels.html`                                 | not detected (ai layer)                                                                                                        |
| 2.5.1 Pointer Gestures                          | `wcag/2-5-1-pointer-gestures.html`                                | engine-at `at/drag-without-alternative` (needs-review)                                                                         |
| 2.5.2 Pointer Cancellation                      | `wcag/2-5-2-pointer-cancellation.html`                            | engine-at `at/pointer-down-action` (likely)                                                                                    |
| 2.5.4 Motion Actuation                          | `wcag/2-5-4-motion-actuation.html`                                | engine-at `at/motion-actuation` (needs-review)                                                                                 |
| 2.5.7 Dragging Movements                        | `wcag/2-5-7-dragging-movements.html`                              | engine-at `at/drag-without-alternative` (needs-review)                                                                         |
| 3.1.2 Language of Parts                         | `wcag/3-1-2-language-of-parts.html`                               | not detected (ai layer)                                                                                                        |
| 3.2.3 Consistent Navigation                     | `wcag/3-2-3-consistent-navigation/products.html` (2-page set)     | not detected (persona layer)                                                                                                   |
| 3.2.4 Consistent Identification                 | `wcag/3-2-4-consistent-identification/products.html` (2-page set) | not detected (persona layer)                                                                                                   |
| 3.2.6 Consistent Help                           | `wcag/3-2-6-consistent-help/products.html` (2-page set)           | not detected (persona layer)                                                                                                   |
| 3.3.3 Error Suggestion                          | `wcag/3-3-3-error-suggestion.html`                                | not detected (ai layer)                                                                                                        |
| 3.3.4 Error Prevention (Legal, Financial, Data) | `wcag/3-3-4-error-prevention/checkout.html` (2-page set)          | not detected (persona layer)                                                                                                   |
| 3.3.7 Redundant Entry                           | `wcag/3-3-7-redundant-entry/billing.html` (2-page set)            | not detected (persona layer)                                                                                                   |
| 3.3.8 Accessible Authentication (Minimum)       | `wcag/3-3-8-accessible-authentication.html`                       | engine-at `at/auth-paste-blocked` (likely)                                                                                     |

16 of 30 detected: 3 by engine-static alone (all `violation`), 13 by engine-at (engine-static also asks about 3 of those). Every correct-pattern page (`-ok`, set pages) gets zero findings from every engine.

## Follow-ups (proposed, not done)

- A deterministic reading-order check (DOM order vs rendered position of text blocks, `needs-review`) would cover 1.3.2; it belongs in engine-visual (wave 7c-2's area).
- A header-row heuristic for tables axe classifies as layout (first row all bold/differently styled `<td>`, `likely`) would cover the 1.3.1 fixture.
- Persona tasks for the multi-page sets (2.4.5, 3.2.3, 3.2.4, 3.2.6, 3.3.4, 3.3.7) in `fixtures/personas.json`.

## Requested core/browser changes

None.
