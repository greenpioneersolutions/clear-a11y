# S05: Accessibility-tree and widget engines

## Goal

Build two engines. `@clear-a11y/engine-at` reads the browser's accessibility tree the way assistive technology does and checks names, roles, states, live regions and error announcements. `@clear-a11y/engine-widgets` drives custom widgets with the keyboard and checks them against the ARIA Authoring Practices (APG) keyboard contracts. Real screen-reader automation (Guidepup) is an opt-in extra, never required. Read the ground rules in "Notes" first.

## Wave

Wave 2, **parallel** with S02, S03, S04. Runs in its own git worktree. The two engines are independent of each other.

## Projects

| Project                      | Path                       | Package                      | Tags                                             | Status                       |
| ---------------------------- | -------------------------- | ---------------------------- | ------------------------------------------------ | ---------------------------- |
| `@clear-a11y/engine-at`      | `packages/engines/at`      | `@clear-a11y/engine-at`      | `type:engine`, `scope:at`, `publish:public`      | created (engine generator)   |
| `@clear-a11y/engine-widgets` | `packages/engines/widgets` | `@clear-a11y/engine-widgets` | `type:engine`, `scope:widgets`, `publish:public` | created (engine generator)   |
| `@clear-a11y/runner`         | `packages/runner`          | `@clear-a11y/runner`         | `type:feature`, `scope:runner`, `publish:public` | touched (two registry lines) |

## Depends on

S01 (browser contracts incl. `getCdpSession`, `stateMeta`, runner registry). Error-announcement checks run in `form-invalid` states produced by S03, but tests build `PageContext` with `stateMeta` by hand, so there's no hard dependency on S03.

## Scope

### engine-at

- Tree: CDP `Accessibility.getFullAXTree` (via `getCdpSession`), mapped to a compact pure model `AxNode { role, name, nameSource, states, backendNodeId, children }` with `DOM.describeNode`/`DOM.resolveNode` to get a selector. Evidence `axTree`: a short indented text snippet of the node and its parent, e.g. `button "" (focusable, expanded=false)`.

| Rule ID                                | SC           | Tier        | Detection                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at/name-missing`                      | 4.1.2        | `violation` | Interactive roles (button, link, checkbox, radio, switch, tab, menuitem, option, combobox, textbox, slider, spinbutton) with an empty computed name, **only for nodes axe doesn't cover** (custom roles on non-native elements, shadow DOM, names emptied after state changes). |
| `at/role-missing`                      | 4.1.2        | `likely`    | Focusable element (`tabindex>=0`) with a key/click listener whose AX role is `generic`/`none`.                                                                                                                                                                                  |
| `at/state-missing`                     | 4.1.2        | `violation` | Required state absent for the role: `checkbox`/`switch` without `checked`, `tab` without `selected`, `combobox` without `expanded`, `option` in a listbox with no `selected` anywhere when the listbox is single-select.                                                        |
| `at/label-in-name`                     | 2.5.3        | `likely`    | Visible text label (rendered text of the control or its `<label>`) not contained in the accessible name after normalization (case, whitespace, punctuation). Icon-only controls are skipped (AI judge in S07).                                                                  |
| `at/error-not-associated`              | 3.3.1, 1.3.1 | `likely`    | In `form-invalid`/`form-empty` states: a field marked `aria-invalid="true"` (or with new adjacent error text) whose error text is not in its accessible description (`aria-describedby`/`aria-errormessage`).                                                                   |
| `at/error-not-identified`              | 3.3.1        | `violation` | In those states: a field is invalid (`aria-invalid`, `:invalid` with `novalidate`, or a visual-only change) and no text anywhere describes the error.                                                                                                                           |
| `at/error-not-announced`               | 4.1.3        | `likely`    | Replay the state with an announcement recorder: fresh `goto` with `page.addInitScript` installing a MutationObserver on live regions (`aria-live`, `role=status                                                                                                                 | alert | log`) that records the accessible text of changes, then `ctx.stateMeta.replay(page)`. If error text appeared but nothing was announced **and** focus did not move to the error/summary, report. Evidence `announcement`: the recorded queue (`assertive: "Email is required"`) or "nothing announced". |
| `at/live-region-inserted-with-content` | 4.1.3        | `likely`    | An `aria-live` region (not `role=alert`) that is added to the DOM already containing its message; screen readers usually ignore it.                                                                                                                                             |

- **Guidepup** (`at.guidepup`, default `false`): an optional adapter `src/lib/guidepup.ts` that dynamically imports `@guidepup/guidepup` only when enabled and the platform supports it (macOS VoiceOver, Windows NVDA). It is an optional peer dependency, not in the catalog's required set. Findings it confirms raise confidence; it never runs in CI and tests skip unless `CLEAR_A11Y_GUIDEPUP=1`.

### engine-widgets

Detect widgets by role/markup, then run a keyboard script per contract on a fresh page (the runner gives one per engine run; re-navigate between widgets with `page.goto(ctx.url)` if a script changed state).

| Rule ID                        | Contract                                                                                                                            | SC / Tier                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `widgets/tabs-keyboard`        | Arrow Left/Right (or Up/Down if vertical) move between tabs; Home/End; only the active tab is in the Tab sequence (roving tabindex) | Can't reach or operate other tabs by keyboard at all → 2.1.1 `violation`; operable only via Tab instead of arrows → 2.1.1 `needs-review` |
| `widgets/tabs-selected-state`  | `aria-selected` follows activation; the shown panel matches                                                                         | 4.1.2 `violation`                                                                                                                        |
| `widgets/menu-keyboard`        | Menu button opens with Enter/Space/ArrowDown; arrows move; Escape closes and returns focus to the button                            | Unoperable → 2.1.1 `violation`; APG deviations → `needs-review`                                                                          |
| `widgets/combobox-keyboard`    | ArrowDown opens the popup; arrows move the active option (`aria-activedescendant` or focus); Enter selects; Escape closes           | Unoperable → 2.1.1 `violation`; `aria-expanded`/`aria-activedescendant` not updated → 4.1.2 `violation`                                  |
| `widgets/listbox-keyboard`     | Arrows change the active/selected option; `aria-selected` updates                                                                   | 2.1.1 / 4.1.2 as above                                                                                                                   |
| `widgets/dialog-initial-focus` | On open, focus moves inside the dialog; dialog has an accessible name                                                               | 2.4.3 `likely`; missing name → 4.1.2 `violation` (only if axe didn't report it)                                                          |
| `widgets/disclosure-keyboard`  | Enter and Space toggle; `aria-expanded` reflects visibility                                                                         | 2.1.1 / 4.1.2 `violation`                                                                                                                |
| `widgets/grid-keyboard`        | Arrow keys move focus between cells in `role=grid`                                                                                  | 2.1.1 `violation` if cells are unreachable; otherwise `needs-review`                                                                     |

Dialog Escape and focus return belong to engine-keyboard (S02); don't duplicate them. APG is guidance, not WCAG: only failures that block keyboard operation or misreport state are violations.

## Out of scope

Tree, treegrid, slider, carousel, feed contracts (v0.3); screen-reader output verification in CI; AI judgment of name quality (S07).

## Files to create/change

- `packages/engines/at/src/lib/{engine.ts,ax-tree.ts,announcements.ts,guidepup.ts}`, `src/rules/*.ts` + tests, pure `normalize-name.ts`, `required-states.ts`
- `packages/engines/widgets/src/lib/{engine.ts,detect.ts,contracts/{tabs,menu,combobox,listbox,dialog,disclosure,grid}.ts}`, `src/rules/*.ts` + tests
- `test/*.integration.test.ts` in both engines
- `packages/runner/src/engines.ts` (two lines)
- `fixtures/site/at/**`, `fixtures/site/widgets/**`, matching `fixtures/expected/**`, `docs/rules/{at,widgets}/*.md`

## Tests

- Unit: AX tree mapping from recorded CDP JSON (`src/__fixtures__/*.json`), name normalization and containment, required-state table, announcement queue reducer, widget detection from DOM snapshots, contract evaluators fed with recorded key/state sequences (pure: `evaluateTabs(steps)`).
- Integration: each rule against barrier and `-ok` pages; announcement recorder against `fixtures/site/at/error-not-announced.html` with `stateMeta.replay` that submits the form.
- Guidepup test file exists and is skipped by default.

## Fixtures + expected findings

`fixtures/site/at/`: `name-missing-custom-button.html` → `-ok`; `role-missing-div-tabindex.html` → `-ok`; `state-missing-checkbox.html` → `-ok`; `label-in-name-mismatch.html` (visible "Search", name "Find products") → `-ok`; `error-not-associated.html` → `-ok`; `error-not-announced.html` (S00c seed; errors injected without live region or focus move) → `error-not-announced-ok.html` (pre-existing `role=status` region); `live-region-inserted.html` → `-ok`.

`fixtures/site/widgets/`: `tabs-no-arrow-keys.html` (S00c seed) → `tabs-ok.html`; `tabs-selected-stale.html` → `-ok`; `menu-button-broken.html` → `menu-button-ok.html`; `combobox-no-keyboard.html` → `combobox-ok.html`; `listbox-broken.html` → `listbox-ok.html`; `dialog-no-initial-focus.html` → `dialog-ok.html`; `disclosure-space-ignored.html` → `disclosure-ok.html`; `grid-no-arrows.html` → `grid-ok.html`. Build the `-ok` pages from the APG example patterns (rewritten, not copied verbatim; credit APG in a comment).

Expected entries use `layer: "at"` or `layer: "widgets"`, real selectors and `ruleId`.

## Docs to update

`docs/rules/at/*.md`, `docs/rules/widgets/*.md`, both engine READMEs (including Guidepup opt-in steps), `docs/DECISIONS.md` (APG-vs-WCAG tier policy, which axe overlaps are skipped).

## Acceptance criteria

- [ ] Every rule has rule file, unit test, barrier + `-ok` fixture, expected entries, integration test and doc.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `test-integration` passes for both engines with Guidepup disabled.
- [ ] `pnpm nx sync:check` passes; neither engine imports the other or any other engine.
- [ ] `config.at.guidepup` defaults to `false`; nothing imports `@guidepup/guidepup` statically.
- [ ] `pnpm nx run bench:run`: recall improves for 2.1.1, 2.5.3, 3.3.1, 4.1.2, 4.1.3 vs the S01 baseline; precision of `violation` ≥ 0.95. Record the delta.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract:** `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`. `PageContext { page, url, state, viewport, config, artifacts, log, stateMeta? }`, `StateMeta { kind, triggerSelector?, replay? }`, `getCdpSession` and `selectorFor` come from `@clear-a11y/browser`; `Finding`, `RuleMeta`, WCAG map, config from `@clear-a11y/core`. Engine names `engine-at`, `engine-widgets`. Validate `ctx.config.at` / `ctx.config.widgets` with your own Zod schemas.
- **Tags/boundaries:** engine → data-access, util only; `publish:public` → public only; test files may import `test-utils`.
- **Engines never import other engines**; coordination in `runner`. No detection logic in `apps/`.
- **Tiers:** `violation` deterministic, high certainty; `likely`; `needs-review` with a yes/no `question`.
- **Generators:** `nx g @clear-a11y/workspace-plugin:engine at`, `... engine widgets`, then `:rule` per rule. Run `pnpm nx sync`.
- **Offline:** localhost fixtures; no screen reader required.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`. Only registry lines in `runner/src/engines.ts`.

### Pitfalls and hints

- `Accessibility.getFullAXTree` returns ignored nodes too; filter `ignored: true`, but keep them when explaining why a node has no name.
- Map AX nodes to DOM via `backendDOMNodeId`; nodes inside iframes need the frame's CDP target.
- Recorder scripts must be installed before the page's own scripts (`addInitScript` then `goto`); observing after the fact misses announcements.
- Use the runner-provided fresh page per run, and re-`goto` between widget scripts; one widget's script leaving focus inside a popup will break the next.
- Avoid double-reporting axe rules (`button-name`, `link-name`, `aria-required-attr`): restrict `at/*` to what axe structurally can't see, and rely on runner dedupe for the rest.
