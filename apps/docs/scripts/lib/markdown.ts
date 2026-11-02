import { posix } from 'node:path';

export type FrontmatterValue = string | string[];

export interface ParsedMarkdown {
  data: Record<string, FrontmatterValue>;
  body: string;
}

const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2');

/**
 * Parses the small YAML subset our docs use in frontmatter: `key: value` and `key: [a, b]`.
 * Anything else is kept as a raw string.
 */
export function parseFrontmatter(source: string): ParsedMarkdown {
  const text = source.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, FrontmatterValue> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1] as string;
    const raw = (kv[2] ?? '').trim();
    const list = /^\[(.*)\]$/.exec(raw);
    data[key] = list
      ? (list[1] ?? '')
          .split(',')
          .map(unquote)
          .filter((v) => v.length > 0)
      : unquote(raw);
  }
  return { data, body: text.slice(match[0].length) };
}

/** Removes the first `# Title` heading (when it is the first content line) and returns it. */
export function extractTitle(body: string): { title?: string; body: string } {
  const lines = body.split('\n');
  const first = lines.findIndex((l) => l.trim().length > 0);
  const heading = first >= 0 ? /^#\s+(.+?)\s*#*\s*$/.exec(lines[first] ?? '') : null;
  if (!heading) return { body };
  lines.splice(first, 1);
  return { title: heading[1], body: lines.join('\n').replace(/^\s*\n/, '') };
}

/** Removes a paragraph that starts with `prefix` (for example the `**Rule:** ...` summary line). */
export function dropParagraphStartingWith(body: string, prefix: string): string {
  const paragraphs = body.split(/\n{2,}/);
  return paragraphs.filter((p) => !p.trimStart().startsWith(prefix)).join('\n\n');
}

const isExternal = (target: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');

/**
 * Rewrites relative Markdown link targets (`[text](../x.md#y)`, `![alt](img.png)`) outside code
 * fences and inline code. `resolve` gets the repo-relative path (POSIX, normalized) and the hash,
 * and returns the new target. External, root-relative and same-page (`#x`) links are untouched.
 */
export function rewriteLinks(
  body: string,
  fromPath: string,
  resolve: (repoPath: string, hash: string) => string,
): string {
  return mapProse(body, (text) =>
    text.replace(
      /\]\(\s*(<[^>]+>|[^)\s]+)(\s+"[^"]*")?\s*\)/g,
      (all, rawTarget: string, title: string | undefined) => {
        const target = rawTarget.replace(/^<|>$/g, '');
        if (isExternal(target) || target.startsWith('/') || target.startsWith('#')) return all;
        const hashAt = target.indexOf('#');
        const path = hashAt >= 0 ? target.slice(0, hashAt) : target;
        const hash = hashAt >= 0 ? target.slice(hashAt) : '';
        const repoPath = posix.normalize(posix.join(posix.dirname(fromPath), path));
        return `](${resolve(repoPath, hash)}${title ?? ''})`;
      },
    ),
  );
}

/** Applies `fn` to Markdown text outside fenced code blocks and inline code spans. */
export function mapProse(body: string, fn: (text: string) => string): string {
  let fence: string | undefined;
  return body
    .split('\n')
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (!fence) fence = marker[0] as string;
        else if (marker.startsWith(fence)) fence = undefined;
        return line;
      }
      if (fence) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((part) => (part.startsWith('`') ? part : fn(part)))
        .join('');
    })
    .join('\n');
}

/** A YAML-safe scalar (JSON strings are valid YAML double-quoted scalars). */
export const yamlString = (value: string) => JSON.stringify(value);

/** Escapes text for a Markdown table cell. */
export const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/**
 * Plain text for a Markdown table cell or list item: HTML-escaped (so "use <a href>" in a rule's
 * fix text shows as text instead of becoming a real link or button) and table-safe.
 */
export const prose = (value: string) =>
  cell(value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

/** Escapes text for HTML. */
export const html = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
