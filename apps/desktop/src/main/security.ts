import { isAbsolute, join, normalize, relative, sep } from 'node:path';

/**
 * Electron security settings, as plain data and functions so they unit-test without Electron.
 * Checklist: https://www.electronjs.org/docs/latest/tutorial/security
 */

/** The renderer is served from a custom, privileged scheme rather than file://. */
export const APP_SCHEME = 'clear-a11y';
export const APP_HOST = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY = `${APP_ORIGIN}/index.html`;

/**
 * Strict CSP for the app window: only our own scripts, no remote origins, no connections.
 * `style-src 'unsafe-inline'` is needed by the embedded HTML report (a srcdoc frame inherits this
 * policy, and the report uses inline styles); scripts never get 'unsafe-inline'. The report frame
 * itself is `sandbox=""`, so no script runs in it at all. Keep in sync with
 * `src/renderer/index.html`.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-src 'self'",
  "child-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** webPreferences for every window we create. */
export function secureWebPreferences(preload: string) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    spellcheck: false,
    devTools: true,
  } as const;
}

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** True for the app's own pages (`clear-a11y://app/...`). */
export function isAppUrl(url: string): boolean {
  const u = parse(url);
  return Boolean(u && u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST);
}

/** True for the app entry page (any hash): the only place the main frame may navigate to. */
export function isAllowedNavigation(url: string): boolean {
  const u = parse(url);
  if (!u || !isAppUrl(url)) return false;
  return u.pathname === '/index.html' || u.pathname === '/';
}

/** Links we hand to the system browser: plain http(s) only, no credentials. */
export function isSafeExternalUrl(url: string): boolean {
  const u = parse(url);
  return Boolean(
    u && (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password,
  );
}

/** Subframes may only hold inline documents (the sandboxed report is a srcdoc frame). */
export function isAllowedFrameUrl(url: string): boolean {
  // In-page links inside the report (about:srcdoc#summary) only scroll the frame.
  return /^about:(srcdoc|blank)(#.*)?$/.test(url);
}

/**
 * Maps a `clear-a11y://app/<path>` request to a file inside the renderer folder, or undefined when
 * it would escape that folder or is not an app URL.
 */
export function resolveAppAsset(rendererDir: string, requestUrl: string): string | undefined {
  const u = parse(requestUrl);
  if (!u || !isAppUrl(requestUrl)) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    return undefined;
  }
  if (path === '/' || path === '') path = '/index.html';
  if (path.includes('\0')) return undefined;
  const file = normalize(join(rendererDir, path));
  const rel = relative(rendererDir, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
    return undefined;
  }
  return file;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function mimeFor(file: string): string {
  const dot = file.lastIndexOf('.');
  return MIME[dot >= 0 ? file.slice(dot).toLowerCase() : ''] ?? 'application/octet-stream';
}

/** Response headers for app assets. */
export function appResponseHeaders(file: string): Record<string, string> {
  return {
    'content-type': mimeFor(file),
    'content-security-policy': CONTENT_SECURITY_POLICY,
    'x-content-type-options': 'nosniff',
    'cross-origin-opener-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
  };
}

interface PreventableEvent {
  preventDefault(): void;
}

/** The part of Electron's `WebContents` that `hardenWebContents` touches. */
export interface WebContentsLike {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' | 'allow' }): void;
  on(
    event: 'will-navigate' | 'will-redirect',
    listener: (e: PreventableEvent, url: string) => void,
  ): unknown;
  on(
    event: 'will-frame-navigate',
    listener: (e: PreventableEvent & { url: string; isMainFrame: boolean }) => void,
  ): unknown;
  on(event: 'will-attach-webview', listener: (e: PreventableEvent) => void): unknown;
}

export interface HardenOptions {
  openExternal(url: string): void;
}

/**
 * Applied to every web contents the app creates: no new windows (http(s) links go to the system
 * browser), no navigation away from the app, subframes limited to inline documents, no <webview>.
 */
export function hardenWebContents(contents: WebContentsLike, options: HardenOptions): void {
  const external = (url: string) => {
    if (isSafeExternalUrl(url)) options.openExternal(url);
  };
  contents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event: PreventableEvent, url: string) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      external(url);
    }
  });
  contents.on('will-redirect', (event: PreventableEvent, url: string) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return; // covered by will-navigate
    if (!isAllowedFrameUrl(event.url)) {
      event.preventDefault();
      external(event.url);
    }
  });
  contents.on('will-attach-webview', (event: PreventableEvent) => event.preventDefault());
}

/** The part of Electron's `Session` used to refuse every permission request. */
export interface SessionLike {
  setPermissionRequestHandler(
    handler:
      ((wc: unknown, permission: string, callback: (granted: boolean) => void) => void) | null,
  ): void;
  setPermissionCheckHandler(handler: ((...args: unknown[]) => boolean) | null): void;
}

/** The app needs no camera, microphone, notifications, geolocation...: deny them all. */
export function denyAllPermissions(session: SessionLike): void {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}
