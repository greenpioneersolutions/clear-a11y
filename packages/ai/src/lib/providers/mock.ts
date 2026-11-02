import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiOptions } from '../config.js';
import { AiConfigError } from '../errors.js';
import { normalizeInput, recordingKey, stableStringify } from '../recording-key.js';
import type { AiProvider, CompletionRequest, MockRecording, ProviderDeps } from './types.js';

/** What the mock answers when no recording matches: deterministic and never a pass. */
export function uncertainResponse(key: string) {
  return {
    verdict: 'uncertain',
    confidence: 0,
    reason: `mock provider: no recorded response for this input (key ${key}).`,
  };
}

function readRecordings(dir: string): MockRecording[] {
  const out: MockRecording[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readRecordings(path));
    else if (entry.name.endsWith('.json')) {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as MockRecording;
      if (parsed?.request?.judge) out.push(parsed);
    }
  }
  return out;
}

const equalNormalized = (a: unknown, b: unknown) =>
  stableStringify(normalizeInput(a)) === stableStringify(normalizeInput(b));

/** Every field listed in `match` equals the candidate's field (after normalization). */
export function matchesPartial(
  input: Record<string, unknown>,
  match: Record<string, unknown>,
): boolean {
  return Object.entries(match).every(([k, v]) => equalNormalized(input[k], v));
}

/**
 * Offline provider for tests, demos and the synthetic benchmark. Answers from recordings
 * (injected via deps or loaded from `ai.recordingsDir`) keyed by judge + stable input hash,
 * then by partial `match`; anything else gets a deterministic `uncertain` answer.
 */
export function createMockProvider(o: AiOptions, deps: ProviderDeps): AiProvider {
  const recordings = [
    ...(deps.recordings ?? []),
    ...(o.recordingsDir ? readRecordings(o.recordingsDir) : []),
  ];
  const byKey = new Map<string, MockRecording>();
  for (const r of recordings) {
    if (r.request.input) byKey.set(recordingKey(r.request.judge, r.request.input), r);
  }
  const versionOk = (r: MockRecording, req: CompletionRequest) =>
    r.request.promptVersion === undefined || r.request.promptVersion === req.meta?.promptVersion;

  return {
    name: 'mock',
    available: true,
    remote: false,
    async complete(req) {
      if (!req.meta) {
        throw new AiConfigError('mock provider: request has no judge metadata to look up.');
      }
      const { judge, key, input } = req.meta;
      const exact = byKey.get(key);
      const hit =
        exact && versionOk(exact, req)
          ? exact
          : recordings.find(
              (r) =>
                r.request.judge === judge &&
                r.request.match &&
                versionOk(r, req) &&
                matchesPartial(input, r.request.match),
            );
      const response = hit ? hit.response : uncertainResponse(key);
      return {
        text: typeof response === 'string' ? response : JSON.stringify(response),
        model: 'mock',
      };
    },
  };
}
