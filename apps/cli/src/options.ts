import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  TIERS,
  ViewportSchema,
  type ClearA11yConfigInput,
  type Tier,
  type Viewport,
} from '@clear-a11y/core';

const NAMED_VIEWPORTS: Record<string, Viewport> = {
  desktop: { name: 'desktop', width: 1280, height: 800 },
  mobile: { name: 'mobile', width: 375, height: 812 },
  reflow: { name: 'reflow', width: 320, height: 256 },
};

/** "desktop", "mobile", "reflow" or "1024x768". */
export function parseViewport(value: string): Viewport {
  const named = NAMED_VIEWPORTS[value];
  if (named) return named;
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(value);
  if (!m)
    throw new Error(`Unknown viewport "${value}". Use desktop, mobile, reflow or WIDTHxHEIGHT.`);
  return ViewportSchema.parse({ name: value, width: Number(m[1]), height: Number(m[2]) });
}

export function parseTier(value: string): Tier {
  if (!(TIERS as readonly string[]).includes(value))
    throw new Error(`--fail-on must be one of ${TIERS.join(', ')}`);
  return value as Tier;
}

export const parseList = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export interface ScanFlags {
  config?: string;
  out: string;
  format: string[];
  viewport?: string[];
  crawl?: boolean;
  maxPages?: number;
  engines?: string[];
  failOn?: Tier;
  screenshots: boolean;
  json?: boolean;
  trustRepoPlugins?: boolean;
  storybookUrl?: string;
  storybookStatic?: string;
  boot?: boolean;
  maxStories?: number;
}

export type ScanTarget = { kind: 'repo'; path: string } | { kind: 'site'; urls: string[] };

const isUrl = (value: string) => {
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/**
 * Decides what `scan` targets mean: one existing local directory is a source repo; otherwise every
 * target must be an http(s) (or file:) URL. Anything else is a usage error.
 */
export async function classifyTargets(targets: readonly string[]): Promise<ScanTarget> {
  const dirs: string[] = [];
  for (const t of targets) {
    const info = await stat(t).catch(() => undefined);
    if (info?.isDirectory()) dirs.push(t);
  }
  if (dirs.length) {
    if (targets.length > 1)
      throw new Error('Scan one repo directory at a time, and do not mix it with URLs.');
    return { kind: 'repo', path: resolve(dirs[0] as string) };
  }
  const bad = targets.filter((t) => !isUrl(t));
  if (bad.length)
    throw new Error(
      `"${bad[0]}" is neither an existing directory nor an http(s) URL. Pass a URL such as https://localhost:3000/ or the path to a source repo.`,
    );
  return { kind: 'site', urls: [...targets] };
}

/** Merges a config file (if any) with command-line flags. Flags win. */
export async function buildConfig(flags: ScanFlags): Promise<ClearA11yConfigInput> {
  const file: ClearA11yConfigInput = flags.config
    ? JSON.parse(await readFile(flags.config, 'utf-8'))
    : {};
  // Repo-scan flags go to the `repo` section (validated by @clear-a11y/repo).
  const repo: Record<string, unknown> = {
    ...(flags.trustRepoPlugins ? { trustRepoPlugins: true } : {}),
    ...(flags.storybookUrl ? { storybookUrl: flags.storybookUrl } : {}),
    ...(flags.storybookStatic ? { storybookStatic: flags.storybookStatic } : {}),
    ...(flags.boot ? { boot: true } : {}),
    ...(flags.maxStories ? { maxStories: flags.maxStories } : {}),
  };
  return {
    ...file,
    ...(flags.viewport?.length ? { viewports: flags.viewport.map(parseViewport) } : {}),
    crawl: {
      ...file.crawl,
      ...(flags.crawl ? { enabled: true } : {}),
      ...(flags.maxPages ? { maxPages: flags.maxPages } : {}),
    },
    output: {
      ...file.output,
      dir: flags.out,
      formats: flags.format as Array<'json' | 'sarif' | 'html'>,
      ...(flags.screenshots === false ? { screenshots: false } : {}),
    },
    ...(flags.failOn ? { failOn: flags.failOn } : {}),
    ...(Object.keys(repo).length ? { repo: { ...file.repo, ...repo } } : {}),
  };
}
