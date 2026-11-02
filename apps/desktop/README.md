# Clear A11Y desktop

An Electron app for people who don't live in a terminal. Add websites and source repo folders, run scans on your own computer, read the accessible report with focus-path diagrams, answer the questions only a person can decide, and pick an AI provider if you want one.

Private package (`@clear-a11y/desktop`, Nx project `desktop`). Installers, signing and auto-update come with the release wave; today you run it from source or package an unpacked app.

## Features

- **Targets.** Add web page URLs (http/https only) or local repo folders (folder picker, or type the path). Remove them any time. Stored in `targets.json` in the app data folder.
- **Scans with progress.** One queue-backed job per target, run one at a time in the main process with `@clear-a11y/runner` (`scan` for URLs, `scanRepo` for folders). Progress per page; **Cancel** stops a scan between pages and drops its result. Past scans stay listed across restarts.
- **Report.** Findings grouped by tier (Violation, Likely issue, Needs review) with plain-language meanings, a tier filter, and details per finding (WCAG criterion, element, page, rule, engine, fix, screenshot). **Show the full HTML report** embeds the same `toHtml` report the CLI writes, in a sandboxed frame.
- **Focus path.** The keyboard walk drawn over the element boxes: numbered stops, arrows in Tab order, backward jumps red, dashed and labelled "backward", followed by the same path as a numbered list (the text alternative). Layout comes from the reporter's `layoutFocusPath`.
- **Review questions.** One `needs-review` question at a time: Yes, No or Skip, with an optional note. Shortcuts Alt+Shift+Y, Alt+Shift+N, Alt+Shift+S (never a single key, WCAG 2.1.4). Answers are saved locally as calibration data and never change a finding's tier.
- **Settings.** AI provider (default **None**), model, the **name** of the environment variable that holds the API key, base URL for Azure/Ollama, which key variables are set (yes/no only), **Test connection**. Scan options (crawl same-site links, page cap). Browser setup. Export review answers as JSON.
- **Keyboard and screen readers.** Landmarks, one `h1` per view, focus moves to the view heading on navigation and the change is announced in a polite live region, visible focus, AA contrast in light and dark, reduced motion respected, reflow at 320 CSS px, 40px+ targets, and an app menu with Ctrl/Cmd+1...6 for the six views.

## Run it

```sh
pnpm install                        # never downloads Electron (see below)
pnpm nx run desktop:fetch-electron  # once: downloads the Electron binary from GitHub releases
pnpm nx run desktop:start           # builds main, preload and renderer, then starts Electron
```

`fetch-electron` runs `node node_modules/electron/install.js` inside `apps/desktop` (Electron's own installer; `npx install-electron` does the same). It is the **one command** a user or CI job runs to get the binary. Nothing else in the build needs it.

### Why `pnpm install` never downloads Electron

Clear A11Y must install, build and test offline (registry access only). The root `package.json` sets `"pnpm": { "neverBuiltDependencies": ["electron"] }`, so pnpm never runs an install script for Electron (verified with pnpm 9.15.4). Electron 45 itself no longer has a postinstall step; instead, **`require('electron')` from plain Node downloads the binary on first use**. Our scripts and tests therefore never call it: `scripts/electron.mjs` and the smoke test locate the binary through `node_modules/electron/path.txt` and fail or skip with instructions when it is missing.

### First run: the browser for scanning

Website scans run in Playwright's Chromium, not in Electron's own Chromium. If it is missing, the app explains what will be downloaded (Chromium, about 170 MB, from `cdn.playwright.dev` with `playwright.download.prss.microsoft.com` as fallback) and where it goes (Playwright's browsers folder, for example `~/Library/Caches/ms-playwright`). Nothing downloads until you press **Install browser**; the main process then runs `playwright install chromium` in a child process and shows progress. Offline, you get a plain message and can choose **Use an existing browser folder** (a Playwright browsers folder copied from another machine; used after a restart). Repo folder scans of source files work without the browser. Tests always stub the installer.

## Build and package

| Command                            | What it does                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm nx build desktop`            | `build-main` (esbuild: `dist/main` ESM + `dist/preload/preload.cjs`) and `build-renderer` (Vite + Preact: `dist/renderer`). No Electron binary needed. |
| `pnpm nx run desktop:start`        | Starts Electron on the build. Needs the binary.                                                                                                        |
| `pnpm nx run desktop:package`      | `electron-builder --dir` with `electronDist` pointed at the fetched binary: an unpacked app in `apps/desktop/release/`. Needs the binary.              |
| `pnpm nx test desktop`             | Unit tests (services, IPC, security, calibration, providers, browser install). No Electron, no browser.                                                |
| `pnpm nx test-integration desktop` | Renderer in Playwright Chromium, dogfood scan of the UI, Electron smoke test (skipped without the binary).                                             |

## Security model

Checklist from [Electron's security guide](https://www.electronjs.org/docs/latest/tutorial/security), enforced in `src/main/security.ts` and covered by unit tests:

- `contextIsolation: true`, `nodeIntegration: false` (also in workers and subframes), `sandbox: true` (and `app.enableSandbox()` for every renderer), `webSecurity: true`, no `<webview>`, no remote module.
- The UI is served from a custom privileged scheme, `clear-a11y://app/`, not `file://`. Requests are mapped only to files inside `dist/renderer` (path traversal refused).
- Strict CSP, sent as a response header and as a meta tag: `default-src 'none'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` and so on. No remote origins at all. `style-src` allows `'unsafe-inline'` only because the embedded HTML report uses inline styles; scripts never do.
- No remote content in the app window: the default session cancels every request that is not an app asset, `data:` or DevTools. Scanned pages never load in Electron; they open in Playwright's separate Chromium with its own browser contexts.
- New windows are denied; `http(s)` links go to the system browser via `shell.openExternal` after a URL check. Navigation away from the app entry, redirects, `<webview>` attachment and every permission request (camera, notifications...) are refused. Subframes may only hold `about:srcdoc`.
- The full HTML report is an `<iframe sandbox="" srcdoc>`: no scripts, no same-origin access, no top navigation.
- The preload exposes one object, `window.clearA11y`, built by `createBridge` from `ipcRenderer.invoke`/`on` for known channels only. The renderer never sees `ipcRenderer`, Node or Electron objects.
- Main validates every IPC payload with zod (`src/shared/ipc-schemas.ts`) before any handler runs, refuses unknown channels and refuses requests from any frame other than the app page. Errors cross the bridge as plain messages, never stacks.

## Where data and keys live

Everything lives in Electron's `userData` folder (macOS `~/Library/Application Support/Clear A11Y`, Windows `%APPDATA%\Clear A11Y`, Linux `~/.config/Clear A11Y`). Set `CLEAR_A11Y_DESKTOP_DATA_DIR` to use another folder.

| File               | Contents                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `clear-a11y.db`    | SQLite (Node's built-in `node:sqlite`): the scan queue (`desktop-scans`) and `calibration_answers` |
| `scans/<id>/`      | Each scan's canonical `report.json` and its `artifacts/` (screenshot crops)                        |
| `targets.json`     | Your targets                                                                                       |
| `settings.json`    | Provider choice, model, key variable **name**, base URL, scan options, browsers folder             |
| `calibration.json` | Only when `node:sqlite` is unavailable (fallback store, same rows)                                 |

**API keys are never stored by the app.** Settings hold the name of an environment variable (for example `ANTHROPIC_API_KEY`); the AI package reads the key from the environment at scan time. Set the variable before you start the app. The UI only shows whether a variable is set, never its value, and messages are scrubbed of key values. There is no consumer chat-subscription login of any kind; see [docs/providers.md](../../docs/providers.md). With the default provider `None`, no page content leaves your computer.

If `node:sqlite` cannot be loaded, the app keeps working with an in-memory queue (scan history lasts until you quit; Settings > About says so) and the JSON calibration store.

## Calibration data format

Table `calibration_answers` (one row per finding id; answering again replaces the earlier answer):

| Column         | Type | Meaning                                                                         |
| -------------- | ---- | ------------------------------------------------------------------------------- |
| `finding_id`   | TEXT | Stable finding id (hash of rule, selector, page, state, viewport). Primary key. |
| `scan_id`      | TEXT | The scan the question came from                                                 |
| `rule_id`      | TEXT | For example `keyboard/skip-link-missing`                                        |
| `engine`       | TEXT | For example `engine-keyboard`                                                   |
| `wcag`         | TEXT | JSON array of success criteria, for example `["2.4.1"]`                         |
| `tier_at_time` | TEXT | The finding's tier when answered (`needs-review`)                               |
| `confidence`   | REAL | The finding's confidence, 0..1                                                  |
| `answer`       | TEXT | `yes`, `no` or `skip`                                                           |
| `note`         | TEXT | Optional free text                                                              |
| `answered_at`  | TEXT | ISO timestamp                                                                   |
| `app_version`  | TEXT | App version that recorded it                                                    |

Metadata is copied from the stored finding in the main process, never taken from the renderer. **Settings > Export answers as JSON** writes:

```json
{
  "format": "clear-a11y-calibration",
  "version": 1,
  "exportedAt": "2026-10-31T12:00:00.000Z",
  "appVersion": "0.0.0",
  "answers": [
    {
      "findingId": "0e8ff0ca38cf72",
      "scanId": "7df2267d-02f1-448d-8809-21225436fc7a",
      "ruleId": "keyboard/skip-link-missing",
      "engine": "engine-keyboard",
      "wcag": ["2.4.1"],
      "tierAtTime": "needs-review",
      "confidence": 0.5,
      "answer": "no",
      "note": "The footer has a skip link.",
      "answeredAt": "2026-10-31T11:58:02.000Z",
      "appVersion": "0.0.0"
    }
  ]
}
```

Answers never leave the machine unless you export them yourself.

## Tests

- **Unit** (`src/**/*.test.ts`): IPC schemas reject bad payloads; dispatch refuses unknown channels and untrusted senders; settings default to provider `none`; calibration stores (SQLite and JSON) on temp files; browser install with stubbed installers (progress, offline error, shared download); provider test with a fake `fetch` (no key: nothing sent; key values redacted); security settings, CSP, navigation guards and path mapping; menu accelerators; the bridge.
- **Renderer integration** (`test/renderer.integration.test.ts`): serves the built renderer and drives it in Playwright Chromium. `window.clearA11y` is the same bridge the preload builds, wired through a Playwright binding to the real IPC dispatcher and services (temp data folder, SQLite queue, real runner scanning local fixture pages). Covers adding targets, running and cancelling scans, the report and sandboxed HTML report, the focus overlay, review answers (buttons and shortcuts), provider settings and the stubbed browser install.
- **Dogfood** (`test/dogfood.integration.test.ts`): a fake bridge holding real data (finished scans of fixture pages and a fixture repo, review questions, settings) serves each of the six views, and each is scanned with `scan` from `@clear-a11y/runner` and every engine. The test requires zero findings of any tier (the requirement is zero `violation`s). It also writes light, dark and 320px screenshots to `test-output/screenshots/`.
- **Electron smoke** (`test/electron.integration.test.ts`): Playwright `_electron` against the built app with a temp data folder: checks web preferences, blocked navigation, then adds a fixture target, scans it, answers a review question and reads it back from SQLite. **Runs only when the Electron binary is installed**; otherwise it is skipped with a message. On Linux without a display it is skipped too; run the suite under `xvfb-run -a pnpm nx run desktop:test-integration`. CI jobs that don't fetch the binary need nothing special.

## Layout

```
src/main/      Electron main process. main.ts/app.ts are the thin Electron shell; everything else
               (services, scans, settings, calibration, providers, browsers, ipc, security, menu)
               is plain Node and unit-tested without Electron.
src/preload/   Sandboxed preload (bundled to CommonJS): exposes window.clearA11y.
src/shared/    API types, IPC channel names, zod schemas, the bridge factory.
src/renderer/  Static web UI (Preact + Vite). Talks only to window.clearA11y.
test/          Integration tests and their helpers (bridge stand-ins, sample data).
```

No detection logic lives here: findings, tiers and evidence come from the runner unchanged.
