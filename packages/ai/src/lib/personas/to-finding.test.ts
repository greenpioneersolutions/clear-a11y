import { applyTierPolicy, RuleMetaSchema } from '@clear-a11y/core';
import { personaRule, personaRunToFinding, wcagFor } from './to-finding.js';
import type { PersonaRun } from './types.js';

const page = { url: 'http://x/checkout.html', state: 'default', viewport: 'desktop' };
const task = { id: 'pay', goal: 'Pay for the order', constraint: 'keyboard-only' } as const;

const blocked = (
  over: Partial<PersonaRun> = {},
  block: Partial<Extract<PersonaRun['outcome'], { status: 'blocked' }>['block']> = {},
): PersonaRun => ({
  taskId: 'pay',
  constraint: 'keyboard-only',
  planner: 'deterministic',
  outcome: {
    status: 'blocked',
    steps: 4,
    block: {
      cause: 'unreachable',
      reason: 'Tab never reached it.',
      selector: '#pay',
      name: 'Pay now',
      measured: true,
      ...block,
    },
  },
  trace: [
    {
      n: 1,
      action: 'press Tab',
      focused: { selector: '#t', role: 'checkbox', name: 'Terms' },
      result: 'changed',
    },
  ],
  focusPath: [{ index: 0, selector: '#t' }],
  ...over,
});

describe('persona findings', () => {
  it('maps causes to WCAG', () => {
    expect(wcagFor('unreachable', 'keyboard-only')).toEqual(['2.1.1']);
    expect(wcagFor('trap', 'keyboard-only')).toEqual(['2.1.2']);
    expect(wcagFor('focus-lost', 'keyboard-only')).toEqual(['2.4.3']);
    expect(wcagFor('unnamed', 'screen-reader')).toEqual(['4.1.2']);
    expect(wcagFor('not-exposed', 'screen-reader')).toEqual(['4.1.2', '1.3.1']);
    expect(wcagFor('not-operable', 'screen-reader')).toEqual(['4.1.2']);
    expect(wcagFor('budget', 'keyboard-only')).toEqual(['2.1.1']);
  });

  it('a measured deterministic block is likely, with the trace and focus path as evidence', () => {
    const f = personaRunToFinding({
      run: blocked(),
      task,
      page,
      traceArtifact: 'artifacts/t.json',
    })!;
    expect(f).toMatchObject({
      ruleId: 'persona/task-blocked',
      engine: 'persona-keyboard-only',
      tier: 'likely',
      wcag: ['2.1.1'],
      target: { selector: '#pay', name: 'Pay now' },
    });
    expect(f.question).toBeUndefined();
    expect(f.message).toMatch(
      /A keyboard-only user could not complete the task "Pay for the order": stuck at "Pay now"/,
    );
    expect(f.message).toContain('artifacts/t.json');
    expect(f.evidence.focusPath).toEqual([{ index: 0, selector: '#t' }]);
    expect(f.evidence.data).toMatchObject({
      cause: 'unreachable',
      trace: [{ action: 'press Tab' }],
    });
  });

  it('unmeasured, AI or injection-flagged blocks are needs-review with a question', () => {
    const unmeasured = personaRunToFinding({
      run: blocked({}, { measured: false, selector: undefined }),
      task,
      page,
    })!;
    expect(unmeasured).toMatchObject({ tier: 'needs-review', target: { selector: 'body' } });
    expect(unmeasured.question).toBe(
      'Could a keyboard-only user complete "Pay for the order" on this page?',
    );
    const ai = personaRunToFinding({
      run: blocked({ planner: 'ai', provider: 'mock', model: 'm' }),
      task,
      page,
    })!;
    expect(ai.tier).toBe('needs-review');
    expect(ai.evidence.data).toMatchObject({ provider: 'mock', model: 'm' });
    const injected = personaRunToFinding({
      run: blocked({ injection: 'ignore previous instructions' }),
      task,
      page,
    })!;
    expect(injected.tier).toBe('needs-review');
    expect(injected.message).toMatch(/looks like instructions to an AI/);
  });

  it('success produces nothing', () => {
    expect(
      personaRunToFinding({
        run: { ...blocked(), outcome: { status: 'success', steps: 3 } },
        task,
        page,
      }),
    ).toBeUndefined();
  });

  it('is never a violation, even under the runner tier policy', () => {
    const f = personaRunToFinding({ run: blocked(), task, page })!;
    const [after] = applyTierPolicy([{ ...f, tier: 'violation' }]);
    expect(after!.tier).toBe('likely');
  });

  it('has valid rule metadata', () => {
    expect(() => RuleMetaSchema.parse(personaRule)).not.toThrow();
    expect(personaRule.tier).not.toBe('violation');
  });
});
