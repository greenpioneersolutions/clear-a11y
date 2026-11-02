/**
 * Every page-derived string (messages, names, selectors, snippets, URLs) goes through
 * `escapeHtml` before it reaches the report. Page content is untrusted.
 */
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ENTITIES[c] as string);
}

/** Only http(s) URLs become links; anything else (javascript:, data:, file:) is shown as text. */
export function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A link when the URL is http(s), otherwise escaped text. */
export function linkOrText(url: string, text: string = url): string {
  const safe = safeHttpUrl(url);
  return safe ? `<a href="${escapeHtml(safe)}">${escapeHtml(text)}</a>` : escapeHtml(text);
}

/** A safe id fragment from arbitrary text. */
export function idFrom(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}
