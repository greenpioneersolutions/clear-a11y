import { createScanRequestSchema } from './dto.js';

const schema = createScanRequestSchema({
  maxTargets: 3,
  maxPages: 10,
  maxTimeoutMs: 60_000,
  aiKeyEnvs: ['ANTHROPIC_API_KEY'],
});
const target = 'https://example.com/';
const issues = (body: unknown) => {
  const r = schema.safeParse(body);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('createScanRequestSchema', () => {
  it('accepts a plain request', () => {
    expect(issues({ targets: [target], config: { engines: { visual: false } } })).toEqual([]);
  });

  it('caps targets including config.targets', () => {
    expect(issues({ targets: [target, target], config: { targets: [target, target] } })).toEqual([
      'targets: at most 3 targets per scan on this server',
    ]);
    expect(issues({ targets: [target], config: { targets: ['file:///etc/passwd'] } })).toEqual([
      'config.targets.0: must be an absolute http:// or https:// URL',
    ]);
  });

  it.each([
    [{ auth: { storageState: '/etc/shadow' } }, 'config.auth.storageState'],
    [{ output: { dir: '/tmp/elsewhere' } }, 'config.output.dir'],
    [{ crawl: { enabled: true, sameOrigin: false } }, 'config.crawl.sameOrigin'],
    [{ crawl: { maxPages: 500 } }, 'config.crawl.maxPages'],
    [{ timeoutMs: 600_000 }, 'config.timeoutMs'],
    [{ ai: { provider: 'mock', recordingsDir: '/etc' } }, 'config.ai.recordingsDir'],
    [
      { ai: { provider: 'openai', baseUrl: 'http://10.0.0.1', apiKeyEnv: 'ANTHROPIC_API_KEY' } },
      'config.ai.baseUrl',
    ],
    [{ ai: { provider: 'anthropic' } }, 'config.ai.apiKeyEnv'],
    [{ ai: { provider: 'anthropic', apiKeyEnv: 'AWS_SECRET_ACCESS_KEY' } }, 'config.ai.apiKeyEnv'],
    [{ ai: { provider: 'ollama' } }, 'config.ai.provider'],
  ])('refuses %o', (config, path) => {
    expect(issues({ targets: [target], config }).some((i) => i.startsWith(`${path}:`))).toBe(true);
  });

  it('refuses a pasted API key without echoing it', () => {
    const out = issues({
      targets: [target],
      config: { ai: { provider: 'anthropic', apiKey: 'sk-secret-123' } },
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out.join(' ')).not.toContain('sk-secret-123');
  });

  it('accepts an allowed AI key variable and local providers', () => {
    expect(
      issues({
        targets: [target],
        config: { ai: { provider: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY' } },
      }),
    ).toEqual([]);
    expect(issues({ targets: [target], config: { ai: { provider: 'mock' } } })).toEqual([]);
  });

  it('disables remote AI entirely when no key variables are allowed', () => {
    const strict = createScanRequestSchema({
      maxTargets: 3,
      maxPages: 10,
      maxTimeoutMs: 60_000,
      aiKeyEnvs: [],
    });
    const r = strict.safeParse({
      targets: [target],
      config: { ai: { provider: 'openai', apiKeyEnv: 'X' } },
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/disabled/);
  });
});
