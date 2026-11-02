import {
  detectLinkTextGeneric,
  findGenericLinkGroups,
  linkTextGenericRule,
  type LinkInfo,
} from './link-text-generic.js';

const link = (
  selector: string,
  name: string,
  href: string,
  extra: Partial<LinkInfo> = {},
): LinkInfo => ({
  selector,
  name,
  href,
  blockText: '',
  heading: 'Resources',
  description: '',
  ...extra,
});

describe('at/link-text-generic', () => {
  it('has rule metadata', () => {
    expect(linkTextGenericRule.id).toBe('at/link-text-generic');
    expect(linkTextGenericRule.wcag).toEqual(['2.4.4']);
    expect(linkTextGenericRule.tier).toBe('likely');
  });

  it('detects identical generic links to different places with the same context', () => {
    const links = [
      link('#link-1', 'Click here', '/guide'),
      link('#link-2', 'Click here', '/checklist'),
      link('#link-3', 'Click here', '/webinar'),
    ];
    const [group] = findGenericLinkGroups(links);
    expect(group!.links.map((l) => l.selector)).toEqual(['#link-1', '#link-2', '#link-3']);
    expect(detectLinkTextGeneric(links[0]!, links)).toBe(true);
  });

  it('normalizes case and punctuation', () => {
    const links = [link('#a', 'Read more…', '/a'), link('#b', 'read more', '/b')];
    expect(findGenericLinkGroups(links)).toHaveLength(1);
  });

  it('does not flag the correct pattern', () => {
    // Different headings above each "Read more" (cards).
    expect(
      findGenericLinkGroups([
        link('#a', 'Read more', '/a', { heading: 'Shipping' }),
        link('#b', 'Read more', '/b', { heading: 'Returns' }),
      ]),
    ).toEqual([]);
    // Context in the same list item.
    expect(
      findGenericLinkGroups([
        link('#a', 'Read more', '/a', { blockText: 'Shipping policy:' }),
        link('#b', 'Read more', '/b', { blockText: 'Returns policy:' }),
      ]),
    ).toEqual([]);
    // Same destination twice is not ambiguous.
    expect(findGenericLinkGroups([link('#a', 'Here', '/a'), link('#b', 'Here', '/a')])).toEqual([]);
    // aria-describedby adds context; aria-label makes the name specific.
    expect(
      findGenericLinkGroups([
        link('#a', 'Read more', '/a', { description: 'Shipping policy' }),
        link('#b', 'Read more', '/b', { description: 'Returns policy' }),
        link('#c', 'Read more about shipping', '/c'),
        link('#d', 'Read more about returns', '/d'),
      ]),
    ).toEqual([]);
    // A single generic link.
    expect(findGenericLinkGroups([link('#a', 'Click here', '/a')])).toEqual([]);
  });
});
