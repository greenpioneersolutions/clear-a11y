/**
 * Writes the CLI reference JSON the docs site renders (`nx run cli:docs-json`).
 * Usage: node dist/docs-json.js <out-file>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createProgram } from './program.js';
import { describeProgram } from './reference.js';

const out = resolve(process.argv[2] ?? 'dist/cli-reference.json');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(describeProgram(createProgram()), null, 2) + '\n');
process.stdout.write(`Wrote ${out}\n`);
