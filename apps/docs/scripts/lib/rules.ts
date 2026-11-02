import type { RuleMeta, Tier } from '@clear-a11y/core';
import { compareSc, layerOf } from '@clear-a11y/core';
import {
  dropParagraphStartingWith,
  extractTitle,
  html,
  prose,
  type FrontmatterValue,
} from './markdown.ts';
import { href, type Page } from './page.ts';
import { layerName, layerRank, scLink, TIER_TEXT, type ScLookup } from './wcag.ts';

/** A file under docs/rules/, with links already rewritten for the site. */
export interface RuleDoc {
  /** Repo-relative path, e.g. "docs/rules/keyboard/keyboard-trap.md". */
  path: string;
  data: Record<string, FrontmatterValue>;
  body: string;
}

/** One repo lint rule from packages/repo's mapping table. */
export interface RepoLintRule {
  /** Lint rule id, e.g. "jsx-a11y/alt-text" (findings use "repo/jsx-a11y/alt-text"). */
  id: string;
  title: string;
  wcag: string[];
  tier: Tier;
  /** Can be upgraded to `violation` when the source is unambiguous. */
  upgradesToViolation: boolean;
  message: string;
  fix: string;
}

export interface RulesInput {
  rules: readonly RuleMeta[];
  docs: readonly RuleDoc[];
  repoRules?: readonly RepoLintRule[];
  skippedRepoRules?: Readonly<Record<string, string>>;
  lookup: ScLookup;
}

export interface RulesOutput {
  pages: Page[];
  /** Drift between rule metadata and docs/rules. The generator fails when this is non-empty. */
  errors: string[];
}

export const RULES_SLUG = 'reference/rules';
export const ruleSlug = (id: string) => `${RULES_SLUG}/${id}`;

/** "docs/rules/keyboard/keyboard-trap.md" -> "keyboard/keyboard-trap"; "docs/rules/static/index.md" -> "static". */
export function docKey(path: string): string {
  return path
    .replace(/^docs\/rules\//, '')
    .replace(/\.md$/, '')
    .replace(/\/index$/, '');
}

const asList = (v: FrontmatterValue | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const tierCode = (tier: string) => `<code>${html(tier)}</code>`;
const scHtml = (sc: string, lookup: ScLookup) => {
  const c = lookup(sc);
  return c
    ? `<a href="${c.understanding}">${c.sc} ${html(c.title)}</a> (Level ${c.level})`
    : html(sc);
};

/** A doc declares a rule when its frontmatter has a tier; other docs are layer overviews. */
const isRuleDoc = (doc: RuleDoc) => doc.data['tier'] !== undefined;

/** Checks rule metadata against docs/rules in both directions. */
export function ruleDrift(rules: readonly RuleMeta[], docs: readonly RuleDoc[]): string[] {
  const errors: string[] = [];
  const byKey = new Map(docs.map((d) => [docKey(d.path), d]));
  const ids = new Set(rules.map((r) => r.id));
  for (const rule of rules) {
    const doc = byKey.get(rule.id);
    if (!doc) {
      errors.push(`Rule ${rule.id} has no documentation page: create docs/rules/${rule.id}.md.`);
      continue;
    }
    if (!isRuleDoc(doc)) {
      errors.push(`${doc.path} documents rule ${rule.id} but its frontmatter has no tier.`);
      continue;
    }
    const docId = doc.data['id'];
    if (docId !== undefined && docId !== rule.id)
      errors.push(`${doc.path}: frontmatter id "${String(docId)}" does not match ${rule.id}.`);
    if (doc.data['tier'] !== rule.tier)
      errors.push(
        `${doc.path}: tier "${String(doc.data['tier'])}" differs from the rule's tier "${rule.tier}".`,
      );
    const docWcag = asList(doc.data['wcag']);
    const missing = rule.wcag.filter((sc) => !docWcag.includes(sc));
    if (missing.length > 0)
      errors.push(
        `${doc.path}: wcag is missing ${missing.join(', ')} (the rule lists ${rule.wcag.join(', ')}).`,
      );
  }
  for (const doc of docs) {
    if (/\bTODO\b/.test(doc.body)) errors.push(`${doc.path} still contains a TODO.`);
    if (isRuleDoc(doc) && !ids.has(docKey(doc.path)))
      errors.push(
        `${doc.path} documents a rule, but no registered rule has the id ${docKey(doc.path)}.`,
      );
  }
  return errors;
}

function rulePage(rule: RuleMeta, doc: RuleDoc | undefined, lookup: ScLookup): Page {
  const meta = [
    '<dl class="rule-meta">',
    `<dt>Rule id</dt> <dd><code>${html(rule.id)}</code></dd>`,
    `<dt>WCAG</dt> <dd>${rule.wcag.map((sc) => scHtml(sc, lookup)).join(', ')}</dd>`,
    `<dt>Tier</dt> <dd>${tierCode(rule.tier)}: ${html(TIER_TEXT[rule.tier])}</dd>`,
    `<dt>Engine</dt> <dd><code>${html(rule.engine)}</code> (${html(layerName(layerOf(rule.engine)))})</dd>`,
    '</dl>',
  ].join('\n');
  const body = doc
    ? dropParagraphStartingWith(extractTitle(doc.body).body, '**Rule:**')
    : `## What it catches\n\n${rule.description}\n\n## How to fix\n\n${rule.fix}`;
  return {
    slug: ruleSlug(rule.id),
    title: rule.title,
    description: rule.description,
    body: `${meta}\n\n${body}`,
  };
}

function overviewPage(doc: RuleDoc): Page {
  const { title, body } = extractTitle(doc.body);
  const key = docKey(doc.path);
  return {
    slug: `${RULES_SLUG}/${key}`,
    title: String(doc.data['title'] ?? title ?? key),
    body,
  };
}

const ruleRow = (r: RuleMeta, lookup: ScLookup) =>
  `| [${prose(r.title)}](${href(ruleSlug(r.id))}) | \`${r.id}\` | ${r.wcag.map((sc) => scLink(sc, lookup, false)).join(', ')} | \`${r.tier}\` |`;

function indexPage(input: RulesInput, overviews: readonly RuleDoc[]): Page {
  const byLayer = new Map<string, RuleMeta[]>();
  for (const r of input.rules) {
    const layer = layerOf(r.engine);
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), r]);
  }
  const overviewByLayer = new Map<string, RuleDoc[]>();
  for (const d of overviews) {
    const layer = docKey(d.path).split('/')[0] as string;
    overviewByLayer.set(layer, [...(overviewByLayer.get(layer) ?? []), d]);
  }
  const layers = [...new Set([...byLayer.keys(), ...overviewByLayer.keys()])].sort(
    (a, b) => layerRank(a) - layerRank(b) || a.localeCompare(b),
  );
  const sections = layers.map((layer) => {
    const parts = [`## ${layerName(layer)}`];
    for (const d of overviewByLayer.get(layer) ?? []) {
      const page = overviewPage(d);
      parts.push(`Overview: [${page.title}](${href(page.slug)}).`);
    }
    if (layer === 'repo' && input.repoRules?.length)
      parts.push(
        `All ${input.repoRules.length} mapped lint rules: [Repo lint rules](${href(`${RULES_SLUG}/repo/lint-rules`)}).`,
      );
    const rules = byLayer.get(layer) ?? [];
    if (rules.length > 0)
      parts.push(
        [
          '| Rule | Id | WCAG | Tier |',
          '| --- | --- | --- | --- |',
          ...rules.map((r) => ruleRow(r, input.lookup)),
        ].join('\n'),
      );
    return parts.join('\n\n');
  });
  const tierCounts = (['violation', 'likely', 'needs-review'] as const)
    .map((t) => `${input.rules.filter((r) => r.tier === t).length} \`${t}\``)
    .join(', ');
  return {
    slug: RULES_SLUG,
    title: 'Rules reference',
    description:
      'Every rule Clear A11Y checks, grouped by engine, with WCAG success criteria and tiers.',
    body: [
      `Clear A11Y has ${input.rules.length} rules in its browser engines (${tierCounts}), plus the axe-core rules of the static layer and the lint rules of the repo layer. This page is generated from the rule metadata in the code and the pages in \`docs/rules/\`, so it can't drift from what the engines do.`,
      `Each rule's tier says how much to trust a finding: \`violation\` is deterministic and can fail CI, \`likely\` is a strong signal a person should confirm, and \`needs-review\` asks a person a yes/no question. See [tiers](${href('getting-started', '#tiers-how-much-to-trust-a-finding')}).`,
      `Looking for a success criterion? See [rules by WCAG success criterion](${href(`${RULES_SLUG}/by-wcag`)}).`,
      ...sections,
    ].join('\n\n'),
  };
}

function byWcagPage(input: RulesInput): Page {
  const scs = new Set<string>();
  for (const r of input.rules) r.wcag.forEach((sc) => scs.add(sc));
  for (const r of input.repoRules ?? []) r.wcag.forEach((sc) => scs.add(sc));
  const sections = [...scs].sort(compareSc).map((sc) => {
    const c = input.lookup(sc);
    const heading = c ? `## ${c.sc} ${c.title} (Level ${c.level})` : `## ${sc}`;
    const parts = [heading];
    if (c) parts.push(`W3C explanation: [Understanding ${c.sc} ${c.title}](${c.understanding}).`);
    const rules = input.rules.filter((r) => r.wcag.includes(sc));
    if (rules.length > 0)
      parts.push(
        rules
          .map((r) => `- [${r.title}](${href(ruleSlug(r.id))}) (\`${r.id}\`, \`${r.tier}\`)`)
          .join('\n'),
      );
    const lint = (input.repoRules ?? []).filter((r) => r.wcag.includes(sc));
    if (lint.length > 0)
      parts.push(
        `Repo lint rules: ${lint.map((r) => `[\`${r.id}\`](${href(`${RULES_SLUG}/repo/lint-rules`, `#${anchorFor(r.id)}`)})`).join(', ')}.`,
      );
    return parts.join('\n\n');
  });
  return {
    slug: `${RULES_SLUG}/by-wcag`,
    title: 'Rules by WCAG success criterion',
    description: 'Which Clear A11Y rules check each WCAG 2.2 success criterion.',
    body: [
      'Each section is one WCAG 2.2 success criterion that at least one rule checks, with a link to the W3C "Understanding" document that explains it. A success criterion that is missing here is not checked automatically yet: it needs a manual check.',
      ...sections,
    ].join('\n\n'),
  };
}

/** Stable anchor for a lint rule row ("jsx-a11y/alt-text" -> "jsx-a11y-alt-text"). */
export const anchorFor = (id: string) => id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();

function repoLintPage(input: RulesInput): Page {
  const rules = [...(input.repoRules ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const rows = rules.map(
    (r) =>
      `| <span id="${anchorFor(r.id)}">\`repo/${r.id}\`</span> | ${prose(r.title)} | ${r.wcag.map((sc) => scLink(sc, input.lookup, false)).join(', ')} | \`${r.tier}\`${r.upgradesToViolation ? ', `violation` when unambiguous' : ''} | ${prose(r.fix)} |`,
  );
  const skipped = Object.entries(input.skippedRepoRules ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return {
    slug: `${RULES_SLUG}/repo/lint-rules`,
    title: 'Repo lint rules',
    description: 'Every source lint rule the repo layer runs, with its WCAG mapping and tier.',
    body: [
      `The repo layer lints your components' source. This table is generated from the mapping in \`packages/repo/src/static/rule-map.ts\`. Most rules are \`likely\` because lint can't see props, CSS or what renders; a few become \`violation\` when the source is unambiguous (a literal DOM element without spread props). See [Repo scanning](${href('guides/repo-scanning')}) for how it works.`,
      [
        '| Rule | Title | WCAG | Tier | How to fix |',
        '| --- | --- | --- | --- | --- |',
        ...rows,
      ].join('\n'),
      ...(skipped.length > 0
        ? [
            '## Rules we deliberately do not run',
            [
              '| Rule | Why |',
              '| --- | --- |',
              ...skipped.map(([id, why]) => `| \`${id}\` | ${prose(why)} |`),
            ].join('\n'),
          ]
        : []),
    ].join('\n\n'),
  };
}

/** Builds the rules reference: one page per rule, overview pages, and the two index pages. */
export function buildRulePages(input: RulesInput): RulesOutput {
  const errors = ruleDrift(input.rules, input.docs);
  const docsByKey = new Map(input.docs.map((d) => [docKey(d.path), d]));
  const overviews = input.docs.filter((d) => !isRuleDoc(d));
  const pages: Page[] = [
    indexPage(input, overviews),
    byWcagPage(input),
    ...input.rules.map((r) => rulePage(r, docsByKey.get(r.id), input.lookup)),
    ...overviews.map(overviewPage),
    ...(input.repoRules?.length ? [repoLintPage(input)] : []),
  ];
  return { pages: pages.sort((a, b) => a.slug.localeCompare(b.slug)), errors };
}
