import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPatch, defaultSettings, SettingsStore, toScanConfig } from './settings.js';

describe('settings', () => {
  it('defaults to provider none and no crawling', () => {
    expect(defaultSettings()).toEqual({
      ai: { provider: 'none' },
      scan: { crawl: false, maxPages: 10 },
      browsers: {},
    });
    expect(toScanConfig(defaultSettings())).toEqual({ crawl: { enabled: false, maxPages: 10 } });
  });

  it('builds an ai section with the env var name only', () => {
    const s = applyPatch(defaultSettings(), {
      ai: { provider: 'openai', model: 'gpt-5.1', apiKeyEnv: 'TEAM_OPENAI_KEY' },
    });
    expect(toScanConfig(s).ai).toEqual({
      provider: 'openai',
      model: 'gpt-5.1',
      apiKeyEnv: 'TEAM_OPENAI_KEY',
    });
  });

  it('replaces ai as a whole and clears the browsers folder with null', () => {
    let s = applyPatch(defaultSettings(), {
      ai: { provider: 'ollama', model: 'llama3.2-vision', baseUrl: 'http://127.0.0.1:11434' },
      browsers: { path: '/opt/browsers' },
    });
    s = applyPatch(s, { ai: { provider: 'none' }, browsers: { path: null } });
    expect(s.ai).toEqual({ provider: 'none' });
    expect(s.browsers).toEqual({});
  });

  it('persists, and survives a corrupt file by falling back to defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clear-a11y-settings-'));
    const file = join(dir, 'settings.json');
    const store = new SettingsStore(file);
    await store.set({ scan: { maxPages: 5 } });
    expect(JSON.parse(await readFile(file, 'utf8')).scan.maxPages).toBe(5);
    expect((await new SettingsStore(file).get()).scan.maxPages).toBe(5);

    await writeFile(file, '{ not json');
    expect(await new SettingsStore(file).get()).toEqual(defaultSettings());
    expect((await readdir(dir)).some((f) => f.startsWith('settings.json.corrupt-'))).toBe(true);
  });

  it('never stores a key: unknown fields such as apiKey are rejected', () => {
    expect(() =>
      applyPatch(defaultSettings(), {
        ai: { provider: 'anthropic', apiKey: 'sk-ant-x' } as unknown as { provider: 'anthropic' },
      }),
    ).toThrow();
  });
});
