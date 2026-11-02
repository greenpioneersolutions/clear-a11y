import type { ScanResult } from '@clear-a11y/core';
import type { JobQueue, ScanJobPayload, ScanJobResult } from '@clear-a11y/queue';
import type { ScanOptions } from '@clear-a11y/runner';
import type { Lookup } from './security/ssrf.js';

/** Dependency-injection tokens. Explicit tokens (no reliance on emitted type metadata). */
export const SERVER_CONFIG = Symbol('SERVER_CONFIG');
export const JOB_QUEUE = Symbol('JOB_QUEUE');
export const SCAN_FN = Symbol('SCAN_FN');
export const RESULT_STORE = Symbol('RESULT_STORE');
export const DNS_LOOKUP = Symbol('DNS_LOOKUP');

export type ScanQueue = JobQueue<ScanJobPayload, ScanJobResult>;
export type ScanFn = (options: ScanOptions) => Promise<ScanResult>;
export type { Lookup };
