import { ConfigSchema, type ClearA11yConfigInput, type ScanResult } from '@clear-a11y/core';
import { z } from 'zod';

export const MAX_PAYLOAD_TARGETS = 100;
export const MAX_URL_LENGTH = 2048;

/** An absolute http(s) URL. `file:`, `javascript:`, `data:` and the rest are rejected. */
export const HttpUrlSchema = z
  .string()
  .max(MAX_URL_LENGTH)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
    } catch {
      return false;
    }
  }, 'must be an absolute http:// or https:// URL');

/** Core's config schema, rejecting unknown top-level keys instead of silently dropping them. */
const StrictConfigSchema = ConfigSchema.strict();

/**
 * A scan job: what to scan and how. Plain JSON, so it can sit in SQLite or Redis. Defined here
 * rather than imported from the runner because `queue` (data-access) may only depend on `core`.
 * `config` is the same shape as `clear-a11y.config.json`, validated by core's `ConfigSchema` and
 * stored as given (defaults are applied by the runner).
 */
export const ScanJobPayloadSchema = z.strictObject({
  targets: z.array(HttpUrlSchema).min(1).max(MAX_PAYLOAD_TARGETS),
  config: z
    .record(z.string(), z.unknown())
    .superRefine((value, ctx) => {
      const parsed = StrictConfigSchema.safeParse(value);
      if (parsed.success) return;
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
      }
    })
    .optional(),
  /** Free text shown in job lists. */
  label: z.string().max(200).optional(),
});

export type ScanJobPayload = Omit<z.infer<typeof ScanJobPayloadSchema>, 'config'> & {
  config?: ClearA11yConfigInput;
};

export function parseScanJobPayload(input: unknown): ScanJobPayload {
  return ScanJobPayloadSchema.parse(input) as ScanJobPayload;
}

/** What a scan job stores as its result: a small summary; the full `ScanResult` lives elsewhere. */
export interface ScanJobResult {
  /** Where the full canonical JSON report is stored (implementation-defined, e.g. a file path). */
  resultRef: string;
  summary: ScanResult['summary'];
  pages: number;
  errors: number;
}
