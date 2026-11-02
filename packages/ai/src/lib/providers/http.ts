import { AiConfigError, AiProviderError } from '../errors.js';
import type { FetchLike, ProviderDeps } from './types.js';

export interface PostJsonOptions {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  retries: number;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Backoff before retry `attempt` (0-based): the server's retry-after (capped) or 0.5s, 1s, 2s... */
export function backoffMs(attempt: number, retryAfter?: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  return 500 * 2 ** attempt;
}

export function resolveFetch(deps: ProviderDeps): FetchLike {
  const f = deps.fetch ?? (globalThis.fetch as FetchLike | undefined);
  if (!f) throw new AiConfigError('No fetch implementation available (Node 18+ required).');
  return f;
}

/** Short, single-line excerpt of an error body. Never includes request headers (keys). */
const excerpt = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 300);

/**
 * POSTs JSON and returns the parsed JSON response. Retries 429/5xx and timeouts with backoff;
 * throws `AiProviderError` for HTTP errors, timeouts, aborts and malformed JSON.
 */
export async function postJson(deps: ProviderDeps, o: PostJsonOptions): Promise<unknown> {
  const fetchFn = resolveFetch(deps);
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= o.retries;
    if (o.signal?.aborted) throw new AiProviderError(`${o.provider} request aborted`);
    const timeout = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeout.abort();
    }, o.timeoutMs);
    const signal = o.signal ? AbortSignal.any([o.signal, timeout.signal]) : timeout.signal;
    let res: Response;
    try {
      res = await fetchFn(o.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...o.headers },
        body: JSON.stringify(o.body),
        signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (timedOut) {
        if (!last) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new AiProviderError(
          `${o.provider} request timed out after ${o.timeoutMs}ms`,
          undefined,
          true,
        );
      }
      if (o.signal?.aborted) throw new AiProviderError(`${o.provider} request aborted`);
      throw new AiProviderError(
        `${o.provider} request failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        true,
      );
    }
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      throw new AiProviderError(
        `${o.provider} response could not be read: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && !last) {
        await sleep(backoffMs(attempt, res.headers.get('retry-after')));
        continue;
      }
      throw new AiProviderError(
        `${o.provider} returned HTTP ${res.status}: ${excerpt(text)}`,
        res.status,
        retryable,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiProviderError(`${o.provider} returned malformed JSON: ${excerpt(text)}`);
    }
  }
}

/** Reads the API key from the environment variable named in config. Never from config itself. */
export function requireApiKey(
  deps: ProviderDeps,
  provider: string,
  envName: string,
  explicit: boolean,
): string {
  const env = deps.env ?? process.env;
  const key = env[envName]?.trim();
  if (!key) {
    throw new AiConfigError(
      `The ${provider} provider needs an API key in the environment variable ${envName}` +
        (explicit ? '' : ' (set ai.apiKeyEnv to use a different variable)') +
        '. Keys are only read from the environment, never from config files.',
    );
  }
  return key;
}

export const trimSlash = (url: string) => url.replace(/\/+$/, '');
