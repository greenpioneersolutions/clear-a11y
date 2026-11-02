import { checkTarget, isNonPublicAddress, matchesAllowlist, parseAllowlist } from './ssrf.js';

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.5.4',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
  ])('blocks %s', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(false);
  });

  it('treats non-addresses as non-public', () => {
    expect(isNonPublicAddress('example.com')).toBe(true);
  });
});

describe('parseAllowlist / matchesAllowlist', () => {
  const rules = parseAllowlist('https://example.com, http://127.0.0.1:4000, https://*.example.org');

  it.each([
    ['https://example.com/a?b', true],
    ['https://example.com:443/', true],
    ['http://example.com/', false],
    ['https://example.com:8443/', false],
    ['https://sub.example.com/', false],
    ['http://127.0.0.1:4000/x.html', true],
    ['http://127.0.0.1:4001/', false],
    ['https://a.example.org/', true],
    ['https://a.b.example.org/', true],
    ['https://example.org/', false],
    ['https://evilexample.org/', false],
  ])('%s -> %s', (url, ok) => {
    expect(matchesAllowlist(new URL(url), rules)).toBe(ok);
  });

  it('rejects entries that are not origins', () => {
    expect(() => parseAllowlist('https://example.com/path')).toThrow(/origin/);
    expect(() => parseAllowlist('ftp://example.com')).toThrow(/http/);
    expect(() => parseAllowlist('not a url')).toThrow();
  });
});

describe('checkTarget', () => {
  const lookup = async (host: string) =>
    ({ 'public.test': ['93.184.216.34'], 'rebind.test': ['93.184.216.34', '10.0.0.5'] })[host] ??
    Promise.reject(new Error('ENOTFOUND'));

  it.each([
    ['file:///etc/passwd', /http/],
    ['http://169.254.169.254/latest/meta-data', /private/],
    ['http://10.0.0.1/', /private/],
    ['http://[::1]:8080/', /private/],
    ['http://localhost:3000/', /resolved|private/],
    ['http://rebind.test/', /private/],
    ['http://nope.test/', /resolved/],
    ['https://user:pw@public.test/', /credentials/],
  ])('refuses %s without an allowlist', async (url, reason) => {
    const r = await checkTarget(url, { allowlist: [], lookup });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });

  it('accepts a host that resolves only to public addresses', async () => {
    expect(await checkTarget('https://public.test/page', { allowlist: [], lookup })).toEqual({
      ok: true,
    });
  });

  it('with an allowlist, accepts listed origins (even private) and refuses the rest', async () => {
    const allowlist = parseAllowlist('http://127.0.0.1:4000');
    expect(await checkTarget('http://127.0.0.1:4000/a.html', { allowlist, lookup })).toEqual({
      ok: true,
    });
    const r = await checkTarget('https://public.test/', { allowlist, lookup });
    expect(r).toEqual({ ok: false, reason: 'is not in ALLOWED_TARGETS' });
  });
});
