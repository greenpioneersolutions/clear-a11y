import { readFileSync } from 'node:fs';
import { resolveConfig, type Finding } from '@clear-a11y/core';
import {
  expectFinding,
  fixtureHarness,
  fixturesPersonasFile,
  loadRecording,
} from '@clear-a11y/test-utils';
import {
  createPersonaEngine,
  createProvider,
  createScriptedPlanner,
  parsePersonaOptions,
  runPersona,
  type AiProvider,
  type CompletionRequest,
  type MockRecording,
  type PersonaOptionsInput,
  type PersonaTaskInput,
  PersonaTaskSchema,
} from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

const fixtureTasks = JSON.parse(
  readFileSync(fixturesPersonasFile(), 'utf-8'),
) as PersonaOptionsInput;

async function runTasks(
  page: string,
  personas: PersonaOptionsInput = fixtureTasks,
  provider?: AiProvider,
) {
  const fx = await harness.open(page);
  const engine = createPersonaEngine(resolveConfig({ personas }), provider, { settleMs: 20 });
  const findings = await engine.run(fx.ctx);
  return { findings, runs: engine.lastRuns(), fx };
}

function expectPersonaTiers(findings: readonly Finding[]) {
  for (const f of findings) {
    expect(['likely', 'needs-review']).toContain(f.tier);
    expect(f.engine).toMatch(/^persona-/);
    expect(f.ruleId).toBe('persona/task-blocked');
    if (f.tier === 'needs-review') expect(f.question).toMatch(/\?$/);
  }
}

describe('fixtures/personas.json', () => {
  it('is a valid persona config', () => {
    expect(parsePersonaOptions(fixtureTasks).tasks.length).toBeGreaterThanOrEqual(3);
  });
});

describe('deterministic keyboard-only persona', () => {
  it('completes checkout on the correct page with no finding', async () => {
    const { findings, runs } = await runTasks('persona/checkout-keyboard-ok.html');
    expect(findings).toEqual([]);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.outcome.status).toBe('success');
    expect(runs[0]!.trace.map((s) => s.action)).toContain('press Space');
  });

  it('is blocked at the mouse-only Pay now control (unreachable, 2.1.1, likely)', async () => {
    const { findings } = await runTasks('persona/checkout-keyboard-blocked.html');
    const f = expectFinding(findings, { ruleId: 'persona/task-blocked', selector: '#pay' });
    expect(f).toMatchObject({ tier: 'likely', engine: 'persona-keyboard-only', wcag: ['2.1.1'] });
    expect(f.evidence.data).toMatchObject({ cause: 'unreachable', planner: 'deterministic' });
    const trace = f.evidence.data!['trace'] as Array<{ action: string; result: string }>;
    expect(trace.length).toBeGreaterThan(2);
    expect(trace.every((s) => !/click/i.test(s.action))).toBe(true);
    expect(f.evidence.focusPath?.map((s) => s.selector)).toEqual(
      expect.arrayContaining(['#terms']),
    );
    expect(f.evidence.focusPath?.some((s) => s.selector === '#pay')).toBe(false);
    expectPersonaTiers(findings);
  });

  it('adds to basket on the correct page', async () => {
    const { findings, runs } = await runTasks('persona/basket-keyboard-ok.html');
    expect(findings).toEqual([]);
    expect(runs[0]!.outcome.status).toBe('success');
  });

  it('reports a focusable control that ignores Enter and Space (not-operable, 2.1.1)', async () => {
    const { findings } = await runTasks('persona/basket-keyboard-not-operable.html');
    const f = expectFinding(findings, { ruleId: 'persona/task-blocked', selector: '#add' });
    expect(f).toMatchObject({ tier: 'likely', wcag: ['2.1.1'] });
    expect(f.evidence.data).toMatchObject({ cause: 'not-operable' });
    const actions = (f.evidence.data!['trace'] as Array<{ action: string }>).map((s) => s.action);
    expect(actions).toEqual(expect.arrayContaining(['press Enter', 'press Space']));
  });

  it('reports a keyboard trap (2.1.2)', async () => {
    const fx = await harness.open('blank.html');
    await fx.page
      .setContent(`<!doctype html><html lang="en"><head><title>Trap</title></head><body><main>
      <div id="widget"><button id="a">One</button><button id="b">Two</button></div>
      <button id="next">Continue</button>
      <script>
        document.getElementById('b').addEventListener('keydown', (e) => {
          if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); document.getElementById('a').focus(); }
        });
      </script></main></body></html>`);
    const task = PersonaTaskSchema.parse({
      id: 'trap',
      goal: 'Continue',
      match: 'blank',
      constraint: 'keyboard-only',
      steps: [{ name: 'Continue' }],
      success: { text: 'never' },
      maxSteps: 20,
    } satisfies PersonaTaskInput);
    const { createKeyboardPlanner } = await import('../src/index.js');
    const run = await runPersona(fx.page, {
      task,
      planner: createKeyboardPlanner(task.steps),
      settleMs: 10,
    });
    expect(run.outcome).toMatchObject({
      status: 'blocked',
      block: { cause: 'trap', selector: '#a' },
    });
    expect(run.trace.map((s) => s.action)).toContain('press Escape');
  });
});

describe('deterministic screen-reader persona', () => {
  it('signs up on the correct page through the accessibility tree', async () => {
    const { findings, runs } = await runTasks('persona/signup-screen-reader-ok.html');
    expect(findings).toEqual([]);
    expect(runs[0]!.outcome.status).toBe('success');
    expect(runs[0]!.trace[0]!.action).toMatch(/^type "reader@example\.test" into n\d+$/);
  });

  it('is blocked by the unnamed sign-up button (unnamed, 4.1.2, likely)', async () => {
    const { findings } = await runTasks('persona/signup-screen-reader-blocked.html');
    const f = expectFinding(findings, { ruleId: 'persona/task-blocked', selector: '#signup' });
    expect(f).toMatchObject({
      tier: 'likely',
      engine: 'persona-screen-reader',
      wcag: ['4.1.2'],
      target: { role: 'button' },
    });
    expect(f.evidence.data).toMatchObject({ cause: 'unnamed', stepHint: 1 });
    expect(f.evidence.focusPath).toBeUndefined();
  });

  it('reports a control hidden from the accessibility tree (not-exposed, 4.1.2)', async () => {
    const fx = await harness.open('blank.html');
    await fx.page
      .setContent(`<!doctype html><html lang="en"><head><title>Hidden</title></head><body><main>
      <h1>Offers</h1><div id="claim" aria-hidden="true" onclick="this.textContent='Claimed'">Claim offer</div>
      </main></body></html>`);
    const task = PersonaTaskSchema.parse({
      id: 'hidden',
      goal: 'Claim the offer',
      match: 'blank',
      constraint: 'screen-reader',
      steps: [{ role: 'button', name: 'Claim offer' }],
      success: { text: 'Claimed' },
    } satisfies PersonaTaskInput);
    const { createScreenReaderPlanner } = await import('../src/index.js');
    const run = await runPersona(fx.page, {
      task,
      planner: createScreenReaderPlanner(task.steps),
      settleMs: 10,
    });
    expect(run.outcome).toMatchObject({
      status: 'blocked',
      block: { cause: 'not-exposed', selector: '#claim', measured: true },
    });
  });

  it('follows a link to complete a task matched by URL', async () => {
    const { findings, runs } = await runTasks('persona/ok.html');
    expect(findings).toEqual([]);
    expect(runs[0]!.outcome.status).toBe('success');
  });
});

describe('executor with a scripted planner', () => {
  it('performs keyboard actions and rejects actions the constraint forbids', async () => {
    const fx = await harness.open('persona/checkout-keyboard-ok.html');
    const task = PersonaTaskSchema.parse({
      id: 'scripted',
      goal: 'Pay',
      match: 'checkout',
      constraint: 'keyboard-only',
      steps: [{ name: 'Pay now' }],
      success: { text: 'Payment complete' },
    } satisfies PersonaTaskInput);
    const run = await runPersona(fx.page, {
      task,
      settleMs: 10,
      planner: createScriptedPlanner([
        { type: 'activate', ref: 'n1' },
        { type: 'press', key: 'Tab' },
        { type: 'press', key: 'Tab' },
        { type: 'press', key: 'Space' },
        { type: 'press', key: 'Tab' },
        { type: 'press', key: 'Enter' },
      ]),
    });
    expect(run.trace[0]!.result).toMatch(/^rejected: a keyboard-only persona cannot activate/);
    expect(run.outcome.status).toBe('success');
    expect(run.focusPath.map((s) => s.selector)).toEqual([
      'body > main > p:nth-of-type(1) > a',
      '#terms',
      '#pay',
    ]);
  });

  it('runs out of budget', async () => {
    const fx = await harness.open('persona/checkout-keyboard-ok.html');
    const task = PersonaTaskSchema.parse({
      id: 'budget',
      goal: 'Pay',
      match: 'checkout',
      constraint: 'keyboard-only',
      steps: [{ name: 'Pay now' }],
      success: { text: 'Payment complete' },
      maxSteps: 2,
    } satisfies PersonaTaskInput);
    const run = await runPersona(fx.page, {
      task,
      settleMs: 10,
      planner: createScriptedPlanner([
        { type: 'press', key: 'Tab' },
        { type: 'press', key: 'Tab' },
        { type: 'press', key: 'Tab' },
      ]),
    });
    expect(run.outcome).toMatchObject({ status: 'blocked', block: { cause: 'budget' } });
  });
});

describe('AI planner (mock provider, synthetic recordings)', () => {
  const RECORDINGS = [
    'persona/kb-checkout-0-tab',
    'persona/kb-checkout-1-tab',
    'persona/kb-checkout-2-space',
    'persona/kb-checkout-3-tab',
    'persona/kb-checkout-4-enter',
    'persona/kb-checkout-4-give-up',
    'persona/sr-signup-0-type',
    'persona/sr-signup-1-activate',
    'persona/sr-signup-1-give-up',
  ];

  function recordedProvider(): AiProvider & { requests: CompletionRequest[] } {
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

  const aiTasks: PersonaOptionsInput = {
    planner: 'ai',
    tasks: [
      {
        id: 'checkout-pay',
        goal: 'Accept the terms and pay for the order',
        match: 'persona/checkout-keyboard-',
        constraint: 'keyboard-only',
        success: { text: 'Payment complete' },
        maxSteps: 10,
      },
      {
        id: 'newsletter-signup',
        goal: 'Sign up for the newsletter',
        match: 'persona/signup-screen-reader-',
        constraint: 'screen-reader',
        inputs: { email: 'reader@example.test' },
        success: { text: 'You are subscribed' },
        maxSteps: 10,
      },
    ],
  };

  it('replays recorded keyboard actions to success on the correct page', async () => {
    const provider = recordedProvider();
    const { findings, runs } = await runTasks(
      'persona/checkout-keyboard-ok.html',
      aiTasks,
      provider,
    );
    expect(findings).toEqual([]);
    expect(runs[0]).toMatchObject({ planner: 'ai', outcome: { status: 'success' } });
    const req = provider.requests[0]!;
    expect(req.meta?.judge).toBe('persona-keyboard-only');
    expect(req.prompt).toMatch(/<page_data nonce="[A-Za-z0-9]+">/);
    expect(req.prompt).toContain('Accept the terms and pay for the order');
    expect(req.system).toMatch(/untrusted/);
  });

  it('gives up on the barrier and the finding is needs-review, never likely', async () => {
    const provider = recordedProvider();
    const { findings } = await runTasks(
      'persona/checkout-keyboard-blocked.html',
      aiTasks,
      provider,
    );
    const f = expectFinding(findings, { ruleId: 'persona/task-blocked' });
    expect(f).toMatchObject({ tier: 'needs-review', engine: 'persona-keyboard-only' });
    expect(f.evidence.data).toMatchObject({ planner: 'ai', provider: 'mock', model: 'mock' });
    expectPersonaTiers(findings);
  });

  it('screen reader: replays actions by tree ref and gives up on the unnamed button', async () => {
    const ok = await runTasks('persona/signup-screen-reader-ok.html', aiTasks, recordedProvider());
    expect(ok.runs[0]!.outcome.status).toBe('success');
    const blocked = await runTasks(
      'persona/signup-screen-reader-blocked.html',
      aiTasks,
      recordedProvider(),
    );
    const f = expectFinding(blocked.findings, { ruleId: 'persona/task-blocked' });
    expect(f).toMatchObject({ tier: 'needs-review', engine: 'persona-screen-reader' });
    expect(f.target.selector).toBe('#signup');
  });

  it('skips AI tasks when no provider is configured, and sends nothing', async () => {
    const { findings, runs } = await runTasks('persona/checkout-keyboard-blocked.html', aiTasks);
    expect(findings).toEqual([]);
    expect(runs).toEqual([]);
  });

  it('counts unknown model answers as invalid steps and gives up (needs-review)', async () => {
    const provider = createProvider({ provider: 'mock' }, { recordings: [] });
    const { findings } = await runTasks('persona/checkout-keyboard-ok.html', aiTasks, provider);
    const f = expectFinding(findings, { ruleId: 'persona/task-blocked' });
    expect(f.tier).toBe('needs-review');
    expect(f.evidence.data).toMatchObject({ cause: 'invalid-output' });
  });
});
