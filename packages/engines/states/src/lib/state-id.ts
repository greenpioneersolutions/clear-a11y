import type { StateKind } from './descriptor.js';

/** Slug safe for ids and file names: letters, digits, `-` and `_`, at most 40 chars. */
export function slug(text: string): string {
  return text
    .trim()
    .replace(/^#/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
}

/**
 * Stable state id from its kind and the thing it opens, e.g. `dialog:open#settings-dialog`,
 * `form-invalid#signup`. Same input always gives the same id.
 */
export function stateId(kind: StateKind, target: string): string {
  const t = slug(target) || kind;
  return kind === 'form-empty' || kind === 'form-invalid' ? `${kind}#${t}` : `${kind}:open#${t}`;
}

/** Appends `-2`, `-3`, ... until the id is not in `taken`. */
export function uniqueId(id: string, taken: ReadonlySet<string>): string {
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) if (!taken.has(`${id}-${n}`)) return `${id}-${n}`;
}
