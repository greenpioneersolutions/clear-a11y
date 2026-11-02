import { ensureHelpers, type PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { altTextSuspicion, altTextSuspiciousRule } from '../rules/alt-text-suspicious.js';
import {
  findGenericLinkGroups,
  linkTextGenericRule,
  type LinkInfo,
} from '../rules/link-text-generic.js';
import { atFinding, quote } from './findings.js';

/** Max elements read per check, so huge pages stay fast. */
const MAX_ELEMENTS = 300;

interface RawImage {
  selector: string;
  alt: string;
  src: string;
  html: string;
}

const SUSPICION_TEXT = {
  'file-name': 'a file name',
  url: 'a URL',
  placeholder: 'a placeholder word',
} as const;

/**
 * Deterministic text-alternative and link-text checks. These are the patterns code can decide
 * on its own; the open-ended judgment ("is this alt text meaningful?") belongs to the AI layer.
 */
export async function runContentChecks(ctx: PageContext): Promise<Finding[]> {
  await ensureHelpers(ctx.page);
  const findings: Finding[] = [];

  // at/alt-text-suspicious
  const images = await ctx.page.evaluate((max: number): RawImage[] => {
    const h = window.__clearA11y!;
    return Array.from(
      document.querySelectorAll('img[alt], input[type=image][alt], [role=img][aria-label]'),
    )
      .filter((el) => h.isVisible(el) && !el.closest('[aria-hidden=true], [inert]'))
      .slice(0, max)
      .map((el) => ({
        selector: h.selector(el),
        alt: el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? '',
        src: el.getAttribute('src') ?? '',
        html: h.snippet(el),
      }));
  }, MAX_ELEMENTS);
  for (const img of images) {
    const why = altTextSuspicion(img);
    if (!why) continue;
    findings.push(
      atFinding(ctx, altTextSuspiciousRule, {
        selector: img.selector,
        role: 'img',
        name: img.alt,
        confidence: why === 'placeholder' ? 0.8 : 0.9,
        message: `The alt text ${quote(img.alt)} is ${SUSPICION_TEXT[why]}, not a description. Screen reader users hear it instead of learning what the image shows.`,
        evidence: { html: img.html, data: { alt: img.alt, reason: why } },
      }),
    );
  }

  // at/link-text-generic
  const links = await ctx.page.evaluate((max: number): LinkInfo[] => {
    const h = window.__clearA11y!;
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const byIds = (ids: string | null) =>
      clean(
        (ids ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' '),
      );
    const nameOf = (el: Element) =>
      byIds(el.getAttribute('aria-labelledby')) ||
      clean(el.getAttribute('aria-label')) ||
      clean(
        `${(el as HTMLElement).innerText ?? ''} ${Array.from(el.querySelectorAll('img[alt]'))
          .map((i) => i.getAttribute('alt'))
          .join(' ')}`,
      ) ||
      clean(el.getAttribute('title'));
    const headings = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]'),
    );
    const headingBefore = (el: Element) => {
      let found = '';
      for (const hd of headings) {
        if (hd.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          found = clean((hd as HTMLElement).innerText);
        }
      }
      return found;
    };
    return Array.from(document.querySelectorAll('a[href], [role=link]'))
      .filter((el) => h.isVisible(el) && !el.closest('[aria-hidden=true], [inert]'))
      .slice(0, max)
      .map((el) => {
        const name = nameOf(el);
        const block = el.closest(
          'p, li, td, th, dd, dt, figcaption, caption, [role=listitem], [role=cell]',
        );
        const blockText = block
          ? clean((block as HTMLElement).innerText).replace(
              clean((el as HTMLElement).innerText),
              '',
            )
          : '';
        return {
          selector: h.selector(el),
          name,
          href: (el as HTMLAnchorElement).href ?? el.getAttribute('href') ?? '',
          blockText: clean(blockText),
          heading: headingBefore(el),
          description: byIds(el.getAttribute('aria-describedby')),
        };
      });
  }, MAX_ELEMENTS);
  for (const group of findGenericLinkGroups(links)) {
    for (const link of group.links) {
      findings.push(
        atFinding(ctx, linkTextGenericRule, {
          selector: link.selector,
          role: 'link',
          name: link.name,
          confidence: 0.85,
          message: `${group.links.length} links are all named ${quote(link.name)} but go to ${group.hrefs.length} different places, and nothing around them tells them apart. Screen reader users listing the links hear the same words each time.`,
          evidence: {
            data: {
              linkText: link.name,
              destinations: group.hrefs,
              context: link.blockText || link.heading,
              links: group.links.map((l) => l.selector),
            },
          },
        }),
      );
    }
  }
  return findings;
}
