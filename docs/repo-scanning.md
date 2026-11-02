# Repo scanning

`clear-a11y scan <path-to-repo>` scans a source repository instead of a running site. A repo scan has two layers, combined into one report:

- the **static layer** (package `@clear-a11y/repo`) lints the source: fast, exact file and line, but blind to anything that only exists at runtime;
- the **runtime layer** (orchestrated by `@clear-a11y/runner`) renders the repo's UI in a browser and runs the full engine set on it: every **Storybook story** when the repo has a built Storybook, or, only when you opt in with `--boot`, the app's **dev server**, crawled like a site.

This page covers both: what each finds, how tiers are chosen, how runtime findings are mapped back to source, and the security model.

```sh
clear-a11y scan ./my-app --format json,sarif,html --out reports
clear-a11y scan ./my-app --fail-on violation        # CI gate
clear-a11y scan ./my-app --storybook-url http://localhost:6006/   # stories from a running Storybook
clear-a11y scan ./my-app --boot                     # no Storybook: start the dev server (runs repo code)
```

The result is a normal report (`report.json`, `report.sarif`, `report.html`). Every static finding has a `source` (`file`, `line`, `column`, and the enclosing `component` when it is cheap to find), so SARIF results show up on the right line in GitHub code scanning. Static findings use `page.url = "repo:<relative path>"`, `state: "source"` and `viewport: "none"`. The first scan target is `repo:<absolute path>`; when the runtime layer ran, its origin is the second target (`repo:storybook-static/`, the Storybook URL, or the dev server URL). Findings are deduplicated by id across both layers.

## Static layer: what happens

1. **Detect** (`detectRepo`). Reads `package.json` at the root, in every direct child folder and one level inside `packages/`, `apps/` and `libs/`. It finds the package manager (`packageManager` field or lockfile), frameworks (React, Preact, Next.js, Create React App, Vue, Nuxt, Angular, Svelte/SvelteKit, Vite), Storybook (`.storybook/`, `@storybook/*` or `storybook` dependencies, a prebuilt `storybook-static/`), TypeScript, and source folders (`src`, `app`, `pages`, `components`, `lib` per package).
2. **List files.** Walks the source folders for `.jsx`, `.tsx`, `.js` (React family or no framework), `.vue` (Vue) and `.html` (Angular templates). It skips `node_modules`, build output (`dist`, `build`, `out`, `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.angular`, `storybook-static`), coverage, dot-folders, symbolic links, tests (`*.test.*`, `*.spec.*`, `__tests__`), stories (`*.stories.*`, scanned at runtime instead), `*.d.ts` and files larger than 512 KB.
3. **Lint** each file in memory with our own fixed rule set (below).
4. **Normalize** every lint hit into a canonical Finding: `ruleId` `repo/<plugin>/<rule>` (for example `repo/jsx-a11y/alt-text`), engine `repo-eslint`, WCAG criteria and tier from the mapping table, a plain-language `message` and `fix`, and the target described as a short element, for example `<img className="hero" src={…}>`. The raw lint text stays in `evidence.data.lintMessage`.

Parse errors become scan `errors`, not findings. Frameworks we detect but cannot lint (Svelte, or Angular without the opt-in below) are reported as `errors` too, so a gap in coverage is never silent.

### Options (`repo` section of the config file)

| Option             | Default  | What it does                                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `include`          | detected | Repo-relative folders to scan instead of the detected ones. Must stay inside the repo.          |
| `exclude`          | `[]`     | Extra globs to skip, e.g. `["src/legacy/**"]`.                                                  |
| `maxFiles`         | `5000`   | Stop after this many files (a notice says so).                                                  |
| `maxFileBytes`     | `524288` | Skip larger files (usually generated or vendored).                                              |
| `trustRepoPlugins` | `false`  | Load lint plugins from the repo's own `node_modules` (Angular). Same as `--trust-repo-plugins`. |

## What static lint can and cannot find

Lint reads source code. It is fast, exact about file and line, and catches barriers that are visible in the markup you write: a missing `alt`, a `<div onClick>`, a label that points at nothing, a positive `tabIndex`, `<html>` without `lang`.

It cannot see anything that only exists at runtime:

- **Props and data.** `<img {...props} />` may receive `alt` from its caller; `<Button>` may render a perfectly fine `<button>`. Lint only sees the call site.
- **Rendered result.** Contrast, focus visibility, reflow at 320 px, text spacing, target size, and whether content is hidden by CSS.
- **Behavior.** Where focus goes when a dialog opens or closes, keyboard traps, focus order versus visual order, live-region announcements, what a menu does on Escape.
- **Meaning.** Whether alt text is accurate, whether a heading describes its section, whether link text makes sense out of context.

Those need the runtime layer (below: Storybook stories or the dev server), a scan of the running app's URL, or a human. Static lint usually finds a minority of what a full audit logs; it is the cheapest early warning, not a verdict.

## Tier policy

Static lint can't see runtime context, so the default tier is **`likely`**. A rule becomes **`violation`** only when the source is unambiguous: the element is a literal DOM element (lowercase tag, not a component) with **no spread props** (`{...props}` in JSX, `v-bind="obj"` in Vue) that could supply the missing attribute.

| Rule (jsx-a11y / vuejs-accessibility) | Violation when                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alt-text`                            | A literal `<img>`, `<area>` or `<input>` with no spread props and **no alt at all** (not the "prefer `alt=""` over `role="presentation"`" advice). |
| `html-has-lang`                       | A literal `<html>` with no spread props and no `lang`.                                                                                             |
| `aria-role`                           | A DOM element whose `role` is a string literal that is not a valid ARIA role.                                                                      |
| `aria-props`                          | A DOM element with an `aria-*` attribute that does not exist (a misspelling cannot be fixed by props).                                             |

Rules that depend on context are **`needs-review`** with a yes/no question: `no-autofocus` (autofocus is right on a search page or in a just-opened dialog) and `img-redundant-alt` (the words "image" or "photo" are noise, not always a failure). Everything else is `likely`.

## Rule mapping

The map lives in `packages/repo/src/static/rule-map.ts`. Only mapped rules are enabled, and a unit test fails if an enabled rule has no mapping or maps to an unknown or obsolete SC, or if a recommended plugin rule is neither mapped nor listed as deliberately skipped.

### eslint-plugin-jsx-a11y (recommended set) and eslint-plugin-vuejs-accessibility (recommended set)

| Rule                                             | Plugins   | WCAG         | Tier               | Why this SC                                                                                                                         |
| ------------------------------------------------ | --------- | ------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `alt-text`                                       | jsx, vue  | 1.1.1        | likely / violation | Images need a text alternative.                                                                                                     |
| `anchor-has-content`                             | jsx, vue  | 2.4.4, 4.1.2 | likely             | A link with no content has no name or purpose.                                                                                      |
| `anchor-is-valid`                                | jsx       | 2.1.1, 2.4.4 | likely             | `<a>` without `href` is not focusable; `href="#"` links go nowhere.                                                                 |
| `aria-activedescendant-has-tabindex`             | jsx       | 2.1.1        | likely             | The widget can't receive keyboard focus.                                                                                            |
| `aria-props`                                     | jsx, vue  | 4.1.2        | likely / violation | Nonexistent ARIA attributes are ignored.                                                                                            |
| `aria-proptypes`                                 | jsx       | 4.1.2        | likely             | Invalid ARIA values expose the wrong state.                                                                                         |
| `aria-role`                                      | jsx, vue  | 4.1.2        | likely / violation | Invalid roles hide what the element is.                                                                                             |
| `aria-unsupported-elements`                      | jsx, vue  | 4.1.2        | likely             | ARIA on `<meta>`, `<script>` etc. has no effect.                                                                                    |
| `autocomplete-valid`                             | jsx       | 1.3.5        | likely             | Input purpose must be programmatically determinable.                                                                                |
| `click-events-have-key-events`                   | jsx, vue  | 2.1.1        | likely             | Click-only handlers exclude keyboard users.                                                                                         |
| `form-control-has-label`                         | vue       | 1.3.1, 4.1.2 | likely             | Controls need a programmatic label.                                                                                                 |
| `heading-has-content`                            | jsx, vue  | 1.3.1, 2.4.6 | likely             | Empty headings break heading navigation.                                                                                            |
| `html-has-lang`                                  | jsx       | 3.1.1        | likely / violation | The page language must be set.                                                                                                      |
| `iframe-has-title`                               | jsx, vue  | 4.1.2        | likely             | Frames need a name. Likely only: an `aria-label` would also name it.                                                                |
| `img-redundant-alt`                              | jsx       | 1.1.1        | needs-review       | "Image of" is noise, but the alt may still describe the image.                                                                      |
| `interactive-supports-focus`                     | jsx, vue  | 2.1.1        | likely             | Interactive roles must be focusable.                                                                                                |
| `label-has-associated-control` / `label-has-for` | jsx / vue | 1.3.1, 4.1.2 | likely             | A label must be tied to its control. For Vue we accept nesting **or** `for`/`id` (Technique H44); the plugin default requires both. |
| `media-has-caption`                              | jsx, vue  | 1.2.2        | likely             | Prerecorded media needs captions (they may be provided another way).                                                                |
| `mouse-events-have-key-events`                   | jsx, vue  | 2.1.1        | likely             | Hover-only behavior excludes keyboard users.                                                                                        |
| `no-autofocus`                                   | jsx, vue  | 2.4.3        | needs-review       | Autofocus can skip content, but is right in some views.                                                                             |
| `no-distracting-elements`                        | jsx, vue  | 2.2.2        | likely             | `<marquee>`/`<blink>` move with no pause control.                                                                                   |
| `no-interactive-element-to-noninteractive-role`  | jsx       | 4.1.2        | likely             | Interactive elements announced as static content.                                                                                   |
| `no-noninteractive-element-interactions`         | jsx       | 2.1.1, 4.1.2 | likely             | Handlers on `<li>`, `<p>`... are not exposed or keyboard operable.                                                                  |
| `no-noninteractive-element-to-interactive-role`  | jsx       | 4.1.2        | likely             | The role promises behavior the element lacks.                                                                                       |
| `no-static-element-interactions`                 | jsx, vue  | 2.1.1, 4.1.2 | likely             | `<div onClick>` has no role and no keyboard support.                                                                                |
| `role-has-required-aria-props`                   | jsx, vue  | 4.1.2        | likely             | State attributes required by the role are missing (props may add them).                                                             |
| `role-supports-aria-props`                       | jsx       | 4.1.2        | likely             | Attributes the role does not support are ignored.                                                                                   |
| `scope`                                          | jsx       | 1.3.1        | likely             | `scope` only works on `<th>`.                                                                                                       |
| `tabindex-no-positive`                           | jsx, vue  | 2.4.3        | likely             | Positive tabindex reorders focus (failure F44 when the order stops making sense).                                                   |

Deliberately **not** enabled (recommended, but no defensible WCAG failure):

| Rule                         | Reason                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `no-access-key`              | accesskey conflicts are a usability concern; no SC fails because of `accesskey` alone.                  |
| `no-noninteractive-tabindex` | `tabIndex={0}` on non-interactive content is often required (scrollable regions need it to meet 2.1.1). |
| `no-redundant-roles`         | `<button role="button">` is harmless.                                                                   |

### Angular (`@angular-eslint/eslint-plugin-template`)

Mapped the same way (`repo/angular-template/<rule>`): `alt-text` 1.1.1, `elements-content` 4.1.2/2.4.4, `label-has-associated-control` 1.3.1/4.1.2, `table-scope` 1.3.1, `valid-aria` 4.1.2, `click-events-have-key-events` 2.1.1, `mouse-events-have-key-events` 2.1.1, `no-autofocus` 2.4.3 (needs-review), `no-distracting-elements` 2.2.2, `interactive-supports-focus` 2.1.1, `role-has-required-aria` 4.1.2, `no-positive-tabindex` 2.4.3.

The Angular plugin is **not** bundled with Clear A11Y. It is loaded from the scanned repo's own `node_modules`, which executes code from that repo, so it only happens when you opt in with `--trust-repo-plugins` (or `repo.trustRepoPlugins: true`). Without the opt-in, or when the plugin isn't installed, the report says that Angular templates were not linted. Inline templates inside `.ts` components are not linted yet.

## Runtime layer

The runtime layer picks one source of pages (`chooseRuntime`), in this order:

1. `--storybook-url <url>` / `repo.storybookUrl`: a Storybook you already run on this machine (localhost only; remote URLs are rejected, scan those as sites).
2. A built Storybook: `--storybook-static <dir>` / `repo.storybookStatic`, else a detected `storybook-static/`.
3. The dev server, **only** with `--boot` / `repo.boot: true`.
4. Nothing: the report says how to enable runtime scanning (static lint still runs).

`--boot` is ignored, with a note, when Storybook is available: stories are the better unit to test and need no repo code on the host.

### Storybook

Clear A11Y never runs `storybook build` or `storybook dev` itself. It reads the **story index** (`index.json`, Storybook 7 and 8, `v: 4`/`v: 5`; the legacy `stories.json`, `v: 3`, is also understood):

- from `storybook-static/index.json`, served on `127.0.0.1` with a random port by Clear A11Y's own static file server, or
- from `<storybook-url>/index.json` of your running Storybook.

Every entry with `type: "story"` is a page; `docs` entries (MDX and autodocs pages) are skipped. Each story opens at `iframe.html?id=<story id>&viewMode=story`, Storybook's isolated preview, and the scanner waits until the story has rendered into `#storybook-root` (or Storybook shows its error display, which is reported as an error for that story) before the engines run. States (menus, dialogs, form errors) are explored per story exactly as on a site.

| Option (`repo` section) | Flag                 | Default                      | What it does                                                                      |
| ----------------------- | -------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `storybookStatic`       | `--storybook-static` | detected `storybook-static/` | Repo-relative folder of a built Storybook.                                        |
| `storybookUrl`          | `--storybook-url`    | none                         | A running Storybook on localhost.                                                 |
| `maxStories`            | `--max-stories`      | `50`                         | Scan at most this many stories (a notice says how many were left out).            |
| `storyFilter`           |                      | `[]`                         | Globs on story id and title: `["Components/**", "!*--playground"]`. `!` excludes. |
| `runtimeTimeoutMs`      |                      | `600000`                     | Total time budget for runtime pages; stories after it are skipped with a notice.  |
| `runtime`               |                      | `true`                       | `false` skips the runtime layer entirely.                                         |

Story findings use the story's iframe URL as `page.url`. For a built Storybook the random port is replaced with the repo-relative folder, `repo:storybook-static/iframe.html?id=components-button--icon-only&viewMode=story`, so finding ids stay stable between runs; with `--storybook-url` the real URL is kept. `page.state` is the engine state (`default`, `dialog:open#…`), as on a site.

Every story finding gets a `source`: the runtime → source mapping below when it finds the component (for example `src/components/IconButton.tsx:14`), otherwise the story itself, `{ file: <story file from importPath>, line: <line of the story's export>, component: <story title> }` with `evidence.data.sourceMatch.strategy = "story-file"`. `importPath` is relative to the Storybook project; Clear A11Y resolves it against the built Storybook's parent folder and every `.storybook/` parent and keeps the first file that exists.

Story parameters such as `parameters.a11y` are not in `index.json`, so they are not honored; use `storyFilter`. Storybook `play` functions are not run (a candidate for later: they would make good states).

### Dev server (`--boot`, opt-in)

Without Storybook, `--boot` starts the app the way a developer would and scans it like a site:

1. **Plan** (`planDevServer`, reads package.json only). The root package, or in a monorepo the first package with a script (noted in the report). The script is `repo.bootScript`, else `dev`, `start`, `serve`. The framework (`detectFramework`: Next.js, Nuxt, SvelteKit, Angular, Astro, Vue CLI, Create React App, Vite, or unknown) decides how to pass a free port: `vite --port <p> --strictPort --host 127.0.0.1`, `next dev -p <p> -H 127.0.0.1`, `ng serve --port <p> --host 127.0.0.1`, and so on. Flags are appended only when the script runs the framework's dev command directly; wrapped scripts (`concurrently`, `&&` chains) and CRA get `PORT`/`HOST` environment variables only. `BROWSER=none` and `CI=1` keep it non-interactive.
2. **Never install.** If the package has dependencies and there is no `node_modules`, the scan stops the runtime layer with a clear message: install them yourself, then scan again. Clear A11Y runs only `<package manager> run <script>`, with the package manager detected from `packageManager` or the lockfile (npm otherwise).
3. **Start and wait** (`startDevServer`). The script runs as a child process in its own process group. Readiness is the first `localhost`/`127.0.0.1` URL the server prints (color codes stripped; it wins when the server picked another port), else the port we asked for, polled until anything answers HTTP. It gives up after `repo.bootTimeoutMs` (default 120 s) or as soon as the process exits, with the last lines of its output in the message.
4. **Crawl and scan.** Same-origin crawl from the server URL, up to `crawl.maxPages` (default 20; `--max-pages`), every page through the full engine set, findings mapped to source.
5. **Always stop.** The whole process tree is killed when the scan finishes, fails or times out (SIGTERM to the process group, SIGKILL after 3 s; `taskkill /T /F` on Windows), and also if Clear A11Y itself exits or gets SIGINT/SIGTERM. Integration tests check that no process of the group survives, on success, on a boot timeout and on a crashing server.

Dev server findings keep the real URL (`http://127.0.0.1:<port>/form`); the port changes between runs, so their ids do too.

## Runtime → source mapping

`mapFindingsToSource(findings, repoPath, options)` gives runtime findings a `source` where it can be found reliably. The runner reopens each story or page once, reads the hints below for every finding's element (also for elements of other states, which usually exist hidden in the default page), and then maps. It tries, in order:

1. **Source attributes** (confidence 1.0) on the element or its nearest ancestor. Recognized:

   ```html
   <img data-clear-a11y-src="src/components/Card.tsx:12:5" ... />
   <img
     data-source-file="src/components/Card.tsx"
     data-source-line="12"
     data-source-column="5"
     ...
   />
   <img data-inspector-relative-path="src/components/Card.tsx" data-inspector-line="12" ... />
   <!-- react-dev-inspector -->
   ```

   `data-clear-a11y-src="<repo-relative path>:<line>[:<column>]"` is the Clear A11Y convention. Add it in development builds only, for example with a small Babel, SWC or Vite plugin that adds `file:line` of each JSX opening element (we don't ship one; react-dev-inspector's attributes are recognized as-is). The path may be absolute; it is made repo-relative, and paths that leave the repo or don't exist are ignored.

2. **React debug info** (development builds): React ≤ 18 `fiber._debugSource` (confidence 0.95). React 19 removed it; its `_debugStack` is parsed but only scores 0.6 because the line is from the compiled module, so it is kept as a candidate, not a location.
3. **Literal search** across source files for the element's `id` and test id (`data-testid`, `data-test`, `data-cy`, `data-qa`) — 0.9 when found in exactly one place — and its class names (0.6) and visible text (0.5). Clues that point at the same spot (same file, within three lines) reinforce each other.

`source` is only set at confidence **≥ 0.8** (configurable with `minConfidence`). Below that, the top three candidates are kept in `evidence.data.sourceCandidates` for a human; we never guess. The strategy and confidence of a match are in `evidence.data.sourceMatch`.

The page-side readers `sourceAttributesProbe` and `reactDebugSourceProbe` are exported as self-contained functions to pass to Playwright's `locator.evaluate`; `mapFindingsToSource` takes their results through `options.hints`, so `@clear-a11y/repo` never needs a browser.

## Security model

Repo content is untrusted data. In the static layer, Clear A11Y **never runs code or configuration from the scanned repo**:

- Files are read as text and linted in memory with ESLint's `Linter` class and a configuration built in our code. No `eslint.config.*`, `.eslintrc*`, `package.json#eslintConfig`, `tsconfig.json` or `.eslintignore` from the repo is read. The sample repo in `fixtures/repos/react-sample` contains an `eslint.config.js` that throws if executed, and a test proves it never is.
- Inline lint comments (`/* eslint ... */`, `eslint-disable`) are ignored, so a repo cannot switch rules off or hide a barrier from an audit.
- All parsers and plugins come from Clear A11Y's own dependencies; the TypeScript parser runs without `project`, so no type information or repo tsconfig is needed.
- Scripts (`postinstall`, build, dev server) are never run, and `node_modules` is never read, with one opt-in exception: `--trust-repo-plugins` loads the Angular template plugin from the repo's `node_modules`.
- Symbolic links are not followed (they could point outside the repo), `include` paths must stay inside the repo, and file count and size are capped.

### Runtime layer: when repo code runs

| Mode                                  | Repo code that runs                                                                                                    | Where                                                          | Default          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------- |
| Static lint                           | none                                                                                                                   | -                                                              | on               |
| Built Storybook (`storybook-static/`) | the built Storybook's own JavaScript (the components, as bundled by your build)                                        | inside the headless browser's sandbox, served from `127.0.0.1` | on when present  |
| `--storybook-url`                     | none started by us; we only read your running Storybook                                                                | your Storybook process, browser sandbox                        | off              |
| `--boot`                              | the repo's dev script and everything it loads (bundler config, plugins, server code), **with your user's permissions** | a child process on this machine                                | **off (opt-in)** |

- A built Storybook is static files: we serve them from our own server (requests can't leave the folder) and the browser runs their JavaScript like any website you scan. Nothing from the repo runs in Node, and `.storybook/main.*` is never loaded (the fixture's `main.ts` throws if it is).
- `--boot` executes the repo on the host. Use it only for repos you trust, or inside a container or VM. That is why it is never automatic, why `--boot` is ignored when a Storybook is available, and why the CLI help says so. Clear A11Y never runs `install`, `postinstall`, `build` or any script other than the one dev script, and it binds the server to `127.0.0.1`.
- Storybook URLs must be localhost; we only fetch `index.json` and the story iframes from it.

Running untrusted repos in a sandbox (Docker or similar) is a possible follow-up, not part of this release.

## Change sets (pull requests)

The GitHub Action ([`docs/github-action.md`](github-action.md)) scans only what a pull request changed, with the same building blocks:

1. `changedFilesFromGit` lists the changed files (`git diff --name-only base...head`), and `targetsForChanges` (pure) turns them into routes, stories and source files. A story matches when its story file changed, when Storybook recorded the changed file as its component, or when it sits next to the changed component with the same base name.
2. Routes are scanned as site pages. Stories and changed source files go through one `scanRepo` call from `@clear-a11y/runner`: `repo.include` is the shallowest folders holding the changed files, `repo.storyFilter` the matched story ids and `repo.maxStories` what is left of the page budget. Story findings therefore get the same runtime → source mapping as a full repo scan.
3. `limitResultToFiles(result, changedFiles, { keepUrl })` keeps lint findings in the changed files and everything on the scanned story pages; repo-wide coverage notices are kept. `mergeScanResults` combines pages, stories and lint into one `ScanResult`.

## Extension points

- `@clear-a11y/runner` exports `scanRepo(options)` (static + runtime) returning `{ result, detection, notices, runtime }`; `@clear-a11y/repo` keeps the static-only `scanRepo` and the browser-free building blocks: `parseStoryIndex`, `selectStories`, `storyIframeUrl`, `chooseRuntime`, `detectFramework`, `buildDevCommand`, `planDevServer`, `startDevServer`, `killTree`.
- `detectRepo`, `listSourceFiles`, `lintRepo`, `toFindings` and the mapping helpers are exported separately.
- New lint plugins: add a config builder in `src/static/eslint-config.ts`, rules to `RULE_MAP` (the completeness test lists anything missing), and a fixture repo under `fixtures/repos/` with `expected.json`.
- New dev-server frameworks: a case in `detectFramework`, `portArgs` and `DEV_COMMANDS` (`src/runtime/frameworks.ts`), plus a `fixtures/repos/framework-manifests/<name>/package.json` row in the table test.

## Benchmark

`pnpm nx run bench:run` runs the full repo scan (static + Storybook stories; never `--boot`) on every `fixtures/repos/<name>` with an `expected.json` and scores it. There are two kinds of expected issues:

- **source issues** (`file`, `line`): a finding matches when it is in the same file, within ±2 lines, and shares a WCAG SC;
- **story issues** (`story`, `selector`): a finding matches when it is on that story (`iframe.html?id=<story>`), its selector matches (`|` separates alternatives, as for sites) and it shares a WCAG SC.

Any finding in a `correctFiles` file (static findings) or on a `correctStories` story (runtime findings, wherever they map) is noise. The repo table (recall, recall by layer, precision of `violation`, noise) is printed below the site numbers in `bench-results/latest.md` and does not change them.

```json
{
  "repo": "react-sample",
  "title": "React + TypeScript shop with seeded source-level barriers",
  "correctFiles": ["src/components/ProductCardOk.tsx"],
  "issues": [
    {
      "id": "react-sample#product-image-no-alt",
      "file": "src/components/ProductCard.tsx",
      "line": 14,
      "rule": "jsx-a11y/alt-text",
      "wcag": ["1.1.1"],
      "layer": "repo",
      "description": "Product image has no alt attribute."
    }
  ]
}
```

```json
{
  "repo": "storybook-sample",
  "correctStories": ["components-button--primary"],
  "issues": [
    {
      "id": "storybook-sample#icon-button-no-name",
      "story": "components-button--icon-only",
      "selector": "#close-button | .icon-button",
      "wcag": ["4.1.2"],
      "layer": "static",
      "description": "The icon-only close button has no accessible name."
    }
  ]
}
```

`fixtures/repos/storybook-sample/storybook-static/` is a hand-written, format-compatible stand-in for `storybook build` output (an `index.json` with `v: 5` entries and an `iframe.html` that renders each story from plain JavaScript by its `id`), so the benchmark and tests stay offline and need no Storybook install. See `fixtures/README.md`.
