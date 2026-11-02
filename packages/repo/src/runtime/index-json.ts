import { posix } from 'node:path';
import { globToRegExp } from '../detect/files.js';

/** One entry of a Storybook story index, normalized across index versions. */
export interface StoryIndexEntry {
  id: string;
  /** Sidebar title, e.g. "Components/Button". */
  title: string;
  /** Story name, e.g. "Icon only". */
  name: string;
  /** Path of the story file relative to the Storybook project root, e.g. "./src/Button.stories.tsx". */
  importPath: string;
  type: 'story' | 'docs';
  tags: string[];
}

export interface StoryIndex {
  /** Index format version (`v`): 5 for Storybook 8, 4 for Storybook 7, 3 for legacy stories.json. */
  version: number;
  entries: StoryIndexEntry[];
  /** Entries that were not understood (missing id, title or path) and were skipped. */
  invalid: number;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function toEntry(raw: unknown, legacy: boolean): StoryIndexEntry | undefined {
  if (!isRecord(raw)) return undefined;
  const params = isRecord(raw['parameters']) ? raw['parameters'] : {};
  const id = str(raw['id']);
  const title = str(raw['title']) ?? str(raw['kind']);
  const name = str(raw['name']) ?? str(raw['story']) ?? id;
  const importPath = str(raw['importPath']) ?? str(params['fileName']);
  if (!id || !title || !name || !importPath) return undefined;
  const tags = Array.isArray(raw['tags'])
    ? raw['tags'].filter((t): t is string => typeof t === 'string')
    : [];
  const docs = legacy
    ? params['docsOnly'] === true
    : raw['type'] === 'docs' || (raw['type'] === undefined && tags.includes('docs'));
  return { id, title, name, importPath, type: docs ? 'docs' : 'story', tags };
}

/**
 * Parses a Storybook story index: `index.json` (Storybook 7+, `v: 4` or `v: 5`, `entries`) or the
 * legacy `stories.json` (`v: 3`, `stories`). Never throws for unknown entries; it counts them.
 * Throws only when the document is not a story index at all.
 */
export function parseStoryIndex(raw: unknown): StoryIndex {
  if (!isRecord(raw)) throw new Error('not a Storybook index (expected a JSON object)');
  const version = typeof raw['v'] === 'number' ? raw['v'] : 0;
  const map = isRecord(raw['entries'])
    ? raw['entries']
    : isRecord(raw['stories'])
      ? raw['stories']
      : undefined;
  if (!map) throw new Error('not a Storybook index (no "entries" or "stories")');
  const legacy = !isRecord(raw['entries']);
  const entries: StoryIndexEntry[] = [];
  let invalid = 0;
  for (const value of Object.values(map)) {
    const entry = toEntry(value, legacy);
    if (entry) entries.push(entry);
    else invalid++;
  }
  return { version, entries, invalid };
}

/**
 * URL of a story rendered on its own, the way Storybook's preview iframe shows it:
 * `<base>/iframe.html?id=<id>&viewMode=story`. The id is URL-encoded.
 */
export function storyIframeUrl(base: string, id: string): string {
  const url = new URL('iframe.html', base.endsWith('/') ? base : `${base}/`);
  url.search = `?id=${encodeURIComponent(id)}&viewMode=story`;
  return url.href;
}

/** The story id of a story iframe URL (`…/iframe.html?id=<id>…`), also for `repo:` URLs. */
export function storyIdFromUrl(url: string): string | undefined {
  const query = /[?&]id=([^&#]*)/.exec(url)?.[1];
  if (!query || !/iframe\.html\?/.test(url)) return undefined;
  try {
    return decodeURIComponent(query) || undefined;
  } catch {
    return undefined;
  }
}

export interface StorySelection {
  stories: StoryIndexEntry[];
  /** Docs entries (MDX and autodocs pages) skipped: they are documentation, not components. */
  docs: number;
  /** Stories removed by `storyFilter`. */
  filteredOut: number;
  /** Stories beyond `maxStories`, not scanned. */
  truncated: number;
}

/** True when a story is kept by the filter globs (matched against id and title). */
export function storyMatchesFilter(entry: StoryIndexEntry, filter: readonly string[]): boolean {
  if (!filter.length) return true;
  const test = (glob: string) => [entry.id, entry.title].some((v) => globToRegExp(glob).test(v));
  const includes = filter.filter((g) => !g.startsWith('!'));
  const excludes = filter.filter((g) => g.startsWith('!')).map((g) => g.slice(1));
  if (excludes.some(test)) return false;
  return includes.length === 0 || includes.some(test);
}

/** Keeps `type: "story"` entries that pass the filter, in index order, up to `max`. */
export function selectStories(
  entries: readonly StoryIndexEntry[],
  options: { filter?: readonly string[]; max: number },
): StorySelection {
  const stories = entries.filter((e) => e.type === 'story');
  const kept = stories.filter((e) => storyMatchesFilter(e, options.filter ?? []));
  return {
    stories: kept.slice(0, options.max),
    docs: entries.length - stories.length,
    filteredOut: stories.length - kept.length,
    truncated: Math.max(0, kept.length - options.max),
  };
}

/**
 * Repo-relative POSIX path of a story file. `importPath` is relative to the Storybook project root
 * (`packageDir`, "." for the repo root). Returns undefined for paths that leave the repo.
 */
export function storyFileInRepo(importPath: string, packageDir = '.'): string | undefined {
  const p = importPath.replace(/\\/g, '/');
  if (/^([a-zA-Z]:)?\//.test(p)) return undefined;
  const joined = posix.normalize(posix.join(packageDir.replace(/\\/g, '/'), p));
  if (joined === '.' || joined.startsWith('../') || joined === '..') return undefined;
  return joined;
}

/**
 * Line of a story's export in its CSF file (`export const IconOnly` for the story "Icon Only"),
 * or undefined. Storybook derives the story name from the export name by splitting words, so the
 * export is the name without spaces and punctuation.
 */
export function storyExportLine(source: string, storyName: string): number | undefined {
  const exportName = storyName.replace(/[^A-Za-z0-9_$]/g, '');
  if (!exportName) return undefined;
  const re = new RegExp(`^\\s*export\\s+(const|let|var|function)\\s+${exportName}\\b`);
  const index = source.split(/\r?\n/).findIndex((line) => re.test(line));
  return index < 0 ? undefined : index + 1;
}
