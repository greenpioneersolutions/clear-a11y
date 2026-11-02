import { silentLogger } from '@clear-a11y/browser';
import { confirmWithScreenReader, guidepupScreenReaderFor, loadGuidepup } from './guidepup.js';

describe('guidepup adapter', () => {
  it('is off unless enabled', async () => {
    expect(await loadGuidepup(false, silentLogger)).toBeUndefined();
  });

  it('is unavailable on platforms Guidepup does not support', async () => {
    expect(guidepupScreenReaderFor('linux')).toBeUndefined();
    expect(guidepupScreenReaderFor('darwin')).toBe('voiceover');
    expect(guidepupScreenReaderFor('win32')).toBe('nvda');
    expect(await loadGuidepup(true, silentLogger, 'linux')).toBeUndefined();
  });

  it('raises confidence only when the screen reader confirmed the problem', () => {
    expect(confirmWithScreenReader(0.8, false)).toBe(0.8);
    expect(confirmWithScreenReader(0.8, true)).toBe(0.9);
  });

  // Drives the real OS screen reader. Never in CI: opt in with CLEAR_A11Y_GUIDEPUP=1 after
  // installing @guidepup/guidepup and setting up VoiceOver or NVDA as its docs describe.
  it.skipIf(process.env['CLEAR_A11Y_GUIDEPUP'] !== '1')(
    'starts and stops the real screen reader',
    async () => {
      const reader = await loadGuidepup(true, silentLogger);
      expect(reader).toBeDefined();
      await reader!.start();
      await reader!.stop();
    },
  );
});
