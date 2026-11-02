import { mapProse } from './markdown.ts';

/**
 * Prefixes the site's base path to root-relative links in generated Markdown, so the same content
 * works at "/" and under a GitHub Pages project path such as "/clear-a11y/". Starlight handles its
 * own navigation links; this covers links written inside pages. (Astro 7's default Markdown
 * processor doesn't run rehype plugins, so this happens at generation time.)
 */

/** "/guides/" + base "/clear-a11y/" -> "/clear-a11y/guides/". Other links are returned unchanged. */
export function withBase(link: string, base: string): string {
  if (!link.startsWith('/') || link.startsWith('//')) return link;
  const prefix = base.replace(/\/+$/, '');
  if (!prefix || link === prefix || link.startsWith(`${prefix}/`)) return link;
  return `${prefix}${link}`;
}

/** Applies {@link withBase} to Markdown link targets and HTML href attributes outside code. */
export function prefixRootLinks(body: string, base: string): string {
  if (!base.replace(/\/+$/, '')) return body;
  return mapProse(body, (text) =>
    text
      .replace(/\]\((\/[^)\s]*)/g, (_all, link: string) => `](${withBase(link, base)}`)
      .replace(/href="(\/[^"]*)"/g, (_all, link: string) => `href="${withBase(link, base)}"`),
  );
}
