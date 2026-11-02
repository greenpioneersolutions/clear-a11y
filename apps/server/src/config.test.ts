import { join, resolve } from 'node:path';
import { ConfigError, isLoopbackHost, loadServerConfig } from './config.js';

const TOKEN = 'a-long-enough-test-token';

describe('isLoopbackHost', () => {
  it.each(['127.0.0.1', '127.1.2.3', 'localhost', '::1', '[::1]'])('%s is loopback', (h) => {
    expect(isLoopbackHost(h)).toBe(true);
  });
  it.each(['0.0.0.0', '::', '192.168.1.2', 'example.com'])('%s is not', (h) => {
    expect(isLoopbackHost(h)).toBe(false);
  });
});

describe('loadServerConfig', () => {
  it('defaults to loopback, SQLite under DATA_DIR, one worker, no token', () => {
    const c = loadServerConfig({});
    expect(c).toMatchObject({ host: '127.0.0.1', port: 3000, workers: 1, maxTargets: 20 });
    expect(c.token).toBeUndefined();
    expect(c.redisUrl).toBeUndefined();
    expect(c.dbPath).toBe(join(resolve('.clear-a11y/server'), 'clear-a11y.db'));
  });

  it('reads overrides', () => {
    const c = loadServerConfig({
      HOST: '0.0.0.0',
      PORT: '8080',
      CLEAR_A11Y_TOKEN: TOKEN,
      CLEAR_A11Y_DB: '/tmp/x.db',
      REDIS_URL: 'redis://redis:6379',
      CLEAR_A11Y_WORKERS: '3',
      ALLOWED_TARGETS: 'https://example.com',
      CLEAR_A11Y_AI_KEY_ENVS: 'ANTHROPIC_API_KEY',
      TRUST_PROXY: 'true',
    });
    expect(c).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      token: TOKEN,
      dbPath: resolve('/tmp/x.db'),
      redisUrl: 'redis://redis:6379',
      workers: 3,
      aiKeyEnvs: ['ANTHROPIC_API_KEY'],
      trustProxy: true,
    });
    expect(c.allowedTargets).toHaveLength(1);
  });

  it('requires a token when HOST is not loopback', () => {
    expect(() => loadServerConfig({ HOST: '0.0.0.0' })).toThrow(/CLEAR_A11Y_TOKEN/);
    expect(() => loadServerConfig({ HOST: '0.0.0.0', CLEAR_A11Y_API_TOKEN: TOKEN })).not.toThrow();
  });

  it('refuses short tokens without echoing them', () => {
    try {
      loadServerConfig({ CLEAR_A11Y_TOKEN: 'short-secret' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).not.toContain('short-secret');
    }
  });

  it.each([
    [{ PORT: 'abc' }, /PORT/],
    [{ CLEAR_A11Y_WORKERS: '99' }, /CLEAR_A11Y_WORKERS/],
    [{ REDIS_URL: 'http://x' }, /REDIS_URL/],
    [{ ALLOWED_TARGETS: 'https://x.com/path' }, /ALLOWED_TARGETS/],
    [{ CLEAR_A11Y_AI_KEY_ENVS: 'not-a-name' }, /CLEAR_A11Y_AI_KEY_ENVS/],
  ])('rejects %o', (env, message) => {
    expect(() => loadServerConfig(env)).toThrow(message);
  });
});
