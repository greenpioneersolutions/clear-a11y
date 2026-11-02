import { launchBrowser, type BrowserSession } from '@clear-a11y/browser';
import { fixtureHarness } from '@clear-a11y/test-utils';
import { keyboardWalk } from '../src/index.js';

const harness = fixtureHarness();
let session: BrowserSession;
beforeAll(async () => {
  session = await launchBrowser();
});
afterAll(async () => {
  await session.close();
  await harness.close();
});

const urlOf = async (path: string) => new URL(path, await harness.baseUrl()).href;

describe('keyboardWalk (integration)', () => {
  it('returns the Tab path and flags the backward jump', async () => {
    const result = await keyboardWalk(await urlOf('keyboard/focus-order-backward.html'), {
      session,
    });
    expect(result.stops.map((s) => s.selector)).toEqual([
      '#first-name',
      '#country',
      '#last-name',
      '#submit',
    ]);
    expect(result.backwardJumps).toEqual([{ from: 1, to: 2 }]);
    expect(result.stops[2]).toMatchObject({ selector: '#last-name', backward: true });
    expect(result.stops[0]?.rect?.width).toBeGreaterThan(0);
    expect(result.end).toBe('wrapped');
    expect(result.cycle).toBeNull();
  });

  it('reports no backward jump on the correct pattern', async () => {
    const result = await keyboardWalk(await urlOf('keyboard/focus-order-backward-ok.html'), {
      session,
    });
    expect(result.stops.length).toBeGreaterThan(1);
    expect(result.backwardJumps).toEqual([]);
  });

  it('reports the cycle on a keyboard trap', async () => {
    const result = await keyboardWalk(await urlOf('keyboard/keyboard-trap.html'), {
      session,
      maxStops: 30,
    });
    expect(result.end).toBe('cycle');
    expect(result.cycle?.length).toBeGreaterThan(0);
  });
});
