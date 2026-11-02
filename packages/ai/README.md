# @clear-a11y/ai

Bring-your-own-model AI judges for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). They handle the judgment calls deterministic engines can't make: is this alt text meaningful, does this link make sense in context, does this error message say how to fix the input.

**Off by default.** The default provider is `none`: no judge runs and no page content leaves your machine. AI findings are only ever `likely` or `needs-review`, never `violation`.

## Install

```sh
pnpm add @clear-a11y/ai
```

You rarely use it directly: `@clear-a11y/runner` registers the AI engine when `ai.provider` is set to anything other than `none`.

## Configure

```jsonc
// clear-a11y.config.json
{
  "ai": {
    "provider": "anthropic", // none | mock | anthropic | openai | azure | ollama | bedrock | vertex
    "model": "claude-sonnet-5-5", // optional for anthropic, required for the others
    "apiKeyEnv": "ANTHROPIC_API_KEY", // the NAME of the environment variable, never the key
  },
}
```

```sh
export ANTHROPIC_API_KEY=...   # your key, from your own account
clear-a11y scan https://example.com
```

Setup for every provider: [`docs/providers.md`](../../docs/providers.md).

## Providers

| Provider    | Status          | Auth                                                  | Default model / endpoint                                  |
| ----------- | --------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `none`      | default         | none                                                  | judges skipped, nothing sent                              |
| `mock`      | tests, demos    | none                                                  | recorded responses; unknown input answers `uncertain`     |
| `anthropic` | supported       | API key in `ANTHROPIC_API_KEY` (or `ai.apiKeyEnv`)    | `claude-sonnet-5-5`, `https://api.anthropic.com`          |
| `openai`    | supported       | API key in `OPENAI_API_KEY` (or `ai.apiKeyEnv`)       | `ai.model` required, `https://api.openai.com/v1`          |
| `azure`     | supported       | API key in `AZURE_OPENAI_API_KEY` (or `ai.apiKeyEnv`) | `ai.baseUrl` = resource endpoint, `ai.model` = deployment |
| `ollama`    | supported       | none (local)                                          | `ai.model` required, `http://127.0.0.1:11434`             |
| `bedrock`   | not implemented | AWS credentials (SigV4)                               | config is validated, then a clear error                   |
| `vertex`    | not implemented | Google ADC                                            | config is validated, then a clear error                   |

All adapters call the providers' HTTP APIs with `fetch` (Node 18+), so the package has no SDK dependencies. Requests ask for a JSON answer that matches a schema (structured output where the provider supports it), retry on 429 and 5xx with backoff, and time out per request.

## Bring your own model, never a subscription login

Clear A11Y authenticates only with **API keys, cloud credentials or local models** that you configure. It never signs in with a consumer chat subscription (no claude.ai or ChatGPT login, no reuse of a CLI's session token), and never will: Anthropic's terms don't allow third-party products to use claude.ai login or its rate limits. If you don't want to manage an API key, use the Clear A11Y MCP server from your own agent (for example your own Claude Code): your agent then does the judging under your own account.

API keys are read from the environment variable named in `ai.apiKeyEnv` (or the provider's default) when the scan starts. They are never read from config files (a key-like field such as `ai.apiKey` is rejected), never written to disk, never logged and never included in error messages.

## Privacy: what is sent, and when

Nothing is sent unless you set `ai.provider`. When you do, for each page and state:

- Deterministic code picks a few **candidates** per judge (`ai.maxCandidatesPerJudge`, default 8; at most `ai.maxCallsPerPage`, default 40, and `ai.maxCallsPerScan`, default 200).
- For each candidate, one request goes to your provider containing: the versioned prompt, and a small JSON object of page data about that one element: its text (alt text, link text, label, error message), nearby text (its paragraph or list item, the heading above it), the page title, and a few computed values (sizes, colors, focus-stop positions). Link destinations are sent as paths only; query strings are dropped.
- The **alt-text** judge also sends a PNG crop of the image itself (not the page) unless you set `ai.images: false`.
- Never sent: full-page screenshots, full DOM, cookies, form values, auth state, URLs with query strings, your API key to anyone but its provider.

`mock` and a local `ollama` keep everything on your machine.

## Judges

| Judge (engine)                   | WCAG  | Asks                                                       | Runs in             |
| -------------------------------- | ----- | ---------------------------------------------------------- | ------------------- |
| `ai-alt-text`                    | 1.1.1 | Does the alt text convey the image (with a crop)?          | default state       |
| `ai-label-in-name`               | 2.5.3 | Does the name match the visible label (ambiguous cases)?   | default state       |
| `ai-link-purpose`                | 2.4.4 | Is the link's purpose clear from its text and context?     | default state       |
| `ai-descriptive-headings-labels` | 2.4.6 | Do vague or duplicate headings/labels describe their part? | default state       |
| `ai-error-clarity`               | 3.3.3 | Does the error message say how to fix the input?           | `form-invalid` only |
| `ai-color-only`                  | 1.4.1 | Is meaning available without color?                        | default state       |
| `ai-focus-order`                 | 2.4.3 | Is the Tab order sensible in a non-linear layout?          | default state       |

Details and how candidates are picked: [`docs/rules/ai/judges.md`](../../docs/rules/ai/judges.md).

A `fail` verdict with confidence at or above `ai.likelyThreshold` (0.7) becomes `likely`; a lower-confidence `fail`, an `uncertain` answer (unless `ai.reportUncertain: false`) or an invalid answer becomes `needs-review` with a yes/no question. `pass` produces nothing. The runner's tier policy caps any `ai-*` finding at `likely` unless a deterministic engine reports the same violation.

## Persona agents

A persona tries to complete a task you declare (`personas.tasks` in config) under a constraint and reports where it got stuck, with the full step trace as evidence. **No AI needed**: the default planner is deterministic. The runner registers the `persona` engine (page-mutating, default state only) as soon as `personas.tasks` is non-empty.

```jsonc
{
  "personas": {
    "tasks": [
      {
        "id": "checkout-pay",
        "goal": "Accept the terms and pay for the order",
        "match": "/checkout*", // URL substring, or a glob with *
        "constraint": "keyboard-only", // or "screen-reader"
        "steps": [{ "name": "I accept the terms" }, { "role": "button", "name": "Pay now" }],
        "success": { "text": "Payment complete" }, // or selector, urlIncludes
      },
    ],
  },
}
```

| Constraint      | Perceives                                        | Can do                                                        |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| `keyboard-only` | the focused element (role, name), visible text   | Tab, Shift+Tab, Enter, Space, arrows, Escape, Home, End, type |
| `screen-reader` | the accessibility tree only (CDP), as an outline | activate / focus / type on tree nodes by ref, the same keys   |

| Planner         | When                                   | Findings                                                           |
| --------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `deterministic` | default; follows the task's step hints | `likely` when a measured fact backs the block, else `needs-review` |
| `ai`            | `planner: "ai"` and `ai.provider` set  | always `needs-review`                                              |

A blocked task becomes one `persona/task-blocked` finding from `persona-keyboard-only` or `persona-screen-reader`: the blocking element as target, WCAG from the cause (2.1.1 unreachable or not operable, 2.1.2 trap, 2.4.3 focus lost, 4.1.2 unnamed, 4.1.2 + 1.3.1 not exposed), `evidence.data.trace` with every step, and `evidence.focusPath` for keyboard runs. Persona engines are AI-tier: never `violation`. A task that succeeds produces nothing.

The AI planner uses the versioned prompts `prompts/persona-system.v1.md` and `prompts/persona-<constraint>.v1.md`, the same `<page_data>` hardening and injection guard as the judges, and accepts only schema-valid actions allowed under the constraint. It sends the goal, page path, your test `inputs`, the visible text or tree outline (capped) and the last few steps; nothing when the provider is `none` (AI-planned tasks are then skipped).

How to write tasks, what each constraint does and the limits: [`docs/personas.md`](../../docs/personas.md). Rule page: [`docs/rules/persona/task-blocked.md`](../../docs/rules/persona/task-blocked.md).

```ts
import {
  createPersonaEngine,
  createKeyboardPlanner,
  runPersona,
  parsePersonaOptions,
} from '@clear-a11y/ai';

const engine = createPersonaEngine(config); // Engine for the runner (provider optional)
const [task] = parsePersonaOptions(config.personas).tasks;
const run = await runPersona(page, { task, planner: createKeyboardPlanner(task.steps) });
run.outcome; // { status: 'success' } or { status: 'blocked', block: { cause, selector, reason } }
```

## Prompt-injection hardening

Page content is untrusted data:

1. Page data goes only inside a `<page_data nonce="…">` block, serialized as JSON with `<`, `>` and `&` escaped, so page text can never close the block or open a fake one.
2. The system prompt says page data is untrusted and must never be followed as instructions.
3. Only a schema-validated verdict (`verdict`, `confidence`, `reason`, `suggestion`) is read from the model; anything else (a "tier", a "violation" flag) is dropped.
4. A deterministic guard flags candidate text that looks like instructions to an AI. Such candidates are always at least `needs-review` and can never yield a pass.

`fixtures/site/ai/prompt-injection.html` and `test/prompt-injection.integration.test.ts` prove it with a deliberately naive model.

## Options

All under `ai` in the config (validated by `AiOptionsSchema`):

| Option                  | Default                 | Meaning                                                    |
| ----------------------- | ----------------------- | ---------------------------------------------------------- |
| `provider`              | `none`                  | See the table above.                                       |
| `model`                 | per provider            | Model id; for `azure` the deployment name.                 |
| `apiKeyEnv`             | per provider            | Name of the environment variable holding the key.          |
| `baseUrl`               | per provider            | API endpoint (proxies, Azure resource, remote Ollama).     |
| `judges`                | all                     | Limit to some judges, e.g. `["alt-text", "link-purpose"]`. |
| `maxCandidatesPerJudge` | `8`                     | Candidates per judge per page and state.                   |
| `maxCallsPerPage`       | `40`                    | Requests per page and state.                               |
| `maxCallsPerScan`       | `200`                   | Requests per scan.                                         |
| `maxTokens`             | `2048`                  | Output token limit per request.                            |
| `timeoutMs`             | `60000`                 | Per request.                                               |
| `retries`               | `2`                     | On 429 and 5xx.                                            |
| `concurrency`           | `4`                     | Requests in flight per page.                               |
| `likelyThreshold`       | `0.7`                   | `fail` confidence needed for `likely`.                     |
| `reportUncertain`       | `true`                  | Report `uncertain` answers as needs-review questions.      |
| `images`                | `true`                  | Send image crops to the alt-text judge.                    |
| `budgetMs`              | 80% of scan `timeoutMs` | Time budget per page and state.                            |
| `effort`                | unset                   | Anthropic `output_config.effort` (`low` ... `max`).        |
| `apiVersion`            | `2024-10-21`            | Azure OpenAI `api-version`.                                |
| `recordingsDir`         | unset                   | `mock` only: directory of recorded responses.              |

The runner limits each engine run to the scan's `timeoutMs` (30 s by default). Raise it (for example `"timeoutMs": 120000`) when you enable a remote provider on large pages.

## Usage

```ts
import { createAiEngine, createProvider } from '@clear-a11y/ai';
import { resolveConfig } from '@clear-a11y/core';

const config = resolveConfig({ ai: { provider: 'ollama', model: 'llama3.2-vision' } });
const engine = createAiEngine(config, createProvider(config.ai));
const findings = await engine.run(pageContext); // PageContext from @clear-a11y/browser
```

## Development

```sh
pnpm nx test @clear-a11y/ai              # unit tests: adapters with a stubbed fetch, hardening, mapping
pnpm nx test-integration @clear-a11y/ai  # Playwright + mock provider + synthetic recordings
```

Tests never touch the network: every adapter gets an injected `fetch`, recorded responses live in `packages/test-utils/recordings/ai/` (marked `"source": "synthetic"`), and a test-wide guard rejects any request that would leave localhost. Prompts are versioned files in [`prompts/`](prompts/); a prompt change means a new `<judge>.v<N>.md` file and a bump of the judge's `promptVersion`, never an edit of a released version.

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (providers, judges, personas)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/ai
