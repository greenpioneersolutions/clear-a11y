import { parseAiOptions, type AiOptions } from '../config.js';
import { AiConfigError } from '../errors.js';
import { createAnthropicProvider } from './anthropic.js';
import { createMockProvider } from './mock.js';
import { createOllamaProvider } from './ollama.js';
import { createAzureProvider, createOpenAiProvider } from './openai.js';
import type { AiProvider, ProviderDeps } from './types.js';

/** The default provider: nothing is ever sent anywhere and judges are skipped. */
export const noneProvider: AiProvider = {
  name: 'none',
  available: false,
  remote: false,
  async complete() {
    throw new AiConfigError(
      'AI provider is "none": no page content is sent anywhere. Set ai.provider to enable AI judges.',
    );
  },
};

function notImplemented(o: AiOptions): never {
  if (o.provider === 'bedrock') {
    const missing = [!o.region && 'ai.region', !o.model && 'ai.model'].filter(Boolean);
    if (missing.length) {
      throw new AiConfigError(`The bedrock provider needs ${missing.join(' and ')}.`);
    }
    throw new AiConfigError(
      'ai.provider "bedrock" is not yet implemented: it needs AWS SigV4 request signing. Use anthropic, openai, azure or ollama.',
    );
  }
  const missing = [!o.project && 'ai.project', !o.region && 'ai.region', !o.model && 'ai.model'];
  const list = missing.filter(Boolean);
  if (list.length) throw new AiConfigError(`The vertex provider needs ${list.join(', ')}.`);
  throw new AiConfigError(
    'ai.provider "vertex" is not yet implemented: it needs Google auth (ADC). Use anthropic, openai, azure or ollama.',
  );
}

/**
 * Builds the configured provider from the loose `ai` config section. Validates config, reads
 * API keys from the environment only, and throws `AiConfigError` with a readable message.
 * There is no consumer-subscription login of any kind: API keys, cloud credentials or local
 * models only.
 */
export function createProvider(ai: unknown = {}, deps: ProviderDeps = {}): AiProvider {
  const o = parseAiOptions(ai);
  switch (o.provider) {
    case 'none':
      return noneProvider;
    case 'mock':
      return createMockProvider(o, deps);
    case 'anthropic':
      return createAnthropicProvider(o, deps);
    case 'openai':
      return createOpenAiProvider(o, deps);
    case 'azure':
      return createAzureProvider(o, deps);
    case 'ollama':
      return createOllamaProvider(o, deps);
    case 'bedrock':
    case 'vertex':
      return notImplemented(o);
  }
}
