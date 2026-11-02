import { AiProviderSchema } from '@clear-a11y/core';
import { z } from 'zod';
import { AiConfigError } from './errors.js';

/** Ids of the built-in judges. Engine names are `ai-<id>`, rule ids `ai/<id>`. */
export const JUDGE_IDS = [
  'alt-text',
  'label-in-name',
  'link-purpose',
  'descriptive-headings-labels',
  'error-clarity',
  'color-only',
  'focus-order',
] as const;
export type JudgeId = (typeof JUDGE_IDS)[number];

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/** Default environment variable per provider. Keys are only ever read from the environment. */
export const DEFAULT_API_KEY_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
} as const;

/** Keys that look like a secret pasted straight into config. Refused with a clear message. */
const SECRET_KEYS = /^(api[-_]?key|key|token|secret|password|access[-_]?token|auth)$/i;

/**
 * The `ai` section of the config. Core keeps it loose; this package validates its own options.
 * Every limit has a conservative default so a misconfigured scan can't send a whole site.
 */
export const AiOptionsSchema = z.looseObject({
  /** `none` (default): no page content ever leaves the machine. */
  provider: AiProviderSchema.default('none'),
  /** Model id (anthropic: optional, others: required). For azure: the deployment name. */
  model: z.string().min(1).optional(),
  /** Name of the environment variable holding the API key. */
  apiKeyEnv: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'ai.apiKeyEnv must be an environment variable name')
    .optional(),
  baseUrl: z.url().optional(),
  /** Judges to run; empty = all built-in judges. */
  judges: z.array(z.enum(JUDGE_IDS)).default([]),
  region: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
  /** Azure OpenAI api-version query parameter. */
  apiVersion: z.string().min(1).default('2024-10-21'),
  /** Anthropic `output_config.effort` (only sent when set). */
  effort: z.enum(EFFORTS).optional(),
  maxCandidatesPerJudge: z.number().int().min(1).max(50).default(8),
  maxCallsPerPage: z.number().int().min(0).max(500).default(40),
  maxCallsPerScan: z.number().int().min(0).max(10_000).default(200),
  maxTokens: z.number().int().min(64).max(32_000).default(2_048),
  /** Per-request timeout. */
  timeoutMs: z.number().int().positive().default(60_000),
  /** Retries on 429 and 5xx, with exponential backoff (or the server's retry-after). */
  retries: z.number().int().min(0).max(5).default(2),
  /** Model requests in flight at once, per page. */
  concurrency: z.number().int().min(1).max(16).default(4),
  /** A `fail` verdict at or above this confidence becomes `likely`; below it, `needs-review`. */
  likelyThreshold: z.number().min(0).max(1).default(0.7),
  /** Report `uncertain` verdicts as needs-review questions (otherwise they are dropped). */
  reportUncertain: z.boolean().default(true),
  /** Send screenshot crops to judges that use vision (alt text). */
  images: z.boolean().default(true),
  /** Time budget per page and state; defaults to 80% of `timeoutMs` of the scan. */
  budgetMs: z.number().int().positive().optional(),
  /** mock provider only: directory of recorded responses (*.json). */
  recordingsDir: z.string().min(1).optional(),
});
export type AiOptions = z.infer<typeof AiOptionsSchema>;
export type AiOptionsInput = z.input<typeof AiOptionsSchema>;

/** Validates the loose `ai` config section. Throws `AiConfigError` with readable messages. */
export function parseAiOptions(section: unknown = {}): AiOptions {
  const raw = (section ?? {}) as Record<string, unknown>;
  const secret = Object.keys(raw).find((k) => SECRET_KEYS.test(k));
  if (secret) {
    throw new AiConfigError(
      `ai.${secret} is not allowed: never put API keys in config. Export the key in an environment variable and set ai.apiKeyEnv to its name.`,
    );
  }
  const parsed = AiOptionsSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `ai.${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new AiConfigError(`Invalid ai config: ${issues}`);
  }
  return parsed.data;
}
