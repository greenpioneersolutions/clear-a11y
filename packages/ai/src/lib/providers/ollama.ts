import { z } from 'zod';
import type { AiOptions } from '../config.js';
import { AiConfigError, AiProviderError } from '../errors.js';
import { postJson, trimSlash } from './http.js';
import type { AiProvider, CompletionRequest, ProviderDeps } from './types.js';

export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

const ResponseSchema = z.object({
  model: z.string().optional(),
  message: z.looseObject({ content: z.string() }),
});

export function ollamaBody(o: AiOptions, model: string, req: CompletionRequest) {
  const images = (req.images ?? []).map((img) => img.data);
  return {
    model,
    stream: false,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt, ...(images.length ? { images } : {}) },
    ],
    format: req.jsonSchema ?? 'json',
    options: { num_predict: req.maxTokens ?? o.maxTokens },
  };
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Local models through Ollama's /api/chat. No key. `ai.model` is required. */
export function createOllamaProvider(o: AiOptions, deps: ProviderDeps): AiProvider {
  if (!o.model) {
    throw new AiConfigError(
      'ai.model is required for the ollama provider (a model you have pulled, e.g. "llama3.2-vision").',
    );
  }
  const model = o.model;
  const base = trimSlash(o.baseUrl ?? OLLAMA_DEFAULT_BASE_URL);
  return {
    name: 'ollama',
    available: true,
    remote: !LOCAL_HOSTS.has(new URL(base).hostname),
    async complete(req) {
      const json = await postJson(deps, {
        provider: 'ollama',
        url: `${base}/api/chat`,
        headers: {},
        body: ollamaBody(o, model, req),
        timeoutMs: o.timeoutMs,
        retries: o.retries,
        signal: req.signal,
      });
      const parsed = ResponseSchema.safeParse(json);
      if (!parsed.success) throw new AiProviderError('ollama returned an unexpected response');
      return { text: parsed.data.message.content, model: parsed.data.model ?? model };
    },
  };
}
