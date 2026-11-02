import { parseScanJobPayload, ScanJobPayloadSchema } from './payload.js';

describe('ScanJobPayloadSchema', () => {
  it('accepts http(s) targets and a valid config', () => {
    expect(
      parseScanJobPayload({
        targets: ['https://example.com/', 'http://localhost:4000/a.html'],
        config: {
          viewports: [{ name: 'mobile', width: 375, height: 667 }],
          engines: { at: false },
        },
        label: 'nightly',
      }),
    ).toMatchObject({ targets: ['https://example.com/', 'http://localhost:4000/a.html'] });
  });

  it.each([
    ['file:///etc/passwd'],
    ['javascript:alert(1)'],
    ['ftp://example.com/'],
    ['/relative/path'],
    ['not a url'],
  ])('rejects target %s', (target) => {
    expect(ScanJobPayloadSchema.safeParse({ targets: [target] }).success).toBe(false);
  });

  it('rejects empty and oversized target lists and unknown keys', () => {
    expect(ScanJobPayloadSchema.safeParse({ targets: [] }).success).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => `https://example.com/${i}`);
    expect(ScanJobPayloadSchema.safeParse({ targets: many }).success).toBe(false);
    expect(
      ScanJobPayloadSchema.safeParse({ targets: ['https://example.com'], extra: 1 }).success,
    ).toBe(false);
  });

  it('validates config with core ConfigSchema and rejects unknown top-level config keys', () => {
    const bad = ScanJobPayloadSchema.safeParse({
      targets: ['https://example.com'],
      config: { timeoutMs: -5 },
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(['config', 'timeoutMs']);
    expect(
      ScanJobPayloadSchema.safeParse({ targets: ['https://example.com'], config: { nope: true } })
        .success,
    ).toBe(false);
  });
});
