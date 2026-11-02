# Persona agents

A persona tries to complete a real task on your page the way a disabled person would, and tells you exactly where it got stuck. Rules that check one element at a time miss barriers that only show up when someone actually tries to do something: a "Pay now" control that the mouse can click but Tab never reaches, an "Add to basket" button that has a role and a tab stop but ignores Enter, a sign-up button a screen reader announces as just "button".

Personas run in `@clear-a11y/ai` and are orchestrated by the runner. **No AI is needed**: the default planner is deterministic. An AI planner is available when you configure a provider.

## Writing a task

Tasks go in the `personas` section of your config:

```jsonc
// clear-a11y.config.json
{
  "personas": {
    "tasks": [
      {
        "id": "checkout-pay",
        "goal": "Accept the terms and pay for the order",
        "match": "/checkout*",
        "constraint": "keyboard-only",
        "steps": [{ "name": "I accept the terms" }, { "role": "button", "name": "Pay now" }],
        "success": { "text": "Payment complete" },
        "maxSteps": 30,
      },
      {
        "id": "newsletter-signup",
        "goal": "Sign up for the newsletter",
        "match": "/newsletter",
        "constraint": "screen-reader",
        "steps": [
          { "role": "textbox", "name": "Email", "action": "type", "text": "reader@example.test" },
          { "role": "button", "namePattern": "sign ?up|subscribe" },
        ],
        "success": { "text": "You are subscribed" },
      },
    ],
  },
}
```

| Field        | Required | Meaning                                                                                                                  |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`         | yes      | Letters, digits and dashes. Unique.                                                                                      |
| `goal`       | yes      | The task in plain words. Shown in findings; the AI planner works from it.                                                |
| `match`      | yes      | Pages the task runs on: a URL substring, or a glob with `*` (any characters; query string and fragment are ignored).     |
| `constraint` | yes      | `keyboard-only` or `screen-reader`.                                                                                      |
| `success`    | yes      | When the task is done: `selector` (an element is visible), `text` (text is visible), `urlIncludes`. All given must hold. |
| `steps`      | see note | Step hints: the controls to reach and operate, in order. Required for the deterministic planner.                         |
| `inputs`     | no       | Test data the AI planner may type, e.g. `{ "email": "a@example.test" }`. Never real personal data.                       |
| `maxSteps`   | no       | Action budget, default 40, at most 200.                                                                                  |
| `planner`    | no       | `deterministic` (default) or `ai`. A section-level `personas.planner` sets the default for all tasks.                    |

### Step hints

Each step names one control the way a person would:

- `name`: case-insensitive substring of the control's name (its visible label or text, or its accessible name).
- `namePattern`: a case-insensitive regular expression instead, e.g. `"add to (basket|cart)"`.
- `role`: the role a screen reader announces (`button`, `link`, `textbox`, `checkbox`...). The screen-reader persona requires it to match (a `searchbox` counts as a `textbox`, a `switch` as a `checkbox`). The keyboard persona identifies controls by what it sees and ignores `role`.
- `action`: `activate` (default) or `type` (with `text`).

Write hints for the visible, intended name ("Pay now"), not for the markup. If the page doesn't name the control that way, that's often the finding.

## Constraints

**keyboard-only.** The persona sees the screen but has no mouse. Each step it observes the focused element (its role and visible name, or nothing when focus is on the page itself) and the visible text. It may press Tab, Shift+Tab, Enter, Space, the arrow keys, Escape, Home and End, and type into the focused field. It cannot click, point, or focus elements by selector. The deterministic planner, for each step hint:

1. presses Tab until the focused element's name matches the hint;
2. presses Enter (Space first for checkboxes, radios and switches) and, if nothing changed, the other key; for `type` hints it types the text;
3. gives up with `unreachable` when Tab has gone all the way around the page (focus left the document and came back to a stop it already saw), with `trap` when focus circles without ever leaving a group even after Escape, and with `not-operable` when neither key changed anything.

"Changed" means a DOM mutation, a URL change, a focus change, or a change of the focused control's checked/expanded/pressed/value state.

**screen-reader.** The persona perceives the page only through the browser's accessibility tree (Chrome DevTools protocol, the same source engine-at uses), flattened into an outline like:

```
[n1] document "Newsletter"
  [n2] main ""
    [n3] heading "Stay in the loop"
    [n8] textbox "Email address" (focused, value="reader@example.test")
    [n9] button ""
```

It acts only on nodes of that outline: `activate` (the screen reader's default action, like Enter in browse mode), `focus`, `type` into a field, plus the keyboard keys above. Refs (`n9`) are positions in the current outline, never selectors or coordinates. The deterministic planner looks each hint up by role and name (like a screen reader's elements list) and gives up with `unnamed` when controls of that role exist but have no name, `not-exposed` when nothing matches, and `not-operable` when activating changed nothing.

## What you get

When a task is blocked, one `persona/task-blocked` finding from `persona-keyboard-only` or `persona-screen-reader`:

- `target`: the blocking element. Personas only report why they are stuck; a sighted cross-check then finds the element for the report (the visible control whose text matches the hint, or the DOM node behind the accessibility-tree node). Its selector lines up with the other engines.
- `wcag`: from the cause (2.1.1 unreachable or not operable, 2.1.2 trap, 2.4.3 focus lost, 4.1.2 unnamed, 4.1.2 + 1.3.1 not exposed). See the [rule page](rules/persona/task-blocked.md).
- `tier`: `likely` when the deterministic planner was blocked by a measured fact; otherwise `needs-review` with a yes/no question. Never `violation`.
- `evidence.data.trace`: every step: `{ n, action, focused: { selector, role, name }, result, reason }`, e.g. `press Tab → #terms checkbox "I accept the terms and conditions" → moved`.
- `evidence.focusPath` (keyboard runs): the focus stops in order, which the HTML report shows with the finding.
- `evidence.data.traceArtifact`: the full run as JSON in the report's `artifacts/` folder, when the scan writes artifacts.

A task that succeeds produces no finding.

## The AI planner

Set `"planner": "ai"` on a task (or `personas.planner`) and configure a provider (`ai.provider`, see [providers](providers.md)). The planner asks your model for one action at a time, with the persona's observation, the goal, the page path (no origin, query string or fragment), the test `inputs` and the last few steps. It uses the same hardening as the AI judges:

- versioned prompts: `packages/ai/prompts/persona-system.v1.md`, `persona-keyboard-only.v1.md`, `persona-screen-reader.v1.md`;
- page data only inside the nonce-delimited `<page_data>` block, escaped so page text can't close it;
- only a schema-valid action allowed under the constraint is accepted (a keyboard persona's model can't click); three invalid answers in a row end the run (`invalid-output`);
- page text that reads like instructions to an AI is reported on the finding and forces `needs-review`.

AI-planned findings are always `needs-review`. With the default provider `none`, AI-planned tasks are skipped with a warning and nothing is sent. What is sent per step: the goal, the inputs you listed, the visible text (keyboard) or the accessibility-tree outline (screen reader), capped at 120 lines.

## Limits

- One page per task, default state only. Multi-page flows and recorded user flows are planned.
- Personas don't use a real screen reader and don't yet listen to live-region announcements.
- Deterministic tasks follow your hints. They find where a known path breaks; they don't explore. Use the AI planner for exploratory runs.
- Personas press Enter on real controls. Non-GET requests to other origins are blocked during a run; run personas against test environments, not production.

## Benchmark

The fixture benchmark loads [`fixtures/personas.json`](../fixtures/personas.json) and runs its tasks on `fixtures/site/persona/*` (layer `persona`). Each barrier page has a passing counterpart that must stay clean.
