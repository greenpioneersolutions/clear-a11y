import { ensureToolkit } from './page-toolkit.js';
import { isDefaultState, quote, type Judge } from './types.js';

/** Link texts that say nothing about the destination on their own. */
export const GENERIC_LINK_TEXT = new Set([
  'click here',
  'click',
  'here',
  'read more',
  'more',
  'learn more',
  'more info',
  'more information',
  'details',
  'link',
  'this link',
  'continue',
  'go',
  'this',
  'info',
  'see more',
  'view more',
  'find out more',
  'view',
  'download',
  'start',
]);

export const normalizeLinkText = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function isGenericLinkText(text: string): boolean {
  const n = normalizeLinkText(text);
  return n === '' ? false : GENERIC_LINK_TEXT.has(n);
}

const looksLikeUrl = (s: string) => /^(https?:\/\/|www\.)\S+$/i.test(s.trim());

export interface RawLink {
  selector: string;
  text: string;
  href: string;
  context: string;
  heading: string;
  describedBy: string;
  title: string;
  html: string;
}

/**
 * Links worth asking about: generic text, URL text, one- or two-character text, or the same
 * text as another link that goes somewhere else. Sorted with the most suspicious first.
 */
export function pickLinkCandidates(links: readonly RawLink[], limit: number) {
  const hrefsByText = new Map<string, Set<string>>();
  for (const l of links) {
    const key = normalizeLinkText(l.text);
    if (!key) continue;
    hrefsByText.set(key, (hrefsByText.get(key) ?? new Set()).add(l.href));
  }
  const scored = links
    .map((l) => {
      const key = normalizeLinkText(l.text);
      const sameTextOtherHrefs = Math.max(0, (hrefsByText.get(key)?.size ?? 1) - 1);
      const score =
        (isGenericLinkText(l.text) ? 4 : 0) +
        (looksLikeUrl(l.text) ? 2 : 0) +
        (key.length > 0 && key.length <= 2 ? 2 : 0) +
        (sameTextOtherHrefs > 0 ? 3 : 0);
      return { link: l, score, sameTextOtherHrefs };
    })
    .filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Path + hash of a link, relative to the page origin. Query strings are dropped (may hold tokens). */
export function hrefForModel(href: string, pageUrl: string): string {
  try {
    const u = new URL(href, pageUrl);
    const page = new URL(pageUrl);
    return u.origin === page.origin ? `${u.pathname}${u.hash}` : `${u.origin}${u.pathname}`;
  } catch {
    return '';
  }
}

export const linkPurposeJudge: Judge = {
  id: 'link-purpose',
  wcag: ['2.4.4'],
  title: 'Link purpose is unclear in context',
  promptVersion: 1,
  fix: 'Make the link text say where it goes ("Download the 2025 annual report"), or add the missing context to the same sentence, list item or an aria-describedby description.',
  runsIn: isDefaultState,
  async select(ctx, { limit }) {
    await ensureToolkit(ctx.page);
    const links = await ctx.page.evaluate((): RawLink[] => {
      const h = window.__clearA11y!;
      const t = window.__clearA11yAi!;
      return Array.from(document.querySelectorAll('a[href], [role=link]'))
        .filter((el) => h.isVisible(el) && !t.hidden(el))
        .slice(0, 500)
        .map((el) => ({
          selector: h.selector(el),
          text: t.name(el),
          href: (el as HTMLAnchorElement).href ?? el.getAttribute('href') ?? '',
          context: t.block(el),
          heading: t.headingBefore(el),
          describedBy: t.describedBy(el),
          title: t.clean(el.getAttribute('title'), 120),
          html: h.snippet(el),
        }));
    });
    const pageTitle = links.length ? await ctx.page.title().catch(() => '') : '';
    return pickLinkCandidates(links, limit).map(({ link, sameTextOtherHrefs }) => ({
      selector: link.selector,
      role: 'link',
      name: link.text,
      html: link.html,
      input: {
        linkText: link.text,
        destination: hrefForModel(link.href, ctx.url),
        context: link.context === link.text ? '' : link.context,
        heading: link.heading,
        describedBy: link.describedBy,
        title: link.title,
        otherLinksWithSameTextToDifferentPlaces: sameTextOtherHrefs,
        pageTitle,
      },
    }));
  },
  subject: () => 'This link',
  failMessage: (c, v) =>
    `The purpose of the link ${quote(c.input['linkText'])} can't be determined from its text and context: ${v.reason} Screen reader users who list links hear only the link text.`,
  question: (c) =>
    `Can someone tell where the link ${quote(c.input['linkText'])} goes from its text and its surrounding sentence, list item or heading?`,
};
