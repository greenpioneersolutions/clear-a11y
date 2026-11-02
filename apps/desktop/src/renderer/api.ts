import type { ClearA11yApi } from '../shared/api-types.js';

declare global {
  interface Window {
    clearA11y?: ClearA11yApi;
  }
}

/** The preload bridge. The renderer talks to nothing else. */
export function getApi(): ClearA11yApi | undefined {
  return window.clearA11y;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "1 finding", "2 findings". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const TIER_LABEL = {
  violation: 'Violation',
  likely: 'Likely issue',
  'needs-review': 'Needs review',
} as const;

export const TIER_PLURAL = {
  violation: 'Violations',
  likely: 'Likely issues',
  'needs-review': 'Needs review',
} as const;

/** What each tier means, in plain words. */
export const TIER_MEANING = {
  violation: 'Measured failures with high certainty.',
  likely: 'Strong signals with a small chance of being wrong.',
  'needs-review': 'A person has to decide. Answer these in Review questions.',
} as const;

export const STATUS_LABEL = {
  queued: 'Waiting',
  running: 'Scanning',
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;
