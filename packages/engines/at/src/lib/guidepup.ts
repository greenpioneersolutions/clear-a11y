import type { Logger } from '@clear-a11y/browser';

/**
 * Optional real screen reader, via Guidepup (https://www.guidepup.dev). Opt-in with
 * `at.guidepup: true`. It drives the OS screen reader, so it never runs in CI and the package
 * is not a dependency: install `@guidepup/guidepup` yourself and set up the screen reader as
 * its docs describe.
 *
 * This is the adapter seam. Findings are produced by the deterministic recorder; a screen
 * reader that confirms an announcement only raises confidence (`confirmWithScreenReader`).
 */
export interface ScreenReaderAdapter {
  name: 'voiceover' | 'nvda';
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Everything spoken since start. */
  spokenPhrases(): Promise<string[]>;
}

export type SupportedScreenReader = ScreenReaderAdapter['name'];

/** Which screen reader Guidepup can drive on this platform. */
export function guidepupScreenReaderFor(platform: string): SupportedScreenReader | undefined {
  if (platform === 'darwin') return 'voiceover';
  if (platform === 'win32') return 'nvda';
  return undefined;
}

interface GuidepupReader {
  start(): Promise<void>;
  stop(): Promise<void>;
  spokenPhraseLog(): Promise<string[]>;
}

/**
 * Loads Guidepup when enabled and supported. The import is dynamic and its specifier is
 * computed, so nothing pulls `@guidepup/guidepup` in unless a user opted in and installed it.
 */
export async function loadGuidepup(
  enabled: boolean,
  log: Logger,
  platform: string = process.platform,
): Promise<ScreenReaderAdapter | undefined> {
  if (!enabled) return undefined;
  const name = guidepupScreenReaderFor(platform);
  if (!name) {
    log.warn('at.guidepup is on but Guidepup only supports macOS (VoiceOver) and Windows (NVDA)');
    return undefined;
  }
  const specifier = ['@guidepup', 'guidepup'].join('/');
  let mod: Record<string, unknown>;
  try {
    mod = (await import(specifier)) as Record<string, unknown>;
  } catch {
    log.warn('at.guidepup is on but @guidepup/guidepup is not installed');
    return undefined;
  }
  const reader = (name === 'voiceover' ? mod['voiceOver'] : mod['nvda']) as
    GuidepupReader | undefined;
  if (!reader) return undefined;
  return {
    name,
    start: () => reader.start(),
    stop: () => reader.stop(),
    spokenPhrases: () => reader.spokenPhraseLog(),
  };
}

/**
 * Pure: raises a finding's confidence when the real screen reader confirmed the problem
 * (for example, it spoke nothing where the recorder saw a silent message).
 */
export function confirmWithScreenReader(confidence: number, confirmed: boolean): number {
  return confirmed
    ? Math.min(1, Math.round((confidence + (1 - confidence) / 2) * 100) / 100)
    : confidence;
}
