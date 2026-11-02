import { getSuccessCriterion, type RuleMeta } from '@clear-a11y/core';
import { describe, expect, it } from 'vitest';
import { buildRulePages, docKey, ruleDrift, type RuleDoc } from './rules.ts';

const trap: RuleMeta = {
  id: 'keyboard/keyboard-trap',
  engine: 'engine-keyboard',
  wcag: ['2.1.2'],
  tier: 'violation',
  title: 'Keyboard trap',
  description: 'Focus gets stuck.',
  fix: 'Let Tab leave.',
};
const contrast: RuleMeta = {
  id: 'visual/contrast-over-background',
  engine: 'engine-visual',
  wcag: ['1.4.3'],
  tier: 'violation',
  title: 'Low contrast over an image',
  description: 'Text is hard to read.',
  fix: 'Darken the overlay.',
};
const doc = (
  path: string,
  data: RuleDoc['data'],
  body = '# Title\n\n**Rule:** x\n\n## What it catches\n\nStuff.',
): RuleDoc => ({
  path,
  data,
  body,
});
const trapDoc = doc('docs/rules/keyboard/keyboard-trap.md', {
  id: 'keyboard/keyboard-trap',
  tier: 'violation',
  wcag: ['2.1.2'],
});
const contrastDoc = doc('docs/rules/visual/contrast-over-background.md', {
  tier: 'violation',
  wcag: ['1.4.3'],
});
const staticOverview = doc(
  'docs/rules/static/index.md',
  { engine: 'engine-static' },
  '# Static rules (axe-core)\n\nOverview.',
);

describe('docKey', () => {
  it('maps doc paths to rule ids and layer overviews', () => {
    expect(docKey('docs/rules/keyboard/keyboard-trap.md')).toBe('keyboard/keyboard-trap');
    expect(docKey('docs/rules/static/index.md')).toBe('static');
  });
});

describe('ruleDrift', () => {
  it('passes when every rule has a matching doc', () => {
    expect(ruleDrift([trap, contrast], [trapDoc, contrastDoc, staticOverview])).toEqual([]);
  });

  it('fails for a rule without a doc page', () => {
    expect(ruleDrift([trap, contrast], [trapDoc])).toEqual([
      'Rule visual/contrast-over-background has no documentation page: create docs/rules/visual/contrast-over-background.md.',
    ]);
  });

  it('fails for a doc page without a rule', () => {
    expect(ruleDrift([trap], [trapDoc, contrastDoc])).toEqual([
      'docs/rules/visual/contrast-over-background.md documents a rule, but no registered rule has the id visual/contrast-over-background.',
    ]);
  });

  it('fails when tier, wcag or id disagree, or a TODO is left', () => {
    const bad = doc(
      'docs/rules/keyboard/keyboard-trap.md',
      { id: 'keyboard/trap', tier: 'likely', wcag: ['2.4.3'] },
      '## What it catches\n\nTODO: describe the barrier.',
    );
    expect(ruleDrift([trap], [bad])).toEqual([
      'docs/rules/keyboard/keyboard-trap.md: frontmatter id "keyboard/trap" does not match keyboard/keyboard-trap.',
      'docs/rules/keyboard/keyboard-trap.md: tier "likely" differs from the rule\'s tier "violation".',
      'docs/rules/keyboard/keyboard-trap.md: wcag is missing 2.1.2 (the rule lists 2.1.2).',
      'docs/rules/keyboard/keyboard-trap.md still contains a TODO.',
    ]);
  });
});

describe('buildRulePages', () => {
  const out = buildRulePages({
    rules: [trap, contrast],
    docs: [trapDoc, contrastDoc, staticOverview],
    repoRules: [
      {
        id: 'jsx-a11y/alt-text',
        title: 'Image has no text alternative',
        wcag: ['1.1.1'],
        tier: 'likely',
        upgradesToViolation: true,
        message: 'No alt.',
        fix: 'Use <img alt="..."> or a <button>.',
      },
    ],
    skippedRepoRules: { 'jsx-a11y/no-access-key': 'Not a WCAG failure.' },
    lookup: getSuccessCriterion,
  });
  const page = (slug: string) => out.pages.find((p) => p.slug === slug);

  it('merges metadata with the hand-written body', () => {
    const p = page('reference/rules/keyboard/keyboard-trap');
    expect(p?.title).toBe('Keyboard trap');
    expect(p?.description).toBe('Focus gets stuck.');
    expect(p?.body).toContain('<dt>Tier</dt> <dd><code>violation</code>');
    expect(p?.body).toContain(
      '<a href="https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html">2.1.2 No Keyboard Trap</a> (Level A)',
    );
    expect(p?.body).toContain('## What it catches\n\nStuff.');
    expect(p?.body).not.toContain('# Title');
    expect(p?.body).not.toContain('**Rule:**');
  });

  it('builds index pages by engine and by WCAG with Understanding links', () => {
    const index = page('reference/rules');
    expect(index?.body).toContain('## Keyboard');
    expect(index?.body).toContain(
      '| [Keyboard trap](/reference/rules/keyboard/keyboard-trap/) | `keyboard/keyboard-trap` |',
    );
    expect(index?.body).toContain('Overview: [Static rules (axe-core)](/reference/rules/static/).');
    const byWcag = page('reference/rules/by-wcag')?.body ?? '';
    expect(byWcag.indexOf('## 1.1.1 Non-text Content')).toBeLessThan(byWcag.indexOf('## 1.4.3'));
    expect(byWcag.indexOf('## 1.4.3')).toBeLessThan(byWcag.indexOf('## 2.1.2'));
    expect(byWcag).toContain(
      '[Understanding 2.1.2 No Keyboard Trap](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html)',
    );
    expect(byWcag).toContain(
      '[`jsx-a11y/alt-text`](/reference/rules/repo/lint-rules/#jsx-a11y-alt-text)',
    );
  });

  it('lists repo lint rules and the skipped ones', () => {
    const lint = page('reference/rules/repo/lint-rules')?.body ?? '';
    expect(lint).toContain('<span id="jsx-a11y-alt-text">`repo/jsx-a11y/alt-text`</span>');
    expect(lint).toContain('`likely`, `violation` when unambiguous');
    // Fix text is prose: markup in it is escaped, never rendered as a real element.
    expect(lint).toContain('Use &lt;img alt="..."&gt; or a &lt;button&gt;.');
    expect(lint).not.toContain('<button>');
    expect(lint).toContain('| `jsx-a11y/no-access-key` | Not a WCAG failure. |');
  });

  it('is deterministic and sorted by slug', () => {
    expect(out.pages.map((p) => p.slug)).toEqual([...out.pages.map((p) => p.slug)].sort());
    expect(out.errors).toEqual([]);
  });
});
