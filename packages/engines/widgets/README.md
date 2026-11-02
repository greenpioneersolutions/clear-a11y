# @clear-a11y/engine-widgets

Widget engine: drives custom widgets with the keyboard and checks them against the ARIA Authoring Practices keyboard contracts.

Part of [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). Engines are run by `@clear-a11y/runner`; you rarely use them directly.

## Install

```sh
pnpm add @clear-a11y/engine-widgets
```

## Usage

```ts
import { createWidgetsEngine } from '@clear-a11y/engine-widgets';

const engine = createWidgetsEngine();
const findings = await engine.run(pageContext); // PageContext from @clear-a11y/browser
```

## How it works

1. **Detect** widgets by role and markup: `role="tablist"`, menu buttons (`aria-haspopup="menu"`), `role="menubar"`, `role="combobox"`, standalone `role="listbox"`, `role="grid"`, disclosure buttons (`aria-expanded` outside a composite widget) and hidden dialogs with their triggers.
2. **Drive** each widget with a keyboard script (Arrow keys, Home, End, Enter, Space, Escape) and read back focus, `aria-selected`, `aria-expanded`, `aria-activedescendant` and visibility. Every script starts from a fresh load of the page, so one widget's leftovers (an open popup, moved focus) never affect the next.
3. **Judge** the recorded steps with small pure evaluators (`evaluateTabsKeyboard(obs)`, `evaluateMenuButton(obs)`, ...) that are unit tested without a browser.

The engine runs once per page and viewport, in the `default` state: its scripts reload the page anyway, so running them in every discovered state would only duplicate findings.

## Rules

| Rule                                                                                  | WCAG         | Tier                     | Catches                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [`widgets/tabs-keyboard`](../../../docs/rules/widgets/tabs-keyboard.md)               | 2.1.1        | violation / needs-review | Tabs neither in the Tab sequence nor reachable with arrow keys; Tab-only tabs for review                         |
| [`widgets/tabs-selected-state`](../../../docs/rules/widgets/tabs-selected-state.md)   | 4.1.2        | violation                | `aria-selected` not following the shown panel                                                                    |
| [`widgets/menu-keyboard`](../../../docs/rules/widgets/menu-keyboard.md)               | 2.1.1, 4.1.2 | violation / needs-review | Menus that open only with the mouse, unreachable items, stale `aria-expanded`; missing keys or Escape for review |
| [`widgets/combobox-keyboard`](../../../docs/rules/widgets/combobox-keyboard.md)       | 2.1.1, 4.1.2 | violation / needs-review | Popups that open only with the mouse, unreachable options, stale `aria-expanded`, visual-only active option      |
| [`widgets/listbox-keyboard`](../../../docs/rules/widgets/listbox-keyboard.md)         | 2.1.1, 4.1.2 | violation / needs-review | Unfocusable listboxes, arrows that do nothing, visual-only active option                                         |
| [`widgets/dialog-initial-focus`](../../../docs/rules/widgets/dialog-initial-focus.md) | 2.4.3, 4.1.2 | likely / violation       | Focus left behind an opened dialog (likely); dialog without a name (violation)                                   |
| [`widgets/disclosure-keyboard`](../../../docs/rules/widgets/disclosure-keyboard.md)   | 2.1.1, 4.1.2 | violation / needs-review | Click-only toggles, `aria-expanded` that disagrees with what is shown                                            |
| [`widgets/grid-keyboard`](../../../docs/rules/widgets/grid-keyboard.md)               | 2.1.1        | violation / needs-review | Grid controls unreachable because arrow keys do nothing                                                          |

### Tier policy: APG is guidance, WCAG is the bar

The ARIA Authoring Practices Guide (APG) describes conventions, not requirements. This engine reports a `violation` only when:

- keyboard operation is actually **blocked** (WCAG 2.1.1): something works with the mouse but cannot be reached or operated with the keyboard at all; or
- the **reported state is wrong** (WCAG 4.1.2): `aria-selected`, `aria-expanded` or the active option contradict what is on screen, or a dialog has no name.

Widgets that work but deviate from the APG (Tab-only tabs, a menu that ignores Down Arrow, Escape that does nothing) are `needs-review` with a yes/no question. Focus left behind a dialog is `likely`. Dialog Escape handling and focus return belong to `engine-keyboard` and are not repeated here.

## Configuration

Options live under `widgets` in the Clear A11Y config and are validated with Zod:

| Option            | Default | Meaning                                                                                                                        |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `contracts`       | all     | Which contracts run: `tabs`, `menu-button`, `menubar`, `combobox`, `listbox`, `dialog`, `disclosure`, `grid`                   |
| `maxPerKind`      | `5`     | At most this many widgets of each kind are driven per page                                                                     |
| `maxDialogProbes` | `8`     | For hidden dialogs with no linked trigger, try this many visible non-submit buttons to find the opener (`0` turns probing off) |
| `budgetMs`        | `20000` | Stop starting new widget scripts after this long, so large pages stay inside the scan timeout                                  |

```json
{ "widgets": { "contracts": ["tabs", "disclosure"], "maxPerKind": 3 } }
```

## Development

```sh
pnpm nx test @clear-a11y/engine-widgets              # unit tests (no browser)
pnpm nx test-integration @clear-a11y/engine-widgets  # Playwright against fixtures/
```

Add a rule with `pnpm nx g @clear-a11y/workspace-plugin:rule --engine=widgets --name=<rule-name> --wcag=<sc>`.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (rules reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/engines/widgets
