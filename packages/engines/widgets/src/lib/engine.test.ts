import { parseWidgetsConfig } from './config.js';
import { createWidgetsEngine, ENGINE_NAME, planWidgets, runsInState } from './engine.js';
import { WIDGET_KINDS } from './types.js';

describe('createWidgetsEngine', () => {
  it('exposes the engine name and mutates the page', () => {
    const engine = createWidgetsEngine();
    expect(engine.name).toBe(ENGINE_NAME);
    expect(engine.mutatesPage).not.toBe(false);
  });
});

describe('runsInState', () => {
  it('runs only in the default state', () => {
    expect(runsInState({ state: 'default' })).toBe(true);
    expect(runsInState({ state: 'default', stateMeta: { kind: 'default' } })).toBe(true);
    expect(runsInState({ state: 'dialog:open#x', stateMeta: { kind: 'dialog' } })).toBe(false);
  });
});

describe('config', () => {
  it('defaults to every contract', () => {
    expect(parseWidgetsConfig({})).toEqual({
      contracts: [...WIDGET_KINDS],
      maxPerKind: 5,
      maxDialogProbes: 8,
      budgetMs: 20_000,
    });
    expect(parseWidgetsConfig(undefined).maxPerKind).toBe(5);
  });

  it('rejects unknown contracts', () => {
    expect(() => parseWidgetsConfig({ contracts: ['carousel'] })).toThrow();
  });
});

describe('planWidgets', () => {
  const detection = {
    widgets: [
      { kind: 'tabs' as const, selector: '#t1' },
      { kind: 'tabs' as const, selector: '#t2' },
      { kind: 'grid' as const, selector: '#g' },
    ],
    orphanDialogs: [],
    probeButtons: [],
  };

  it('caps widgets per kind and honors the contract list', () => {
    expect(
      planWidgets(detection, parseWidgetsConfig({ maxPerKind: 1 })).map((w) => w.selector),
    ).toEqual(['#t1', '#g']);
    expect(
      planWidgets(detection, parseWidgetsConfig({ contracts: ['grid'] })).map((w) => w.selector),
    ).toEqual(['#g']);
  });
});
