import { stableHash } from '@clear-a11y/core';

/** Trims and collapses whitespace in every string, recursively. */
export function normalizeInput(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (Array.isArray(value)) return value.map(normalizeInput);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, normalizeInput(v)]),
    );
  }
  return value;
}

/** JSON with sorted object keys, so equal inputs always serialize identically. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Stable key for a judge input: recordings stay valid across runs and machines. */
export function recordingKey(judge: string, input: Record<string, unknown>): string {
  return stableHash(`${judge}|${stableStringify(normalizeInput(input))}`);
}
