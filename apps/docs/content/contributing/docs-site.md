---
title: Docs site
description: How this site is built, which pages are generated, and how it tests itself with Clear A11Y.
---

This site lives in `apps/docs` and is built with [Astro Starlight](https://starlight.astro.build): static HTML, a skip link, landmarks, keyboard-friendly navigation, light and dark themes, and an offline search index built with Pagefind. It loads no remote fonts, scripts, images or analytics.

## Commands

```sh
pnpm nx run docs:generate   # write the generated pages
pnpm nx run docs:build      # generate, then build the static site into apps/docs/dist
pnpm nx run docs:dev        # generate, then start a local dev server
pnpm nx run docs:preview    # serve the built site
pnpm nx run docs:test-integration   # scan the built site with Clear A11Y and check every link
```

## Where pages come from

Everything in `apps/docs/src/content/docs/` is generated (and gitignored). `nx run docs:generate` writes it before every build from:

| Source                                                                                | Pages                                                                                                                                         |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs/content/**`                                                                | Hand-written pages: home, getting started, CLI guide, concepts, these contributor guides.                                                     |
| `docs/*.md`, `apps/*/README.md`, `apps/mcp/SKILL.md`, `CONTRIBUTING.md`, `docs/adr/*` | Guides and reference pages that live next to the code they describe. The site imports them, so there is one copy of each.                     |
| Rule metadata from `@clear-a11y/runner` + `docs/rules/**`                             | The [rules reference](/reference/rules/): one page per rule, plus indexes by engine and by WCAG success criterion.                            |
| `packages/repo` rule mapping                                                          | [Repo lint rules](/reference/rules/repo/lint-rules/).                                                                                         |
| `apps/cli/dist/cli-reference.json`                                                    | The [CLI reference](/reference/cli/). The CLI writes this file about itself (`nx run cli:docs-json`), because one app may not import another. |
| Config schemas in `@clear-a11y/core` and `@clear-a11y/repo`                           | The [configuration reference](/reference/configuration/). Descriptions live in `apps/docs/scripts/config-descriptions.ts`.                    |
| `bench-results/*.json`                                                                | The tables on [How coverage is measured](/concepts/coverage/).                                                                                |

To change a guide, edit its source file, not the generated copy. Relative links between source files become links between pages; links to other files in the repository become links to GitHub.

## Drift checks

`docs:generate` fails when:

- a rule has no `docs/rules/<engine>/<rule>.md`, or a doc page names a rule that doesn't exist;
- a doc page's tier differs from the rule's, misses one of its WCAG criteria, or still contains `TODO`;
- a config option has no description, or a description has no option;
- a relative link points to a file that doesn't exist.

## Practice what we test

`docs:test-integration` serves the built site and scans a representative set of pages (home, getting started, the CLI guide and reference, a rule page, the rules indexes, the coverage page and the open search dialog) with every engine at desktop and mobile sizes. It fails on any finding, of any tier. It also checks every internal link and anchor in the built site and makes sure no page requests anything from another origin.

## Deploying

`.github/workflows/dogfood.yml` builds the site and runs the scan on every pull request (together with the HTML report and desktop renderer scans), and `.github/workflows/docs.yml` builds, scans and deploys it to GitHub Pages from `main`. Forks work without changes: the site URL and base path come from the Pages configuration of the repository the workflow runs in (`DOCS_SITE`, `DOCS_BASE` and `DOCS_REPO_URL`).
