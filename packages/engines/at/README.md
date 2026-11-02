# @clear-a11y/engine-at

Accessibility tree engine: names, roles, states, labels, live regions and error announcements as assistive technology sees them.

Part of [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). Engines are run by `@clear-a11y/runner`; you rarely use them directly.

## Install

```sh
pnpm add @clear-a11y/engine-at
```

## Usage

```ts
import { createAtEngine } from '@clear-a11y/engine-at';

const engine = createAtEngine();
const findings = await engine.run(pageContext); // PageContext from @clear-a11y/browser
```

## How it works

1. **Tree checks** (every state). Reads the browser accessibility tree over CDP (`Accessibility.getFullAXTree`) and maps it to a compact model: role, name, where the name came from, description, states and DOM backend id. Evidence `axTree` is a short snippet such as `textbox "Email address" (focusable, name from placeholder)`. Content checks in the same phase flag text alternatives and link texts that code can judge on its own (alt text that is a file name, generic duplicate link text); open-ended judgments are left to the opt-in AI judges in `@clear-a11y/ai`.
2. **Button probe** (default state). The page is reloaded with an announcement recorder installed before its own scripts (`page.addInitScript`). The recorder is a `MutationObserver` that knows which elements are live regions. The engine presses up to `probeButtons` plain buttons, then compares what appeared or disappeared on screen with what a screen reader would have been told, and where focus went.
3. **Form probe** (default state). Each form is submitted empty. In `form-invalid`/`form-empty` states from the state explorer, the state's `replay` is recorded instead.
4. **Media and form-purpose checks** (every state). `<video>`/`<audio>` elements are read for captions, transcripts, audio descriptions, live sources and autoplay; personal-data fields for autocomplete tokens.
5. **Interaction probes** (default state). A listener spy, installed before the page's scripts, records which event types have listeners on which elements. On a fresh load the engine reads motion listeners and drag/swipe targets, dispatches a cancelable `paste` on password and code fields, presses (without releasing) elements that only listen for pointer down, and, when the page has a document-level key listener, presses single-character keys with nothing focused.

The engine mutates the page, so the runner gives it a fresh page load per state.

## Rules

| Rule                                   | WCAG                | Tier           | Catches                                                                       |
| -------------------------------------- | ------------------- | -------------- | ----------------------------------------------------------------------------- |
| `at/expanded-state-missing`            | 4.1.2               | `violation`    | A button toggles a section but has no `aria-expanded`                         |
| `at/state-missing`                     | 4.1.2               | `violation`    | No tab in a tablist is `aria-selected="true"`                                 |
| `at/role-missing`                      | 4.1.2               | `likely`       | Focusable element with a click handler and no role                            |
| `at/placeholder-only-label`            | 3.3.2, 1.3.1        | `likely`       | Text field named only by its placeholder (axe accepts it)                     |
| `at/label-in-name`                     | 2.5.3               | `likely`       | Visible label not contained in the `aria-label` name                          |
| `at/status-message-not-announced`      | 4.1.3               | `likely`       | Message appears after a press, nothing announced                              |
| `at/live-region-inserted-with-content` | 4.1.3               | `likely`       | Live region added already holding its message                                 |
| `at/error-not-announced`               | 4.1.3               | `likely`       | Errors injected silently: no live region, no focus move                       |
| `at/error-not-associated`              | 3.3.1, 1.3.1        | `likely`       | Error text not in the field's name or description                             |
| `at/error-not-identified`              | 3.3.1               | `violation`    | Field flagged invalid (color, `aria-invalid`) with no text                    |
| `at/alt-text-suspicious`               | 1.1.1               | `likely`       | Alt text is a file name, a URL or a placeholder word                          |
| `at/link-text-generic`                 | 2.4.4               | `likely`       | Same generic link text to different places, no context                        |
| `at/media-captions-missing`            | 1.2.2, 1.2.4        | `needs-review` | Playable video without a captions track                                       |
| `at/media-alternative-missing`         | 1.2.1, 1.2.3, 1.2.5 | `needs-review` | Audio without a transcript; video without an audio description or transcript  |
| `at/audio-autoplay-no-control`         | 1.4.2               | `likely`       | Sound autoplays with no controls and no pause/mute button                     |
| `at/autocomplete-missing`              | 1.3.5               | `likely`       | Personal-data field without an autocomplete token                             |
| `at/auth-paste-blocked`                | 3.3.8               | `likely`       | Password/code field cancels paste, or login password has `autocomplete="off"` |
| `at/character-key-shortcut`            | 2.1.4               | `needs-review` | A single letter/digit key does something with nothing focused                 |
| `at/pointer-down-action`               | 2.5.2               | `likely`       | Control acts on mousedown/pointerdown/touchstart, before release              |
| `at/motion-actuation`                  | 2.5.4               | `needs-review` | Page listens to device motion/orientation on load                             |
| `at/drag-without-alternative`          | 2.5.7, 2.5.1        | `needs-review` | Drag or swipe target with no button or field next to it                       |

Rule pages: [`docs/rules/at/`](../../../docs/rules/at/). Roles that axe-core's `aria-required-attr`, `button-name` and similar rules already report are left to `engine-static`.

## Configuration

All options live under `at` in `clear-a11y` config:

| Option         | Default | Meaning                                                               |
| -------------- | ------- | --------------------------------------------------------------------- |
| `guidepup`     | `false` | Use a real screen reader through Guidepup (see below). Never in CI.   |
| `probeButtons` | `20`    | Press up to this many buttons per page. `0` turns the probe off.      |
| `probeForms`   | `3`     | Submit up to this many forms empty per page. `0` turns it off.        |
| `settleMs`     | `250`   | A probe ends when the DOM has been quiet this long (ms)...            |
| `maxSettleMs`  | `1500`  | ...or after this long at most.                                        |
| `budgetMs`     | `20000` | Stop starting new probes after this long, to stay inside the timeout. |

## Real screen reader (Guidepup, opt-in)

Findings always come from the deterministic recorder. A real screen reader is an optional extra and never needed for CI:

1. Install it yourself: `pnpm add -D @guidepup/guidepup` (it is not a dependency of this package).
2. Set up VoiceOver (macOS) or NVDA (Windows) as described in the [Guidepup docs](https://www.guidepup.dev/docs/guides/environment).
3. Set `at: { guidepup: true }` in your config.

The engine loads Guidepup with a dynamic import only when this is on and the platform is supported. The adapter interface (`ScreenReaderAdapter`) lives in `src/lib/guidepup.ts`. Its test is skipped unless `CLEAR_A11Y_GUIDEPUP=1`.

## Development

```sh
pnpm nx test @clear-a11y/engine-at              # unit tests (no browser)
pnpm nx test-integration @clear-a11y/engine-at  # Playwright against fixtures/
```

Add a rule with `pnpm nx g @clear-a11y/workspace-plugin:rule --engine=at --name=<rule-name> --wcag=<sc>`.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (rules reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/engines/at
