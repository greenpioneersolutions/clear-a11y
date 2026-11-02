import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stableHash } from '@clear-a11y/core';
import type { ArtifactSink } from './types.js';

const safe = (name: string) =>
  name
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'artifact';

/** Writes artifacts to `<dir>/artifacts/` and returns paths relative to `dir`. */
export function fileArtifactSink(dir: string): ArtifactSink {
  return {
    async save(name, data, ext = 'png') {
      const file = `${safe(name)}-${stableHash(Buffer.from(data).toString('base64')).slice(0, 8)}.${ext}`;
      await mkdir(join(dir, 'artifacts'), { recursive: true });
      await writeFile(join(dir, 'artifacts', file), data);
      return `artifacts/${file}`;
    },
  };
}

/** Keeps artifacts in memory (tests, benchmark). Returns data URIs for small files. */
export function memoryArtifactSink(): ArtifactSink & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async save(name, data, ext = 'png') {
      const key = `memory:${safe(name)}.${ext}`;
      files.set(key, data);
      return key;
    },
  };
}

/** Discards artifacts. */
export const nullArtifactSink: ArtifactSink = { save: async () => '' };
