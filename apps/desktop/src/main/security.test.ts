import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_ENTRY,
  appResponseHeaders,
  CONTENT_SECURITY_POLICY,
  denyAllPermissions,
  hardenWebContents,
  isAllowedNavigation,
  isAppUrl,
  isSafeExternalUrl,
  resolveAppAsset,
  secureWebPreferences,
  type WebContentsLike,
} from './security.js';

describe('secureWebPreferences', () => {
  it('turns on isolation and the sandbox and turns off Node in the renderer', () => {
    const prefs = secureWebPreferences('/app/preload.cjs');
    expect(prefs).toMatchObject({
      preload: '/app/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });
});

describe('CSP', () => {
  it('allows only our own scripts and no remote origins', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:/);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/);
  });

  it('matches the meta tag in index.html (minus the header-only frame-ancestors)', () => {
    const html = readFileSync(join(import.meta.dirname, '../renderer/index.html'), 'utf8');
    const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
    expect(meta).toBe(CONTENT_SECURITY_POLICY.replace("; frame-ancestors 'none'", ''));
  });

  it('is sent with every app asset', () => {
    expect(appResponseHeaders('/x/index.html')).toMatchObject({
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CONTENT_SECURITY_POLICY,
      'x-content-type-options': 'nosniff',
    });
  });
});

describe('URL checks', () => {
  it('knows the app origin', () => {
    expect(isAppUrl(APP_ENTRY)).toBe(true);
    expect(isAppUrl('clear-a11y://app/assets/index.js')).toBe(true);
    expect(isAppUrl('clear-a11y://other/index.html')).toBe(false);
    expect(isAppUrl('file:///index.html')).toBe(false);
    expect(isAppUrl('https://app/')).toBe(false);
  });

  it('allows main-frame navigation only to the app entry', () => {
    expect(isAllowedNavigation(`${APP_ENTRY}#/report`)).toBe(true);
    expect(isAllowedNavigation('clear-a11y://app/assets/index.js')).toBe(false);
    expect(isAllowedNavigation('https://example.com/')).toBe(false);
    expect(isAllowedNavigation('javascript:alert(1)')).toBe(false);
  });

  it('opens only plain http(s) links externally', () => {
    expect(isSafeExternalUrl('https://www.w3.org/WAI/WCAG22/Understanding/')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/')).toBe(true);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('https://user:pw@example.com/')).toBe(false);
    expect(isSafeExternalUrl('smb://share/x')).toBe(false);
  });

  it('serves only files inside the renderer folder', () => {
    const dir = '/opt/app/renderer';
    expect(resolveAppAsset(dir, 'clear-a11y://app/')).toBe('/opt/app/renderer/index.html');
    expect(resolveAppAsset(dir, 'clear-a11y://app/assets/a.js')).toBe(
      '/opt/app/renderer/assets/a.js',
    );
    expect(resolveAppAsset(dir, 'clear-a11y://app/../main/main.js')).toBe(
      '/opt/app/renderer/main/main.js', // URL parsing already removes the ..
    );
    expect(resolveAppAsset(dir, 'clear-a11y://app/%2e%2e/%2e%2e/etc/passwd')).toBe(
      '/opt/app/renderer/etc/passwd', // also normalized by the URL parser: stays inside
    );
    expect(resolveAppAsset(dir, 'clear-a11y://app/..%2f..%2fetc%2fpasswd')).toBeUndefined();
    expect(resolveAppAsset(dir, 'clear-a11y://app/a%00.js')).toBeUndefined();
    expect(resolveAppAsset(dir, 'clear-a11y://evil/index.html')).toBeUndefined();
    expect(resolveAppAsset(dir, 'https://app/index.html')).toBeUndefined();
  });
});

type Listener = (...args: unknown[]) => void;

function fakeContents() {
  const listeners = new Map<string, Listener>();
  let openHandler: ((d: { url: string }) => { action: string }) | undefined;
  const contents = {
    setWindowOpenHandler(h: (d: { url: string }) => { action: string }) {
      openHandler = h;
    },
    on(event: string, listener: Listener) {
      listeners.set(event, listener);
      return contents;
    },
  };
  const event = () => {
    const e = { prevented: false, preventDefault: () => (e.prevented = true) };
    return e;
  };
  return {
    contents: contents as unknown as WebContentsLike,
    open: (url: string) => openHandler?.({ url }),
    navigate(url: string) {
      const e = event();
      listeners.get('will-navigate')?.(e, url);
      return e.prevented;
    },
    redirect(url: string) {
      const e = event();
      listeners.get('will-redirect')?.(e, url);
      return e.prevented;
    },
    frame(url: string, isMainFrame = false) {
      const e = Object.assign(event(), { url, isMainFrame });
      listeners.get('will-frame-navigate')?.(e);
      return e.prevented;
    },
    webview() {
      const e = event();
      listeners.get('will-attach-webview')?.(e);
      return e.prevented;
    },
  };
}

describe('hardenWebContents', () => {
  it('denies new windows and sends http(s) links to the system browser', () => {
    const opened: string[] = [];
    const wc = fakeContents();
    hardenWebContents(wc.contents, { openExternal: (u) => opened.push(u) });
    expect(wc.open('https://www.w3.org/')).toEqual({ action: 'deny' });
    expect(wc.open('file:///etc/passwd')).toEqual({ action: 'deny' });
    expect(opened).toEqual(['https://www.w3.org/']);
  });

  it('blocks navigation away from the app, redirects, frame navigation and webviews', () => {
    const opened: string[] = [];
    const wc = fakeContents();
    hardenWebContents(wc.contents, { openExternal: (u) => opened.push(u) });
    expect(wc.navigate(`${APP_ENTRY}#/scans`)).toBe(false);
    expect(wc.navigate('https://example.com/')).toBe(true);
    expect(wc.navigate('file:///etc/passwd')).toBe(true);
    expect(wc.redirect('https://example.com/')).toBe(true);
    expect(wc.frame('about:srcdoc')).toBe(false);
    expect(wc.frame('about:srcdoc#summary')).toBe(false);
    expect(wc.frame('about:srcdocx')).toBe(true);
    expect(wc.frame('https://example.com/inside-report')).toBe(true);
    expect(wc.frame('https://example.com/', true)).toBe(false); // main frame: will-navigate decides
    expect(wc.webview()).toBe(true);
    expect(opened).toEqual(['https://example.com/', 'https://example.com/inside-report']);
  });
});

describe('denyAllPermissions', () => {
  it('refuses every permission request and check', () => {
    let request: ((wc: unknown, p: string, cb: (g: boolean) => void) => void) | null = null;
    let check: ((...a: unknown[]) => boolean) | null = null;
    denyAllPermissions({
      setPermissionRequestHandler: (h) => (request = h),
      setPermissionCheckHandler: (h) => (check = h),
    });
    const answers: boolean[] = [];
    (request as unknown as (wc: unknown, p: string, cb: (g: boolean) => void) => void)(
      {},
      'media',
      (g) => answers.push(g),
    );
    expect(answers).toEqual([false]);
    expect((check as unknown as () => boolean)()).toBe(false);
  });
});
