/** A built HTML page, by its path inside the output folder ("guides/cli/index.html"). */
export interface BuiltPage {
  path: string;
  html: string;
}

const ORIGIN = 'http://docs.invalid';

/** URLs in href/src attributes of a, link, script, img and source elements. */
export function extractUrls(html: string): string[] {
  const out: string[] = [];
  const re = /<(a|link|script|img|source)\b[^>]*?\s(href|src)=("([^"]*)"|'([^']*)')/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push(decodeEntities(m[4] ?? m[5] ?? ''));
  return out;
}

/** Every id (and legacy a[name]) in the page, for anchor checks. */
export function extractIds(html: string): Set<string> {
  const ids = new Set<string>();
  const re = /\s(?:id|name)=("([^"]*)"|'([^']*)')/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) ids.add(decodeEntities(m[2] ?? m[3] ?? ''));
  return ids;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const normBase = (base: string) => `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

/** Page URL path for a built file: "guides/cli/index.html" + "/b/" -> "/b/guides/cli/". */
export function pageUrl(path: string, base: string): string {
  return normBase(base) + path.replace(/(^|\/)index\.html$/, '$1');
}

/**
 * Checks every internal link and anchor in a built site: the target page or asset must exist
 * under the base path, and `#fragment` must match an id on the target page. External links are
 * not fetched (no network).
 */
export function checkLinks(
  pages: readonly BuiltPage[],
  base: string,
  assetExists: (path: string) => boolean,
): string[] {
  const root = normBase(base);
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const ids = new Map<string, Set<string>>();
  const idsOf = (path: string) => {
    let set = ids.get(path);
    if (!set) {
      set = extractIds(byPath.get(path)?.html ?? '');
      ids.set(path, set);
    }
    return set;
  };
  const problems: string[] = [];
  for (const page of pages) {
    const here = new URL(pageUrl(page.path, base), ORIGIN);
    for (const raw of new Set(extractUrls(page.html))) {
      if (!raw || /^(mailto|tel|javascript|data):/i.test(raw)) continue;
      let url: URL;
      try {
        url = new URL(raw, here);
      } catch {
        problems.push(`${page.path}: invalid URL ${raw}`);
        continue;
      }
      if (url.origin !== ORIGIN) continue;
      const pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith(root)) {
        problems.push(`${page.path}: ${raw} is outside the base path ${root}`);
        continue;
      }
      let file = pathname.slice(root.length);
      if (file === '' || file.endsWith('/')) file += 'index.html';
      if (file.endsWith('.html')) {
        if (!byPath.has(file)) {
          problems.push(`${page.path}: broken link ${raw}`);
          continue;
        }
        const hash = decodeURIComponent(url.hash.slice(1));
        if (hash && !idsOf(file).has(hash))
          problems.push(`${page.path}: ${raw} points to a missing anchor #${hash}`);
      } else if (!assetExists(file)) {
        problems.push(`${page.path}: missing file ${raw}`);
      }
    }
  }
  return problems;
}
