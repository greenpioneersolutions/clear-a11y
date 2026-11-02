import { parseVisualConfig } from './config.js';

describe('parseVisualConfig', () => {
  it('fills defaults from an empty section', () => {
    const c = parseVisualConfig({});
    expect(c.reflow).toBe(true);
    expect(c.maxHoverTriggers).toBe(6);
    expect(c.targetSizeEquivalent).toEqual([]);
  });

  it('accepts overrides and rejects bad values', () => {
    expect(parseVisualConfig({ hover: false, hoverPersistMs: 2000 }).hoverPersistMs).toBe(2000);
    expect(() => parseVisualConfig({ maxHoverTriggers: -1 })).toThrow();
  });
});
