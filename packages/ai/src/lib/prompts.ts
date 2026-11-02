import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** A versioned prompt file from packages/ai/prompts/<id>.v<version>.md. */
export interface PromptFile {
  id: string;
  version: number;
  wcag: string[];
  body: string;
}

const FrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.coerce.number().int().positive(),
  wcag: z.array(z.string()).default([]),
});

/** Parses `---\nkey: value\n---\nbody`. Values may be `[a, b]` lists. */
export function parseFrontmatter(source: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!m) throw new Error('prompt file has no frontmatter');
  const data: Record<string, unknown> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/i.exec(line.trim());
    if (!kv) continue;
    const value = kv[2]!.trim();
    data[kv[1]!] = /^\[.*\]$/.test(value)
      ? value
          .slice(1, -1)
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value;
  }
  return { data, body: m[2]!.trim() };
}

export function parsePromptFile(source: string, expected?: { id: string; version: number }) {
  const { data, body } = parseFrontmatter(source);
  const meta = FrontmatterSchema.parse(data);
  if (expected && (meta.id !== expected.id || meta.version !== expected.version)) {
    throw new Error(
      `prompt file ${expected.id}.v${expected.version} declares ${meta.id} v${meta.version}`,
    );
  }
  return { ...meta, body } satisfies PromptFile;
}

const cache = new Map<string, PromptFile>();

/**
 * Loads `prompts/<id>.v<version>.md`, shipped in the package next to `dist/`. The path is the
 * same depth from src/lib and dist/lib, so it works in tests and in the published package.
 * A prompt change means a new version file, never an edit of a released one.
 */
export function loadPrompt(id: string, version: number): PromptFile {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`invalid prompt id: ${id}`);
  const name = `${id}.v${version}`;
  const hit = cache.get(name);
  if (hit) return hit;
  const source = readFileSync(new URL(`../../prompts/${name}.md`, import.meta.url), 'utf-8');
  const prompt = parsePromptFile(source, { id, version });
  cache.set(name, prompt);
  return prompt;
}
