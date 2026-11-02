// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

/**
 * Site URL and base path come from the environment so forks deploy without edits:
 * docs.yml sets them from actions/configure-pages (e.g. https://<owner>.github.io + /clear-a11y).
 * Locally the site is served from "/". Links inside pages get the base at generation time
 * (scripts/generate.ts reads the same DOCS_BASE).
 */
const site = process.env.DOCS_SITE || undefined;
const base = process.env.DOCS_BASE || '/';
const repoUrl = (
  process.env.DOCS_REPO_URL || 'https://github.com/greenpioneersolutions/clear-a11y'
).replace(/\/$/, '');

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  outDir: './dist',
  integrations: [
    starlight({
      title: 'Clear A11Y',
      description:
        'Open-source accessibility testing that works like a human accessibility expert, not just a rules scanner.',
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'github', label: 'Clear A11Y on GitHub', href: repoUrl }],
      head: [
        {
          // keyboard/focus-obscured (WCAG 2.4.11): on small screens the open "On this page" menu
          // stayed open while Tab moved on into the page, covering the focused element. Close it
          // when focus leaves it, like a menu.
          tag: 'script',
          content:
            "document.addEventListener('focusin',function(e){var d=document.getElementById('starlight__mobile-toc');if(d&&d.open&&!d.contains(e.target))d.open=false;});",
        },
      ],
      lastUpdated: false,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      sidebar: [
        { label: 'Start here', items: ['getting-started', 'guides/cli'] },
        {
          label: 'Guides',
          items: [
            'guides/repo-scanning',
            'guides/github-action',
            'guides/mcp',
            'guides/mcp-skill',
            'guides/providers',
            'guides/reports',
            'guides/personas',
            'guides/self-hosting',
            'guides/desktop',
          ],
        },
        {
          label: 'Concepts',
          items: ['concepts/architecture', 'concepts/coverage', 'concepts/faq'],
        },
        {
          label: 'Reference',
          items: [
            'reference/cli',
            'reference/configuration',
            'guides/mcp-server',
            'guides/server-api',
            // Individual rule pages are linked from these indexes rather than listed in the
            // sidebar: ~50 links (and nested collapsible groups) on every page would bury the
            // navigation.
            'reference/rules',
            'reference/rules/by-wcag',
            'reference/rules/repo/lint-rules',
          ],
        },
        {
          label: 'Contributing',
          items: [
            'contributing',
            'contributing/add-a-rule',
            'contributing/add-an-engine',
            'contributing/fixtures-and-benchmark',
            'contributing/release-process',
            'contributing/docs-site',
            'roadmap',
          ],
        },
        {
          label: 'Architecture decisions',
          items: [
            'architecture/adr',
            'architecture/adr/0001-architecture',
            'architecture/adr/0002-nx-workspace',
            'architecture/adr/0003-engine-pass-records',
            'architecture/github-action',
          ],
        },
      ],
    }),
  ],
});
