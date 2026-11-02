import { AiOptionsSchema } from '@clear-a11y/ai';
import { TierSchema } from '@clear-a11y/core';
import { JOB_STATUSES, ScanJobPayloadSchema, type ScanJobPayload } from '@clear-a11y/queue';
import { z } from 'zod';
import type { ServerConfig } from '../config.js';

/** AI providers a request may pick on its own (nothing leaves the machine). */
const LOCAL_PROVIDERS = new Set(['none', 'mock']);
/** Remote providers a request may pick when it names an allowed key variable. */
const KEY_PROVIDERS = new Set(['anthropic', 'openai']);
/** `ai` keys that point the server at URLs or files it would otherwise never touch. */
const AI_KEYS_REFUSED = ['baseUrl', 'recordingsDir'];
const AiSectionSchema = AiOptionsSchema.strict();

type Policy = Pick<ServerConfig, 'maxTargets' | 'maxPages' | 'maxTimeoutMs' | 'aiKeyEnvs'>;

/**
 * The POST /scans body: the queue's `ScanJobPayload` (http(s) targets, a config validated by
 * core's ConfigSchema) plus this server's policy. Settings that would make the server read its
 * own files, write outside its data directory, crawl other origins or use secrets beyond the
 * operator's allowlist are refused. Target addresses are checked separately (SSRF guard).
 */
export function createScanRequestSchema(policy: Policy) {
  return ScanJobPayloadSchema.superRefine((body, ctx) => {
    const config = (body.config ?? {}) as Record<string, unknown> & {
      targets?: string[];
      auth?: { storageState?: string };
      output?: { dir?: string };
      crawl?: { maxPages?: number; sameOrigin?: boolean };
      timeoutMs?: number;
      viewports?: unknown[];
      ai?: Record<string, unknown>;
    };
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    const total = body.targets.length + (config.targets?.length ?? 0);
    if (total > policy.maxTargets) {
      issue(['targets'], `at most ${policy.maxTargets} targets per scan on this server`);
    }
    config.targets?.forEach((t, i) => {
      if (!ScanJobPayloadSchema.shape.targets.element.safeParse(t).success) {
        issue(['config', 'targets', i], 'must be an absolute http:// or https:// URL');
      }
    });
    if (config.auth?.storageState !== undefined) {
      issue(
        ['config', 'auth', 'storageState'],
        'is not accepted over the API (it names a file on the server)',
      );
    }
    if (config.output?.dir !== undefined) {
      issue(['config', 'output', 'dir'], 'is decided by the server');
    }
    if (config.crawl?.sameOrigin === false) {
      issue(['config', 'crawl', 'sameOrigin'], 'must stay true on the server');
    }
    if ((config.crawl?.maxPages ?? 0) > policy.maxPages) {
      issue(['config', 'crawl', 'maxPages'], `at most ${policy.maxPages} on this server`);
    }
    if ((config.timeoutMs ?? 0) > policy.maxTimeoutMs) {
      issue(['config', 'timeoutMs'], `at most ${policy.maxTimeoutMs} on this server`);
    }
    if ((config.viewports?.length ?? 0) > 5) {
      issue(['config', 'viewports'], 'at most 5 viewports');
    }

    const ai = config.ai;
    if (ai === undefined) return;
    for (const key of AI_KEYS_REFUSED) {
      if (key in ai) issue(['config', 'ai', key], 'is not accepted over the API');
    }
    const parsed = AiSectionSchema.safeParse(ai);
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        // Messages only; never the submitted values (a pasted key must not be echoed back).
        issue(
          ['config', 'ai', ...i.path.map((p) => (typeof p === 'symbol' ? String(p) : p))],
          i.message,
        );
      }
      return;
    }
    const provider = parsed.data.provider;
    if (LOCAL_PROVIDERS.has(provider)) return;
    if (!KEY_PROVIDERS.has(provider)) {
      issue(
        ['config', 'ai', 'provider'],
        `"${provider}" cannot be chosen over the API on this server`,
      );
      return;
    }
    if (!policy.aiKeyEnvs.length) {
      issue(
        ['config', 'ai', 'provider'],
        'AI providers are disabled on this server (CLEAR_A11Y_AI_KEY_ENVS is empty)',
      );
    } else if (!parsed.data.apiKeyEnv || !policy.aiKeyEnvs.includes(parsed.data.apiKeyEnv)) {
      issue(
        ['config', 'ai', 'apiKeyEnv'],
        `must name one of the variables this server allows: ${policy.aiKeyEnvs.join(', ')}`,
      );
    }
  });
}

export type ScanRequest = ScanJobPayload;

export const ListQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const FindingsQuerySchema = z.object({
  tier: TierSchema.optional(),
  wcag: z
    .string()
    .regex(/^\d\.\d{1,2}\.\d{1,2}$/, 'must be a success criterion like 1.4.3')
    .optional(),
});

export const ReportQuerySchema = z.object({
  format: z.enum(['html', 'sarif', 'json']).default('html'),
});

/** Job ids are UUIDs; anything else is a 404 (and never reaches the file system). */
export const isJobId = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
