import { resolveConfig, type Finding } from '@clear-a11y/core';
import { loadRecording } from '@clear-a11y/test-utils';
import {
  createAiEngine,
  createProvider,
  type AiOptionsInput,
  type AiProvider,
  type CompletionRequest,
  type JudgeId,
  type MockRecording,
} from '../src/index.js';
import type { PageContext } from '@clear-a11y/browser';

export const RECORDINGS = [
  'ai/alt-text-filename',
  'ai/alt-text-ok',
  'ai/link-purpose-click-here',
  'ai/label-in-name-abbreviation',
  'ai/label-in-name-close-symbol',
  'ai/descriptive-details',
  'ai/error-clarity-code',
  'ai/color-only-inline-link',
  'ai/focus-order-any',
  'ai/prompt-injection-fooled',
];

/** Mock provider answering from the synthetic recordings in packages/test-utils/recordings/ai. */
export function recordedProvider(): AiProvider & { requests: CompletionRequest[] } {
  const recordings = RECORDINGS.map((name) => {
    const r = loadRecording<MockRecording['request'], unknown>(name);
    expect(r.source).toBe('synthetic');
    return { name: r.name, source: r.source, request: r.request, response: r.response };
  });
  const inner = createProvider({ provider: 'mock' }, { recordings });
  const requests: CompletionRequest[] = [];
  return {
    ...inner,
    requests,
    complete(req) {
      requests.push(req);
      return inner.complete(req);
    },
  };
}

export async function runJudges(
  ctx: PageContext,
  provider: AiProvider,
  judges: JudgeId[],
  ai: AiOptionsInput = {},
): Promise<Finding[]> {
  const config = resolveConfig({ ai: { provider: 'mock', reportUncertain: false, ...ai } });
  return createAiEngine(config, provider, { judges }).run(ctx);
}

/** Every AI finding is likely or needs-review and comes from an ai-* engine. */
export function expectAiTiers(findings: readonly Finding[]): void {
  for (const f of findings) {
    expect(['likely', 'needs-review']).toContain(f.tier);
    expect(f.engine).toMatch(/^ai-/);
    if (f.tier === 'needs-review') expect(f.question).toMatch(/\?$/);
  }
}
