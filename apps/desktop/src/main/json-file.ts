import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';

/**
 * Reads a JSON file and validates it. A missing file gives `fallback`; a corrupt or invalid file is
 * moved aside (`<file>.corrupt-<time>`) and also gives `fallback`, so a bad edit never bricks the app.
 */
export async function readJsonFile<S extends z.ZodType>(
  file: string,
  schema: S,
  fallback: () => z.output<S>,
): Promise<z.output<S>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback();
    throw err;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through: not JSON
  }
  await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
  return fallback();
}

/** Writes JSON atomically (temp file + rename) so a crash never leaves half a file. */
export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}
