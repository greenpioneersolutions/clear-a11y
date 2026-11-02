import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readJson, type Tree } from '@nx/devkit';
import { engineGenerator } from '../engine/engine';
import { registerRule, ruleGenerator } from './rule';

describe('rule generator', () => {
  let tree: Tree;

  beforeEach(async () => {
    tree = createTreeWithEmptyWorkspace();
    tree.write('.prettierrc', '{"singleQuote": true}');
    await engineGenerator(tree, { name: 'keyboard', skipInstall: true });
  });

  it('creates the rule, its unit test and registers it', async () => {
    await ruleGenerator(tree, { engine: 'keyboard', name: 'focus-order-backward', wcag: '2.4.3' });
    const dir = 'packages/engines/keyboard/src/rules';
    const rule = tree.read(`${dir}/focus-order-backward.ts`, 'utf-8');
    expect(rule).toContain("id: 'keyboard/focus-order-backward'");
    expect(rule).toContain("wcag: ['2.4.3']");
    expect(rule).toContain("tier: 'violation'");
    expect(rule).toContain('export function detectFocusOrderBackward(');
    expect(tree.exists(`${dir}/focus-order-backward.test.ts`)).toBe(true);

    const index = tree.read(`${dir}/index.ts`, 'utf-8');
    expect(index).toContain("import { focusOrderBackwardRule } from './focus-order-backward.js';");
    expect(index).toMatch(/rules: RuleMeta\[\] = \[\s*focusOrderBackwardRule,?\s*\]/);
  });

  it('creates a barrier fixture, a correct-pattern fixture and expected entries', async () => {
    await ruleGenerator(tree, { engine: 'keyboard', name: 'focus-order-backward', wcag: '2.4.3' });
    expect(tree.exists('fixtures/site/keyboard/focus-order-backward.html')).toBe(true);
    expect(tree.exists('fixtures/site/keyboard/focus-order-backward-ok.html')).toBe(true);
    const barrier = readJson(tree, 'fixtures/expected/keyboard/focus-order-backward.json');
    expect(barrier.issues[0]).toMatchObject({
      wcag: ['2.4.3'],
      layer: 'keyboard',
      ruleId: 'keyboard/focus-order-backward',
    });
    expect(
      readJson(tree, 'fixtures/expected/keyboard/focus-order-backward-ok.json').issues,
    ).toEqual([]);
  });

  it('creates a rule doc stub', async () => {
    await ruleGenerator(tree, {
      engine: 'keyboard',
      name: 'trap',
      wcag: '2.1.2',
      tier: 'needs-review',
    });
    const doc = tree.read('docs/rules/keyboard/trap.md', 'utf-8');
    expect(doc).toContain('id: keyboard/trap');
    expect(doc).toContain('tier: needs-review');
    expect(doc).toContain('## How to fix');
  });

  it('registers several rules in order', () => {
    const base =
      "import type { RuleMeta } from '@clear-a11y/core';\n\nexport const rules: RuleMeta[] = [];\n";
    const once = registerRule(base, 'aRule'.replace('Rule', ''), 'a');
    const twice = registerRule(once, 'b', 'b');
    expect(twice).toContain("import { aRule } from './a.js';");
    expect(twice).toContain("import { bRule } from './b.js';");
  });

  it('fails clearly when the engine does not exist', async () => {
    await expect(ruleGenerator(tree, { engine: 'nope', name: 'x', wcag: '1.1.1' })).rejects.toThrow(
      /not found/,
    );
  });
});
