import { href } from './page.ts';

/**
 * Markdown files elsewhere in the repo that the site publishes as pages. They stay the source of
 * truth (engine and app slices edit them next to their code); the site imports them on every build.
 */
export interface ImportedDoc {
  /** Repo-relative source path. */
  source: string;
  slug: string;
  /** Title override; otherwise the file's first `# heading`. */
  title?: string;
  description?: string;
  /** Page shown when the source file doesn't exist yet. */
  placeholder?: { title: string; body: string };
}

export const IMPORTED_DOCS: readonly ImportedDoc[] = [
  {
    source: 'docs/repo-scanning.md',
    slug: 'guides/repo-scanning',
    description:
      'Scan a source repo: lint, Storybook stories and an opt-in dev server, with findings mapped to files and lines.',
  },
  {
    source: 'docs/mcp.md',
    slug: 'guides/mcp',
    title: 'Coding agents (MCP)',
    description:
      'Use Clear A11Y from Claude Code, Cursor and other MCP clients, with your own agent as the judge.',
  },
  {
    source: 'apps/mcp/SKILL.md',
    slug: 'guides/mcp-skill',
    title: 'The agent skill (SKILL.md)',
    description: 'The skill that teaches a coding agent the scan, judge, fix and verify loop.',
  },
  {
    source: 'apps/mcp/README.md',
    slug: 'guides/mcp-server',
    title: 'MCP server reference',
    description: 'Install, tools, inputs and outputs of the Clear A11Y MCP server.',
  },
  {
    source: 'apps/action/README.md',
    slug: 'guides/github-action',
    title: 'GitHub Action',
    description:
      'Scan what a pull request changed and report to code scanning, a job summary and an HTML report.',
  },
  {
    source: 'docs/desktop.md',
    slug: 'guides/desktop',
    title: 'Desktop app',
    description: 'The Clear A11Y desktop app.',
    placeholder: {
      title: 'Desktop app (coming soon)',
      body: 'A desktop app for scanning sites without the command line is being built. Until it ships, use the [CLI](/getting-started/), the [GitHub Action](/guides/github-action/) or your [coding agent](/guides/mcp/). This page will describe installing it, scanning and reviewing findings once it is released.',
    },
  },
  {
    source: 'docs/self-hosting.md',
    slug: 'guides/self-hosting',
    title: 'Self-hosting',
    description: 'Run the Clear A11Y API server and workers on your own machine or in a container.',
  },
  {
    source: 'apps/server/README.md',
    slug: 'guides/server-api',
    title: 'Server API reference',
    description: 'Endpoints and settings of the self-hosted Clear A11Y server.',
  },
  {
    source: 'docs/providers.md',
    slug: 'guides/providers',
    description:
      'Bring your own model: Anthropic, OpenAI, Azure OpenAI or a local model through Ollama. Off by default.',
  },
  {
    source: 'docs/reports.md',
    slug: 'guides/reports',
    title: 'Reports (JSON, SARIF, HTML)',
    description: 'What each report format contains and how the HTML report helps you decide.',
  },
  {
    source: 'docs/personas.md',
    slug: 'guides/personas',
    description: 'Keyboard-only and screen-reader persona agents that try to complete your tasks.',
  },
  {
    source: 'docs/github-action.md',
    slug: 'architecture/github-action',
    title: 'How the GitHub Action works',
    description: 'Internals of apps/action: changed files to targets to reports.',
  },
  {
    source: 'docs/adr/README.md',
    slug: 'architecture/adr',
    title: 'Architecture decisions',
    description: 'Architecture decision records (ADRs).',
  },
  {
    source: 'docs/adr/0001-architecture.md',
    slug: 'architecture/adr/0001-architecture',
    description: 'ADR 0001: the architecture of Clear A11Y.',
  },
  {
    source: 'docs/adr/0002-nx-workspace.md',
    slug: 'architecture/adr/0002-nx-workspace',
    description: 'ADR 0002: the Nx workspace setup.',
  },
  {
    source: 'docs/adr/0003-engine-pass-records.md',
    slug: 'architecture/adr/0003-engine-pass-records',
    description: 'ADR 0003: engines report verified passes that settle needs-review findings.',
  },
  {
    source: 'CONTRIBUTING.md',
    slug: 'contributing',
    title: 'Contributing',
    description:
      'Set up the repo, the contribution flow, commit sign-off and how to add rules and fixtures.',
  },
  {
    source: 'docs/release.md',
    slug: 'contributing/release-process',
    description:
      'How Clear A11Y versions and publishes packages and the GitHub Action with nx release and npm provenance, from CI only.',
  },
  { source: 'docs/ROADMAP.md', slug: 'roadmap', description: 'Where Clear A11Y is going.' },
];

export interface LinkContext {
  /** Repo-relative path -> site slug, for every published Markdown file. */
  routes: ReadonlyMap<string, string>;
  /** Base URL for linking to files on GitHub, e.g. "https://github.com/greenpioneersolutions/clear-a11y". */
  repoUrl: string;
  /** Git ref for GitHub links. */
  ref: string;
  /** Does this repo-relative path exist (file or directory)? */
  exists: (repoPath: string) => boolean;
}

/**
 * Resolves a relative link from a published Markdown file: to a site page when the target is
 * published, otherwise to the file on GitHub. Records a problem when the target doesn't exist.
 */
export function makeLinkResolver(ctx: LinkContext, problems: string[], from: string) {
  return (repoPath: string, hash: string): string => {
    const clean = repoPath.replace(/\/$/, '');
    const slug =
      ctx.routes.get(clean) ??
      ctx.routes.get(`${clean}/README.md`) ??
      ctx.routes.get(`${clean}/index.md`);
    if (slug !== undefined) return href(slug, hash);
    if (clean.startsWith('..') || clean === '.' || !ctx.exists(clean)) {
      problems.push(`${from}: link target ${repoPath}${hash} does not exist in the repository.`);
      return `${ctx.repoUrl}/blob/${ctx.ref}/${clean}${hash}`;
    }
    return `${ctx.repoUrl}/blob/${ctx.ref}/${clean}${hash}`;
  };
}
