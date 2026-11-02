import type { ExpectedIssue, Finding } from '@clear-a11y/core';

/** Fixture page path ("keyboard/trap.html") for a finding URL, relative to the fixture base URL. */
export function pagePathOf(url: string, baseUrl: string): string {
  const u = new URL(url);
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const path =
    u.origin === base.origin && u.pathname.startsWith(base.pathname)
      ? u.pathname.slice(base.pathname.length)
      : u.pathname.replace(/^\//, '');
  return decodeURIComponent(path || 'index.html');
}

const norm = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*>\s*/g, ' > ');

/** True when `needle` appears in `hay` as a whole compound (not as the prefix of a longer id or class). */
function containsCompound(hay: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = i === 0 ? ' ' : hay.charAt(i - 1);
    const after = hay.charAt(i + needle.length);
    const okBefore = /[\s>+~,(]/.test(before) || i === 0 || /^[#.[:]/.test(needle);
    const okAfter = after === '' || /[\s>+~,.[:#)]/.test(after);
    if (okBefore && okAfter) return true;
    from = i + 1;
  }
}

/**
 * Selector equivalence for benchmark matching. The expected selector may list alternatives
 * separated by " | " and may be "*" (any element on the page).
 */
export function selectorsMatch(found: string, expected: string): boolean {
  const f = norm(found);
  return expected
    .split(' | ')
    .map(norm)
    .some((e) => e === '*' || e === f || containsCompound(f, e) || containsCompound(e, f));
}

export function findingMatchesIssue(finding: Finding, issue: ExpectedIssue): boolean {
  if (!finding.wcag.some((sc) => issue.wcag.includes(sc))) return false;
  if (issue.state && !finding.page.state.includes(issue.state)) return false;
  return selectorsMatch(finding.target.selector, issue.selector);
}
