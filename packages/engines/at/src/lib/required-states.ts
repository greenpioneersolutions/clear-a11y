/**
 * Which state a role must expose so assistive technology can report it (WAI-ARIA 1.2 required
 * states, plus `aria-selected` on tabs, which ARIA leaves optional but without which no tab is
 * ever announced as selected).
 */
export interface RequiredState {
  role: string;
  /** Attributes that satisfy the requirement (any one of them). */
  attributes: string[];
  /** axe-core's `aria-required-attr` already reports this, so engine-at skips it to avoid duplicates. */
  coveredByAxe: boolean;
}

export const REQUIRED_STATES: readonly RequiredState[] = [
  { role: 'checkbox', attributes: ['aria-checked'], coveredByAxe: true },
  { role: 'switch', attributes: ['aria-checked'], coveredByAxe: true },
  { role: 'menuitemcheckbox', attributes: ['aria-checked'], coveredByAxe: true },
  { role: 'menuitemradio', attributes: ['aria-checked'], coveredByAxe: true },
  { role: 'combobox', attributes: ['aria-expanded'], coveredByAxe: true },
  { role: 'slider', attributes: ['aria-valuenow'], coveredByAxe: true },
  { role: 'tab', attributes: ['aria-selected'], coveredByAxe: false },
];

export function requiredStateFor(role: string): RequiredState | undefined {
  return REQUIRED_STATES.find((r) => r.role === role);
}

/** Roles engine-at checks itself (the rest are left to axe). */
export const OWN_STATE_ROLES: readonly string[] = REQUIRED_STATES.filter(
  (r) => !r.coveredByAxe,
).map((r) => r.role);
