import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A recorded model exchange used instead of a live AI call in tests. */
export interface Recording<TRequest = unknown, TResponse = unknown> {
  name: string;
  /** Provider/model the response was recorded from, or "synthetic" for hand-written ones. */
  source: string;
  request: TRequest;
  response: TResponse;
}

export const recordingsDir = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), '..', 'recordings');

export function loadRecording<TReq = unknown, TRes = unknown>(
  name: string,
  dir = recordingsDir(),
): Recording<TReq, TRes> {
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(name)) throw new Error(`Invalid recording name: ${name}`);
  return JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf-8')) as Recording<TReq, TRes>;
}
