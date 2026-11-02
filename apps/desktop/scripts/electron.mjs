// `node scripts/electron.mjs start|package`
//
// Finds the Electron binary WITHOUT triggering a download. (Since Electron 45, `require('electron')`
// from Node downloads the binary on first use; this script never calls it.) If the binary is
// missing it explains how to fetch it and exits.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

function electronDir() {
  return dirname(require.resolve('electron/package.json'));
}

function electronBinary() {
  const dir = electronDir();
  const override = process.env.ELECTRON_OVERRIDE_DIST_PATH;
  const pathFile = join(dir, 'path.txt');
  const rel = existsSync(pathFile) ? readFileSync(pathFile, 'utf8').trim() : undefined;
  if (override) return join(override, rel ?? 'electron');
  return rel ? join(dir, 'dist', rel) : undefined;
}

const command = process.argv[2];
const bin = electronBinary();
if (!bin || !existsSync(bin)) {
  console.error(
    [
      'The Electron binary is not installed. pnpm install never downloads it (see apps/desktop/README.md).',
      'Fetch it once (downloads from GitHub releases) with:',
      '  pnpm nx run desktop:fetch-electron',
      'or: node apps/desktop/node_modules/electron/install.js',
    ].join('\n'),
  );
  process.exit(1);
}

if (command === 'start') {
  const child = spawn(bin, [root], { stdio: 'inherit' });
  child.on('close', (code) => process.exit(code ?? 0));
} else if (command === 'package') {
  // electronDist points electron-builder at the binary we already have, so it does not download
  // Electron again. Produces an unpacked app (--dir); installers and signing are out of scope.
  const builderCli = join(dirname(require.resolve('electron-builder/package.json')), 'cli.js');
  const child = spawn(
    process.execPath,
    [
      builderCli,
      '--dir',
      '--config',
      'electron-builder.yml',
      `-c.electronDist=${join(electronDir(), 'dist')}`,
    ],
    { stdio: 'inherit', cwd: root },
  );
  child.on('close', (code) => process.exit(code ?? 0));
} else {
  console.error('usage: node scripts/electron.mjs start|package');
  process.exit(2);
}
