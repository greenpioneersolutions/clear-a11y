import { yamlString } from './markdown.ts';

/** One page the generator writes into `src/content/docs/`. */
export interface Page {
  /** Route without leading/trailing slash, e.g. "reference/rules/keyboard/keyboard-trap" ("" = home). */
  slug: string;
  title: string;
  description?: string;
  /** Extra frontmatter lines (already YAML), e.g. "template: splash". */
  frontmatter?: string[];
  /** Markdown body; internal links are root-relative ("/guides/mcp/"). */
  body: string;
}

/** Root-relative URL of a slug: "" -> "/", "a/b" -> "/a/b/". */
export const href = (slug: string, hash = '') => (slug ? `/${slug}/${hash}` : `/${hash}`);

/** File path (relative to the content dir) for a page. */
export const pageFile = (slug: string) => (slug ? `${slug}.md` : 'index.md');

export function renderPage(page: Page): string {
  const fm = [
    `title: ${yamlString(page.title)}`,
    ...(page.description ? [`description: ${yamlString(page.description)}`] : []),
    ...(page.frontmatter ?? []),
  ];
  return `---\n${fm.join('\n')}\n---\n\n${page.body.trim()}\n`;
}
