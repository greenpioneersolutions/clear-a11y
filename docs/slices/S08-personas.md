# S08: Persona agents

## Goal

Add task-based persona agents to `@clear-a11y/ai`: an agent gets a task ("sign up for the newsletter", "add the blue shirt to the cart and check out") and a constraint (keyboard only, or screen-reader output only), tries to complete it on the real page, and reports exactly where it got stuck, with a full step trace. This catches barriers that only show up when someone actually tries to do something. The runner orchestrates personas; a deterministic policy makes them testable and benchmarkable offline. Read the ground rules in "Notes" first.

## Wave

Wave 4, **parallel** with S09 and S10. Runs in its own git worktree.

## Projects

| Project              | Path              | Package              | Tags                                             | Status                       |
| -------------------- | ----------------- | -------------------- | ------------------------------------------------ | ---------------------------- |
| `@clear-a11y/ai`     | `packages/ai`     | `@clear-a11y/ai`     | `type:engine`, `scope:ai`, `publish:public`      | touched (`src/personas/`)    |
| `@clear-a11y/runner` | `packages/runner` | `@clear-a11y/runner` | `type:feature`, `scope:runner`, `publish:public` | touched (`runPersonas` step) |

## Depends on

S07 (providers, mock provider, recordings, prompt versioning, injection guard), S01 (runner hook `runPersonas`, browser `getCdpSession`).

## Scope

**Config** (validated inside `ai` with its own Zod schema from the loose `config.personas` array in core):

```ts
interface PersonaTask {
  id: string; // "newsletter-signup"
  url: string; // start page (must be in the scan's explicit targets/origin)
  goal: string; // natural-language task
  constraint: 'keyboard-only' | 'screen-reader';
  success: { urlIncludes?: string; textVisible?: string; selectorVisible?: string };
  inputs?: Record<string, string>; // test data the persona may type ("email": "a@example.test")
  maxSteps?: number; // default 40
  policy?: 'llm' | 'heuristic' | 'scripted';
}
```

**Observations and actions** (`src/personas/`):

- `keyboard-only`: observation = focused element (role, name, states, selector), a compact accessibility-tree outline of the viewport, visible text near focus. Actions: `Tab`, `Shift+Tab`, `Enter`, `Space`, `ArrowUp/Down/Left/Right`, `Escape`, `Home`, `End`, `type(text)`, `done`, `give_up(reason)`. No mouse, no `element.click()`, no `focus()` by selector.
- `screen-reader`: observation = text serialization of the accessibility tree only (no screenshot, no CSS), plus the last announcements captured by a live-region recorder; actions = keyboard actions above plus virtual-cursor moves implemented over the AX tree: `next_heading`, `next_landmark`, `next_form_field`, `next_link`, `read_next` (moves focus to the node when focusable, otherwise moves a virtual cursor).
- Every step is recorded: `{ n, observationDigest, action, rationale?, result: { focusChanged, urlChanged, newAnnouncements }, screenshot? }`.

**Policies** (`PersonaPolicy { nextAction(obs, history): Promise<Action> }`):

- `llm`: uses the configured provider and a versioned prompt `prompts/persona-keyboard.v1.md` / `persona-screen-reader.v1.md`; observation text wrapped in the nonce-delimited data block from S07; JSON action schema; invalid output counts as a failed step.
- `heuristic` (deterministic, no AI): parses the goal and `inputs` into target words; Tabs (or uses virtual-cursor moves) through the page, fills fields whose accessible name matches an input key, activates the control whose name best matches the goal verb ("Sign up", "Subscribe", "Place order"), and checks success. Used by the benchmark.
- `scripted`: a fixed action list for unit tests.

**Stuck detection and findings**:

- Stuck when: `maxSteps` reached; the same observation repeats N times; focus can't reach a control that is visible (cross-check: the control exists in the DOM and is visible but never appears as a focus stop → `2.1.1`); a needed field has no accessible name (→ `4.1.2`/`1.3.1`); an action produced visible change but no announcement for the screen-reader persona (→ `4.1.3`).
- Finding: `ruleId: persona/task-blocked`, engine `ai-persona-keyboard` or `ai-persona-screen-reader` (always `ai-` prefixed, so the tier policy caps them), `wcag` from the stuck reason, tier `likely` when the stuck reason is backed by a measurable fact in the trace (unreachable visible control), else `needs-review` with a question ("Could a keyboard user complete 'newsletter signup' on this page?"), `target` = the element where the persona got stuck, `message` = task + where + why, `evidence.focusPath` = the persona's focus stops, full trace saved as an artifact (JSON) and referenced in the message.
- Success produces no finding; the trace is still returned in `ScanResult.personas[]` (additive runner result field; not a Finding schema change).

**Runner**: `runPersonas(browser, config.personas, provider)` after page scans; fresh context per task; same route guard as engine-states (abort non-GET requests to other origins; allow same-origin form posts only on localhost fixtures or when `personas.allowSubmit` is true).

## Out of scope

Recorded user flows as tasks (v0.2), multi-page tasks across origins, vision-only personas, magnifier/zoom personas (candidate for later), real screen readers.

## Files to create/change

`packages/ai/src/personas/{types.ts,config.ts,observe-keyboard.ts,observe-sr.ts,virtual-cursor.ts,actions.ts,policies/{llm.ts,heuristic.ts,scripted.ts},run-persona.ts,stuck.ts,to-finding.ts}` + tests; `packages/ai/prompts/persona-*.v1.md`; `packages/ai/test/personas.integration.test.ts`, `test/recordings/persona-*.json`; `packages/runner/src/personas.ts` + test; `fixtures/site/persona/**`, `fixtures/expected/persona/**`, bench config listing persona tasks (`tools/bench/personas.json` or inside the bench options); `docs/rules/ai/persona-task-blocked.md`.

## Tests

- Unit: action validation per constraint (keyboard persona can't click), virtual cursor over a recorded AX tree, stuck detectors (repeat, max steps, unreachable control), heuristic target matching ("Subscribe" vs goal "sign up for the newsletter" with synonyms list), trace serialization, finding mapping and tiers.
- Integration (Playwright, offline): heuristic policy completes the task on each `-ok` fixture and gets stuck on each barrier at the expected element; `llm` policy with the `mock` provider replays recorded actions on one barrier and one control page; scripted policy proves the action executor.

## Fixtures + expected findings

`fixtures/site/persona/` (barrier → passing control):

- `newsletter-keyboard-blocked.html` (the "Subscribe" control is a `div` with a click handler; keyboard persona can't activate it; 2.1.1) → `newsletter-keyboard-ok.html`
- `checkout-focus-lost.html` (after "Add to cart", a modal steals and then drops focus to `body`; 2.4.3) → `checkout-ok.html`
- `signup-sr-unlabelled.html` (email field with placeholder only and an icon submit button with no name; screen-reader persona can't identify them; 4.1.2/1.3.1) → `signup-sr-ok.html`
- `search-sr-no-announcement.html` (results update silently; 4.1.3) → `search-sr-ok.html`

Expected entries `layer: "persona"`, selectors of the blocking element, `ruleId: "persona/task-blocked"`. The persona tasks for these pages live in the bench config with `policy: "heuristic"`.

## Docs to update

`packages/ai/README.md` (personas section: task config, constraints, policies, privacy), `docs/rules/ai/persona-task-blocked.md`, runner README (persona step, `ScanResult.personas`), `docs/DECISIONS.md` (heuristic policy design, stuck thresholds).

## Acceptance criteria

- [ ] Keyboard-only and screen-reader personas run with `heuristic`, `scripted` and `llm` (mock) policies.
- [ ] Each barrier fixture yields `persona/task-blocked` at the right element with a full trace artifact; each control page completes with no finding.
- [ ] Persona findings are never `violation` (engine names start with `ai-`; verified through the runner).
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `test-integration` for ai and runner passes offline; `pnpm nx sync:check` passes.
- [ ] `pnpm nx run bench:run` shows persona-layer recall; overall recall ≥ previous wave; precision of `violation` unchanged. Record the delta.

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Engine contract:** `interface Engine { name: string; run(ctx: PageContext): Promise<Finding[]> }`; `PageContext`, `getCdpSession`, `selectorFor` in `@clear-a11y/browser`; `Finding`, config, `enforceTierPolicy` in `@clear-a11y/core`. Personas are multi-step, so they're driven by the runner through `ai`'s `runPersona(page, task, policy)` API rather than as a single-page `Engine`; that's fine because `ai` stays `type:engine` (depends only on browser and core).
- **Tags/boundaries:** engine → data-access, util; feature → feature, engine, data-access, util. `ai` must not import engine-keyboard or engine-at; re-implement the small AX/focus helpers it needs, or use `@clear-a11y/browser` helpers. Test files may import `test-utils`.
- **Tiers:** persona findings are `likely` or `needs-review` only. AI never `violation`.
- **Untrusted content:** page text in observations is data; reuse the S07 delimiter and injection guard.
- **Offline:** mock provider + recordings; heuristic policy for the benchmark; localhost fixtures only.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`. S09 and S10 also touch the runner (different files); keep `scan.ts` edits small.

### Pitfalls and hints

- The heuristic policy must not "cheat" with DOM access the persona wouldn't have: it may only read its own observations.
- Cap trace size (observation digests, not full trees, per step) and store full observations only in the artifact.
- Set `maxSteps` low in tests to keep runs fast; stuck detection should trigger well before it.
