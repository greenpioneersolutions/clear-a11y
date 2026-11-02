# S14: Desktop app

## Goal

Ship `apps/desktop`, an Electron app for people who don't live in a terminal: add targets (URLs or repo folders), run scans with progress, read the accessible report with focus-path overlays, answer `needs-review` questions (saved as calibration data), and configure AI providers. Scans run locally in the main process with the runner and the SQLite queue. The app's own UI must pass Clear A11Y with zero `violation`s. Read the ground rules in "Notes" first.

## Wave

Wave 6, **parallel** with S15. Runs in its own git worktree.

## Projects

| Project   | Path           | Package               | Tags                                           | Status                                              |
| --------- | -------------- | --------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `desktop` | `apps/desktop` | `@clear-a11y/desktop` | `type:app`, `scope:desktop`, `publish:private` | created (see Notes: no official Nx Electron plugin) |

## Depends on

S01 (runner), S06 (HTML report, focus-path rendering), S07 (provider config), S12 (`@clear-a11y/queue` SQLite implementation and `ResultStore`).

## Scope

**Process model**

- **Main** (Node): owns the runner, a SQLite `JobQueue` + `ResultStore` in `app.getPath('userData')/clear-a11y.db`, a worker (`queue.process` → `runner.scan`/`scanRepo`), settings, secret storage, and the browser-install manager.
- **Preload**: `contextBridge.exposeInMainWorld('clearA11y', api)` with a narrow, typed API: `targets.list/add/remove`, `scans.start/cancel/list/get/onProgress`, `findings.list(scanId, filter)`, `report.html(scanId)`, `review.answer(findingId, answer, note?)`, `review.export()`, `settings.get/set`, `providers.test(id)`, `browsers.status/install/onProgress`. Validate every IPC payload with Zod in main.
- **Renderer**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP (no remote origins), no `remote` module, navigation and `window.open` blocked except to the bundled UI; external links opened with `shell.openExternal` after an http(s) check.

**First run**: check Playwright's Chromium (`chromium.executablePath()` exists). If missing, explain in plain words what will be downloaded and where, ask for consent, then install using `playwright-core`'s registry installer with a progress bar. Offline machines get a clear message and a "Locate existing browser" option. Tests stub the installer.

**UI** (keep the framework small: React or Preact with native elements first; record the choice):

- Screens: Targets, Scans (progress per job, cancel), Report (findings grouped by tier and SC; filters; detail view with evidence), Focus path (page screenshot with numbered stops, backward jumps red + dashed + labeled, plus the ordered-list text alternative — reuse reporter's renderer functions from `@clear-a11y/reporter`), Review queue (one question at a time, Yes / No / Skip, optional note, keyboard shortcuts documented and not single-character-only per 2.1.4), Settings (provider selection `none` default, model, key entry, base URL for Ollama; "Test connection" button).
- Accessibility: landmarks, one `h1` per view, focus moved to the view heading on navigation and announced via a polite live region, visible focus, AA contrast in light/dark, respects reduced motion, reflow at 320 CSS px, targets ≥ 24px, app menu with keyboard accelerators.

**Calibration data**: table `calibration_answers { findingId, ruleId, engine, wcag, tierAtTime, confidence, answer: 'yes'|'no'|'skip', note, answeredAt, appVersion }`; export as JSON from Settings. Answers never leave the machine.

**Secrets**: API keys stored with Electron `safeStorage` (encrypted at rest); if `safeStorage.isEncryptionAvailable()` is false, refuse to save and tell the user to use an environment variable instead. Keys never sent to the renderer after entry (renderer only sees "configured: yes").

**Build**: bundle main/preload/renderer (esbuild or Vite), package an unpacked app with `electron-builder --dir` (or Electron Forge `package`) for the current OS. Installers, signing, notarization, auto-update: out of scope (release wave).

## Out of scope

Installers/signing/auto-update, multi-user sync, cloud storage, scheduling recurring scans, editing source code from the app.

## Files to create/change

`apps/desktop/{package.json,README.md,electron-builder.yml (or forge.config),src/main/{main.ts,ipc.ts,worker.ts,settings.ts,secrets.ts,browsers.ts,calibration.ts,security.ts},src/preload/preload.ts,src/renderer/{index.html,main.tsx,views/*,components/*,styles.css},src/shared/{api-types.ts,ipc-schemas.ts},test/{unit/**,smoke.e2e.ts,dogfood.integration.test.ts}}`; root catalog (electron, builder, UI lib); `docs/DECISIONS.md`.

## Tests

- Unit (Vitest): IPC schema validation (rejects bad payloads), settings defaults (`provider: none`), calibration repository on a temp SQLite DB, secrets wrapper with `safeStorage` mocked (refuses when unavailable), browser-status logic, renderer components with Testing Library (keyboard operation of the review queue, focus moves on navigation).
- **Smoke e2e**: Playwright `_electron.launch` on the built app with a temp `userData`, stubbed browser installer and a fixture-server target: add target → start scan → wait for completion → open report → answer one review question → assert it's stored. On Linux CI run under `xvfb-run`; if no display is available and xvfb isn't installed, skip with a logged reason (`describe.skip` guarded by an env check) and document it in the README. Don't rely on a `--headless` Electron flag; Electron has no true headless mode.
- **Dogfood**: build the renderer, serve it with the fixture server using a mocked `window.clearA11y` (static demo data, injected by a test-only preload script or a `?demo` flag), scan each view with `runner.scan`, assert zero `violation`s; fix or document `likely`s.

## Fixtures + expected findings

No new barrier pages. Add `fixtures/site/desktop/` only if you need a demo target; any page added there needs an expected file (`correctPattern: true` if it's clean).

## Docs to update

`apps/desktop/README.md` (run in dev, build, first-run browser download, where data and keys live, smoke test requirements), `docs/DECISIONS.md` (bundler/packager choice, UI library, SQLite driver works in Electron), user docs stub for S15 (`apps/docs` page content can be drafted in the README).

## Acceptance criteria

- [ ] `pnpm nx build desktop` produces an unpacked app for the current OS.
- [ ] Smoke e2e passes locally (and under xvfb on Linux) or is skipped with a documented reason.
- [ ] Security settings verified by test: `contextIsolation`, `sandbox`, no `nodeIntegration`, navigation blocked, IPC payloads validated.
- [ ] Review answers persist to `calibration_answers` and export as JSON.
- [ ] Dogfood scan of the UI: zero `violation`s.
- [ ] Default provider is `none`; keys only via `safeStorage` or env vars.
- [ ] `pnpm nx run-many -t lint typecheck test build` passes; `pnpm nx sync:check` passes.
- [ ] `pnpm nx run bench:run` unchanged (no detection change); note "n/a".

## Notes for the implementing agent

### Ground rules (restated; AGENTS.md is the full contract)

- **Apps are thin:** the main process calls `@clear-a11y/runner`, `@clear-a11y/queue`, `@clear-a11y/reporter`. No detection logic in `apps/desktop`; if you need a helper that analyzes findings, put it in reporter or runner.
- **Tags/boundaries:** app → feature, engine, data-access, util. `desktop` is `publish:private`. Test files may import `test-utils`.
- **Tiers:** show tiers in plain words; review answers are calibration data and never change a finding's tier automatically.
- **Provider policy:** API keys, cloud credentials, or local Ollama; never consumer chat-subscription login. Default `none`. Nothing is sent to a remote model unless the user configured a provider.
- **Practice what we test:** the UI must pass Clear A11Y with zero `violation`s.
- **Offline:** tests use stubbed browser install and localhost fixtures; Electron's own binary download happens at `pnpm install` time (set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in CI jobs that don't run the smoke test).
- **Parallel slice:** do not modify `packages/core` or `packages/browser`; write needed changes under "Pending core changes" in `docs/DECISIONS.md`.

### Pitfalls and hints

- There is no official `@nx/electron` plugin. Create the project with `@nx/js:library` (or a minimal `package.json` project) and add explicit targets (`build`, `serve`, `package`, `e2e`) as `nx:run-commands`; that's "custom work", which AGENTS.md allows. Record it.
- Electron's main process may be CJS-only depending on version/bundler; bundling main and preload to CJS is fine for a private app.
- Playwright inside Electron's main: launch Chromium via `playwright-core` with the installed browser path; don't use Electron's own Chromium for scanning.
- Native modules (if you end up with `better-sqlite3`) need rebuilding for Electron's ABI; another reason to prefer `node:sqlite` if Electron's Node supports it.
