# @clear-a11y/engine-states

State explorer for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). It opens the parts of a page a human auditor would open (menus, dialogs, accordions, disclosures, tabs, tooltips, popovers, form error states) and describes each one so it can be replayed. The runner then hands every state to the other engines, so barriers that only exist after an interaction (an unlabelled field inside a dialog, a nameless link inside a collapsed menu, a low-contrast tooltip) are tested too.

Engines are run by `@clear-a11y/runner`; you rarely use this package directly.

## Install

```sh
pnpm add @clear-a11y/engine-states
```

## Usage

```ts
import { createStatesEngine, discoverStates } from '@clear-a11y/engine-states';

// Discovery (the runner does this for every page and viewport):
const states = await discoverStates(pageContext); // PageContext from @clear-a11y/browser
for (const state of states) {
  // On a freshly loaded page of the same URL:
  await state.open(page);
  if (await state.verify(page)) {
    /* analyze the page in this state */
  }
}

// The engine's own findings (default state only):
const findings = await createStatesEngine().run(pageContext);
```

## The state descriptor

```ts
interface StateDescriptor {
  id: string; // "dialog:open#settings-dialog", "menu:open#site-menu", "form-invalid#signup"
  kind: StateKind; // menu | dialog | accordion | tab | tooltip | disclosure | popover | form-empty | form-invalid
  trigger: string; // selector of the control that opens it (the submit button for forms)
  label: string; // human description for reports
  action: StateAction; // click | hover | focus on a selector, or submit a form with typed values
  content: string[]; // selectors of what the state reveals
  open(page: Page): Promise<void>; // replays the action on a freshly loaded page
  verify(page: Page): Promise<boolean>; // the state really is open
}
```

Ids are `<kind>:open#<target>` for widgets and `form-empty#<form>` / `form-invalid#<form>` for forms. The target is the id of the revealed content when it has one (else the trigger's id or name), sanitized to letters, digits, `-` and `_`.

The runner passes each state to engines as `ctx.state = id` and `ctx.stateMeta = { kind, triggerSelector: trigger, replay: open }`, so the keyboard and accessibility-tree engines can re-open a state (focus return, announcements) without importing this package.

## How discovery works

1. Candidates, in priority order: controls with `aria-expanded`, `aria-haspopup`, `aria-controls`, `popovertarget` or a `data-*toggle*` attribute; `<summary>` of a closed `<details>`; unselected `[role=tab]`; other buttons; elements with `title` or `aria-describedby` (tooltip candidates). Links to another document and submit buttons are never candidates (forms are explored separately).
2. For each candidate, the engine snapshots the visible elements, activates the candidate (click; for tooltip candidates hover, then focus, then click), snapshots again and diffs the two (`visibleSetDiff`). The roots of newly visible subtrees are classified (`classifyState`): a dialog inside → `dialog`; `role=menu` or a list of links → `menu`; `role=tabpanel` → `tab`; hover or focus reveals → `tooltip`; a button inside a heading → `accordion`; otherwise `disclosure`. The page is reloaded before the next candidate whenever it changed.
3. Forms with a submit control: `form-empty` submits with text fields cleared; `form-invalid` types values a correct form must reject (`invalidValueFor`: `not-an-email`, a number outside `min`/`max`, text that breaks `pattern` or `minlength`) and submits. A state is recorded when new text appears, a field becomes `aria-invalid="true"`, or native validation blocks the submit (browser bubbles are not in the DOM; the label says "native validation").
4. States that reveal the same content are recorded once.

## Safety model

Exploring must never change data on the site being scanned.

- A route guard (`page.route`) is installed for discovery, for the engine's own run and for every replayed state, and stays for the life of the page. It aborts every non-GET request, and answers any main-frame navigation away from the page (another origin, path or query) with a local `204 No Content`, so the browser stays on the page and the request never reaches the server. Form posts are therefore evaluated in the page only.
- Controls whose name matches a destructive pattern (`delete`, `remove`, `log out`, `sign out`, `buy`, `pay`, `purchase`, `checkout`, `unsubscribe`, `cancel subscription`, ...) are never clicked, and forms whose submit button has such a name are never submitted. Skipped controls are logged.
- Links to other documents are never followed.
- When it changes form controls to test SC 3.2.2 (choose another option, toggle a checkbox, type into a field), it never presses a submit button, `window.open()` is answered with `null` (no window opens), and destructive-looking controls and options are skipped. Any submit or navigation the page starts on its own is caught by the route guard above.

## Options (`config.states`)

| Option               | Default            | Meaning                                     |
| -------------------- | ------------------ | ------------------------------------------- |
| `maxStates`          | `10`               | Most states per page and viewport           |
| `maxCandidates`      | `60`               | Most controls tried per page and viewport   |
| `maxForms`           | `5`                | Most forms submitted per page               |
| `maxInputs`          | `10`               | Most form controls changed per page (3.2.2) |
| `candidateTimeoutMs` | `2000`             | Time allowed for one click, hover or submit |
| `settleMs`           | `150`              | Wait after an action before comparing       |
| `budgetMs`           | 80% of `timeoutMs` | Total discovery time per page and viewport  |
| `viewports`          | all scanned        | Viewport names where discovery runs         |
| `maxElements`        | `5000`             | Visible elements compared per snapshot      |

When a limit is reached, the remaining candidates are logged as not explored.

## Rules

| Rule                                                                                      | WCAG         | Tier                      |
| ----------------------------------------------------------------------------------------- | ------------ | ------------------------- |
| [`states/error-not-associated`](../../../docs/rules/states/error-not-associated.md)       | 3.3.1, 1.3.1 | `violation` / `likely`    |
| [`states/error-not-in-text`](../../../docs/rules/states/error-not-in-text.md)             | 3.3.1, 1.4.1 | `likely`                  |
| [`states/expanded-state-mismatch`](../../../docs/rules/states/expanded-state-mismatch.md) | 4.1.2        | `violation` / `likely`    |
| [`states/context-change-on-input`](../../../docs/rules/states/context-change-on-input.md) | 3.2.2        | `likely` / `needs-review` |

The engine reports these from the default state only; in replayed states it returns nothing (the states were explored from the default page).

## Development

```sh
pnpm nx test @clear-a11y/engine-states              # unit tests (no browser)
pnpm nx test-integration @clear-a11y/engine-states  # Playwright against fixtures/
```

Add a rule with `pnpm nx g @clear-a11y/workspace-plugin:rule --engine=states --name=<rule-name> --wcag=<sc>`.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (rules reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/engines/states
