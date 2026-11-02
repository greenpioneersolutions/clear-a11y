import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { parseAllowlist, type AllowRule } from './security/ssrf.js';

export interface ServerConfig {
  host: string;
  port: number;
  /** Bearer token. Required when `host` is not a loopback address. */
  token?: string;
  dataDir: string;
  /** SQLite file (used when `redisUrl` is not set). */
  dbPath: string;
  redisUrl?: string;
  /** Scans run at once by this process. 0 = API only (workers run elsewhere, BullMQ). */
  workers: number;
  /** Origins (with optional `*.` host wildcard) scans may target. Empty = any public address. */
  allowedTargets: AllowRule[];
  maxTargets: number;
  /** Cap on `config.crawl.maxPages`. */
  maxPages: number;
  /** Cap on `config.timeoutMs`. */
  maxTimeoutMs: number;
  /** POST /scans per client IP per minute. 0 disables the limit. */
  rateLimitPerMinute: number;
  /** JSON body limit in bytes. */
  maxBodyBytes: number;
  /** Environment variable names that scan requests may reference as `ai.apiKeyEnv`. */
  aiKeyEnvs: string[];
  /** Express `trust proxy`, so the rate limit sees the client IP behind a reverse proxy. */
  trustProxy: boolean;
}

const LOOPBACK_NAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

/** 127.0.0.0/8, ::1 and localhost. */
export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (LOOPBACK_NAMES.has(h)) return true;
  if (isIP(h) === 4) return h.startsWith('127.');
  if (isIP(h) === 6) return h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '::ffff:127.0.0.1';
  return false;
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;

const EnvSchema = z.object({
  HOST: z.string().min(1).optional(),
  PORT: int(0, 65_535).default(3000),
  CLEAR_A11Y_TOKEN: z.string().optional(),
  CLEAR_A11Y_API_TOKEN: z.string().optional(),
  DATA_DIR: z.string().min(1).default('.clear-a11y/server'),
  CLEAR_A11Y_DB: z.string().min(1).optional(),
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, 'REDIS_URL must start with redis:// or rediss://')
    .optional(),
  CLEAR_A11Y_WORKERS: int(0, 16).default(1),
  ALLOWED_TARGETS: z.string().default(''),
  CLEAR_A11Y_MAX_TARGETS: int(1, 100).default(20),
  CLEAR_A11Y_MAX_PAGES: int(1, 1000).default(50),
  CLEAR_A11Y_MAX_TIMEOUT_MS: int(1000, 600_000).default(120_000),
  RATE_LIMIT_PER_MINUTE: int(0, 100_000).default(30),
  CLEAR_A11Y_MAX_BODY_BYTES: int(1024, 10_000_000).default(100_000),
  CLEAR_A11Y_AI_KEY_ENVS: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false', '1', '0', '']).default(''),
});

const list = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export class ConfigError extends Error {}

/**
 * Reads the server settings from environment variables (see README). Throws `ConfigError` with a
 * readable message; never includes the token in it.
 */
export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // Treat empty strings as unset, the way `docker run -e NAME=` behaves.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid server settings: ${issues}`);
  }
  const e = parsed.data;
  const host = e.HOST ?? '127.0.0.1';
  const token = e.CLEAR_A11Y_TOKEN ?? e.CLEAR_A11Y_API_TOKEN;
  if (token !== undefined && token.length < 16) {
    throw new ConfigError('CLEAR_A11Y_TOKEN must be at least 16 characters.');
  }
  if (!token && !isLoopbackHost(host)) {
    throw new ConfigError(
      `HOST=${host} exposes the API beyond this machine: set CLEAR_A11Y_TOKEN (at least 16 characters) so requests need "Authorization: Bearer <token>".`,
    );
  }
  const aiKeyEnvs = list(e.CLEAR_A11Y_AI_KEY_ENVS);
  const badEnv = aiKeyEnvs.find((n) => !envName.test(n));
  if (badEnv) throw new ConfigError(`CLEAR_A11Y_AI_KEY_ENVS: "${badEnv}" is not a variable name.`);
  let allowedTargets: AllowRule[];
  try {
    allowedTargets = parseAllowlist(e.ALLOWED_TARGETS);
  } catch (err) {
    throw new ConfigError(`ALLOWED_TARGETS: ${(err as Error).message}`);
  }
  const dataDir = resolve(e.DATA_DIR);
  return {
    host,
    port: e.PORT,
    ...(token ? { token } : {}),
    dataDir,
    dbPath: e.CLEAR_A11Y_DB ? resolve(e.CLEAR_A11Y_DB) : join(dataDir, 'clear-a11y.db'),
    ...(e.REDIS_URL ? { redisUrl: e.REDIS_URL } : {}),
    workers: e.CLEAR_A11Y_WORKERS,
    allowedTargets,
    maxTargets: e.CLEAR_A11Y_MAX_TARGETS,
    maxPages: e.CLEAR_A11Y_MAX_PAGES,
    maxTimeoutMs: e.CLEAR_A11Y_MAX_TIMEOUT_MS,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    maxBodyBytes: e.CLEAR_A11Y_MAX_BODY_BYTES,
    aiKeyEnvs,
    trustProxy: e.TRUST_PROXY === 'true' || e.TRUST_PROXY === '1',
  };
}
