import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const siteDir = join(root, 'site');
export const expectedDir = join(root, 'expected');
export const reposDir = join(root, 'repos');
