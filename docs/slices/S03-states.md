# S03: States engine

## Goal

Build `@clear-a11y/engine-states`, which discovers the hidden states of a page that a human auditor would open (menus, modals, accordions, tabs, tooltips, disclosures, form error states) and describes each as a replayable `StateDescriptor`. Extend the runner so every discovered state is replayed and handed to the other engines with `ctx.state` and `ctx.stateMeta` set. Barriers that only appear after interaction become visible to every engine. Read the ground rules in "Notes" first.

## Wave

Wave 2, **parallel** with S02, S04, S05. This slice **owns runner pipeline changes** in Wave 2; the other slices only add one registry line.

## Projects

| Project                     | Path                      | Package                     | Tags                                             | Status                     |
| --------------------------- | ------------------------- | --------------------------- | ------------------------------------------------ | -------------------------- |
| `@clear-a11y/engine-states` | `packages/engines/states` | `@clear-a11y/engine-states` | `type:engine`, `scope:states`, `publish:public`  | created (engine generator) |
| `@clear-a11y/runner`        | `packages/runner`         | `@clear-a11y/runner`        | `type:feature`, `scope:runner`, `publish:public` | touched (state pipeline)   |

## Depends on

S01 (browser `PageContext`/`StateMeta`, runner scan with per-engine fresh navigation and the `discoverStates` hook).

## Scope

**Descriptor** (exported from engine-states):

```ts
interface StateDescriptor {
  id: string; // "menu:open#main-nav", "modal:open#signup", "form:invalid#signup"
  kind:
    | 'menu'
    | 'modal'
    | 'accordion'
    | 'tab'
    | 'tooltip'
    | 'disclosure'
    | 'popover'
    | 'form-empty'
    | 'form-invalid';
  trigger: string; // stable selector of the control that opens it
  label: string; // human description for reports
  open(page: Page): Promise<void>; // replays from a freshly loaded page
  close?(page: Page): Promise<void>;
  verify(page: Page): Promise<boolean>; // the state really is open
}
```

**Discovery** `discoverStates(page, config): Promise<StateDescriptor[]>`:

- Candidates: `[aria-expanded]`, `[aria-haspopup]`, `[aria-controls]`, `summary` in `details`, `[role=tab]` not selected, `button`s/links with `data-*toggle*`/`popovertarget`, elements with `title` or `aria-describedby` (tooltip candidates via hover and focus), and buttons whose activation makes new content visible.
- For each candidate: snapshot visible, non-trivial elements (pure `visibleSetDiff(before, after)`), activate (click; for tooltips hover then focus), diff, classify the new content (`dialog`/`[role=dialog]` → modal; `[role=menu]` or list of links → menu; `[role=tabpanel]` → tab; region controlled by `aria-controls` → disclosure/accordion; small text popup → tooltip), then reload before the next candidate.
- Forms: for each `form` with a submit control: `form-empty` = submit with no input; `form-invalid` = fill pure `invalidValueFor(input)` values (bad email, out-of-range number, too-short text by `minlength`, mismatched `pattern`) and submit. State reached when new visible text appears, `aria-invalid="true"` appears, or `:invalid` + `reportValidity` bubbles exist (native bubbles are not in the DOM; record as `form-invalid` with `nativeValidation: true` in the label).
- Limits: `states.maxStates` (default 20 per page), `states.maxCandidates` (60), per-candidate timeout. Dedupe states that reveal the same content.

**Safety while exploring** (live sites will be scanned later):

- `page.route('**/*')` aborts every non-GET request and any navigation away from the page's origin during discovery and replay (form submits are evaluated client-side only). Configurable only to stricter.
- Never click elements whose accessible name matches destructive patterns (`delete`, `remove`, `logout|sign out`, `buy|pay|purchase|checkout`, `unsubscribe`), and never follow links to other pages (`a[href]` with a different path).

**Rule** (rule generator): `states/expanded-state-mismatch` (4.1.2, `violation`): after activation the controlled content became visible but `aria-expanded` stayed `false` (or the reverse after closing). Deterministic and naturally observed during discovery. `run(ctx)` returns this rule's findings for the default state; discovery itself is a separate export.

**Runner integration** (`packages/runner/src/states.ts` + `scan.ts`):

- After the default-state engines run, call `discoverStates` once per URL per viewport (config `states.viewports`, default `['desktop', 'mobile']` because mobile menus differ).
- For each descriptor: for each enabled engine except states: fresh `goto` → `descriptor.open(page)` → `verify` (skip and log if false) → build `PageContext` with `state: descriptor.id` and `stateMeta: { kind, triggerSelector: descriptor.trigger, replay: descriptor.open }` → `engine.run(ctx)`.
- Findings already reported in the default state for the same selector + rule are dropped from state runs (dedupe by `ruleId + selector`, not by id, which includes state).
- Expose `scan({ ..., states: false })` to skip.

## Out of scope

Recorded multi-page flows (v0.2), authenticated flows beyond storage state, APG keyboard contracts (S05), Escape/focus-return checks (S02 consumes `stateMeta`), error announcement checks (S05 consumes `form-invalid` states).

## Files to create/change

- `packages/engines/states/src/lib/{engine.ts,discover.ts,classify.ts,forms.ts,safety.ts,descriptor.ts}`
- `packages/engines/states/src/rules/expanded-state-mismatch.ts` + test; pure `visibleSetDiff.ts`, `invalidValueFor.ts`, `stateId.ts` + tests
- `packages/engines/states/test/*.integration.test.ts`
- `packages/runner/src/{states.ts,scan.ts,engines.ts}` + tests
- `fixtures/site/states/**`, `fixtures/expected/states/**`, `docs/rules/states/expanded-state-mismatch.md`

## Tests

- Unit: `visibleSetDiff`, `classify` on hand-built snapshots, `invalidValueFor` per input type, `stateId` stability and sanitization, destructive-name filter, route guard decision function (`shouldAbort(request)`).
- Integration: discovery on each states fixture returns the expected kinds and ids; `open` → `verify` round-trips from a fresh page; non-GET requests are aborted (fixture form posts to `/submit` and the server records nothing); runner test proving a barrier that exists only inside an opened menu (`menu-hidden-link-no-name.html`) is found by engine-static in state `menu:open#...` and not in the default state.

## Fixtures + expected findings

Under `fixtures/site/states/` (barrier → correct pattern):

- `menu-hidden-link-no-name.html` (icon link without name inside a closed nav menu; expected issue has `layer: "states"` because the state engine is what makes it reachable) → `menu-hidden-link-no-name-ok.html`
- `modal-unlabelled-input.html` (input without label inside a modal) → `-ok`
- `accordion-expanded-mismatch.html` (`aria-expanded` never updates) → `accordion-expanded-ok.html`
- `form-error-no-text.html` (invalid submit only turns borders red, 3.3.1) → `form-error-text-ok.html`
- `tooltip-contrast.html` (tooltip text with low contrast, 1.4.3) → `-ok`
- `destructive-button-ok.html` (a "Delete account" button that must never be clicked; the fixture server counts requests and the test asserts zero)

## Docs to update

`docs/rules/states/expanded-state-mismatch.md`, `packages/engines/states/README.md` (descriptor contract, safety model), `packages/runner/README.md` (state pipeline), `docs/DECISIONS.md` (safety rules, limits, default viewports for states).

## Acceptance criteria

- [ ] `discoverStates` finds menu, modal, accordion, tab, tooltip, disclosure and form error states on the fixtures.
- [ ] Runner replays states and passes `state` + `stateMeta`; engines receive a fresh page per run.
- [ ] Non-GET requests and off-origin navigations are blocked during discovery/replay (tested).
- [ ] `pnpm nx run-many -t lint typecheck test build` and `test-integration` for engine-states and runner pass.
- [ ] `pnpm nx sync:check` passes; no engine imports `engine-states` (only runner does).
- [ ] `pnpm nx run bench:run`: recall rises for issues in `fixtures/site/states/**` (found by engine-static inside states); precision of `violation` ≥ 0.95. Record the delta.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract:** `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`. `PageContext { page, url, state, viewport, config, artifacts, log, stateMeta? }` and `StateMeta { kind, triggerSelector?, replay? }` live in `@clear-a11y/browser`. Engine name `engine-states`.
- **Tags/boundaries:** engine → data-access, util; feature (runner) → feature, engine, data-access, util. `publish:public` → public only. Test files may import `test-utils`.
- **Engines never import other engines.** Only the runner imports `engine-states`. No detection logic in `apps/`.
- **Tiers:** `violation` deterministic; `likely`; `needs-review` with a yes/no `question`.
- **Generators:** `nx g @clear-a11y/workspace-plugin:engine states`, `:rule expanded-state-mismatch --engine=states --wcag=4.1.2`, `:fixture states/<page>`. Run `pnpm nx sync`.
- **Offline:** localhost fixtures only.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; note needed changes under "Pending core changes" in `docs/DECISIONS.md`. Expect trivial merge conflicts in `runner/src/engines.ts` with S02/S04/S05 (one line each); keep your edits elsewhere in that file minimal.

### Pitfalls and hints

- Replay must be independent of discovery order: `open` re-locates the trigger by selector on a fresh page and performs the same action (and the same input fills for forms).
- Hover tooltips need the mouse moved away first; focus tooltips need `focus()` not click.
- Use `locator.isVisible()` plus a size/opacity check for "visible"; `display: contents` and `visibility` inheritance trip naive checks.
- Cost grows as states × engines × viewports. Respect limits and log skipped states rather than silently dropping them.
- Native validation bubbles are browser UI, not DOM; don't expect engines to see them.
