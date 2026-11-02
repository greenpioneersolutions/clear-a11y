import { z } from 'zod';
import type { InvokeChannel } from './channels.js';

/**
 * Zod schemas for every IPC payload. Main validates each call against these before doing
 * anything: the renderer is treated as untrusted (it renders scan data that came from websites).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const IdSchema = z.string().regex(UUID, 'must be an id');
export const EnvNameSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be an environment variable name like MY_API_KEY');
export const TierSchema = z.enum(['violation', 'likely', 'needs-review']);
export const ProviderIdSchema = z.enum(['none', 'anthropic', 'openai', 'azure', 'ollama']);

const NoPayload = z.undefined();

export const TargetInputSchema = z.strictObject({
  kind: z.enum(['url', 'repo']),
  value: z.string().trim().min(1).max(4096),
  label: z.string().trim().max(200).optional(),
});

const HttpUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
    } catch {
      return false;
    }
  }, 'must be an absolute http:// or https:// URL');

export const AiSettingsSchema = z.strictObject({
  provider: ProviderIdSchema.default('none'),
  model: z.string().trim().min(1).max(200).optional(),
  apiKeyEnv: EnvNameSchema.optional(),
  baseUrl: HttpUrl.optional(),
});

export const SettingsSchema = z.strictObject({
  ai: AiSettingsSchema.prefault({}),
  scan: z
    .strictObject({
      crawl: z.boolean().default(false),
      maxPages: z.number().int().min(1).max(200).default(10),
    })
    .prefault({}),
  browsers: z
    .strictObject({
      path: z.string().min(1).max(4096).optional(),
    })
    .prefault({}),
});

export const SettingsPatchSchema = z.strictObject({
  ai: AiSettingsSchema.optional(),
  scan: z
    .strictObject({
      crawl: z.boolean().optional(),
      maxPages: z.number().int().min(1).max(200).optional(),
    })
    .optional(),
  browsers: z.strictObject({ path: z.string().min(1).max(4096).nullable().optional() }).optional(),
});

export const ReviewAnswerSchema = z.strictObject({
  scanId: IdSchema,
  findingId: z.string().min(1).max(128),
  answer: z.enum(['yes', 'no', 'skip']),
  note: z.string().max(2000).optional(),
});

export const IPC_SCHEMAS = {
  'app:info': NoPayload,
  'targets:list': NoPayload,
  'targets:add': TargetInputSchema,
  'targets:remove': z.strictObject({ id: IdSchema }),
  'targets:pickFolder': NoPayload,
  'scans:start': z.strictObject({ targetIds: z.array(IdSchema).min(1).max(50) }),
  'scans:cancel': z.strictObject({ id: IdSchema }),
  'scans:list': NoPayload,
  'scans:get': z.strictObject({ id: IdSchema }),
  'findings:list': z.strictObject({
    scanId: IdSchema,
    tier: TierSchema.optional(),
    wcag: z
      .string()
      .regex(/^\d\.\d{1,2}\.\d{1,2}$/, 'must be a WCAG success criterion like 2.4.3')
      .optional(),
  }),
  'report:html': z.strictObject({ scanId: IdSchema }),
  'report:focusPaths': z.strictObject({ scanId: IdSchema }),
  'review:queue': z.strictObject({ scanId: IdSchema }),
  'review:answer': ReviewAnswerSchema,
  'review:export': NoPayload,
  'settings:get': NoPayload,
  'settings:set': SettingsPatchSchema,
  'providers:list': NoPayload,
  'providers:envStatus': z.strictObject({ names: z.array(EnvNameSchema).max(20) }),
  'providers:test': NoPayload,
  'browsers:status': NoPayload,
  'browsers:install': NoPayload,
  'browsers:useFolder': NoPayload,
} as const satisfies Record<InvokeChannel, z.ZodType>;

export type IpcPayload<C extends InvokeChannel> = z.output<(typeof IPC_SCHEMAS)[C]>;

/** Readable zod issues without echoing the submitted values. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message))
    .join('; ');
}
