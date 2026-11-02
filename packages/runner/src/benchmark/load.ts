import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ExpectedPageSchema, type ExpectedPage } from '@clear-a11y/core';

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? walk(join(dir, e.name))
        : Promise.resolve(e.name.endsWith('.json') ? [join(dir, e.name)] : []),
    ),
  );
  return nested.flat().sort();
}

/** Loads and validates every fixtures/expected/**\/*.json file. */
export async function loadExpected(dir: string): Promise<ExpectedPage[]> {
  const files = await walk(dir);
  return Promise.all(
    files.map(async (file) => {
      const parsed = ExpectedPageSchema.safeParse(JSON.parse(await readFile(file, 'utf-8')));
      if (!parsed.success) throw new Error(`${relative(dir, file)}: ${parsed.error.message}`);
      return parsed.data;
    }),
  );
}
