import type { RuleMeta } from '@clear-a11y/core';

export const linkTextGenericRule: RuleMeta = {
  id: 'at/link-text-generic',
  engine: 'engine-at',
  wcag: ['2.4.4'],
  tier: 'likely',
  title: 'Same generic link text for different destinations',
  description:
    'Several links have the same generic text ("Click here", "Read more", "More") but go to different places, and nothing in their sentence, list item, heading or description tells them apart. Screen reader users who list or tab through links hear the same words several times and cannot tell where each one goes.',
  fix: 'Make each link text say where it goes ("Accessibility testing guide"), or give each link distinguishing context in the same sentence, list item or table cell, or an aria-describedby description.',
};

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
]);

export const normalizeLinkText = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export interface LinkInfo {
  selector: string;
  /** Accessible name (aria-labelledby, aria-label, text, img alt, title). */
  name: string;
  /** Resolved destination. */
  href: string;
  /** Text of the enclosing sentence container (p, li, td...) other than the link itself. */
  blockText: string;
  /** Nearest heading before the link. */
  heading: string;
  /** aria-describedby text. */
  description: string;
}

export interface GenericLinkGroup {
  name: string;
  links: LinkInfo[];
  hrefs: string[];
}

/**
 * Pure analysis for at/link-text-generic. Links with a generic name are grouped by name plus
 * their programmatically determined context (the rest of their sentence container, or else the
 * heading above them). A group whose links go to two or more destinations can't be told apart.
 * Links with an aria-describedby description are left out: they have extra context.
 */
export function findGenericLinkGroups(links: readonly LinkInfo[]): GenericLinkGroup[] {
  const groups = new Map<string, GenericLinkGroup>();
  for (const link of links) {
    const name = normalizeLinkText(link.name);
    if (!GENERIC_LINK_TEXT.has(name) || link.description.trim()) continue;
    const block = normalizeLinkText(link.blockText);
    const context = block ? `block:${block}` : `heading:${normalizeLinkText(link.heading)}`;
    const key = `${name}|${context}`;
    const group = groups.get(key) ?? { name, links: [], hrefs: [] };
    group.links.push(link);
    if (!group.hrefs.includes(link.href)) group.hrefs.push(link.href);
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.hrefs.length >= 2);
}

/** True when the link is part of an ambiguous generic-text group. */
export function detectLinkTextGeneric(link: LinkInfo, all: readonly LinkInfo[]): boolean {
  return findGenericLinkGroups(all).some((g) => g.links.includes(link));
}
