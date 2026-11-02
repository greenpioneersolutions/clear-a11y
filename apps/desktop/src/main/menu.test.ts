import type { AppCommand } from '../shared/api-types.js';
import { buildMenuTemplate, VIEW_MENU } from './menu.js';

describe('buildMenuTemplate', () => {
  it('gives every view a modified keyboard accelerator that navigates', () => {
    const sent: AppCommand[] = [];
    const template = buildMenuTemplate((c) => sent.push(c), 'linux');
    const go = template.find((m) => m.label === 'Go');
    expect(go?.submenu).toHaveLength(VIEW_MENU.length);
    for (const item of go?.submenu ?? []) {
      expect(item.accelerator).toMatch(/^CmdOrCtrl\+\d$/);
      item.click?.();
    }
    expect(sent.map((c) => c.view)).toEqual(VIEW_MENU.map((v) => v.view));
  });

  it('adds the app menu on macOS only', () => {
    expect(buildMenuTemplate(() => undefined, 'darwin')[0]?.role).toBe('appMenu');
    expect(buildMenuTemplate(() => undefined, 'win32')[0]?.role).toBe('fileMenu');
  });
});
