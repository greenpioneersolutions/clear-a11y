import { resolveRepoConfig, type RepoConfigInput } from '../config.js';
import type { StorybookInfo } from '../detect/detect-repo.js';
import { chooseRuntime } from './choose.js';

const sb = (over: Partial<StorybookInfo> = {}): { storybook: StorybookInfo } => ({
  storybook: { present: false, configDirs: [], staticDirs: [], inDependencies: false, ...over },
});
const cfg = (input: RepoConfigInput = {}) => resolveRepoConfig(input);

describe('chooseRuntime', () => {
  it('prefers an explicit Storybook URL, then a built Storybook, then --boot', () => {
    const built = sb({ present: true, staticDirs: ['storybook-static'] });
    expect(chooseRuntime(built, cfg({ storybookUrl: 'http://localhost:6006/' }))).toMatchObject({
      mode: 'storybook',
      source: { kind: 'url', url: 'http://localhost:6006/' },
    });
    expect(chooseRuntime(built, cfg())).toMatchObject({
      mode: 'storybook',
      source: { kind: 'static', dir: 'storybook-static' },
      notes: [],
    });
    expect(chooseRuntime(sb(), cfg({ storybookStatic: 'out/sb' }))).toMatchObject({
      mode: 'storybook',
      source: { kind: 'static', dir: 'out/sb' },
    });
    expect(chooseRuntime(sb(), cfg({ boot: true }))).toEqual({ mode: 'dev-server', notes: [] });
  });

  it('does not boot when Storybook is available, and says so', () => {
    const plan = chooseRuntime(sb({ staticDirs: ['storybook-static'] }), cfg({ boot: true }));
    expect(plan.mode).toBe('storybook');
    expect(plan.mode === 'storybook' && plan.notes[0]).toMatch(/--boot not needed/);
  });

  it('never boots without the opt-in, and explains how to enable runtime scanning', () => {
    const none = chooseRuntime(sb(), cfg());
    expect(none.mode).toBe('none');
    expect(none.mode === 'none' && none.reason).toMatch(/--boot/);
    const unbuilt = chooseRuntime(sb({ present: true, configDirs: ['.storybook'] }), cfg());
    expect(unbuilt.mode === 'none' && unbuilt.reason).toMatch(/storybook build.*--storybook-url/);
    expect(
      chooseRuntime(sb({ staticDirs: ['storybook-static'] }), cfg({ runtime: false })),
    ).toEqual({ mode: 'none', reason: 'Runtime layer disabled (repo.runtime: false).' });
  });

  it('validates the runtime options', () => {
    expect(cfg()).toMatchObject({ maxStories: 50, boot: false, runtime: true, storyFilter: [] });
    expect(() => cfg({ storybookStatic: '../elsewhere' })).toThrow();
    expect(() => cfg({ bootScript: 'dev; rm -rf /' })).toThrow();
    expect(() => cfg({ maxStories: 0 })).toThrow();
  });
});
