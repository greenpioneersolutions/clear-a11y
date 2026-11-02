import { VIEW_IDS, type ViewId } from '../shared/api-types.js';

export interface Route {
  view: ViewId;
  /** Scan shown by the report, focus path and review views. */
  scanId?: string;
}

export const VIEW_TITLES: Record<ViewId, string> = {
  targets: 'Targets',
  scans: 'Scans',
  report: 'Report',
  focus: 'Focus path',
  review: 'Review questions',
  settings: 'Settings',
};

const SCAN_ID = /^[0-9a-f-]{36}$/i;

/** `#/report/<scanId>` -> { view: 'report', scanId }. Unknown hashes go to Targets. */
export function parseHash(hash: string): Route {
  const [view, scanId] = hash.replace(/^#\/?/, '').split('/');
  const known = (VIEW_IDS as readonly string[]).includes(view ?? '');
  const route: Route = { view: known ? (view as ViewId) : 'targets' };
  if (scanId && SCAN_ID.test(scanId)) route.scanId = scanId;
  return route;
}

/**
 * The route for a location: the hash when there is one (in-app navigation), otherwise
 * `?view=<view>&scan=<id>` (deep links that load without a fragment).
 */
export function parseLocation(loc: Pick<Location, 'hash' | 'search'>): Route {
  if (loc.hash && loc.hash !== '#') return parseHash(loc.hash);
  const q = new URLSearchParams(loc.search);
  const view = q.get('view');
  const scan = q.get('scan');
  return parseHash(view ? `#/${view}${scan ? `/${scan}` : ''}` : '');
}

export function hrefFor(route: Route): string {
  return `#/${route.view}${route.scanId ? `/${route.scanId}` : ''}`;
}

export function navigate(route: Route): void {
  const href = hrefFor(route);
  if (window.location.hash !== href) window.location.hash = href;
}
