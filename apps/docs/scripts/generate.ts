/**
 * Generates the docs site content (`nx run docs:generate`, runs before every build).
 *
 * Writes `apps/docs/src/content/docs/` (gitignored) from:
 * - hand-written pages in `apps/docs/content/` ({{benchmark}} is replaced with the benchmark tables),
 * - Markdown files elsewhere in the repo (IMPORTED_DOCS: guides, ADRs, CONTRIBUTING.md),
 * - rule metadata (`allRules()` from @clear-a11y/runner) merged with `docs/rules/**`,
 * - the CLI reference JSON written by `nx run cli:docs-json` (read as a file: apps never import apps),
 * - the config schemas in @clear-a11y/core and @clear-a11y/repo,
 * - `bench-results/*.json`.
 *
 * Fails (exit code 1) on drift: a rule without a doc page, a doc page without a rule, an
 * undocumented config option, or a relative link to a file that doesn't exist.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigSchema, getSuccessCriterion } from '@clear-a11y/core';
import { RULE_MAP, RepoConfigSchema, SKIPPED_RULES } from '@clear-a11y/repo';
import { allRules } from '@clear-a11y/runner';
import { z } from 'zod';
import { CONFIG_DESCRIPTIONS } from './config-descriptions.ts';
import {
  isHistoryFile,
  renderBenchmark,
  type BenchmarkFile,
  type HistoryEntry,
} from './lib/bench.ts';
import { parseCliReference, renderCliReference } from './lib/cli.ts';
import { configRows, configTable, type JsonSchema } from './lib/config.ts';
import { extractTitle, parseFrontmatter, rewriteLinks } from './lib/markdown.ts';
import { prefixRootLinks } from './lib/base-links.ts';
import { pageFile, renderPage, type Page } from './lib/page.ts';
import { IMPORTED_DOCS, makeLinkResolver, type LinkContext } from './lib/routes.ts';
import {
  buildRulePages,
  docKey,
  RULES_SLUG,
  type RepoLintRule,
  type RuleDoc,
} from './lib/rules.ts';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..', '..');
const outDir = join(appRoot, 'src', 'content', 'docs');
const handDir = join(appRoot, 'content');
const toPosix = (p: string) => p.split(sep).join('/');
const repoPath = (abs: string) => toPosix(relative(repoRoot, abs));

async function listMarkdown(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T;
}

async function main(): Promise<void> {
  const problems: string[] = [];
  const pages: Page[] = [];
  // Same variable astro.config.mjs reads; links inside pages are prefixed with it.
  const base = process.env['DOCS_BASE'] || '/';
  const lookup = getSuccessCriterion;

  // 1. Every published Markdown source and its route, so links between them resolve to site pages.
  const handFiles = await listMarkdown(handDir);
  const ruleFiles = await listMarkdown(join(repoRoot, 'docs', 'rules'));
  const routes = new Map<string, string>();
  for (const f of handFiles) {
    const slug = toPosix(relative(handDir, f))
      .replace(/\.md$/, '')
      .replace(/(^|\/)index$/, '');
    routes.set(repoPath(f), slug);
  }
  for (const d of IMPORTED_DOCS) routes.set(d.source, d.slug);
  for (const f of ruleFiles) routes.set(repoPath(f), `${RULES_SLUG}/${docKey(repoPath(f))}`);

  const linkCtx: LinkContext = {
    routes,
    repoUrl: (
      process.env['DOCS_REPO_URL'] || 'https://github.com/greenpioneersolutions/clear-a11y'
    ).replace(/\/$/, ''),
    ref: process.env['DOCS_REPO_REF'] || 'main',
    exists: (p) => existsSync(join(repoRoot, p)),
  };
  const rewrite = (body: string, from: string) =>
    rewriteLinks(body, from, makeLinkResolver(linkCtx, problems, from));

  // 2. Benchmark tables (used by the coverage page).
  const benchDir = join(repoRoot, 'bench-results');
  const latest = await readJson<BenchmarkFile>(join(benchDir, 'latest.json'));
  const history: HistoryEntry[] = [];
  for (const name of (await readdir(benchDir)).sort()) {
    const base = name.replace(/\.json$/, '');
    if (name.endsWith('.json') && isHistoryFile(base))
      history.push({ name: base, result: await readJson<BenchmarkFile>(join(benchDir, name)) });
  }
  const benchmark = renderBenchmark(latest, history, lookup);

  // 3. Hand-written pages.
  for (const f of handFiles) {
    const from = repoPath(f);
    const { data, body } = parseFrontmatter(await readFile(f, 'utf-8'));
    const title = data['title'];
    if (typeof title !== 'string' || !title) {
      problems.push(`${from}: frontmatter needs a title.`);
      continue;
    }
    const extra = Object.entries(data)
      .filter(([k]) => k !== 'title' && k !== 'description')
      .map(
        ([k, v]) =>
          `${k}: ${Array.isArray(v) || !/^(true|false|\d+)$/.test(v) ? JSON.stringify(v) : v}`,
      );
    const description = typeof data['description'] === 'string' ? data['description'] : undefined;
    pages.push({
      slug: routes.get(from) as string,
      title,
      ...(description ? { description } : {}),
      frontmatter: extra,
      body: rewrite(body, from).replace(/^\{\{benchmark\}\}$/m, () => benchmark),
    });
  }

  // 4. Imported Markdown from the rest of the repo.
  for (const d of IMPORTED_DOCS) {
    const abs = join(repoRoot, d.source);
    if (!existsSync(abs)) {
      if (d.placeholder)
        pages.push({ slug: d.slug, title: d.placeholder.title, body: d.placeholder.body });
      else problems.push(`${d.source} is listed in IMPORTED_DOCS but does not exist.`);
      continue;
    }
    const { body } = parseFrontmatter(await readFile(abs, 'utf-8'));
    const { title, body: rest } = extractTitle(body);
    pages.push({
      slug: d.slug,
      title: d.title ?? title ?? d.slug,
      ...(d.description ? { description: d.description } : {}),
      body: rewrite(rest, d.source),
    });
  }

  // 5. Rules reference.
  const docs: RuleDoc[] = [];
  for (const f of ruleFiles) {
    const from = repoPath(f);
    const { data, body } = parseFrontmatter(await readFile(f, 'utf-8'));
    docs.push({ path: from, data, body: rewrite(body, from) });
  }
  const repoRules: RepoLintRule[] = Object.entries(RULE_MAP).map(([id, e]) => ({
    id,
    title: e.title,
    wcag: [...e.wcag],
    tier: e.tier,
    upgradesToViolation: typeof e.violationWhen === 'function',
    message: e.message,
    fix: e.fix,
  }));
  const rules = buildRulePages({
    rules: allRules(),
    docs,
    repoRules,
    skippedRepoRules: SKIPPED_RULES,
    lookup,
  });
  problems.push(...rules.errors);
  pages.push(...rules.pages);

  // 6. CLI reference (from the JSON the CLI writes about itself).
  const cliJson = join(repoRoot, 'apps', 'cli', 'dist', 'cli-reference.json');
  if (!existsSync(cliJson))
    problems.push('apps/cli/dist/cli-reference.json is missing: run `pnpm nx run cli:docs-json`.');
  else pages.push(renderCliReference(parseCliReference(await readFile(cliJson, 'utf-8'))));

  // 7. Configuration reference.
  const toSchema = (s: z.ZodType) =>
    z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
  const config = configRows(
    [{ schema: toSchema(ConfigSchema) }, { schema: toSchema(RepoConfigSchema), prefix: 'repo' }],
    CONFIG_DESCRIPTIONS,
  );
  problems.push(...config.errors);
  const repoRows = config.rows.filter((r) => r.path.startsWith('repo.'));
  pages.push({
    slug: 'reference/configuration',
    title: 'Configuration reference',
    description: 'Every option of the Clear A11Y config file, with types and defaults.',
    body: [
      'Pass a JSON config file with `--config clear-a11y.json`. Every option is optional; command-line flags override the file. Types and defaults on this page are generated from the schemas in the code, so they always match what Clear A11Y accepts.',
      '```json\n' +
        JSON.stringify(
          {
            targets: ['http://localhost:3000/', 'http://localhost:3000/checkout'],
            viewports: [
              { name: 'desktop', width: 1280, height: 800 },
              { name: 'mobile', width: 320, height: 640 },
            ],
            output: { dir: 'reports', formats: ['json', 'html'] },
            failOn: 'violation',
          },
          null,
          2,
        ) +
        '\n```',
      '## Options',
      configTable(config.rows.filter((r) => !r.path.startsWith('repo.'))),
      '## Repo scanning options (`repo`)',
      'These apply when the target is a source repo directory. See [Repo scanning](/guides/repo-scanning/).',
      configTable(repoRows),
    ].join('\n\n'),
  });

  // 8. Check and write.
  const slugs = new Map<string, number>();
  for (const p of pages) slugs.set(p.slug, (slugs.get(p.slug) ?? 0) + 1);
  for (const [slug, n] of slugs) if (n > 1) problems.push(`Two pages want the route /${slug}/.`);

  if (problems.length > 0) {
    process.stderr.write(
      `docs:generate found ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  await rm(outDir, { recursive: true, force: true });
  for (const page of [...pages].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const file = join(outDir, pageFile(page.slug));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, renderPage({ ...page, body: prefixRootLinks(page.body, base) }));
  }
  process.stdout.write(`docs:generate wrote ${pages.length} pages to ${repoPath(outDir)}/\n`);
}

await main();
