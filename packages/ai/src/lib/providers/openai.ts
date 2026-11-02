import { z } from 'zod';
import { DEFAULT_API_KEY_ENV, type AiOptions } from '../config.js';
import { AiConfigError, AiProviderError } from '../errors.js';
import { postJson, requireApiKey, trimSlash } from './http.js';
import type { AiProvider, CompletionRequest, ProviderDeps } from './types.js';

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const ResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.looseObject({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

/** Chat Completions request body (shared by OpenAI and Azure OpenAI). */
export function chatCompletionsBody(o: AiOptions, req: CompletionRequest, model?: string) {
  const images = req.images ?? [];
  return {
    ...(model ? { model } : {}),
    max_completion_tokens: req.maxTokens ?? o.maxTokens,
    messages: [
      { role: 'system', content: req.system },
      {
        role: 'user',
        content: images.length
          ? [
              { type: 'text', text: req.prompt },
              ...images.map((img) => ({
                type: 'image_url',
                image_url: { url: `data:${img.mediaType};base64,${img.data}` },
              })),
            ]
          : req.prompt,
      },
    ],
    ...(req.jsonSchema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'verdict', schema: req.jsonSchema, strict: true },
          },
        }
      : {}),
  };
}

function readChoice(provider: string, json: unknown, fallbackModel: string) {
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) throw new AiProviderError(`${provider} returned an unexpected response`);
  const message = parsed.data.choices[0]!.message;
  if (message.refusal) throw new AiProviderError(`${provider} declined the request`);
  if (!message.content) throw new AiProviderError(`${provider} returned no text`);
  return { text: message.content, model: parsed.data.model ?? fallbackModel };
}

/** OpenAI Chat Completions over fetch. `ai.model` is required; key from OPENAI_API_KEY. */
export function createOpenAiProvider(o: AiOptions, deps: ProviderDeps): AiProvider {
  if (!o.model) {
    throw new AiConfigError('ai.model is required for the openai provider (e.g. "gpt-5.1").');
  }
  const model = o.model;
  const envName = o.apiKeyEnv ?? DEFAULT_API_KEY_ENV.openai;
  const key = requireApiKey(deps, 'openai', envName, Boolean(o.apiKeyEnv));
  const url = `${trimSlash(o.baseUrl ?? OPENAI_DEFAULT_BASE_URL)}/chat/completions`;
  return {
    name: 'openai',
    available: true,
    remote: true,
    async complete(req) {
      const json = await postJson(deps, {
        provider: 'openai',
        url,
        headers: { authorization: `Bearer ${key}` },
        body: chatCompletionsBody(o, req, model),
        timeoutMs: o.timeoutMs,
        retries: o.retries,
        signal: req.signal,
      });
      return readChoice('openai', json, model);
    },
  };
}

/**
 * Azure OpenAI over fetch: `ai.baseUrl` is the resource endpoint
 * (https://<resource>.openai.azure.com), `ai.model` the deployment name, `api-key` header.
 */
export function createAzureProvider(o: AiOptions, deps: ProviderDeps): AiProvider {
  if (!o.baseUrl) {
    throw new AiConfigError(
      'ai.baseUrl is required for the azure provider (https://<resource>.openai.azure.com).',
    );
  }
  if (!o.model) {
    throw new AiConfigError('ai.model is required for the azure provider: the deployment name.');
  }
  const deployment = o.model;
  const envName = o.apiKeyEnv ?? DEFAULT_API_KEY_ENV.azure;
  const key = requireApiKey(deps, 'azure', envName, Boolean(o.apiKeyEnv));
  const url =
    `${trimSlash(o.baseUrl)}/openai/deployments/${encodeURIComponent(deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(o.apiVersion)}`;
  return {
    name: 'azure',
    available: true,
    remote: true,
    async complete(req) {
      const json = await postJson(deps, {
        provider: 'azure',
        url,
        headers: { 'api-key': key },
        body: chatCompletionsBody(o, req),
        timeoutMs: o.timeoutMs,
        retries: o.retries,
        signal: req.signal,
      });
      return readChoice('azure', json, deployment);
    },
  };
}
