# Self-hosting Clear A11Y

Clear A11Y runs entirely on your own machines. There are three ways to run scans, from simplest to most shared:

1. **CLI** (`clear-a11y scan <url>`): one scan, results in a folder. No server.
2. **API server on one machine** (`apps/server`, SQLite queue): submit scans over HTTP, poll, fetch reports. No Redis, no database server.
3. **API server for a team** (Docker, optionally Redis): several workers, one shared queue.

Nothing here needs a SaaS account, Nx Cloud, or an AI key. AI providers are opt-in and bring-your-own (see [providers.md](providers.md)).

## 1. One machine, no extra services

```sh
pnpm install
pnpm nx run server:serve
```

The server listens on `http://127.0.0.1:3000`, keeps its queue in `./.clear-a11y/server/clear-a11y.db` (SQLite, through Node's built-in `node:sqlite`; Node 22.13 or newer) and writes each scan's results to `./.clear-a11y/server/scans/<id>/`. Jobs survive a restart: a scan that was running when the process stopped is picked up again (up to 3 attempts).

```sh
curl -s -X POST http://127.0.0.1:3000/scans -H 'Content-Type: application/json' \
  -d '{"targets":["https://example.com/"]}'
curl -s http://127.0.0.1:3000/scans/<id>
curl -s -o report.html "http://127.0.0.1:3000/scans/<id>/report?format=html"
```

Because it only listens on loopback, no token is needed. Scanning a site on your own machine (for example `http://localhost:8080`) is refused by the SSRF guard unless you allow it: `ALLOWED_TARGETS=http://localhost:8080`.

## 2. A container for a team

```sh
docker build -f apps/server/Dockerfile -t clear-a11y/server .
docker run -d --name clear-a11y -p 3000:3000 \
  -e CLEAR_A11Y_TOKEN="$(openssl rand -hex 24)" \
  -e ALLOWED_TARGETS=https://staging.example.com,https://*.preview.example.com \
  -v clear-a11y-data:/data \
  clear-a11y/server
```

- The image is the Playwright image matching the workspace's Playwright version, so browsers are already inside; it runs as a non-root user and has a health check on `/health`.
- In the container the server binds `0.0.0.0`, so a token is required. Clients send `Authorization: Bearer <token>`.
- Put a reverse proxy with TLS in front of it and set `TRUST_PROXY=true` so the rate limit sees real client IPs.
- Set `ALLOWED_TARGETS` to the origins your team scans. Without it, any public address is allowed and private addresses are refused.

## 3. More workers with Redis

Set `REDIS_URL` and the queue becomes BullMQ on Redis. Run as many server containers as you like; each runs `CLEAR_A11Y_WORKERS` scans at once (default 1; each scan uses its own headless browser, so budget about 1 CPU and 1 GB of memory per worker). Containers with `CLEAR_A11Y_WORKERS=0` only serve the API.

All containers must mount the same `DATA_DIR` volume: results and screenshots are files, and any container may be asked for any scan's report.

```yaml
# docker-compose.yml (sketch)
services:
  redis:
    image: redis:7
  api:
    image: clear-a11y/server
    environment:
      REDIS_URL: redis://redis:6379
      CLEAR_A11Y_TOKEN: ${CLEAR_A11Y_TOKEN}
      CLEAR_A11Y_WORKERS: '0'
      ALLOWED_TARGETS: https://staging.example.com
    volumes: [data:/data]
    ports: ['3000:3000']
  worker:
    image: clear-a11y/server
    deploy: { replicas: 2 }
    environment:
      REDIS_URL: redis://redis:6379
      CLEAR_A11Y_TOKEN: ${CLEAR_A11Y_TOKEN}
      CLEAR_A11Y_WORKERS: '2'
      ALLOWED_TARGETS: https://staging.example.com
    volumes: [data:/data]
volumes:
  data: {}
```

## Settings and API

The full list of environment variables, endpoints with curl examples, and the security model are in the [server README](../apps/server/README.md). The queue itself (memory, SQLite, BullMQ) is documented in [`@clear-a11y/queue`](../packages/queue/README.md); the desktop app reuses its SQLite queue.

## Security checklist

- Keep the default loopback binding unless other machines need the API; when they do, set a long random `CLEAR_A11Y_TOKEN`.
- Set `ALLOWED_TARGETS`. The SSRF guard refuses private and metadata addresses, but the browser follows redirects during a scan, so for untrusted users also run the container on a network without access to internal services.
- Don't pass AI keys in requests (the server refuses them). To let requests use an AI provider, export the key in the server's environment and list the variable name in `CLEAR_A11Y_AI_KEY_ENVS`.
- Back up the `DATA_DIR` volume if you keep reports; delete `scans/<id>` folders you no longer need.
