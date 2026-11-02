import type { FetchLike } from '@clear-a11y/ai';
import { envStatus, PROVIDERS, redact, relevantEnvNames, testProvider } from './providers.js';

describe('providers', () => {
  it('offers none first and no subscription logins', () => {
    expect(PROVIDERS[0]?.id).toBe('none');
    expect(PROVIDERS.map((p) => p.id)).toEqual(['none', 'anthropic', 'openai', 'azure', 'ollama']);
    expect(JSON.stringify(PROVIDERS)).not.toMatch(/claude\.ai|chatgpt|subscription login/i);
  });

  it('reports only whether env vars are set, never their values', () => {
    const status = envStatus(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'EMPTY', 'bad name'], {
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      EMPTY: '',
    });
    expect(status).toEqual([
      { name: 'ANTHROPIC_API_KEY', set: true },
      { name: 'OPENAI_API_KEY', set: false },
      { name: 'EMPTY', set: false },
    ]);
    expect(JSON.stringify(status)).not.toContain('sk-ant-secret');
  });

  it('lists the configured env var first, then the defaults', () => {
    expect(relevantEnvNames({ provider: 'anthropic', apiKeyEnv: 'TEAM_KEY' })).toEqual([
      'TEAM_KEY',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'AZURE_OPENAI_API_KEY',
    ]);
  });

  it('redacts key values from messages', () => {
    expect(redact('bad key sk-ant-abcdef123 rejected', { K: 'sk-ant-abcdef123' }, ['K'])).toBe(
      'bad key [redacted] rejected',
    );
  });
});

describe('testProvider', () => {
  it('none: nothing is sent', async () => {
    const fetch = vi.fn<FetchLike>();
    const r = await testProvider({ provider: 'none' }, { env: {}, fetch });
    expect(r.ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('explains a missing key variable without sending anything', async () => {
    const fetch = vi.fn<FetchLike>();
    const r = await testProvider(
      { provider: 'anthropic', apiKeyEnv: 'MY_KEY' },
      { env: {}, fetch },
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/MY_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends one tiny request without page content and reports success', async () => {
    const fetch = vi.fn<FetchLike>(
      async () =>
        new Response(
          JSON.stringify({ model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'OK' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const r = await testProvider(
      { provider: 'anthropic' },
      { env: { ANTHROPIC_API_KEY: 'sk-ant-test-key-123' }, fetch },
    );
    expect(r).toEqual({ ok: true, message: 'Connected. The provider answered.' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(body)).toContain('No page content is included');
    expect(body.max_tokens).toBe(16);
  });

  it('reports provider errors with the key redacted', async () => {
    const fetch = vi.fn<FetchLike>(
      async () => new Response('invalid key sk-ant-test-key-123', { status: 401 }),
    );
    const r = await testProvider(
      { provider: 'anthropic' },
      { env: { ANTHROPIC_API_KEY: 'sk-ant-test-key-123' }, fetch },
    );
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain('sk-ant-test-key-123');
  });
});
