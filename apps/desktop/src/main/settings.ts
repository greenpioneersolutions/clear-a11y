import type { ClearA11yConfigInput } from '@clear-a11y/core';
import type { Settings, SettingsPatch } from '../shared/api-types.js';
import { SettingsSchema } from '../shared/ipc-schemas.js';
import { readJsonFile, writeJsonFile } from './json-file.js';

/** Defaults: provider `none` (nothing leaves the machine), no crawling. */
export const defaultSettings = (): Settings => SettingsSchema.parse({}) as Settings;

/** Applies a validated patch. `ai` is replaced as a whole so stale fields don't linger. */
export function applyPatch(current: Settings, patch: SettingsPatch): Settings {
  const next: Settings = {
    ai: patch.ai ? { ...patch.ai } : current.ai,
    scan: { ...current.scan, ...(patch.scan ?? {}) },
    browsers: { ...current.browsers },
  };
  if (patch.browsers && 'path' in patch.browsers) {
    if (patch.browsers.path) next.browsers.path = patch.browsers.path;
    else delete next.browsers.path;
  }
  return SettingsSchema.parse(next) as Settings;
}

/**
 * The scan config built from settings. The AI section carries the env var NAME only; the provider
 * reads the key from the environment at scan time. With provider `none` no AI section is sent.
 */
export function toScanConfig(settings: Settings): ClearA11yConfigInput {
  const config: ClearA11yConfigInput = {
    crawl: { enabled: settings.scan.crawl, maxPages: settings.scan.maxPages },
  };
  if (settings.ai.provider !== 'none') {
    const { provider, model, apiKeyEnv, baseUrl } = settings.ai;
    config.ai = {
      provider,
      ...(model ? { model } : {}),
      ...(apiKeyEnv ? { apiKeyEnv } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    };
  }
  return config;
}

/** Settings in `<dataDir>/settings.json`. API keys are never part of it. */
export class SettingsStore {
  private cache?: Settings;

  constructor(private readonly file: string) {}

  async get(): Promise<Settings> {
    if (!this.cache) {
      this.cache = (await readJsonFile(this.file, SettingsSchema, defaultSettings)) as Settings;
    }
    return structuredClone(this.cache);
  }

  async set(patch: SettingsPatch): Promise<Settings> {
    const next = applyPatch(await this.get(), patch);
    await writeJsonFile(this.file, next);
    this.cache = next;
    return structuredClone(next);
  }
}
