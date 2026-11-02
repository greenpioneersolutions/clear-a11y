# S12: Queue and API server

## Goal

Add a job queue abstraction with a zero-infrastructure SQLite implementation and a BullMQ (Redis) implementation, and a self-hostable NestJS API server that accepts scan jobs, reports progress, and serves findings and reports. A team can `docker run` it; a laptop can run it with no Redis. Read the ground rules in "Notes" first.

## Wave

Wave 5, **parallel** with S11 and S13. Runs in its own git worktree.

## Projects

| Project             | Path             | Package              | Tags                                                | Status                           |
| ------------------- | ---------------- | -------------------- | --------------------------------------------------- | -------------------------------- |
| `@clear-a11y/queue` | `packages/queue` | `@clear-a11y/queue`  | `type:data-access`, `scope:queue`, `publish:public` | created (`@nx/js:library`)       |
| `server`            | `apps/server`    | `@clear-a11y/server` | `type:app`, `scope:server`, `publish:private`       | created (`@nx/nest:application`) |

## Depends on

S01 (runner `scan`), S06 (reporter JSON/SARIF/HTML). S14 (desktop) will reuse the SQLite queue, so its API must be stable here.

## Scope

**Queue interface** (`packages/queue/src/types.ts`):

```ts
type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
interface ScanJob {
  id: string;
  status: JobStatus;
  payload: ScanJobPayload;
  progress: { done: number; total: number; message?: string };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  resultRef?: string;
  attempts: number;
}
interface JobQueue {
  enqueue(payload: ScanJobPayload): Promise<ScanJob>;
  get(id: string): Promise<ScanJob | undefined>;
  list(opts?: { status?: JobStatus; limit?: number }): Promise<ScanJob[]>;
  cancel(id: string): Promise<void>;
  process(
    handler: (
      job: ScanJob,
      report: (p: ScanJob['progress']) => Promise<void>,
    ) => Promise<string /* resultRef */>,
    opts?: { concurrency?: number; signal?: AbortSignal },
  ): Promise<void>;
  close(): Promise<void>;
}
interface ResultStore {
  put(jobId: string, result: unknown): Promise<string>;
  get(ref: string): Promise<unknown | undefined>;
}
```

`ScanJobPayload` is a plain JSON subset of scan options (targets, engines, viewports, maxPages, formats) defined here, not imported from runner (data-access may only depend on util). Validate with Zod.

**SQLite implementation**: recommended `node:sqlite` (built into Node; no native addon to compile or download, so installs stay offline-safe and Electron-friendly if Electron's Node includes it). Verify at implementation time that `node:sqlite` is stable (no flag) on the workspace's Node version **and** available in the Electron version planned for S14; if not, use `better-sqlite3` and justify. Record the choice in `docs/DECISIONS.md`. Schema: `jobs` table (JSON payload/progress columns), `results` table (JSON blob or file path for large results), WAL mode, atomic claim via `UPDATE … WHERE id = (SELECT … WHERE status='queued' ORDER BY createdAt LIMIT 1) RETURNING *`, stale `running` jobs re-queued on startup (attempts + 1, max 3), migrations versioned by `PRAGMA user_version`.

**BullMQ implementation**: `createBullQueue({ connection })` mapping the interface onto BullMQ `Queue`/`Worker`/`QueueEvents`; progress via `job.updateProgress`; results in Redis (small) or the `ResultStore`. Lazy-import `bullmq` so the SQLite path never loads it.

**Server** (`apps/server`, NestJS):

- `POST /scans` body `ScanJobPayload` → `202 { id, status }`; `GET /scans/:id` → job; `GET /scans` → list; `DELETE /scans/:id` → cancel; `GET /scans/:id/findings?tier=&wcag=` → canonical JSON findings; `GET /scans/:id/report?format=html|sarif|json` (correct content types; HTML served with a CSP header); `GET /health`.
- Worker: in-process `queue.process(handler)` where the handler calls `runner.scan` and stores `ScanResult` via `ResultStore`; progress callbacks from runner (add an optional `onProgress` option to runner if missing; runner is not core).
- Queue selection: `REDIS_URL` set → BullMQ; otherwise SQLite at `DATA_DIR/clear-a11y.db` (default `./.clear-a11y/server`).
- Security defaults: bind `127.0.0.1` unless `HOST` set; optional bearer token `CLEAR_A11Y_API_TOKEN` (required when `HOST` is not loopback); **SSRF guard**: targets must match `ALLOWED_TARGETS` (comma-separated origins/globs); reject `file:`, non-http(s), and private/link-local IP ranges unless explicitly allowed; validate payload sizes; rate-limit job creation.
- `Dockerfile` (multi-stage): build with pnpm, runtime `mcr.microsoft.com/playwright:v<same version as catalog>-noble`, non-root user, `HEALTHCHECK`, `EXPOSE 3000`, volume for `DATA_DIR`. `.dockerignore`. Renovate rule keeps the image tag in sync with the Playwright version.

## Out of scope

Multi-tenant auth, user accounts, a web UI (desktop and the HTML report cover viewing), horizontal scaling docs beyond "use Redis + more workers", Helm charts, running Docker in CI tests.

## Files to create/change

`packages/queue/src/{types.ts,payload.ts,sqlite/{sqlite-queue.ts,migrations.ts,result-store.ts},bullmq/bull-queue.ts,memory/memory-queue.ts,contract.ts,index.ts}` + tests; `apps/server/{src/{main.ts,app.module.ts,scans/{scans.controller.ts,scans.service.ts,dto.ts},worker/worker.service.ts,security/{ssrf.ts,auth.guard.ts},config.ts},test/**,Dockerfile,.dockerignore,README.md}`; `packages/runner/src/scan.ts` (`onProgress`, if needed); docs.

## Tests

- **Shared contract suite** `runQueueContract(createQueue)` exported from `queue` test helpers and run against memory, SQLite (temp file) and BullMQ: enqueue/get/list, FIFO claim, concurrency 2 never double-claims, progress updates, failure with error message, cancel, restart recovery (SQLite: close and reopen; stale running → queued).
- BullMQ: the contract suite runs only when `REDIS_URL` is set (skipped otherwise, with a log line); a unit test with `vi.mock('bullmq')` checks the mapping. `ioredis-mock` does not support BullMQ's Lua scripts reliably; don't build on it.
- Server (Nest testing module + `supertest`, SQLite queue in a temp dir, fixture server for targets): submit → poll until `succeeded` → findings JSON validates → report formats; SSRF rejections (`file:///etc/passwd`, `http://169.254.169.254`, `http://10.0.0.1` without allowlist); auth required when non-loopback; 404/400 paths.
- Dockerfile lint by inspection only (no `docker build` in tests); optional manual `docker build` recorded in the PR.

## Fixtures + expected findings

No new barrier pages; server tests scan `fixtures/site/static/img-missing-alt.html` and `-ok`. The allowlist in tests is the fixture server origin.

## Docs to update

`packages/queue/README.md` (interface, implementations, choosing), `apps/server/README.md` (endpoints with curl examples, env vars, security model, Docker usage), `docs/DECISIONS.md` (SQLite driver choice, SSRF defaults), `SECURITY.md` scope note if needed.

## Acceptance criteria

- [ ] Contract suite passes for memory and SQLite; BullMQ suite passes when `REDIS_URL` is set and is skipped cleanly otherwise.
- [ ] Server end-to-end test: submit → succeeded → findings + HTML/SARIF/JSON reports, using SQLite and the fixture server.
- [ ] SSRF guard and auth behave as specified (tested).
- [ ] `Dockerfile` uses the Playwright image matching the catalog version and runs as non-root.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `pnpm nx sync:check` passes; `queue` depends only on `core` (util).
- [ ] `pnpm nx run bench:run` unchanged (no detection change); note "n/a".

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Tags/boundaries:** `queue` is `type:data-access` → may depend only on `type:util` (`core`). It must not import `runner` or `reporter`; the server (app) wires them together. app → feature, engine, data-access, util. `publish:public` → public only (`queue` is public so S14 and others can use it; `server` is private). Test files may import `test-utils`.
- **Apps are thin:** the server validates input, enqueues, and calls runner/reporter. No detection logic in `apps/`.
- **Self-hostable:** no required SaaS; works with no Redis.
- **Offline:** no network in tests (Redis tests opt-in via env); fixture server targets only.
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`.

### Pitfalls and hints

- NestJS relies on decorators and `emitDecoratorMetadata`; the Nx Nest generator configures a bundled build. Keep the app's tsconfig settings local to `apps/server` and don't push decorator flags into `tsconfig.base.json`. If ESM causes trouble, a CJS bundle for this private app is acceptable; record it.
- SQLite concurrency: one writer; use WAL and short transactions; the worker and API share one connection per process.
- Scans are long; set request timeouts so `POST /scans` returns immediately and work happens in the worker.
- DNS rebinding: resolve the target host and check the resolved IP against the guard, not just the hostname.
