import type { RuleMeta } from '@clear-a11y/core';
import { requiredStateFor } from '../lib/required-states.js';

export const stateMissingRule: RuleMeta = {
  id: 'at/state-missing',
  engine: 'engine-at',
  wcag: ['4.1.2'],
  tier: 'violation',
  title: 'Required widget state missing',
  description:
    'A custom widget does not expose the state that tells assistive technology which option is current. For tabs, no tab is marked aria-selected="true", so screen reader users hear every tab as "not selected" and cannot tell which panel they are looking at.',
  fix: 'Set aria-selected="true" on the active tab and aria-selected="false" on the others, and update both when the user switches tabs. Other roles need their own state: aria-checked for checkboxes and switches, aria-expanded for comboboxes.',
};

export type Attributes = Readonly<Record<string, string | null>>;

/** A widget and, for group states like "one tab is selected", the other members of its group. */
export interface StateMissingInput {
  role: string;
  attributes: Attributes;
  /** All members of the widget's group (e.g. every tab in the tablist), including itself. */
  group?: readonly Attributes[];
}

/**
 * Pure analysis for at/state-missing. Returns the missing state attribute, or undefined when
 * the widget exposes what its role needs. Tabs are checked as a group: one tab in the tablist
 * must be `aria-selected="true"` (tabs without the attribute are exposed as not selected).
 */
export function detectStateMissing(input: StateMissingInput): string | undefined {
  const required = requiredStateFor(input.role);
  if (!required) return undefined;
  if (input.role === 'tab') {
    const group = input.group?.length ? input.group : [input.attributes];
    return group.some((a) => a['aria-selected'] === 'true') ? undefined : 'aria-selected';
  }
  const has = required.attributes.some((a) => {
    const v = input.attributes[a];
    return v !== null && v !== undefined && v.trim() !== '';
  });
  return has ? undefined : required.attributes[0];
}
