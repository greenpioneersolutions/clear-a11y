# Clear A11Y server

A self-hosted HTTP API for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y): submit a scan, poll its status, then fetch the findings and the JSON, HTML or SARIF report. It runs on a laptop with no extra services (SQLite queue) and in a container for a team (optionally with Redis and several workers).

The server is a thin NestJS app: it validates requests, puts jobs on the queue from [`@clear-a11y/queue`](../../packages/queue), and its worker calls `scan` from `@clear-a11y/runner` and the reporters from `@clear-a11y/reporter`. It has no detection logic of its own.

## Run it

```sh
pnpm install
pnpm nx run server:serve            # builds, then listens on http://127.0.0.1:3000
```

Or with Docker (see [Docker](#docker)).

## API

All responses are JSON unless noted. When `CLEAR_A11Y_TOKEN` is set, every endpoint except `/health` needs `Authorization: Bearer <token>`. Errors look like `{ "statusCode": 400, "error": "Bad Request", "message": "...", "issues": [{ "path": "targets.0", "message": "..." }] }`; issues never repeat the values you sent.

| Method and path                                  | Does                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `POST /scans`                                    | Queue a scan. `202` with the scan and a `Location` header.           |
| `GET /scans?status=&limit=`                      | List scans, newest first (`limit` 1 to 200, default 50).             |
| `GET /scans/:id`                                 | Status, progress, timestamps, error, summary when finished.          |
| `DELETE /scans/:id`                              | Cancel a queued or running scan.                                     |
| `GET /scans/:id/results`                         | The canonical JSON report (`ScanResult`). `409` until it succeeded.  |
| `GET /scans/:id/findings?tier=&wcag=`            | Findings only, optionally filtered by tier and success criterion.    |
| `GET /scans/:id/report?format=html\|sarif\|json` | A report file. HTML is served with a strict Content-Security-Policy. |
| `GET /health`                                    | `{ "status": "ok", "version", "queue" }`. No token needed.           |

### Submit a scan

```sh
TOKEN=change-me-to-a-long-random-string
curl -s -X POST http://127.0.0.1:3000/scans \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "targets": ["https://example.com/", "https://example.com/contact"],
        "label": "nightly",
        "config": { "viewports": [{ "name": "mobile", "width": 375, "height": 667 }] }
      }'
```

```json
{
  "id": "6f1c0e7e-3a43-4a5e-9c1d-2f0b8c1d9a10",
  "status": "queued",
  "targets": ["https://example.com/", "https://example.com/contact"],
  "label": "nightly",
  "attempts": 0,
  "createdAt": "2026-10-31T10:00:00.000Z",
  "updatedAt": "2026-10-31T10:00:00.000Z",
  "links": { "self": "/scans/6f1c0e7e-3a43-4a5e-9c1d-2f0b8c1d9a10" }
}
```

The body is `{ targets: string[], config?: object, label?: string }`. `config` is the same shape as `clear-a11y.config.json` (see the CLI docs) and is validated by core's `ConfigSchema`; unknown keys are refused. The server also refuses settings that would make it touch things beyond the target: `auth.storageState` (a server file), `output.dir`, `crawl.sameOrigin: false`, `ai.baseUrl`, `ai.recordingsDir`, and limits the number of targets, `crawl.maxPages`, `timeoutMs` and viewports.

### Poll, then fetch

```sh
ID=6f1c0e7e-3a43-4a5e-9c1d-2f0b8c1d9a10
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/scans/$ID
# "status": "running", "progress": { "done": 1, "total": 2, "message": "https://example.com/contact" }
# ... later: "status": "succeeded", "summary": { "total": 7, "byTier": { ... } }

curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3000/scans/$ID/findings?tier=violation"
curl -s -H "Authorization: Bearer $TOKEN" -o report.html "http://127.0.0.1:3000/scans/$ID/report?format=html"
curl -s -H "Authorization: Bearer $TOKEN" -o report.sarif "http://127.0.0.1:3000/scans/$ID/report?format=sarif"
curl -s -H "Authorization: Bearer $TOKEN" -X DELETE http://127.0.0.1:3000/scans/$ID   # cancel
```

A scan that throws ends `failed` with an `error` message and is not retried. A scan whose worker died (crash, container restart) is re-queued, up to 3 attempts.

## Environment variables

| Variable                    | Default                   | Meaning                                                                                                                                                |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HOST`                      | `127.0.0.1`               | Address to bind. Anything but loopback requires `CLEAR_A11Y_TOKEN`.                                                                                    |
| `PORT`                      | `3000`                    | Port.                                                                                                                                                  |
| `CLEAR_A11Y_TOKEN`          | (none)                    | Bearer token, at least 16 characters. `CLEAR_A11Y_API_TOKEN` is accepted as an alias.                                                                  |
| `DATA_DIR`                  | `./.clear-a11y/server`    | Scan results (`scans/<id>/report.json` plus screenshot crops) and the default SQLite file.                                                             |
| `CLEAR_A11Y_DB`             | `$DATA_DIR/clear-a11y.db` | SQLite queue file.                                                                                                                                     |
| `REDIS_URL`                 | (none)                    | `redis://` or `rediss://` URL. When set, the queue is BullMQ on Redis instead of SQLite.                                                               |
| `CLEAR_A11Y_WORKERS`        | `1`                       | Scans this process runs at once (0 to 16). `0` = API only; run workers elsewhere (BullMQ).                                                             |
| `ALLOWED_TARGETS`           | (none)                    | Comma-separated origins scans may target, e.g. `https://example.com,https://*.example.org,http://localhost:8080`.                                      |
| `CLEAR_A11Y_MAX_TARGETS`    | `20`                      | Targets per scan (`targets` plus `config.targets`).                                                                                                    |
| `CLEAR_A11Y_MAX_PAGES`      | `50`                      | Upper bound for `config.crawl.maxPages`.                                                                                                               |
| `CLEAR_A11Y_MAX_TIMEOUT_MS` | `120000`                  | Upper bound for `config.timeoutMs`.                                                                                                                    |
| `RATE_LIMIT_PER_MINUTE`     | `30`                      | `POST /scans` per client IP per minute; `0` turns it off.                                                                                              |
| `CLEAR_A11Y_MAX_BODY_BYTES` | `100000`                  | Largest accepted request body.                                                                                                                         |
| `CLEAR_A11Y_AI_KEY_ENVS`    | (none)                    | Environment variable names a request may reference as `ai.apiKeyEnv` (anthropic, openai). Empty = requests can only use `ai.provider: none` or `mock`. |
| `TRUST_PROXY`               | `false`                   | Set `true` behind a reverse proxy so rate limits see the client IP.                                                                                    |

## Security model

- **Local by default.** The server binds to `127.0.0.1`. Exposing it (`HOST=0.0.0.0`) refuses to start without a token. The token is compared in constant time and never logged or echoed.
- **SSRF guard.** Targets must be `http:` or `https:` URLs without credentials. With `ALLOWED_TARGETS` set, only those origins are accepted (private addresses included, because you listed them). Without it, a target's host must resolve only to public addresses: loopback, private (10/8, 172.16/12, 192.168/16), link-local (including cloud metadata at 169.254.169.254), CGNAT, multicast, IPv6 ULA/link-local and IPv4-mapped forms are refused. The check runs on resolved IPs, at submission and again just before the scan starts. Same-origin crawling only.
- **Known limit.** Redirects and DNS answers that change during a scan are followed by the browser and are not re-checked per request. For untrusted users, set `ALLOWED_TARGETS` and run the container on a network with no route to internal services.
- **No secrets in requests.** AI settings may name an environment variable from `CLEAR_A11Y_AI_KEY_ENVS`, never contain a key; `ai.baseUrl` and file paths are refused so a request can't send your keys or files elsewhere.
- **Limits.** Body size, targets, pages, timeout and a per-IP rate limit on scan creation. HTTP request timeout is 30 s; scans run in the worker, so `POST /scans` returns at once.
- **Reports.** HTML reports are self-contained and served with `Content-Security-Policy: default-src 'none'; img-src data:; ...; frame-ancestors 'none'`, plus `X-Content-Type-Options: nosniff`.

Not in scope: user accounts, multiple tenants, a web UI. Put a reverse proxy with TLS in front when you expose it.

## Docker

```sh
docker build -f apps/server/Dockerfile -t clear-a11y/server .      # or: pnpm nx run server:docker-build
docker run --rm -p 3000:3000 \
  -e CLEAR_A11Y_TOKEN="$(openssl rand -hex 24)" \
  -e ALLOWED_TARGETS=https://staging.example.com \
  -v clear-a11y-data:/data \
  clear-a11y/server
```

The image is based on `mcr.microsoft.com/playwright:v1.61.1-noble` (the same Playwright version as the workspace, so the browsers match), installs only production dependencies with `pnpm deploy`, runs as the non-root `pwuser`, keeps data in the `/data` volume, and has a `HEALTHCHECK` on `/health`. The image sets `HOST=0.0.0.0`, so `CLEAR_A11Y_TOKEN` is required.

With Redis and more workers:

```sh
docker run -d --name redis redis:7
docker run -d --link redis -e REDIS_URL=redis://redis:6379 -e CLEAR_A11Y_TOKEN=... \
  -e CLEAR_A11Y_WORKERS=2 -v clear-a11y-data:/data -p 3000:3000 clear-a11y/server
```

Every server sharing a Redis queue must share `DATA_DIR` (one volume), because results are files.

More: [docs/self-hosting.md](../../docs/self-hosting.md).

## Develop

```sh
pnpm nx test server               # unit and API tests (fake scan, no browser)
pnpm nx test-integration server   # real scan of the local fixture site through the API
```
