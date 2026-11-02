import { posix } from 'node:path';
import { stripDotSlash } from './routes.js';

/** One story from a built Storybook's index (`storybook-static/index.json`). */
export interface StoryEntry {
  id: string;
  title: string;
  name: string;
  /** Path of the story file, relative to the Storybook project root ("./src/Button.stories.tsx"). */
  importPath: string;
  /** Component file the story renders, when Storybook recorded it (Storybook 8+). */
  componentPath?: string;
}

type RawEntry = Partial<Record<keyof StoryEntry | 'type', unknown>>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Reads the stories from a Storybook index: `index.json` (Storybook 7+, `entries`, docs entries
 * dropped) or the older `stories.json` (`stories`). Malformed entries are skipped. The input is
 * untrusted repo content; only plain strings are kept.
 */
export function parseStoryIndex(json: unknown): StoryEntry[] {
  if (!json || typeof json !== 'object') return [];
  const obj = json as { entries?: unknown; stories?: unknown };
  const raw = obj.entries ?? obj.stories;
  if (!raw || typeof raw !== 'object') return [];
  const out: StoryEntry[] = [];
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const e = value as RawEntry;
    if (e.type !== undefined && e.type !== 'story') continue;
    const id = str(e.id);
    const importPath = str(e.importPath);
    if (!id || !importPath) continue;
    const componentPath = str(e.componentPath);
    out.push({
      id,
      title: str(e.title) ?? id,
      name: str(e.name) ?? id,
      importPath,
      ...(componentPath ? { componentPath } : {}),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Path of a story's isolated preview inside a built Storybook. */
export const storyIframePath = (id: string): string =>
  `iframe.html?id=${encodeURIComponent(id)}&viewMode=story`;

const STORY_SUFFIX = /\.(stories|story)\.[cm]?[jt]sx?$|\.(stories|story)\.(vue|svelte|mdx)$/;
const SOURCE_EXT = /\.[^./]+$/;

/** Repo-relative path of a Storybook path ("./src/x" under the Storybook root "packages/ui"). */
export function storyPathInRepo(path: string, storybookRoot = '.'): string {
  const root = stripDotSlash(storybookRoot).replace(/\/+$/, '');
  const rel = stripDotSlash(path);
  return root && root !== '.' ? posix.normalize(`${root}/${rel}`) : posix.normalize(rel);
}

/** Why a story matched a changed file. */
export type StoryMatch = 'story-file' | 'component-path' | 'sibling-story';

/**
 * How a changed file relates to a story, if at all:
 * - `story-file`: the story file itself changed;
 * - `component-path`: Storybook recorded the changed file as the story's component;
 * - `sibling-story`: a story file next to the changed component with the same base name
 *   (`Button.tsx` -> `Button.stories.tsx`), or any story in the folder of a changed `index.*`.
 * Stories that import the component from elsewhere are not found (that needs an import graph).
 */
export function matchStory(
  file: string,
  story: StoryEntry,
  storybookRoot = '.',
): StoryMatch | undefined {
  const storyFile = storyPathInRepo(story.importPath, storybookRoot);
  if (storyFile === file) return 'story-file';
  if (story.componentPath && storyPathInRepo(story.componentPath, storybookRoot) === file)
    return 'component-path';
  if (!STORY_SUFFIX.test(storyFile) || STORY_SUFFIX.test(file)) return undefined;
  if (posix.dirname(storyFile) !== posix.dirname(file)) return undefined;
  const storyBase = posix.basename(storyFile).replace(STORY_SUFFIX, '');
  const fileBase = posix.basename(file).replace(SOURCE_EXT, '');
  if (storyBase === fileBase || fileBase === 'index') return 'sibling-story';
  return undefined;
}
