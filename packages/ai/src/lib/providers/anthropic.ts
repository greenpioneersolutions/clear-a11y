import { z } from 'zod';
import { DEFAULT_API_KEY_ENV, type AiOptions } from '../config.js';
import { AiProviderError } from '../errors.js';
import { postJson, requireApiKey, trimSlash } from './http.js';
import type { AiProvider, CompletionRequest, ProviderDeps } from './types.js';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5-5';
export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2026-10-21';

const ResponseSchema = z.object({
  model: z.string(),
  stop_reason: z.string().nullable().optional(),
  content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })),
});

/** Messages API request body (exported for tests and docs). */
export function anthropicBody(o: AiOptions, model: string, req: CompletionRequest) {
  const outputConfig: Record<string, unknown> = {};
  if (req.jsonSchema) outputConfig['format'] = { type: 'json_schema', schema: req.jsonSchema };
  if (o.effort) outputConfig['effort'] = o.effort;
  return {
    model,
    max_tokens: req.maxTokens ?? o.maxTokens,
    system: req.system,
    messages: [
      {
        role: 'user',
        content: [
          ...(req.images ?? []).map((img) => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mediaType, data: img.data },
          })),
          { type: 'text', text: req.prompt },
        ],
      },
    ],
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
  };
}

/** Anthropic Messages API over fetch. Key from `ai.apiKeyEnv` (default ANTHROPIC_API_KEY). */
export function createAnthropicProvider(o: AiOptions, deps: ProviderDeps): AiProvider {
  const envName = o.apiKeyEnv ?? DEFAULT_API_KEY_ENV.anthropic;
  const key = requireApiKey(deps, 'anthropic', envName, Boolean(o.apiKeyEnv));
  const model = o.model ?? ANTHROPIC_DEFAULT_MODEL;
  const url = `${trimSlash(o.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL)}/v1/messages`;
  return {
    name: 'anthropic',
    available: true,
    remote: true,
    async complete(req) {
      const json = await postJson(deps, {
        provider: 'anthropic',
        url,
        headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
        body: anthropicBody(o, model, req),
        timeoutMs: o.timeoutMs,
        retries: o.retries,
        signal: req.signal,
      });
      const parsed = ResponseSchema.safeParse(json);
      if (!parsed.success) throw new AiProviderError('anthropic returned an unexpected response');
      if (parsed.data.stop_reason === 'refusal') {
        throw new AiProviderError('anthropic declined the request (stop_reason: refusal)');
      }
      const text = parsed.data.content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('');
      if (!text) throw new AiProviderError('anthropic returned no text');
      return { text, model: parsed.data.model };
    },
  };
}
