import { createStaticEngine, ENGINE_NAME } from './engine.js';

describe('createStaticEngine', () => {
  it('exposes the engine name and is read-only', () => {
    const engine = createStaticEngine();
    expect(engine.name).toBe(ENGINE_NAME);
    expect(engine.mutatesPage).toBe(false);
  });
});
