import { createVisualEngine, ENGINE_NAME } from './engine.js';

describe('createVisualEngine', () => {
  it('exposes the engine name', () => {
    expect(createVisualEngine().name).toBe(ENGINE_NAME);
  });
});
