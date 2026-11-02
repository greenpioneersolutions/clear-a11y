import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readJson, type Tree } from '@nx/devkit';
import { fixtureGenerator } from './fixture';

describe('fixture generator', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write('.prettierrc', '{"singleQuote": true}');
  });

  it('creates a barrier page and an expected-findings entry', async () => {
    await fixtureGenerator(tree, {
      path: 'keyboard/skip-link-missing',
      wcag: '2.4.1',
      layer: 'keyboard',
      ruleId: 'keyboard/skip-link-missing',
      description: 'No way to bypass the repeated navigation.',
    });

    const html = tree.read('fixtures/site/keyboard/skip-link-missing.html', 'utf-8');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Skip Link Missing</title>');
    expect(html).toContain('Seeded barrier');

    const expected = readJson(tree, 'fixtures/expected/keyboard/skip-link-missing.json');
    expect(expected).toEqual({
      page: 'keyboard/skip-link-missing.html',
      title: 'Skip Link Missing',
      correctPattern: false,
      issues: [
        {
          id: 'keyboard/skip-link-missing#1',
          wcag: ['2.4.1'],
          selector: 'TODO',
          layer: 'keyboard',
          description: 'No way to bypass the repeated navigation.',
          ruleId: 'keyboard/skip-link-missing',
        },
      ],
    });
  });

  it('creates a correct-pattern page with no expected issues', async () => {
    await fixtureGenerator(tree, { path: 'keyboard/skip-link-ok', correctPattern: true });
    expect(tree.read('fixtures/site/keyboard/skip-link-ok.html', 'utf-8')).toContain(
      'Correct pattern',
    );
    expect(readJson(tree, 'fixtures/expected/keyboard/skip-link-ok.json').issues).toEqual([]);
  });

  it('rejects invalid success criteria and duplicates', async () => {
    await expect(fixtureGenerator(tree, { path: 'a/b', wcag: '2.4' })).rejects.toThrow(
      /not a WCAG/,
    );
    await fixtureGenerator(tree, { path: 'a/b' });
    await expect(fixtureGenerator(tree, { path: 'a/b' })).rejects.toThrow(/already exists/);
  });
});
