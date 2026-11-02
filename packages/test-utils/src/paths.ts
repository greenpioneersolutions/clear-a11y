import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walks up from `start` to the directory holding pnpm-workspace.yaml. */
export function findWorkspaceRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No pnpm-workspace.yaml found above ${start}`);
    dir = parent;
  }
}

export const fixturesDir = (): string => join(findWorkspaceRoot(), 'fixtures');
export const fixturesSiteDir = (): string => join(fixturesDir(), 'site');
export const fixturesExpectedDir = (): string => join(fixturesDir(), 'expected');
export const fixturesReposDir = (): string => join(fixturesDir(), 'repos');
/** Persona tasks for the fixture benchmark (fixtures/personas.json). */
export const fixturesPersonasFile = (): string => join(fixturesDir(), 'personas.json');
