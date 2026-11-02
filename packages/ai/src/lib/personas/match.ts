import type { StepHint } from './config.js';

export const normalizeName = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The name part of a hint, as plain data that can also be sent into the page. */
export interface NameQuery {
  name?: string;
  namePattern?: string;
}

/** Case-insensitive: `name` is a substring of the accessible name, `namePattern` a regex. */
export function nameMatches(name: string, q: NameQuery): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  if (q.name && !n.includes(normalizeName(q.name))) return false;
  if (q.namePattern && !new RegExp(q.namePattern, 'i').test(n)) return false;
  return Boolean(q.name || q.namePattern);
}

/** Roles a screen reader announces the same way for the purpose of finding a control. */
const ROLE_GROUPS: readonly (readonly string[])[] = [
  ['textbox', 'searchbox'],
  ['checkbox', 'switch'],
  ['button', 'togglebutton'],
  ['combobox', 'listbox'],
];

export function rolesMatch(actual: string, wanted: string): boolean {
  const a = actual.toLowerCase();
  const w = wanted.toLowerCase();
  return a === w || ROLE_GROUPS.some((g) => g.includes(a) && g.includes(w));
}

/** How a hint reads in messages: `button "Pay now"`. */
export function describeHint(h: Pick<StepHint, 'role' | 'name' | 'namePattern'>): string {
  const name = h.name ?? `/${h.namePattern}/i`;
  return h.role ? `${h.role} "${name}"` : `"${name}"`;
}

/** Roles a keyboard user toggles with Space rather than Enter. */
export const SPACE_FIRST_ROLES = new Set(['checkbox', 'radio', 'switch']);
