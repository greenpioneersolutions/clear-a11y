// Bundles the action for GitHub, which runs `main` from action.yml without installing anything:
//
//   dist/index.js                     every JS dependency inlined (ESM, one file)
//   dist/node_modules/playwright-core copied as-is (see below)
//
// Browsers are not bundled; the workflow installs Chromium before the action runs
// (`npx playwright@<version> install --with-deps chromium`, version printed by the action).
// The output is deterministic (no timestamps, no absolute paths, sorted metafile) so it can be
// committed for releases and diffed.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'dist');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

/**
 * playwright-core finds its own package.json, browsers.json and lib/ files from __dirname at
 * runtime, so it cannot be inlined. `playwright` is only a re-export of `playwright-core`, so we
 * point imports of it at playwright-core, keep that external and copy the package next to the
 * bundle, where Node resolves it from dist/node_modules.
 */
const playwrightExternal = {
  name: 'playwright-external',
  setup(b) {
    b.onResolve({ filter: /^playwright(-core)?$/ }, () => ({
      path: 'playwright-core',
      external: true,
    }));
  },
};

/**
 * Some bundled CommonJS modules call `require.resolve("<package>")` only to probe for a package
 * or to record its path (eslint-plugin-vuejs-accessibility's legacy config, fdir's picomatch
 * probe). There is no node_modules next to the bundle, so the call would throw; the package is
 * inlined anyway, so the bare name is an accurate answer.
 */
const RESOLVE_CALL = /\brequire\.resolve\((["'])([a-z@][\w./@-]*)\1\)/g;
const inlineRequireResolve = {
  name: 'inline-require-resolve',
  setup(b) {
    b.onLoad({ filter: /[\\/]node_modules[\\/].*\.c?js$/ }, async (args) => {
      const source = await readFile(args.path, 'utf-8');
      if (!source.includes('require.resolve(')) return undefined;
      return { contents: source.replace(RESOLVE_CALL, '$1$2$1'), loader: 'js' };
    });
  },
};

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Read workspace packages from their TypeScript sources, like the tests do.
  conditions: ['@clear-a11y/source'],
  // Bundled CommonJS dependencies call require() for Node built-ins and read __dirname; give the
  // ESM bundle both.
  banner: {
    js: [
      "import { createRequire as __clearA11yCreateRequire } from 'node:module';",
      "import { fileURLToPath as __clearA11yFileURLToPath } from 'node:url';",
      "import { dirname as __clearA11yDirname } from 'node:path';",
      'const require = __clearA11yCreateRequire(import.meta.url);',
      'const __filename = __clearA11yFileURLToPath(import.meta.url);',
      'const __dirname = __clearA11yDirname(__filename);',
    ].join('\n'),
  },
  plugins: [playwrightExternal, inlineRequireResolve],
  // Optional modules that eslint only loads when present.
  external: ['fsevents', 'jiti'],
  legalComments: 'linked',
  sourcemap: false,
  minify: false,
  logLevel: 'warning',
});

// Copy playwright-core (it has no dependencies of its own) from where @clear-a11y/browser resolves it.
const browserPkg = join(root, '..', '..', 'packages', 'browser', 'package.json');
const playwrightPkg = createRequire(browserPkg).resolve('playwright/package.json');
const corePkg = createRequire(playwrightPkg).resolve('playwright-core/package.json');
const coreDir = dirname(corePkg);
await cp(coreDir, join(outdir, 'node_modules', 'playwright-core'), {
  recursive: true,
  dereference: true,
});

// The runner and repo packages read their version from "../package.json" relative to the module;
// in the bundle that is dist/../package.json (this app's package.json, shipped with action.yml).
const { version } = JSON.parse(await readFile(corePkg, 'utf-8'));
await writeFile(
  join(outdir, 'playwright-version.json'),
  JSON.stringify({ playwright: version }) + '\n',
);
console.log(`bundled dist/index.js (playwright-core ${version})`);
