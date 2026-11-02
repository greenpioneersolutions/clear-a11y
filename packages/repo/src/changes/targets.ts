import { isAbsolute, relative, resolve } from 'node:path';
import { IGNORED_DIRS } from '../detect/detect-repo.js';
import { DEFAULT_EXCLUDES, globToRegExp } from '../detect/files.js';
import {
  isRoutePath,
  nextRouteForFile,
  resolveRoute,
  routesForFile,
  stripDotSlash,
  type RouteMap,
} from './routes.js';
import {
  matchStory,
  parseStoryIndex,
  storyIframePath,
  type StoryEntry,
  type StoryMatch,
} from './storybook.js';

/** File types the static layer lints. */
export const LINTABLE_EXTENSIONS = ['jsx', 'tsx', 'js', 'vue', 'html'] as const;

export interface ChangeTargetsInput {
  /** Changed files, repo-relative (absolute paths inside `repoPath` are made relative). */
  changedFiles: readonly string[];
  /** Repo root; only used to make absolute changed paths repo-relative. */
  repoPath?: string;
  /** Source globs -> site routes. */
  routes?: RouteMap;
  /** Parsed `storybook-static/index.json` (or `stories.json`), or its story list. */
  storybookIndex?: unknown;
  /** Repo-relative folder the story index paths are relative to (default "."). */
  storybookRoot?: string;
  /** Also derive routes from the Next.js app/ and pages/ conventions. */
  nextjs?: boolean;
  /** Base URL of the running app; routes become absolute URLs on it. */
  baseUrl?: string;
  /** Routes (paths) scanned when no changed file maps to a route or story. */
  defaultTargets?: readonly string[];
  /** Static lint only covers changed files under these repo-relative folders (default: any). */
  sourceDirs?: readonly string[];
  /** Extra globs that are never linted (added to the repo layer's default excludes). */
  exclude?: readonly string[];
}

export interface RouteTarget {
  /** Site path, e.g. "/checkout". */
  route: string;
  /** Absolute URL when a base URL was given. */
  url?: string;
  /** Changed files that led here (empty for default targets). */
  files: string[];
  /** "route-map", "nextjs" or "default". */
  via: Array<'route-map' | 'nextjs' | 'default'>;
}

export interface StoryTarget extends StoryEntry {
  /** Preview path inside the built Storybook: "iframe.html?id=...&viewMode=story". */
  path: string;
  files: string[];
  via: StoryMatch[];
}

export interface ChangeTargets {
  routes: RouteTarget[];
  stories: StoryTarget[];
  /** Changed files the static layer should lint (repo-relative). */
  sourceFiles: string[];
  /** Changed files that produced no target at all. */
  unmapped: string[];
  /** True when nothing mapped and `defaultTargets` were used. */
  usedDefaults: boolean;
  /** Plain-language notes for the job summary (skipped routes, fallbacks). */
  notes: string[];
}

const toRepoRelative = (file: string, repoPath?: string): string => {
  const posix = file.replace(/\\/g, '/');
  if (repoPath && isAbsolute(file)) return relative(resolve(repoPath), file).replace(/\\/g, '/');
  return stripDotSlash(posix);
};

const insideRepo = (file: string) => !!file && !isAbsolute(file) && !file.split('/').includes('..');

/**
 * Turns the files a change touched into what to scan:
 * - **routes** from the route map globs, plus the Next.js file conventions when `nextjs` is set;
 * - **stories** whose story file changed, whose recorded component changed, or that sit next to a
 *   changed component with the same base name;
 * - **source files** for the static layer: changed files with a lintable extension, not tests,
 *   stories, build output or dot-folders, and (when given) inside `sourceDirs`.
 *
 * When no changed file maps to a route or story, `defaultTargets` are used instead (or nothing,
 * with a note). Pure: it never touches the disk or the network.
 */
export function targetsForChanges(input: ChangeTargetsInput): ChangeTargets {
  const files = [
    ...new Set(input.changedFiles.map((f) => toRepoRelative(f, input.repoPath))),
  ].filter(insideRepo);
  files.sort();
  const routeMap = input.routes ?? {};
  const stories = Array.isArray(input.storybookIndex)
    ? (input.storybookIndex as StoryEntry[])
    : parseStoryIndex(input.storybookIndex);
  const notes: string[] = [];
  const routeTargets = new Map<string, RouteTarget>();
  const storyTargets = new Map<string, StoryTarget>();
  const mapped = new Set<string>();

  const addRoute = (route: string, file: string | undefined, via: RouteTarget['via'][number]) => {
    const t = routeTargets.get(route) ?? { route, files: [], via: [] };
    if (file && !t.files.includes(file)) t.files.push(file);
    if (!t.via.includes(via)) t.via.push(via);
    routeTargets.set(route, t);
    if (file) mapped.add(file);
  };

  for (const file of files) {
    for (const route of routesForFile(file, routeMap)) addRoute(route, file, 'route-map');
    if (input.nextjs) {
      const next = nextRouteForFile(file);
      if (next?.route) addRoute(next.route, file, 'nextjs');
      else if (next?.skipped && !routesForFile(file, routeMap).length)
        notes.push(`${file}: ${next.skipped}; add it to the route map to scan it.`);
    }
    for (const story of stories) {
      const match = matchStory(file, story, input.storybookRoot);
      if (!match) continue;
      const t = storyTargets.get(story.id) ?? {
        ...story,
        path: storyIframePath(story.id),
        files: [],
        via: [],
      };
      if (!t.files.includes(file)) t.files.push(file);
      if (!t.via.includes(match)) t.via.push(match);
      storyTargets.set(story.id, t);
      mapped.add(file);
    }
  }

  const excludes = [...DEFAULT_EXCLUDES, ...(input.exclude ?? [])].map((g) =>
    globToRegExp(stripDotSlash(g)),
  );
  const dirs = input.sourceDirs?.map((d) => stripDotSlash(d).replace(/\/+$/, ''));
  const exts = new Set<string>(LINTABLE_EXTENSIONS);
  const sourceFiles = files.filter((file) => {
    const parts = file.split('/');
    const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
    if (!exts.has(ext)) return false;
    if (parts.slice(0, -1).some((p) => IGNORED_DIRS.has(p) || p.startsWith('.'))) return false;
    if (excludes.some((re) => re.test(file))) return false;
    if (dirs && !dirs.some((d) => d === '.' || d === '' || file.startsWith(`${d}/`))) return false;
    return true;
  });
  for (const f of sourceFiles) mapped.add(f);

  let usedDefaults = false;
  if (!routeTargets.size && !storyTargets.size) {
    const defaults = (input.defaultTargets ?? []).filter((r) => {
      if (isRoutePath(r)) return true;
      notes.push(`Ignored default target "${r}": use a path that starts with "/".`);
      return false;
    });
    if (defaults.length) {
      usedDefaults = true;
      for (const r of defaults) addRoute(r, undefined, 'default');
      notes.push(
        'No changed file maps to a route or story, so the default targets were scanned instead.',
      );
    } else if (files.length) {
      notes.push(
        'No changed file maps to a route or story, and no default targets are configured, so no pages were scanned.',
      );
    }
  }

  const routes = [...routeTargets.values()].sort((a, b) => a.route.localeCompare(b.route));
  if (input.baseUrl) {
    for (const t of routes) {
      try {
        t.url = resolveRoute(input.baseUrl, t.route);
      } catch (err) {
        notes.push(`Skipped route ${t.route}: ${(err as Error).message}`);
      }
    }
  }

  return {
    routes,
    stories: [...storyTargets.values()].sort((a, b) => a.id.localeCompare(b.id)),
    sourceFiles,
    unmapped: files.filter((f) => !mapped.has(f)),
    usedDefaults,
    notes,
  };
}

/**
 * Everything the configuration names, regardless of what changed: every route in the route map,
 * the default targets and every story. Used when scanning is not limited to changed files.
 * `sourceFiles` is empty; the caller lints the whole repo instead.
 */
export function allTargets(
  input: Omit<ChangeTargetsInput, 'changedFiles' | 'sourceDirs' | 'exclude' | 'nextjs'>,
): ChangeTargets {
  const routes = [
    ...new Set([...Object.values(input.routes ?? {}).flat(), ...(input.defaultTargets ?? [])]),
  ].filter(isRoutePath);
  const stories = Array.isArray(input.storybookIndex)
    ? (input.storybookIndex as StoryEntry[])
    : parseStoryIndex(input.storybookIndex);
  const notes: string[] = [];
  const routeTargets: RouteTarget[] = routes.sort().map((route) => {
    const t: RouteTarget = { route, files: [], via: ['default'] };
    if (input.baseUrl) {
      try {
        t.url = resolveRoute(input.baseUrl, route);
      } catch (err) {
        notes.push(`Skipped route ${route}: ${(err as Error).message}`);
      }
    }
    return t;
  });
  return {
    routes: routeTargets,
    stories: stories.map((s) => ({ ...s, path: storyIframePath(s.id), files: [], via: [] })),
    sourceFiles: [],
    unmapped: [],
    usedDefaults: false,
    notes,
  };
}
