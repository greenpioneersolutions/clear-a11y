# AI providers

Clear A11Y's AI judges are optional. Out of the box the provider is `none`: no judge runs, and no page content ever leaves your machine. Everything deterministic (axe-core, keyboard, states, visual, accessibility tree, widgets) works without any model.

When you want the judgment calls too (is this alt text meaningful, is this link clear in context, does this error message say how to fix the input), bring your own model: an API key from your own account, cloud credentials, or a local model.

The same provider powers the optional AI planner of [persona agents](personas.md) (tasks with `"planner": "ai"`). Persona tasks with the default deterministic planner need no provider.

## The rules

- **Keys come from the environment only.** Config names the variable (`ai.apiKeyEnv`), never the key. A key-like field in config (`ai.apiKey`, `ai.token`...) is rejected. Keys are never written to disk, logged or put in error messages.
- **No consumer subscription logins.** Clear A11Y never signs in with claude.ai, ChatGPT or any other chat subscription, and never reuses a CLI's session token. Anthropic's terms don't allow third-party products to use claude.ai login or its rate limits, and we don't build features that depend on it.
- **"No API key" users:** run the [Clear A11Y MCP server](mcp.md) from your own agent (for example your own Claude Code). The deterministic engines run locally and your agent does the judging under your own account and terms.
- **AI findings are never `violation`s.** They are `likely` or `needs-review` (a yes/no question for a person).

What is sent and when is listed in [`packages/ai/README.md`](../packages/ai/README.md#privacy-what-is-sent-and-when).

## Anthropic

```sh
export ANTHROPIC_API_KEY=sk-ant-...      # from console.anthropic.com
```

```json
{ "ai": { "provider": "anthropic" } }
```

- Default model `claude-sonnet-5-5`; set `ai.model` to use another (for example `claude-opus-5-5` or `claude-haiku-5-5`).
- Optional: `ai.effort` (`low`, `medium`, `high`, `xhigh`, `max`) sets `output_config.effort`. `low` is usually enough for these short questions and costs less.
- Optional: `ai.baseUrl` for a proxy or gateway; `ai.apiKeyEnv` if your key lives in another variable.
- Uses the Messages API (`POST /v1/messages`, `anthropic-version: 2026-10-21`) with a JSON-schema output format.

## OpenAI

```sh
export OPENAI_API_KEY=sk-...
```

```json
{ "ai": { "provider": "openai", "model": "gpt-5.1" } }
```

- `ai.model` is required (we don't guess model ids for you).
- Uses Chat Completions (`POST /v1/chat/completions`) with `response_format: json_schema`. `ai.baseUrl` works with compatible gateways.

## Azure OpenAI

```sh
export AZURE_OPENAI_API_KEY=...
```

```json
{
  "ai": {
    "provider": "azure",
    "baseUrl": "https://my-resource.openai.azure.com",
    "model": "my-gpt-deployment"
  }
}
```

- `ai.baseUrl` is your resource endpoint, `ai.model` is the **deployment name**.
- `ai.apiVersion` defaults to `2024-10-21`.
- Authenticates with the `api-key` header. (Entra ID tokens are not supported yet.)

## Ollama (local)

```sh
ollama pull llama3.2-vision
ollama serve
```

```json
{ "ai": { "provider": "ollama", "model": "llama3.2-vision" } }
```

- Talks to `http://127.0.0.1:11434/api/chat` by default; set `ai.baseUrl` for another host. Nothing leaves your machine when Ollama runs locally.
- Use a vision model if you want the alt-text judge to see image crops; otherwise set `ai.images: false`.
- Small local models answer `uncertain` more often; those become `needs-review` questions (or are dropped with `ai.reportUncertain: false`).

## Amazon Bedrock and Google Vertex AI

Not implemented yet. The config is validated (`bedrock`: `ai.region` and `ai.model`; `vertex`: `ai.project`, `ai.region` and `ai.model`) and the scan then stops with a clear error, because these need AWS SigV4 request signing or Google application-default credentials, which the fetch-based adapters don't do yet. Use `anthropic`, `openai`, `azure` or `ollama` for now. Contributions welcome; see `docs/decisions-pending/S07.md` for the plan.

## Mock (tests and demos)

```json
{ "ai": { "provider": "mock", "recordingsDir": "./recordings" } }
```

Answers from recorded responses (JSON files with `request.judge` plus an exact `request.input` or a partial `request.match`, and a `response`). Unknown input gets a deterministic `uncertain` answer. Results from the mock provider are not real AI results; never report them as such.

## Cost and time controls

| Option                  | Default | Effect                                  |
| ----------------------- | ------- | --------------------------------------- |
| `maxCandidatesPerJudge` | 8       | Questions per judge per page and state. |
| `maxCallsPerPage`       | 40      | Requests per page and state.            |
| `maxCallsPerScan`       | 200     | Requests per scan.                      |
| `judges`                | all     | Run only some judges.                   |
| `images`                | true    | Send image crops to the alt-text judge. |
| `timeoutMs`             | 60000   | Per request.                            |

The runner gives each engine the scan's `timeoutMs` (30 s by default) per page and state; the AI engine plans for 80% of it and skips what doesn't fit. Raise `timeoutMs` for large pages with a remote provider.
