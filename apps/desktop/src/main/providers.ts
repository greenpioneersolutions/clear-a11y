import { createProvider, DEFAULT_API_KEY_ENV, type FetchLike } from '@clear-a11y/ai';
import type {
  AiSettings,
  EnvVarStatus,
  ProviderInfo,
  ProviderTestResult,
} from '../shared/api-types.js';
import { toScanConfig } from './settings.js';

/**
 * Providers the app offers. API keys, cloud credentials or a local model only: there is no
 * consumer chat-subscription login of any kind. Bedrock and Vertex are left out until the AI
 * package implements them (docs/providers.md); `mock` is for tests only.
 */
export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'none',
    label: 'None (default)',
    description: 'AI judges are off. No page content ever leaves this computer.',
    local: true,
    needsModel: false,
    needsBaseUrl: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic API',
    description: 'Claude models with an API key from your own Anthropic Console account.',
    local: false,
    needsModel: false,
    needsBaseUrl: false,
    defaultKeyEnv: DEFAULT_API_KEY_ENV.anthropic,
  },
  {
    id: 'openai',
    label: 'OpenAI API',
    description: 'OpenAI models with an API key from your own OpenAI account. Model is required.',
    local: false,
    needsModel: true,
    needsBaseUrl: false,
    defaultKeyEnv: DEFAULT_API_KEY_ENV.openai,
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    description:
      'Your Azure OpenAI resource. Base URL is the resource endpoint; model is the deployment name.',
    local: false,
    needsModel: true,
    needsBaseUrl: true,
    defaultKeyEnv: DEFAULT_API_KEY_ENV.azure,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    description: 'A model running on this computer with Ollama. Nothing leaves the machine.',
    local: true,
    needsModel: true,
    needsBaseUrl: false,
  },
];

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Which environment variables are set. Only presence is reported; values are never read out. */
export function envStatus(
  names: readonly string[],
  env: Record<string, string | undefined>,
): EnvVarStatus[] {
  return [...new Set(names)]
    .filter((n) => ENV_NAME.test(n))
    .map((name) => ({ name, set: typeof env[name] === 'string' && env[name] !== '' }));
}

/** Env var names worth showing: every provider default plus the configured one. */
export function relevantEnvNames(ai: AiSettings): string[] {
  const names: string[] = PROVIDERS.flatMap((p) => (p.defaultKeyEnv ? [p.defaultKeyEnv] : []));
  if (ai.apiKeyEnv) names.unshift(ai.apiKeyEnv);
  return [...new Set(names)];
}

/** Removes anything that looks like a key from a message before it reaches the UI. */
export function redact(message: string, env: Record<string, string | undefined>, names: string[]) {
  let out = message;
  for (const name of names) {
    const value = env[name];
    if (value && value.length >= 6) out = out.split(value).join('[redacted]');
  }
  return out.replace(/\b(sk-[A-Za-z0-9_-]{8,})/g, '[redacted]');
}

export interface ProviderTestDeps {
  env: Record<string, string | undefined>;
  fetch?: FetchLike;
  timeoutMs?: number;
}

/**
 * Checks the saved provider: validates the config, checks that the key's environment variable is
 * set, and (for providers other than `none`) sends one tiny request with no page content. Only runs
 * when the user presses "Test connection".
 */
export async function testProvider(
  ai: AiSettings,
  deps: ProviderTestDeps,
): Promise<ProviderTestResult> {
  if (ai.provider === 'none') {
    return {
      ok: true,
      message: 'No provider is set. AI judges are off and nothing is sent anywhere.',
    };
  }
  const section = toScanConfig({ ai, scan: { crawl: false, maxPages: 1 }, browsers: {} }).ai;
  const names = relevantEnvNames(ai);
  let provider;
  try {
    provider = createProvider(section, {
      env: deps.env,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      sleep: async () => undefined,
    });
  } catch (err) {
    return { ok: false, message: redact((err as Error).message, deps.env, names) };
  }
  try {
    await provider.complete({
      system: 'You are a connection test. Reply with the single word OK.',
      prompt: 'Connection test from the Clear A11Y desktop app. No page content is included.',
      maxTokens: 16,
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
    });
    const where = provider.remote ? 'The provider answered.' : 'The local model answered.';
    return { ok: true, message: `Connected. ${where}` };
  } catch (err) {
    return {
      ok: false,
      message: `Could not reach the provider: ${redact((err as Error).message, deps.env, names)}`,
    };
  }
}
