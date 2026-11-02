import { readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { RepoDetection } from '../detect/detect-repo.js';
import { parseStoryIndex, storyFileInRepo, type StoryIndex } from './index-json.js';

/** Where the stories come from: a built Storybook folder in the repo, or a running local Storybook. */
export type StorybookSource =
  | { kind: 'static'; /** Repo-relative folder with index.json and iframe.html. */ dir: string }
  | { kind: 'url'; /** Base URL of a running Storybook (localhost only). */ url: string };

/** Index file names, newest format first. */
export const STORY_INDEX_FILES = ['index.json', 'stories.json'] as const;

/** True for http(s) URLs on this machine: localhost, *.localhost, 127.0.0.0/8 and [::1]. */
export function isLocalUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^127(\.\d{1,3}){3}$/.test(host) ||
    host === '[::1]'
  );
}

/** Throws a user-facing error unless `value` is a localhost URL. Returns it with a trailing slash. */
export function assertLocalStorybookUrl(value: string): string {
  if (!isLocalUrl(value))
    throw new Error(
      `--storybook-url must point at a Storybook on this machine (http://localhost:6006/ or 127.0.0.1); got "${value}". Remote sites are scanned by URL, not as a repo.`,
    );
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/(iframe|index)\.html$/, '/');
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

/** Reads and parses the story index of a built Storybook folder. */
export async function readStaticStoryIndex(root: string, dir: string): Promise<StoryIndex> {
  for (const name of STORY_INDEX_FILES) {
    const raw = await readFile(join(root, dir, name), 'utf-8').catch(() => undefined);
    if (raw === undefined) continue;
    return parseStoryIndex(JSON.parse(raw) as unknown);
  }
  throw new Error(
    `${dir}/ has no index.json or stories.json; build it with \`storybook build\` (Storybook 7+) first.`,
  );
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetches `<url>/index.json` (or the legacy `stories.json`) from a running local Storybook. */
export async function fetchStoryIndex(
  baseUrl: string,
  options: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<StoryIndex> {
  const base = assertLocalStorybookUrl(baseUrl);
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const errors: string[] = [];
  for (const name of STORY_INDEX_FILES) {
    const url = new URL(name, base).href;
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      return parseStoryIndex(await res.json());
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Could not read the story index from ${base} (${errors.join('; ')}).`);
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Repo-relative folders that can be a Storybook project root for a given source. */
export function storybookProjectDirs(
  detection: Pick<RepoDetection, 'storybook'>,
  source: StorybookSource,
): string[] {
  const dirs: string[] = [];
  if (source.kind === 'static') dirs.push(posix.dirname(source.dir));
  for (const config of detection.storybook.configDirs) dirs.push(posix.dirname(config));
  dirs.push('.');
  return [...new Set(dirs)];
}

/**
 * Repo-relative path of a story file (`importPath` is relative to the Storybook project root,
 * which we don't know for sure in a monorepo). Tries each candidate project folder and returns
 * the first path that exists; falls back to the first candidate's path when none exists.
 */
export async function resolveStoryFile(
  root: string,
  importPath: string,
  projectDirs: readonly string[],
): Promise<string | undefined> {
  const candidates = projectDirs
    .map((d) => storyFileInRepo(importPath, d))
    .filter((p): p is string => !!p);
  for (const c of candidates) if (await exists(join(root, c))) return c;
  return candidates[0];
}
