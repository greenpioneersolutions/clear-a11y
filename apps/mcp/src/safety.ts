import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

/** Longest URL or path we accept. Anything longer is almost certainly not a real target. */
export const MAX_URL_LENGTH = 2048;
export const MAX_PATH_LENGTH = 1024;

/** Thrown for bad input; the message is shown to the calling agent as a tool error. */
export class InputError extends Error {
  override name = 'InputError';
}

/**
 * Parses `CLEAR_A11Y_ALLOWED_ORIGINS`: a comma-separated list of origins such as
 * `http://localhost:3000,https://staging.example.com`. `*` matches any run of characters inside
 * the host or port (`http://localhost:*`, `https://*.example.com`). Empty or unset means any
 * http(s) origin is allowed (the default policy; see docs/mcp.md).
 */
export function parseAllowedOrigins(value: string | undefined): RegExp[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean)
    .map((pattern) => {
      const body = pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*');
      return new RegExp(`^${body}$`);
    });
}

/**
 * Validates a scan target URL: absolute http(s) only, no embedded credentials, within the
 * optional origin allowlist. Returns the normalized URL.
 */
export function checkUrl(value: string, allowed: readonly RegExp[] = []): string {
  if (value.length > MAX_URL_LENGTH)
    throw new InputError(`URL is too long (max ${MAX_URL_LENGTH}).`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InputError(
      `"${value.slice(0, 200)}" is not an absolute URL. Pass a full http(s) URL such as http://localhost:3000/.`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new InputError(
      `Only http(s) URLs can be scanned; got "${url.protocol}". For a local source folder use scan_repo.`,
    );
  if (url.username || url.password)
    throw new InputError(
      'URLs with embedded credentials are not accepted (they would end up in reports). Use an authenticated session instead.',
    );
  if (allowed.length && !allowed.some((re) => re.test(url.origin.toLowerCase())))
    throw new InputError(
      `${url.origin} is not in CLEAR_A11Y_ALLOWED_ORIGINS. Ask the user to add it to the server's allowlist if it should be scanned.`,
    );
  return url.href;
}

/** Resolves a local repo path (relative to `cwd`) and checks that it is an existing directory. */
export async function checkRepoPath(value: string, cwd: string = process.cwd()): Promise<string> {
  if (value.length > MAX_PATH_LENGTH)
    throw new InputError(`Path is too long (max ${MAX_PATH_LENGTH}).`);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value))
    throw new InputError(
      'scan_repo takes a local directory path, not a URL. Clone the repo first, or use scan_url for a running site.',
    );
  const abs = isAbsolute(value) ? resolve(value) : resolve(cwd, value);
  const info = await stat(abs).catch(() => undefined);
  if (!info) throw new InputError(`Path does not exist: ${abs}`);
  if (!info.isDirectory()) throw new InputError(`Not a directory: ${abs}`);
  return abs;
}
