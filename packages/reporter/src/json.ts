import { ScanResultSchema, type ScanResult } from '@clear-a11y/core';

/** Canonical JSON report. Stable key order comes from the schema-validated object. */
export function toJson(result: ScanResult): string {
  return JSON.stringify(ScanResultSchema.parse(result), null, 2) + '\n';
}

export function parseScanResult(json: string): ScanResult {
  return ScanResultSchema.parse(JSON.parse(json));
}
