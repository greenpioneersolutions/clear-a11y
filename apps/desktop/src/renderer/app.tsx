import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ClearA11yApi, ScanRecord, ViewId } from '../shared/api-types.js';
import { errorMessage } from './api.js';
import { hrefFor, navigate, parseLocation, VIEW_TITLES, type Route } from './router.js';
import { FocusView } from './views/focus.js';
import { ReportView } from './views/report.js';
import { ReviewView } from './views/review.js';
import { ScansView } from './views/scans.js';
import { SettingsView } from './views/settings.js';
import { TargetsView } from './views/targets.js';

const NAV: ViewId[] = ['targets', 'scans', 'report', 'focus', 'review', 'settings'];
/** Views that show one scan: the nav keeps the chosen scan when moving between them. */
const SCAN_VIEWS = new Set<ViewId>(['report', 'focus', 'review']);

export interface ViewProps {
  api: ClearA11yApi;
  route: Route;
  scans: ScanRecord[];
  refreshScans: () => Promise<void>;
  /** Polite announcement for screen readers. */
  announce: (message: string) => void;
}

/** Newest finished scan, used when a view opens without a scan id. */
export function defaultScanId(scans: ScanRecord[], wanted?: string): string | undefined {
  if (wanted && scans.some((s) => s.id === wanted && s.status === 'succeeded')) return wanted;
  return scans.find((s) => s.status === 'succeeded')?.id;
}

export function App({ api }: { api: ClearA11yApi }) {
  const [route, setRoute] = useState<Route>(() => parseLocation(window.location));
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [live, setLive] = useState('');
  const first = useRef(true);

  const announce = useCallback((message: string) => {
    // Clear first so repeating the same message is announced again.
    setLive('');
    window.setTimeout(() => setLive(message), 50);
  }, []);

  const refreshScans = useCallback(async () => {
    try {
      setScans(await api.scans.list());
      setLoadError(undefined);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [api]);

  useEffect(() => {
    void refreshScans();
    const offProgress = api.scans.onProgress((record) => {
      setScans((list) => {
        const i = list.findIndex((s) => s.id === record.id);
        if (i === -1) return [record, ...list];
        const next = [...list];
        next[i] = record;
        return next;
      });
    });
    const offCommand = api.app.onCommand((command) => {
      if (command.type === 'navigate') navigate({ view: command.view });
    });
    const onHash = () => setRoute(parseLocation(window.location));
    window.addEventListener('hashchange', onHash);
    return () => {
      offProgress();
      offCommand();
      window.removeEventListener('hashchange', onHash);
    };
  }, [api, refreshScans]);

  // On navigation to another view: update the title, move focus to the view heading and announce
  // the view. Choosing another scan in a view's scan picker only changes the content: focus stays
  // on the picker, so changing its value is not a change of context (WCAG 3.2.2).
  useEffect(() => {
    const title = VIEW_TITLES[route.view];
    document.title = `${title} - Clear A11Y`;
    if (first.current) {
      first.current = false;
      return;
    }
    const heading = document.getElementById('view-heading');
    heading?.focus();
    announce(`${title} page`);
  }, [route.view, announce]);

  const props: ViewProps = { api, route, scans, refreshScans, announce };

  return (
    <>
      <a class="skip-link" href="#main" onClick={skipToMain}>
        Skip to main content
      </a>
      <header class="app-header">
        <p class="brand">
          <span class="brand-mark" aria-hidden="true">
            A11Y
          </span>{' '}
          Clear A11Y
        </p>
        <nav aria-label="Pages">
          <ul class="nav-list">
            {NAV.map((view) => (
              <li key={view}>
                <a
                  href={hrefFor(
                    SCAN_VIEWS.has(view) && route.scanId
                      ? { view, scanId: route.scanId }
                      : { view },
                  )}
                  aria-current={route.view === view ? 'page' : undefined}
                  class={route.view === view ? 'nav-link current' : 'nav-link'}
                >
                  {VIEW_TITLES[view]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {loadError ? (
          <p class="error" role="alert">
            Could not load scans: {loadError}
          </p>
        ) : null}
        {route.view === 'targets' && <TargetsView {...props} />}
        {route.view === 'scans' && <ScansView {...props} />}
        {route.view === 'report' && <ReportView {...props} />}
        {route.view === 'focus' && <FocusView {...props} />}
        {route.view === 'review' && <ReviewView {...props} />}
        {route.view === 'settings' && <SettingsView {...props} />}
      </main>
      <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {live || null}
      </div>
    </>
  );
}

function skipToMain(event: MouseEvent): void {
  // Hash links are routes in this app, so move focus without changing the hash.
  event.preventDefault();
  document.getElementById('main')?.focus();
}
