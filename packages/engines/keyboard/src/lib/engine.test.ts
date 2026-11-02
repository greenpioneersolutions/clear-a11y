import { createKeyboardEngine, ENGINE_NAME } from './engine.js';
import { parseKeyboardOptions } from './options.js';
import { clipAround } from './screenshot.js';
import { toFocusStop } from './walker.js';

describe('createKeyboardEngine', () => {
  it('exposes the engine name and needs its own page load', () => {
    const engine = createKeyboardEngine();
    expect(engine.name).toBe(ENGINE_NAME);
    expect(engine.mutatesPage).toBe(true);
  });
});

describe('parseKeyboardOptions', () => {
  it('fills defaults and validates', () => {
    expect(parseKeyboardOptions({})).toMatchObject({ maxStops: 150, focusVisibleMaxStops: 40 });
    expect(parseKeyboardOptions(undefined).maxFindingsPerRule).toBe(10);
    expect(() => parseKeyboardOptions({ maxStops: -1 })).toThrow();
  });
});

describe('clipAround', () => {
  const viewport = { width: 1280, height: 800 };
  it('pads and clamps to the viewport', () => {
    expect(clipAround({ x: 4, y: 10, width: 50, height: 20 }, 8, viewport)).toEqual({
      x: 0,
      y: 2,
      width: 62,
      height: 36,
    });
  });
  it('returns null off screen', () => {
    expect(clipAround({ x: -9999, y: 10, width: 50, height: 20 }, 8, viewport)).toBeNull();
    expect(clipAround({ x: 10, y: 900, width: 50, height: 20 }, 8, viewport)).toBeNull();
  });
});

describe('toFocusStop', () => {
  it('keeps only evidence fields and marks backward stops', () => {
    const stop = toFocusStop(
      {
        index: 2,
        selector: '#last-name',
        name: 'Last name',
        role: 'textbox',
        tag: 'input',
        rect: { x: 336.4, y: 100.2, width: 300, height: 40 },
        client: { x: 336.4, y: 100.2, width: 300, height: 40 },
        visible: true,
        tiny: false,
        fixed: false,
        region: '',
        rtl: false,
        frame: false,
        inOverlay: false,
        hits: [],
      },
      true,
    );
    expect(stop).toEqual({
      index: 2,
      selector: '#last-name',
      name: 'Last name',
      role: 'textbox',
      rect: { x: 336, y: 100, width: 300, height: 40 },
      backward: true,
    });
  });
});
