import type { AppCommand, ViewId } from '../shared/api-types.js';

/** A menu item in Electron's template shape (structural: no Electron import). */
export interface MenuItemTemplate {
  label?: string;
  role?: string;
  type?: 'separator' | 'submenu' | 'normal';
  accelerator?: string;
  click?: () => void;
  submenu?: MenuItemTemplate[];
}

export const VIEW_MENU: ReadonlyArray<{ view: ViewId; label: string; key: string }> = [
  { view: 'targets', label: 'Targets', key: '1' },
  { view: 'scans', label: 'Scans', key: '2' },
  { view: 'report', label: 'Report', key: '3' },
  { view: 'focus', label: 'Focus path', key: '4' },
  { view: 'review', label: 'Review questions', key: '5' },
  { view: 'settings', label: 'Settings', key: '6' },
];

/**
 * The app menu. Every view has a keyboard accelerator (Ctrl/Cmd + number), so the app is fully
 * usable from the keyboard; accelerators always include a modifier (WCAG 2.1.4).
 */
export function buildMenuTemplate(
  send: (command: AppCommand) => void,
  platform: NodeJS.Platform = process.platform,
): MenuItemTemplate[] {
  const go: MenuItemTemplate = {
    label: 'Go',
    submenu: VIEW_MENU.map(({ view, label, key }) => ({
      label,
      accelerator: `CmdOrCtrl+${key}`,
      click: () => send({ type: 'navigate', view }),
    })),
  };
  const template: MenuItemTemplate[] = [];
  if (platform === 'darwin') template.push({ role: 'appMenu' });
  template.push(
    { role: 'fileMenu' },
    { role: 'editMenu' },
    go,
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  );
  return template;
}
