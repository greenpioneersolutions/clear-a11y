import { createBridge, type Invoke, type Subscribe } from './bridge.js';

describe('createBridge', () => {
  it('maps API calls to channels and unwraps envelopes', async () => {
    const calls: [string, unknown][] = [];
    const invoke: Invoke = async (channel, payload) => {
      calls.push([channel, payload]);
      return channel === 'targets:remove'
        ? { ok: false, error: 'That target no longer exists.' }
        : { ok: true, value: channel };
    };
    const api = createBridge(invoke, () => () => undefined);
    expect(await api.targets.list()).toBe('targets:list');
    expect(await api.scans.start(['a'])).toBe('scans:start');
    expect(await api.findings.list('s', { tier: 'likely' })).toBe('findings:list');
    await expect(api.targets.remove('x')).rejects.toThrow('That target no longer exists.');
    expect(calls).toEqual([
      ['targets:list', undefined],
      ['scans:start', { targetIds: ['a'] }],
      ['findings:list', { scanId: 's', tier: 'likely' }],
      ['targets:remove', { id: 'x' }],
    ]);
  });

  it('rejects malformed responses', async () => {
    const api = createBridge(
      async () => 'nope' as never,
      () => () => undefined,
    );
    await expect(api.app.info()).rejects.toThrow(/unexpected response/);
  });

  it('subscribes to events and returns an unsubscribe function', () => {
    const listeners = new Map<string, (d: unknown) => void>();
    const subscribe: Subscribe = (channel, l) => {
      listeners.set(channel, l);
      return () => listeners.delete(channel);
    };
    const api = createBridge(async () => ({ ok: true, value: null }), subscribe);
    const seen: unknown[] = [];
    const off = api.scans.onProgress((s) => seen.push(s));
    listeners.get('scans:progress')?.({ id: '1' });
    off();
    expect(seen).toEqual([{ id: '1' }]);
    expect(listeners.size).toBe(0);
    expect(() => api.browsers.onProgress('x' as never)).toThrow(TypeError);
  });
});
