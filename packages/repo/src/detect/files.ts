import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { IGNORED_DIRS } from './detect-repo.js';

/** Files we skip by default: tests, stories (S10 scans Storybook at runtime), type declarations. */
export const DEFAULT_EXCLUDES = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.story.*',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.d.ts',
];

/** Minimal glob -> RegExp: `**` (any depth), `*` (within a segment), `?`, `{a,b}`. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i);
    if (c === '*' && glob.charAt(i + 1) === '*') {
      const slash = glob.charAt(i + 2) === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) re += '\\{';
      else {
        re += `(?:${glob
          .slice(i + 1, end)
          .split(',')
          .map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&'))
          .join('|')})`;
        i = end;
      }
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export interface ListFilesOptions {
  /** File extensions without the dot, e.g. ["tsx", "jsx"]. */
  extensions: readonly string[];
  /** Extra globs to skip (repo-relative). Added to DEFAULT_EXCLUDES unless `defaultExcludes` is false. */
  exclude?: readonly string[];
  defaultExcludes?: boolean;
  /** Stop after this many files. */
  maxFiles?: number;
  /** Skip files larger than this (bytes). Large files are usually generated or vendored. */
  maxFileBytes?: number;
}

export interface ListedFiles {
  /** Repo-relative POSIX paths, sorted. */
  files: string[];
  /** True when `maxFiles` cut the list short. */
  truncated: boolean;
  /** Files skipped because they exceed `maxFileBytes`. */
  tooLarge: string[];
}

/**
 * Lists source files under `dirs` (repo-relative). Skips IGNORED_DIRS, dot-directories and
 * symbolic links (a link could point outside the repo), and never reads file contents.
 */
export async function listSourceFiles(
  root: string,
  dirs: readonly string[],
  options: ListFilesOptions,
): Promise<ListedFiles> {
  const maxFiles = options.maxFiles ?? 5000;
  const maxBytes = options.maxFileBytes ?? 512 * 1024;
  const excludes = [
    ...(options.defaultExcludes === false ? [] : DEFAULT_EXCLUDES),
    ...(options.exclude ?? []),
  ].map(globToRegExp);
  const exts = new Set(options.extensions.map((e) => e.replace(/^\./, '').toLowerCase()));
  const files = new Set<string>();
  const tooLarge: string[] = [];
  let truncated = false;

  async function walk(rel: string): Promise<void> {
    if (truncated) return;
    const entries = await readdir(join(root, rel), { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const path = rel === '.' ? e.name : `${rel}/${e.name}`;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(path);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase();
      if (!exts.has(ext) || excludes.some((re) => re.test(path))) continue;
      const info = await lstat(join(root, path)).catch(() => undefined);
      if (!info) continue;
      if (info.size > maxBytes) {
        tooLarge.push(path);
        continue;
      }
      if (files.size >= maxFiles) {
        truncated = true;
        return;
      }
      files.add(path);
    }
  }

  for (const dir of dirs) await walk(dir.replace(/\\/g, '/').replace(/\/+$/, '') || '.');
  return { files: [...files].sort(), truncated, tooLarge };
}
