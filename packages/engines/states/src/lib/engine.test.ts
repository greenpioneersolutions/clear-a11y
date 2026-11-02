import { createStatesEngine, ENGINE_NAME } from './engine.js';

describe('createStatesEngine', () => {
  it('exposes the engine name', () => {
    expect(createStatesEngine().name).toBe(ENGINE_NAME);
  });
});
