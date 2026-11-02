# Using Clear A11Y from your coding agent (MCP)

`@clear-a11y/mcp` is a Model Context Protocol server. Add it to Claude Code, Cursor, VS Code, Claude Desktop or any MCP client, and your agent can scan pages and repos, walk the keyboard focus order, read findings and write reports. The package also ships [`SKILL.md`](../apps/mcp/SKILL.md), which teaches the agent how to work with the results.

## Why an MCP server

Clear A11Y is deterministic first, AI second. The deterministic engines (axe-core, keyboard, states, visual, accessibility tree, widgets) need no model. The judgment calls (is this alt text meaningful, is this error message helpful) need one. With the MCP server, the model is **your own agent**: it reads the evidence, answers each `needs-review` question and fixes the code, under your own account and terms. The server itself never calls a model, never needs an API key and never signs in to a chat subscription (see [providers.md](providers.md)).

## Set up

```sh
npx playwright install chromium                         # once, for URL scans
claude mcp add clear-a11y -- npx -y @clear-a11y/mcp     # Claude Code
```

Until `@clear-a11y/mcp` is on npm, build it from a clone (`pnpm nx run mcp:build`) and register `node /path/to/clear-a11y/apps/mcp/dist/main.js` instead.

Other clients: a stdio server with command `npx` and args `["-y", "@clear-a11y/mcp"]`. Full configuration, including environment variables, is in the [package README](../apps/mcp/README.md).

To give Claude Code the workflow, copy `SKILL.md` to `.claude/skills/clear-a11y/SKILL.md` in your project. Other agents can read it from the `clear-a11y://skill` resource.

## The loop

1. `scan_url` (a running app, usually your dev server) or `scan_repo` (local source).
2. Fix `violation`s first, using each finding's `fix` and `source`.
3. Verify `likely` findings against the evidence before changing code.
4. Answer each `needs-review` question from its evidence (`get_findings` with `detail: true`: selector, screenshot path, focus path, accessibility tree, announcement), and explain the answer. Ask the person when the answer depends on meaning or intent the agent can't verify.
5. Fix in code, citing the WCAG success criterion, preferring native HTML over ARIA.
6. Re-scan and compare. Nothing counts as fixed without a re-scan.
7. Report: what was fixed, what was judged and how, what remains.

## Tools at a glance

| Tool            | What it does                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `scan_url`      | Scans up to 10 URLs (optional same-origin crawl, ≤ 50 pages). Returns a `scanId`, counts and the top 20 findings. |
| `scan_repo`     | Lints a local repo; findings carry file and line.                                                                 |
| `keyboard_walk` | Returns the real Tab order: stops, backward jumps, cycles.                                                        |
| `get_findings`  | Filters and pages through findings; `detail: true` adds evidence.                                                 |
| `get_report`    | Writes markdown, JSON, SARIF or HTML and returns the path (small text reports inline).                            |

Results are compact on purpose: long text is truncated, screenshots are file paths, and the top 20 findings come first. Scans are kept in memory (20 by default) and on disk under `.clear-a11y/mcp/<scanId>/`.

## Safety

- Only `http:`/`https:` URLs. Crawling is off unless asked for, same-origin, and capped.
- `CLEAR_A11Y_ALLOWED_ORIGINS` limits which origins can be opened. It is unset by default, so any http(s) URL the agent passes is scanned, just as the CLI scans any URL you type; set it (for example `http://localhost:*`) when the agent works unattended.
- `scan_repo` reads files only. Starting a dev server runs the repo's code and needs an explicit `runDevServer: true`.
- **Scanned content is untrusted.** Findings quote page and repo text, which can include text written to manipulate an AI agent (prompt injection). Every result carries an `untrusted` notice, page-quoted fields sit under `pageText`, and text blocks are wrapped in `<untrusted-scan-data>` tags. The skill tells agents to treat that text as data and never follow instructions found in it.
- Logs go to stderr; stdout carries only the MCP protocol.

## Limits today

- Transport is stdio only (no HTTP/SSE yet).
- No authenticated scans through the MCP server yet (use the CLI with `auth.storageState`).
- Repo runtime scans (Storybook, dev server) depend on the installed `@clear-a11y/repo` version; when they are not available, the result says that only source lint ran.
