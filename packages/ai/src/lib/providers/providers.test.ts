import { AiConfigError, AiProviderError } from '../errors.js';
import { recordingKey } from '../recording-key.js';
import { backoffMs } from './http.js';
import { createProvider, noneProvider } from './index.js';
import type { CompletionRequest, FetchLike, ProviderDeps } from './types.js';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A stubbed fetch that records requests and replays canned responses (no network). */
function stubFetch(...responses: Array<Response | (() => Response) | Error>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const KEY = 'sk-test-not-a-real-key';
const deps = (fetch: FetchLike, env: Record<string, string> = {}): ProviderDeps => ({
  fetch,
  env,
  sleep: async () => undefined,
});

const req: CompletionRequest = {
  system: 'SYSTEM',
  prompt: 'PROMPT <page_data nonce="abc123">{}</page_data>',
  images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
  maxTokens: 300,
  jsonSchema: { type: 'object' },
};

const verdictText = '{"verdict":"fail","confidence":0.9,"reason":"File name."}';

describe('createProvider', () => {
  it('defaults to none: unavailable, and complete() refuses to send anything', async () => {
    const p = createProvider();
    expect(p).toBe(noneProvider);
    expect(p.available).toBe(false);
    await expect(p.complete(req)).rejects.toBeInstanceOf(AiConfigError);
    expect(createProvider({ provider: 'none' })).toBe(noneProvider);
  });

  it('never accepts an API key in config', () => {
    expect(() => createProvider({ provider: 'anthropic', apiKey: KEY })).toThrow(
      /never put API keys in config/,
    );
  });

  it('names the environment variable when the key is missing', () => {
    expect(() => createProvider({ provider: 'anthropic' }, { env: {} })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
    expect(() => createProvider({ provider: 'openai', model: 'gpt-x' }, { env: {} })).toThrow(
      /OPENAI_API_KEY/,
    );
    expect(() =>
      createProvider(
        { provider: 'azure', model: 'dep', baseUrl: 'https://r.openai.azure.com' },
        { env: {} },
      ),
    ).toThrow(/AZURE_OPENAI_API_KEY/);
    expect(() =>
      createProvider({ provider: 'anthropic', apiKeyEnv: 'MY_KEY' }, { env: {} }),
    ).toThrow(/MY_KEY/);
  });

  it('requires a model for openai, azure and ollama', () => {
    expect(() => createProvider({ provider: 'openai' }, { env: { OPENAI_API_KEY: KEY } })).toThrow(
      /ai.model is required/,
    );
    expect(() =>
      createProvider(
        { provider: 'azure', baseUrl: 'https://r.openai.azure.com' },
        { env: { AZURE_OPENAI_API_KEY: KEY } },
      ),
    ).toThrow(/deployment/);
    expect(() => createProvider({ provider: 'ollama' })).toThrow(/ai.model is required/);
  });

  it('validates bedrock and vertex config, then reports they are not implemented', () => {
    expect(() => createProvider({ provider: 'bedrock' })).toThrow(/ai.region and ai.model/);
    expect(() =>
      createProvider({ provider: 'bedrock', region: 'us-east-1', model: 'anthropic.claude' }),
    ).toThrow(/not yet implemented: it needs AWS SigV4/);
    expect(() => createProvider({ provider: 'vertex', region: 'global' })).toThrow(
      /ai.project, ai.model/,
    );
    expect(() =>
      createProvider({ provider: 'vertex', region: 'global', project: 'p', model: 'm' }),
    ).toThrow(/not yet implemented: it needs Google auth/);
  });

  it('rejects invalid options with readable messages', () => {
    expect(() => createProvider({ provider: 'gemini' })).toThrow(/ai.provider/);
    expect(() => createProvider({ provider: 'mock', maxCallsPerPage: -1 })).toThrow(
      /ai.maxCallsPerPage/,
    );
    expect(() => createProvider({ provider: 'mock', judges: ['nope'] })).toThrow(/ai.judges/);
    expect(() => createProvider({ provider: 'mock', apiKeyEnv: 'not a var' })).toThrow(
      /environment variable name/,
    );
  });
});

describe('anthropic adapter', () => {
  it('sends a Messages API request with key header, version, model, image and schema', async () => {
    const { fetch, calls } = stubFetch(
      json({
        model: 'claude-sonnet-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: verdictText }],
      }),
    );
    const p = createProvider({ provider: 'anthropic' }, deps(fetch, { ANTHROPIC_API_KEY: KEY }));
    expect(p.remote).toBe(true);
    const res = await p.complete(req);
    expect(res).toEqual({ text: verdictText, model: 'claude-sonnet-5-5' });
    const call = calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.headers['x-api-key']).toBe(KEY);
    expect(call.headers['anthropic-version']).toBe('2026-10-21');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.body).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 300,
      system: 'SYSTEM',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
            },
            { type: 'text', text: req.prompt },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: { type: 'object' } } },
    });
    expect(JSON.stringify(call.body)).not.toContain('meta');
  });

  it('honors ai.model, ai.baseUrl, ai.apiKeyEnv and ai.effort', async () => {
    const { fetch, calls } = stubFetch(
      json({ model: 'claude-opus-5-5', content: [{ type: 'text', text: verdictText }] }),
    );
    const p = createProvider(
      {
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        baseUrl: 'https://proxy.example.test/',
        apiKeyEnv: 'TEAM_KEY',
        effort: 'low',
      },
      deps(fetch, { TEAM_KEY: KEY }),
    );
    await p.complete({ system: 's', prompt: 'p' });
    expect(calls[0]!.url).toBe('https://proxy.example.test/v1/messages');
    expect(calls[0]!.body['model']).toBe('claude-opus-5-5');
    expect(calls[0]!.body['output_config']).toEqual({ effort: 'low' });
    expect(calls[0]!.body['max_tokens']).toBe(2048);
  });

  it('turns a refusal into an error', async () => {
    const { fetch } = stubFetch(json({ model: 'm', stop_reason: 'refusal', content: [] }));
    const p = createProvider({ provider: 'anthropic' }, deps(fetch, { ANTHROPIC_API_KEY: KEY }));
    await expect(p.complete(req)).rejects.toThrow(/refusal/);
  });
});

describe('openai and azure adapters', () => {
  const chat = (content: string, model = 'gpt-x') =>
    json({ model, choices: [{ message: { role: 'assistant', content } }] });

  it('openai: Chat Completions with bearer key, data-URI image and json_schema format', async () => {
    const { fetch, calls } = stubFetch(chat(verdictText));
    const p = createProvider(
      { provider: 'openai', model: 'gpt-x' },
      deps(fetch, { OPENAI_API_KEY: KEY }),
    );
    expect(await p.complete(req)).toEqual({ text: verdictText, model: 'gpt-x' });
    const call = calls[0]!;
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call.headers['authorization']).toBe(`Bearer ${KEY}`);
    expect(call.body).toEqual({
      model: 'gpt-x',
      max_completion_tokens: 300,
      messages: [
        { role: 'system', content: 'SYSTEM' },
        {
          role: 'user',
          content: [
            { type: 'text', text: req.prompt },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'verdict', schema: { type: 'object' }, strict: true },
      },
    });
  });

  it('azure: deployment URL with api-version and api-key header, no model in the body', async () => {
    const { fetch, calls } = stubFetch(chat(verdictText, 'gpt-x-2026'));
    const p = createProvider(
      { provider: 'azure', model: 'a11y judge', baseUrl: 'https://res.openai.azure.com/' },
      deps(fetch, { AZURE_OPENAI_API_KEY: KEY }),
    );
    await p.complete({ system: 's', prompt: 'p' });
    const call = calls[0]!;
    expect(call.url).toBe(
      'https://res.openai.azure.com/openai/deployments/a11y%20judge/chat/completions?api-version=2024-10-21',
    );
    expect(call.headers['api-key']).toBe(KEY);
    expect(call.headers['authorization']).toBeUndefined();
    expect(call.body['model']).toBeUndefined();
    expect(call.body['messages']).toEqual([
      { role: 'system', content: 's' },
      { role: 'user', content: 'p' },
    ]);
  });

  it('reports a refusal or empty content as an error', async () => {
    const { fetch } = stubFetch(
      json({ choices: [{ message: { content: null, refusal: 'no' } }] }),
      json({ choices: [{ message: { content: '' } }] }),
    );
    const p = createProvider(
      { provider: 'openai', model: 'gpt-x' },
      deps(fetch, { OPENAI_API_KEY: KEY }),
    );
    await expect(p.complete(req)).rejects.toThrow(/declined/);
    await expect(p.complete(req)).rejects.toThrow(/no text/);
  });
});

describe('ollama adapter', () => {
  it('posts to the local /api/chat with raw base64 images and the schema as format', async () => {
    const { fetch, calls } = stubFetch(
      json({ model: 'llava', message: { role: 'assistant', content: verdictText } }),
    );
    const p = createProvider({ provider: 'ollama', model: 'llava' }, deps(fetch));
    expect(p.remote).toBe(false);
    expect(await p.complete(req)).toEqual({ text: verdictText, model: 'llava' });
    expect(calls[0]!.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(calls[0]!.headers['authorization']).toBeUndefined();
    expect(calls[0]!.body).toEqual({
      model: 'llava',
      stream: false,
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: req.prompt, images: ['iVBORw0KGgo='] },
      ],
      format: { type: 'object' },
      options: { num_predict: 300 },
    });
  });

  it('marks a non-local Ollama host as remote', () => {
    const p = createProvider({
      provider: 'ollama',
      model: 'm',
      baseUrl: 'http://gpu-box.internal:11434',
    });
    expect(p.remote).toBe(true);
  });
});

describe('HTTP error handling', () => {
  const anthropic = (fetch: FetchLike, extra: Record<string, unknown> = {}) =>
    createProvider({ provider: 'anthropic', ...extra }, deps(fetch, { ANTHROPIC_API_KEY: KEY }));
  const ok = () => json({ model: 'm', content: [{ type: 'text', text: verdictText }] });

  it('retries 429 and 5xx with backoff, then succeeds', async () => {
    const { fetch, calls } = stubFetch(
      json({ error: 'busy' }, 429, { 'retry-after': '1' }),
      json({ error: 'oops' }, 503),
      ok(),
    );
    const res = await anthropic(fetch).complete(req);
    expect(res.text).toBe(verdictText);
    expect(calls).toHaveLength(3);
  });

  it('gives up after ai.retries and reports the status without leaking the key', async () => {
    const { fetch } = stubFetch(json({ error: 'down' }, 500), json({ error: 'down' }, 500));
    const err = await anthropic(fetch, { retries: 1 })
      .complete(req)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).status).toBe(500);
    expect(String(err)).toMatch(/HTTP 500/);
    expect(String(err)).not.toContain(KEY);
  });

  it('does not retry 4xx; 401/403 are fatal for the scan', async () => {
    const { fetch, calls } = stubFetch(json({ error: { message: 'invalid x-api-key' } }, 401));
    const err = (await anthropic(fetch)
      .complete(req)
      .catch((e: unknown) => e)) as AiProviderError;
    expect(err.status).toBe(401);
    expect(err.fatal).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('times out through AbortSignal', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const p = createProvider(
      { provider: 'anthropic', timeoutMs: 20, retries: 0 },
      deps(hang, { ANTHROPIC_API_KEY: KEY }),
    );
    await expect(p.complete(req)).rejects.toThrow(/timed out after 20ms/);
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = stubFetch(ok());
    await expect(anthropic(fetch).complete({ ...req, signal: controller.signal })).rejects.toThrow(
      /aborted/,
    );
    expect(calls).toHaveLength(0);
  });

  it('reports malformed JSON and unexpected shapes', async () => {
    const { fetch } = stubFetch(
      new Response('<html>gateway</html>', { status: 200 }),
      json({ unexpected: true }),
    );
    const p = anthropic(fetch);
    await expect(p.complete(req)).rejects.toThrow(/malformed JSON/);
    await expect(p.complete(req)).rejects.toThrow(/unexpected response/);
  });

  it('reports network failures', async () => {
    const { fetch } = stubFetch(new Error('ECONNREFUSED'));
    await expect(anthropic(fetch, { retries: 0 }).complete(req)).rejects.toThrow(/ECONNREFUSED/);
  });

  it('computes backoff from retry-after or exponentially', () => {
    expect(backoffMs(0)).toBe(500);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(0, '3')).toBe(3000);
    expect(backoffMs(0, '999')).toBe(30_000);
  });
});

describe('mock provider', () => {
  const input = { alt: 'IMG_2041.jpg', context: 'Meet the team' };
  const meta = (i: Record<string, unknown>, judge = 'alt-text') => ({
    judge,
    promptVersion: 1,
    key: recordingKey(judge, i),
    input: i,
  });

  it('answers from recordings by exact input hash (whitespace-insensitive)', async () => {
    const p = createProvider(
      { provider: 'mock' },
      {
        recordings: [
          {
            source: 'synthetic',
            request: {
              judge: 'alt-text',
              input: { alt: ' IMG_2041.jpg ', context: 'Meet  the team' },
            },
            response: { verdict: 'fail', confidence: 0.95, reason: 'File name.' },
          },
        ],
      },
    );
    expect(p.remote).toBe(false);
    const res = await p.complete({ system: 's', prompt: 'p', meta: meta(input) });
    expect(JSON.parse(res.text)).toMatchObject({ verdict: 'fail' });
    expect(res.model).toBe('mock');
  });

  it('answers from partial matches, respecting judge and prompt version', async () => {
    const p = createProvider(
      { provider: 'mock' },
      {
        recordings: [
          { request: { judge: 'link-purpose', match: { alt: 'IMG_2041.jpg' } }, response: 'x' },
          {
            request: { judge: 'alt-text', promptVersion: 2, match: { alt: 'IMG_2041.jpg' } },
            response: 'v2',
          },
          { request: { judge: 'alt-text', match: { alt: 'IMG_2041.jpg' } }, response: 'raw text' },
        ],
      },
    );
    const res = await p.complete({ system: 's', prompt: 'p', meta: meta(input) });
    expect(res.text).toBe('raw text');
  });

  it('gives a deterministic uncertain answer for unknown input', async () => {
    const p = createProvider({ provider: 'mock' });
    const a = await p.complete({ system: 's', prompt: 'p', meta: meta({ alt: 'x' }) });
    const b = await p.complete({ system: 's', prompt: 'p', meta: meta({ alt: 'x' }) });
    expect(a).toEqual(b);
    expect(JSON.parse(a.text)).toMatchObject({ verdict: 'uncertain', confidence: 0 });
  });

  it('is backed by a test-wide network guard that blocks non-local requests', async () => {
    await expect(fetch('https://api.anthropic.com/v1/messages')).rejects.toThrow(
      /blocked in tests/,
    );
  });

  it('needs judge metadata', async () => {
    await expect(
      createProvider({ provider: 'mock' }).complete({ system: 's', prompt: 'p' }),
    ).rejects.toThrow(/metadata/);
  });
});
