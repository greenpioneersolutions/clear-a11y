# @clear-a11y/engine-keyboard

Keyboard-only testing for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). It tests a page the way an auditor does with only a keyboard: it walks the real Tab order and compares it with the visual reading order, checks that focus is visible and never hidden, detects keyboard traps and mouse-only controls, checks Escape and focus return on overlays, verifies skip links, and notices when merely focusing an element changes the context (navigation, a new window, a dialog, focus moved away). Every finding carries the focus path as evidence.

Engines are run by `@clear-a11y/runner`; you rarely use them directly.

## Install

```sh
pnpm add @clear-a11y/engine-keyboard
```

## Usage

```ts
import { createKeyboardEngine } from '@clear-a11y/engine-keyboard';

const engine = createKeyboardEngine();
const findings = await engine.run(pageContext); // PageContext from @clear-a11y/browser
```

The focus walk is reusable on its own (the AI focus-order judge consumes it):

```ts
import { walkFocus, toFocusStop } from '@clear-a11y/engine-keyboard';

const walk = await walkFocus(page, { maxStops: 150 });
const focusPath = walk.stops.map((s) => toFocusStop(s)); // FocusStop[] for evidence.focusPath
```

## Rules

| Rule                                                                                          | WCAG   | Tier                         |
| --------------------------------------------------------------------------------------------- | ------ | ---------------------------- |
| [`keyboard/focus-order-backward`](../../../docs/rules/keyboard/focus-order-backward.md)       | 2.4.3  | likely                       |
| [`keyboard/focus-not-visible`](../../../docs/rules/keyboard/focus-not-visible.md)             | 2.4.7  | violation / needs-review     |
| [`keyboard/focus-obscured`](../../../docs/rules/keyboard/focus-obscured.md)                   | 2.4.11 | violation                    |
| [`keyboard/keyboard-trap`](../../../docs/rules/keyboard/keyboard-trap.md)                     | 2.1.2  | violation                    |
| [`keyboard/click-not-focusable`](../../../docs/rules/keyboard/click-not-focusable.md)         | 2.1.1  | likely / needs-review        |
| [`keyboard/escape-does-not-close`](../../../docs/rules/keyboard/escape-does-not-close.md)     | 2.1.1  | needs-review (overlay state) |
| [`keyboard/focus-not-returned`](../../../docs/rules/keyboard/focus-not-returned.md)           | 2.4.3  | likely (overlay state)       |
| [`keyboard/overlay-focus-not-moved`](../../../docs/rules/keyboard/overlay-focus-not-moved.md) | 2.4.3  | likely (dialog state)        |
| [`keyboard/skip-link-broken`](../../../docs/rules/keyboard/skip-link-broken.md)               | 2.4.1  | violation                    |
| [`keyboard/skip-link-missing`](../../../docs/rules/keyboard/skip-link-missing.md)             | 2.4.1  | needs-review                 |
| [`keyboard/context-change-on-focus`](../../../docs/rules/keyboard/context-change-on-focus.md) | 3.2.1  | violation / likely           |

Overlay rules run only when the runner hands over an overlay state from the state explorer (`ctx.stateMeta.kind` of `modal`, `dialog`, `alertdialog`, `menu`, `popover` or `overlay`, with `triggerSelector` and `replay`).

## Options

`config.keyboard` (validated with zod, all optional):

| Option                 | Default | Meaning                                                  |
| ---------------------- | ------- | -------------------------------------------------------- |
| `maxStops`             | 150     | Most Tab presses in one walk.                            |
| `focusVisibleMaxStops` | 40      | Stops whose focus indicator is checked with screenshots. |
| `maxFindingsPerRule`   | 10      | Findings per rule per page state.                        |
| `focusCropPadding`     | 8       | CSS px around the element in focus-indicator crops.      |
| `maxClickCandidates`   | 300     | Elements whose event listeners are inspected.            |

## Development

```sh
pnpm nx test @clear-a11y/engine-keyboard              # unit tests (no browser)
pnpm nx test-integration @clear-a11y/engine-keyboard  # Playwright against fixtures/
```

Add a rule with `pnpm nx g @clear-a11y/workspace-plugin:rule --engine=keyboard --name=<rule-name> --wcag=<sc>`.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (rules reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/engines/keyboard
