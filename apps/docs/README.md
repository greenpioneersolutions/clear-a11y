# @clear-a11y/docs

The Clear A11Y documentation site: getting started, guides, concepts, the generated rules, CLI and configuration references, the benchmark, and contributor guides. Built with [Astro Starlight](https://starlight.astro.build) into static HTML, deployed to GitHub Pages by `.github/workflows/docs.yml`. Private project (`type:app`, `scope:docs`, `publish:private`); never published to npm.

## Commands

```sh
pnpm nx run docs:generate          # write the generated pages into src/content/docs/
pnpm nx run docs:build             # generate + astro build -> apps/docs/dist
pnpm nx run docs:dev               # generate + astro dev (also: docs:serve)
pnpm nx run docs:preview           # serve the built site
pnpm nx run docs:test              # unit tests for the generators
pnpm nx run docs:test-integration  # scan the built site with Clear A11Y, check links, screenshots
```

Everything builds offline: no remote fonts, scripts, images or analytics, and the Pagefind search index is built locally.

## Where pages come from

`src/content/docs/` is generated and gitignored. Don't edit it; edit the source:

| Source                                                                                                                                       | Becomes                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `content/**/*.md`                                                                                                                            | Hand-written pages. `{{benchmark}}` on its own line is replaced with the benchmark tables. |
| `docs/*.md`, `apps/*/README.md`, `apps/mcp/SKILL.md`, `CONTRIBUTING.md`, `docs/adr/*` (`scripts/lib/routes.ts`)                              | Imported pages. They stay next to the code they describe.                                  |
| `allRules()` from `@clear-a11y/runner` + `docs/rules/**`                                                                                     | Rules reference (one page per rule, indexes by engine and by WCAG SC).                     |
| `RULE_MAP` from `@clear-a11y/repo`                                                                                                           | Repo lint rules table.                                                                     |
| `apps/cli/dist/cli-reference.json` (from `nx run cli:docs-json`)                                                                             | CLI reference. Read as a file, because apps may not import other apps.                     |
| `ConfigSchema` (core; each field's `.describe()` text), `RepoConfigSchema` (repo) + `scripts/config-descriptions.ts` (fallback descriptions) | Configuration reference.                                                                   |
| `bench-results/latest.json`, `s01-axe-baseline.json`, `wave*.json`                                                                           | Benchmark tables on "How coverage is measured".                                            |

The generator fails on drift: a rule without a doc page (or the reverse), a doc page whose tier or WCAG criteria differ from the code or that still has a `TODO`, an undocumented config option, or a relative link to a file that doesn't exist. Relative links between published Markdown files become links between pages; links to other repository files point to GitHub.

## Configuration

| Variable        | Default                                               | Used for                                                  |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `DOCS_SITE`     | none                                                  | Absolute site URL (canonical links, sitemap).             |
| `DOCS_BASE`     | `/`                                                   | Base path, e.g. `/clear-a11y` for a GitHub Pages project. |
| `DOCS_REPO_URL` | `https://github.com/greenpioneersolutions/clear-a11y` | Links to repository files and the GitHub icon.            |
| `DOCS_REPO_REF` | `main`                                                | Git ref for links to repository files.                    |

The workflow sets them from `actions/configure-pages` and the repository it runs in, so forks deploy without changes.

## Accessibility

The site must pass Clear A11Y with zero findings on the dogfood pages (`test/dogfood.integration.test.ts`). Theme overrides that fix findings are in `src/styles/custom.css` and the `head` script in `astro.config.mjs`, each with the rule it fixes.
