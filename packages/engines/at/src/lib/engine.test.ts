import { createAtEngine, ENGINE_NAME, phasesFor } from './engine.js';
import { parseAtConfig } from './config.js';

describe('createAtEngine', () => {
  it('exposes the engine name and mutates the page (it presses buttons)', () => {
    const engine = createAtEngine();
    expect(engine.name).toBe(ENGINE_NAME);
    expect(engine.mutatesPage).toBeUndefined();
  });
});

describe('phasesFor', () => {
  it('probes buttons and forms only in the default state', () => {
    expect(phasesFor({ state: 'default' })).toEqual({
      tree: true,
      buttons: true,
      forms: true,
      replay: false,
    });
    expect(phasesFor({ state: 'dialog:open#x', stateMeta: { kind: 'dialog' } })).toMatchObject({
      tree: true,
      buttons: false,
      forms: false,
      replay: false,
    });
  });

  it('replays form-invalid and form-empty states with the recorder', () => {
    const replay = async () => undefined;
    expect(
      phasesFor({ state: 'form-invalid#signup', stateMeta: { kind: 'form-invalid', replay } }),
    ).toMatchObject({ buttons: false, forms: false, replay: true });
    expect(phasesFor({ state: 'form-empty#x', stateMeta: { kind: 'form-empty' } }).replay).toBe(
      false,
    );
  });
});

describe('parseAtConfig', () => {
  it('defaults guidepup to false and keeps probes on', () => {
    expect(parseAtConfig(undefined)).toMatchObject({
      guidepup: false,
      probeButtons: 20,
      probeForms: 3,
    });
    expect(() => parseAtConfig({ probeButtons: -1 })).toThrow();
  });
});
