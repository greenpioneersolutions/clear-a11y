---
id: persona/task-blocked
title: Persona could not complete the task
engine: persona-keyboard-only, persona-screen-reader
wcag: [2.1.1, 2.1.2, 2.4.3, 4.1.2, 1.3.1]
tier: likely
---

# Persona could not complete the task

**Rule:** `persona/task-blocked` · **WCAG:** depends on the cause (2.1.1, 2.1.2, 2.4.3, 4.1.2, 1.3.1) · **Tier:** `likely` (deterministic planner, measured block) or `needs-review` · **Engines:** `persona-keyboard-only`, `persona-screen-reader`

## What it catches

A task you declared in config ("pay for the order", "sign up for the newsletter") that a persona could not finish under its constraint:

- **keyboard-only**: presses only Tab, Shift+Tab, Enter, Space, the arrow keys, Escape, Home and End, and sees what has focus and the text on screen. No mouse, no clicks, no focusing elements by selector.
- **screen-reader**: perceives the page only through the browser's accessibility tree and acts only on nodes exposed there (by role and accessible name). No coordinates, no CSS, no screenshots.

The finding points at the element where the persona got stuck and says why:

| Cause              | What happened                                                                 | WCAG          | Tier (deterministic planner) |
| ------------------ | ----------------------------------------------------------------------------- | ------------- | ---------------------------- |
| `unreachable`      | The control is visible, but Tab went all the way around the page without it   | 2.1.1         | `likely`                     |
| `not-operable`     | Keyboard: the control has focus but neither Enter nor Space does anything     | 2.1.1         | `likely`                     |
| `not-operable`     | Screen reader: activating the exposed control changed nothing                 | 4.1.2         | `needs-review`               |
| `trap`             | Focus circles inside a group without the target, and Escape doesn't help      | 2.1.2         | `likely`                     |
| `unnamed`          | Controls of the needed role exist in the accessibility tree, but have no name | 4.1.2         | `likely`                     |
| `not-exposed`      | The control is visible but missing from the accessibility tree                | 4.1.2, 1.3.1  | `likely`                     |
| `focus-lost`       | After an action focus fell to the page body, and the task then failed         | 2.4.3         | `needs-review`               |
| `target-not-found` | The control named in the task is neither visible nor exposed                  | 2.1.1 / 4.1.2 | `needs-review`               |
| `budget`           | `maxSteps` ran out                                                            | 2.1.1 / 4.1.2 | `needs-review`               |
| `success-not-met`  | Every step ran, but the success condition never became true                   | 2.1.1 / 4.1.2 | `needs-review`               |

Findings from the AI planner are always `needs-review`. A task that succeeds produces no finding.

## Who it affects

Keyboard-only, switch and voice-control users (keyboard persona) and blind screen reader users (screen-reader persona). Rules that check one element at a time can miss these barriers: the basket fixture's "Add to basket" control has a role, a name and a tab stop, and only fails when someone actually presses Enter on it.

## WCAG and tier

- [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html): all functionality operable through a keyboard.
- [2.1.2 No Keyboard Trap](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html): focus can be moved away with the keyboard.
- [2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html): focus order preserves meaning and operability.
- [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html): controls expose a name and role to assistive technology.
- [1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html): structure conveyed visually is available programmatically.

Persona engines count as AI-tier (`persona-*`), so the runner never lets them produce a `violation`. `likely` needs a measured fact in the trace: a visible control that never received focus, a focused control on which Enter and Space changed nothing (no DOM change, no URL change, no focus or state change), a node in the accessibility tree with an empty name. Anything less certain, any AI-planned run, and any run that saw instruction-like page text is `needs-review` with the question "Could a keyboard-only user complete "…" on this page?".

## How to fix

Fix the blocking element named in the finding:

```html
<!-- Before: mouse only -->
<div class="pay" onclick="pay()">Pay now</div>
<span role="button" tabindex="0" onclick="add()">Add to basket</span>
<button><svg aria-hidden="true">…</svg></button>

<!-- After -->
<button type="button" onclick="pay()">Pay now</button>
<button type="button" onclick="add()">Add to basket</button>
<button type="button">Sign up <svg aria-hidden="true">…</svg></button>
```

Then run the task again. The trace (`evidence.data.trace`) shows every step: the action, where focus was (or which node was used) and what happened.

## How it's detected

The runner's `persona` engine runs each task whose `match` fits the page URL, on the default state, on a fresh page load. A planner chooses one action at a time from the persona's observation only; the executor checks the action is allowed under the constraint and performs it with real key presses (keyboard) or the accessibility node's default action (screen reader). After every action it checks the task's success condition (`selector` visible, `text` visible, `urlIncludes`). When the planner is stuck, a sighted cross-check finds the blocking element for the report (the visible control matching the step's name, or the DOM node behind an accessibility-tree node). See [`docs/personas.md`](../../personas.md).

## Limitations

- Deterministic tasks need explicit step hints (the controls to reach, in order). A wrong hint shows up as `target-not-found`, `needs-review`.
- The keyboard persona identifies controls by their visible label or text; the screen-reader persona by role and accessible name. Neither uses a real screen reader; announcements of live regions are not checked yet.
- Default state only, one page per task (no multi-page flows yet).

## Examples

- Barrier: [`fixtures/site/persona/checkout-keyboard-blocked.html`](../../../fixtures/site/persona/checkout-keyboard-blocked.html) (unreachable), [`basket-keyboard-not-operable.html`](../../../fixtures/site/persona/basket-keyboard-not-operable.html) (not operable), [`signup-screen-reader-blocked.html`](../../../fixtures/site/persona/signup-screen-reader-blocked.html) (unnamed)
- Correct pattern: [`checkout-keyboard-ok.html`](../../../fixtures/site/persona/checkout-keyboard-ok.html), [`basket-keyboard-ok.html`](../../../fixtures/site/persona/basket-keyboard-ok.html), [`signup-screen-reader-ok.html`](../../../fixtures/site/persona/signup-screen-reader-ok.html), [`ok.html`](../../../fixtures/site/persona/ok.html)
- Tasks: [`fixtures/personas.json`](../../../fixtures/personas.json)
