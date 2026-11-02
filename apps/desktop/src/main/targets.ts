import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { Target, TargetInput } from '../shared/api-types.js';
import { readJsonFile, writeJsonFile } from './json-file.js';

const TargetSchema = z.object({
  id: z.string(),
  kind: z.enum(['url', 'repo']),
  value: z.string(),
  label: z.string(),
  addedAt: z.string(),
});
const FileSchema = z.object({ version: z.literal(1), targets: z.array(TargetSchema) });

export class TargetError extends Error {}

export const MAX_TARGETS = 200;

/** Normalizes and checks a URL target: absolute http(s) only, no credentials in it. */
export function normalizeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TargetError('Enter a full web address that starts with http:// or https://.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetError('Only http:// and https:// addresses can be scanned.');
  }
  if (url.username || url.password) {
    throw new TargetError(
      'Remove the user name and password from the address. Use an auth storage state file for sites that need a login.',
    );
  }
  url.hash = '';
  return url.href;
}

/** Checks a repo target: an absolute path to an existing folder. */
export async function normalizeRepoPath(value: string): Promise<string> {
  const trimmed = value.trim();
  if (!isAbsolute(trimmed)) throw new TargetError('Choose a folder (an absolute path).');
  const path = resolve(trimmed);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) throw new TargetError(`This folder does not exist: ${path}`);
  return path;
}

function defaultLabel(kind: Target['kind'], value: string): string {
  if (kind === 'repo') return basename(value) || value;
  const url = new URL(value);
  return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
}

/** Scan targets, kept in `<dataDir>/targets.json`. */
export class TargetStore {
  private cache?: Target[];

  constructor(private readonly file: string) {}

  async list(): Promise<Target[]> {
    if (!this.cache) {
      this.cache = (
        await readJsonFile(this.file, FileSchema, () => ({ version: 1 as const, targets: [] }))
      ).targets;
    }
    return [...this.cache];
  }

  async get(id: string): Promise<Target | undefined> {
    return (await this.list()).find((t) => t.id === id);
  }

  async add(input: TargetInput): Promise<Target> {
    const value =
      input.kind === 'url' ? normalizeUrl(input.value) : await normalizeRepoPath(input.value);
    const targets = await this.list();
    const existing = targets.find((t) => t.kind === input.kind && t.value === value);
    if (existing) return existing;
    if (targets.length >= MAX_TARGETS) {
      throw new TargetError(`You can keep up to ${MAX_TARGETS} targets. Remove one first.`);
    }
    const target: Target = {
      id: randomUUID(),
      kind: input.kind,
      value,
      label: input.label?.trim() || defaultLabel(input.kind, value),
      addedAt: new Date().toISOString(),
    };
    await this.save([...targets, target]);
    return target;
  }

  async remove(id: string): Promise<void> {
    const targets = await this.list();
    if (!targets.some((t) => t.id === id)) throw new TargetError('That target no longer exists.');
    await this.save(targets.filter((t) => t.id !== id));
  }

  private async save(targets: Target[]): Promise<void> {
    await writeJsonFile(this.file, { version: 1, targets });
    this.cache = targets;
  }
}
