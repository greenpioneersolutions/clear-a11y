import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRepoPath, checkUrl, InputError, parseAllowedOrigins } from './safety.js';

describe('checkUrl', () => {
  it('accepts http and https and normalizes', () => {
    expect(checkUrl('http://localhost:3000')).toBe('http://localhost:3000/');
    expect(checkUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://x.org/',
    'chrome://settings',
  ])('rejects %s', (url) => {
    expect(() => checkUrl(url)).toThrow(/Only http\(s\) URLs/);
  });

  it('rejects relative URLs, credentials and huge input', () => {
    expect(() => checkUrl('/signup')).toThrow(/not an absolute URL/);
    expect(() => checkUrl('https://user:pw@example.com/')).toThrow(/credentials/);
    expect(() => checkUrl(`https://example.com/${'a'.repeat(3000)}`)).toThrow(/too long/);
    expect(() => checkUrl('nope')).toThrow(InputError);
  });

  it('enforces the origin allowlist', () => {
    const allowed = parseAllowedOrigins('http://localhost:*, https://*.example.com/,https://a.org');
    expect(checkUrl('http://localhost:5173/x', allowed)).toBe('http://localhost:5173/x');
    expect(checkUrl('https://staging.example.com/', allowed)).toBe('https://staging.example.com/');
    expect(checkUrl('https://a.org/page', allowed)).toBe('https://a.org/page');
    expect(() => checkUrl('https://evil.org/', allowed)).toThrow(/CLEAR_A11Y_ALLOWED_ORIGINS/);
    expect(() => checkUrl('https://a.org.evil.org/', allowed)).toThrow(/ALLOWED_ORIGINS/);
    expect(() => checkUrl('http://staging.example.com/', allowed)).toThrow(/ALLOWED_ORIGINS/);
  });

  it('allows any http(s) origin when the allowlist is empty', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins(' , ')).toEqual([]);
    expect(checkUrl('https://anything.test/', [])).toBe('https://anything.test/');
  });
});

describe('checkRepoPath', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clear-a11y-safety-'));
  writeFileSync(join(dir, 'file.txt'), 'x');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resolves existing directories, relative to cwd', async () => {
    expect(await checkRepoPath(dir)).toBe(dir);
    expect(await checkRepoPath('.', dir)).toBe(dir);
  });

  it('rejects missing paths, files and URLs', async () => {
    await expect(checkRepoPath(join(dir, 'missing'))).rejects.toThrow(/does not exist/);
    await expect(checkRepoPath(join(dir, 'file.txt'))).rejects.toThrow(/Not a directory/);
    await expect(checkRepoPath('https://github.com/a/b')).rejects.toThrow(/not a URL/);
    await expect(checkRepoPath('x'.repeat(2000))).rejects.toThrow(/too long/);
  });
});
