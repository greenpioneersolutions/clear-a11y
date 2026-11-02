import { z } from 'zod';
import { globToRegExp } from '../detect/files.js';

/**
 * Maps repo-relative source globs to the routes they render, for example
 * `{ "src/pages/checkout/**": ["/checkout"], "src/components/Header.tsx": ["/", "/about"] }`.
 * Routes are paths on the scanned site (resolved against the base URL), never other origins.
 */
export type RouteMap = Record<string, string[]>;

const RoutePath = z
  .string()
  .min(1)
  .refine((r) => r.startsWith('/') && !r.startsWith('//') && !/[\s\\]/.test(r), {
    message: 'must be a path on the scanned site that starts with "/" (for example "/checkout")',
  });

export const RouteMapSchema = z.record(
  z.string().min(1),
  z.union([RoutePath.transform((r) => [r]), z.array(RoutePath)]),
);

/** Validates a route map (a string value is accepted as a one-route list). Throws on bad input. */
export function parseRouteMap(input: unknown): RouteMap {
  const parsed = RouteMapSchema.safeParse(input ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at "${issue.path.join('.')}"` : '';
    throw new Error(`Invalid route map${where}: ${issue?.message ?? 'expected an object'}`);
  }
  return parsed.data;
}

/** True for a site path we accept as a route: "/x", not "//host", no whitespace or backslashes. */
export const isRoutePath = (route: string): boolean => RoutePath.safeParse(route).success;

/** Routes whose glob matches `file` (repo-relative POSIX path), in map order, without duplicates. */
export function routesForFile(file: string, map: RouteMap): string[] {
  const routes = new Set<string>();
  for (const [glob, list] of Object.entries(map)) {
    if (globToRegExp(stripDotSlash(glob)).test(file)) for (const r of list) routes.add(r);
  }
  return [...routes];
}

export const stripDotSlash = (p: string): string => p.replace(/\\/g, '/').replace(/^(\.\/)+/, '');

const NEXT_PAGE_EXT = /\.(tsx|jsx|ts|js|mdx)$/;
const APP_SPECIAL = /^(page|layout|template|loading|error|not-found|default)$/;

/** Result of mapping a file with the Next.js routing conventions. */
export interface NextRoute {
  route?: string;
  /** Why no route could be derived (dynamic segment, API route...). */
  skipped?: string;
}

/**
 * Next.js file conventions, for repos where Next.js is detected:
 * - App Router: `app/**\/page.tsx` is the route of its folder; `layout`, `template`, `loading`,
 *   `error` and `not-found` files affect the route of their folder. Route groups `(group)` are
 *   dropped; parallel slots `@slot` and intercepted routes `(.)x` are skipped.
 * - Pages Router: `pages/**\/x.tsx` is `/x`, `index` is its folder; `_app`, `_document`, `_error`
 *   and `pages/api/**` are not pages.
 * Folders may sit under `src/` and inside a workspace package (`apps/web/app/...`).
 * Dynamic segments (`[id]`, `[...slug]`) can't be turned into a URL without data, so they are
 * skipped with a reason; list them in the route map instead.
 * Returns undefined when the file is not under an `app/` or `pages/` folder.
 */
export function nextRouteForFile(file: string): NextRoute | undefined {
  if (!NEXT_PAGE_EXT.test(file)) return undefined;
  const parts = file.split('/');
  const routerAt = parts.findIndex(
    (p, i) => (p === 'app' || p === 'pages') && (i === 0 || parts[i - 1] !== 'node_modules'),
  );
  if (routerAt < 0) return undefined;
  const kind = parts[routerAt] as 'app' | 'pages';
  const rest = parts.slice(routerAt + 1);
  const name = (rest.pop() ?? '').replace(NEXT_PAGE_EXT, '');

  if (kind === 'app') {
    if (!APP_SPECIAL.test(name)) return undefined;
    const segments: string[] = [];
    for (const seg of rest) {
      if (/^\(\.{1,3}\)/.test(seg)) return { skipped: 'intercepted route' };
      if (seg.startsWith('@')) return { skipped: 'parallel route slot' };
      if (seg.startsWith('_')) return undefined; // private folder
      if (/^\(.+\)$/.test(seg)) continue; // route group
      if (seg.includes('[')) return { skipped: 'dynamic route segment' };
      segments.push(seg);
    }
    return { route: '/' + segments.join('/') };
  }

  if (rest[0] === 'api') return { skipped: 'API route' };
  if (rest.length === 0 && /^_(app|document|error)$/.test(name)) return { skipped: 'not a page' };
  const segments = [...rest, ...(name === 'index' ? [] : [name])];
  if (segments.some((s) => s.includes('['))) return { skipped: 'dynamic route segment' };
  return { route: '/' + segments.join('/') };
}

/**
 * Resolves a route against the base URL, keeping the base path: base `https://x.dev/app/` and
 * route `/checkout` give `https://x.dev/app/checkout`. Throws when the result leaves the base
 * origin, so a route map edited in a pull request can't point the scanner at another host.
 */
export function resolveRoute(baseUrl: string, route: string): string {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol))
    throw new Error(`Base URL must be http(s): ${baseUrl}`);
  if (!isRoutePath(route)) throw new Error(`Route must be a path starting with "/": ${route}`);
  const url = new URL(base.pathname.replace(/\/+$/, '') + route, base.origin);
  if (url.origin !== base.origin) throw new Error(`Route leaves the base URL origin: ${route}`);
  return url.href;
}
