import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readJson, type Tree } from '@nx/devkit';
import { engineGenerator } from './engine';

describe('engine generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write('.prettierrc', '{"singleQuote": true}');
    tree.write('tsconfig.json', JSON.stringify({ files: [], references: [] }));
  });

  it('creates a tagged engine package with the engine contract stub', async () => {
    await engineGenerator(tree, {
      name: 'keyboard',
      description: 'Keyboard checks.',
      skipInstall: true,
    });

    const pkg = readJson(tree, 'packages/engines/keyboard/package.json');
    expect(pkg.name).toBe('@clear-a11y/engine-keyboard');
    expect(pkg.nx.tags).toEqual(['type:engine', 'scope:keyboard', 'publish:public']);
    expect(pkg.dependencies['@clear-a11y/browser']).toBe('workspace:*');
    expect(pkg.dependencies['@clear-a11y/core']).toBe('workspace:*');
    expect(pkg.devDependencies['@clear-a11y/test-utils']).toBe('workspace:*');
    expect(pkg.publishConfig).toEqual({ access: 'public' });

    const engine = tree.read('packages/engines/keyboard/src/lib/engine.ts', 'utf-8');
    expect(engine).toContain("export const ENGINE_NAME = 'engine-keyboard'");
    expect(engine).toContain('export function createKeyboardEngine(): Engine');
    expect(engine).toContain('run(_ctx: PageContext): Promise<Finding[]>');
  });

  it('sets up unit and integration tests plus a README', async () => {
    await engineGenerator(tree, { name: 'keyboard', skipInstall: true });
    const root = 'packages/engines/keyboard';
    for (const file of [
      'src/lib/engine.test.ts',
      'test/engine.integration.test.ts',
      'vitest.config.mts',
      'vitest.integration.config.mts',
      'src/rules/index.ts',
      'README.md',
      'eslint.config.mjs',
    ]) {
      expect(tree.exists(`${root}/${file}`)).toBe(true);
    }
    expect(tree.read(`${root}/eslint.config.mjs`, 'utf-8')).toContain(
      "'../../../eslint.config.mjs'",
    );
  });

  it('adds a root tsconfig reference', async () => {
    await engineGenerator(tree, { name: 'visual', skipInstall: true });
    expect(readJson(tree, 'tsconfig.json').references).toContainEqual({
      path: './packages/engines/visual',
    });
  });

  it('refuses to overwrite an existing engine', async () => {
    await engineGenerator(tree, { name: 'keyboard', skipInstall: true });
    await expect(engineGenerator(tree, { name: 'keyboard', skipInstall: true })).rejects.toThrow(
      /already exists/,
    );
  });
});
