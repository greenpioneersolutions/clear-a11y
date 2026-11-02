/**
 * Markdown escaping for page-derived text (messages, selectors, page URLs, questions, file names).
 * Page content is untrusted: it must not be able to add HTML, links, images, headings, table
 * cells or @-mentions to a job summary or PR comment.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/** ASCII punctuation with a meaning in (GitHub-flavoured) Markdown; CommonMark lets us backslash it. */
const MD_PUNCTUATION = /[\\`*_{}[\]()#+\-.!|~:=$]/g;

/** Zero-width space: breaks @-mentions and #123 references without changing what people read. */
const ZWSP = '\u200B';

/** Collapses whitespace (newlines would end a table row or start a block) and trims. */
const oneLine = (value: string) =>
  value
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Shortens to `max` characters with an ellipsis. */
export function truncate(value: string, max: number): string {
  const chars = [...value];
  return chars.length > max ? `${chars.slice(0, Math.max(1, max - 1)).join('')}…` : value;
}

/**
 * Escapes text for inline Markdown and table cells: one line, HTML special characters as
 * entities, Markdown punctuation backslash-escaped, `@` and `#` followed by a zero-width space.
 */
export function escapeMarkdown(value: unknown, max = 300): string {
  return truncate(oneLine(String(value ?? '')), max)
    .replace(/[&<>"]/g, (c) => HTML_ENTITIES[c] as string)
    .replace(MD_PUNCTUATION, (c) => `\\${c}`)
    .replace(/[@#]/g, (c) => `${c}${ZWSP}`);
}

/**
 * Inline code for page-derived text such as selectors: a backtick fence longer than any run of
 * backticks inside, and `|` escaped so the value can't split a table cell (GitHub applies the
 * table split before code spans).
 */
export function markdownCode(value: unknown, max = 120, inTable = true): string {
  const line = truncate(oneLine(String(value ?? '')), max);
  const text = inTable ? line.replace(/\|/g, '\\|') : line;
  if (!text) return '';
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** A Markdown link only for http(s) URLs we generate (W3C docs); the label is escaped. */
export function markdownLink(label: string, url: string): string {
  let safe: string | undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safe = parsed.href;
  } catch {
    safe = undefined;
  }
  const text = escapeMarkdown(label);
  return safe ? `[${text}](${safe.replace(/[()<>\s]/g, encodeURIComponent)})` : text;
}
