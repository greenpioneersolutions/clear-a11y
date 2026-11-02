export interface CrawlOptions {
  /** Explicit targets. Crawling never leaves the origins of these URLs when sameOrigin is true. */
  start: readonly string[];
  maxPages: number;
  sameOrigin: boolean;
  /** Patterns a discovered URL must match (substring, or `*` wildcards). Empty = everything. */
  include: readonly string[];
  exclude: readonly string[];
}

/** Returns the links found on a page (absolute or relative to that page). */
export type LinkSource = (url: string) => Promise<string[]>;

const SKIP_EXT = /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3|woff2?|css|js|json|xml|ico)$/i;

/** Absolute http(s) URL without the fragment, or undefined for anything we should not visit. */
export function normalizeUrl(raw: string, base?: string): string | undefined {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    u.hash = '';
    return u.href;
  } catch {
    return undefined;
  }
}

export function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped);
}

export function isAllowed(
  url: string,
  options: CrawlOptions,
  origins: ReadonlySet<string>,
): boolean {
  const u = new URL(url);
  if (options.sameOrigin && !origins.has(u.origin)) return false;
  if (SKIP_EXT.test(u.pathname)) return false;
  if (options.include.length && !options.include.some((p) => patternToRegExp(p).test(url)))
    return false;
  return !options.exclude.some((p) => patternToRegExp(p).test(url));
}

/** Breadth-first discovery from the explicit targets. Targets themselves are always included. */
export async function crawl(options: CrawlOptions, links: LinkSource): Promise<string[]> {
  const start = options.start.map((s) => normalizeUrl(s)).filter((s): s is string => !!s);
  const origins = new Set(start.map((s) => new URL(s).origin));
  const seen = new Set<string>(start);
  const result: string[] = [];
  const queue = [...start];
  while (queue.length && result.length < options.maxPages) {
    const url = queue.shift() as string;
    result.push(url);
    if (result.length >= options.maxPages) break;
    let found: string[] = [];
    try {
      found = await links(url);
    } catch {
      continue;
    }
    for (const raw of found) {
      const next = normalizeUrl(raw, url);
      if (next && !seen.has(next) && isAllowed(next, options, origins)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return result;
}
