import { useEffect, useState } from 'preact/hooks';
import type { FocusStop } from '@clear-a11y/core';
import type { FocusPathView } from '../../shared/api-types.js';
import { errorMessage, TIER_LABEL } from '../api.js';
import { defaultScanId, type ViewProps } from '../app.js';
import { ErrorText, NoScans, ScanPicker, ViewHeading } from '../components/common.js';
import { navigate } from '../router.js';

function stopLabel(stop: FocusStop): string {
  const name = stop.name?.trim();
  const base = name ? name : stop.selector;
  return stop.role ? `${base} (${stop.role})` : base;
}

const pct = (v: number, of: number) => `${Math.round((v / of) * 1000) / 10}%`;

/**
 * The focus-path overlay: numbered Tab stops over the element boxes, arrows between consecutive
 * stops, backward jumps red, dashed and labelled. The numbered list after it is the text
 * alternative and carries the same information.
 */
export function FocusDiagram({ path }: { path: FocusPathView }) {
  const layout = path.layout;
  const backwardCount = path.stops.filter((s, i) => i > 0 && s.backward).length;
  const summary = `${path.stops.length} ${path.stops.length === 1 ? 'stop' : 'stops'}, ${backwardCount} backward ${backwardCount === 1 ? 'jump' : 'jumps'}.`;
  const id = `fp-${path.findingId}`;
  return (
    <figure class="focus-path" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`}>
        Focus path on <span class="mono break">{path.page.url}</span>: {summary}
        {layout ? ' Diagram first, then the same path as a numbered list.' : ''}
      </figcaption>
      {layout ? (
        <div
          class="fp-canvas"
          role="img"
          aria-label={`Diagram of the focus path: ${summary} The numbered list below gives the same path as text.`}
          style={{ maxWidth: `${layout.width}px` }}
        >
          <svg
            class="fp-svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <marker
                id={`${id}-head`}
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path class="fp-head" d="M0,0 L10,5 L0,10 z" />
              </marker>
              <marker
                id={`${id}-head-back`}
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path class="fp-head fp-head-back" d="M0,0 L10,5 L0,10 z" />
              </marker>
            </defs>
            {layout.stops.map((s) => (
              <rect
                key={`b${s.n}`}
                class="fp-box"
                x={s.box.x}
                y={s.box.y}
                width={s.box.width}
                height={s.box.height}
                rx="2"
              />
            ))}
            {layout.arrows.map((a) => (
              <polyline
                key={`a${a.from}`}
                class={a.backward ? 'fp-arrow fp-back' : 'fp-arrow'}
                points={`${a.x1},${a.y1} ${a.mx},${a.my} ${a.x2},${a.y2}`}
                marker-mid={`url(#${id}-${a.backward ? 'head-back' : 'head'})`}
              />
            ))}
          </svg>
          {layout.stops.map((s) => (
            <span
              key={`n${s.n}`}
              class={s.backward ? 'fp-num fp-num-back' : 'fp-num'}
              aria-hidden="true"
              data-n={s.n}
              style={{ left: pct(s.cx, layout.width), top: pct(s.cy, layout.height) }}
            />
          ))}
          {layout.arrows
            .filter((a) => a.backward)
            .map((a) => (
              <span
                key={`l${a.from}`}
                class="fp-back-label"
                aria-hidden="true"
                style={{ left: pct(a.mx, layout.width), top: pct(a.my, layout.height) }}
              >
                backward
              </span>
            ))}
        </div>
      ) : (
        <p>The stops have no positions, so only the list is shown.</p>
      )}
      <ol class="fp-list">
        {path.stops.map((s, i) => {
          const prev = path.stops[i - 1];
          return (
            <li key={`${s.index}-${s.selector}`}>
              <span>{stopLabel(s)}</span> <code class="break">{s.selector}</code>
              {i > 0 && s.backward && prev ? (
                <>
                  {' '}
                  <strong class="fp-back-text">backward jump</strong> from {i}. {stopLabel(prev)}
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      {path.screenshotUri ? (
        <>
          <p>Screenshot of the element this finding is about:</p>
          <img
            class="shot"
            src={path.screenshotUri}
            alt={`Screenshot of ${path.stops.find((s) => s.backward)?.selector ?? 'the element'}`}
          />
        </>
      ) : null}
    </figure>
  );
}

export function FocusView({ api, route, scans }: ViewProps) {
  const scanId = defaultScanId(scans, route.scanId);
  const [paths, setPaths] = useState<FocusPathView[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPaths([]);
    setSelected(0);
    setLoaded(false);
    setError(undefined);
    if (!scanId) return;
    api.report
      .focusPaths(scanId)
      .then((p) => {
        setPaths(p);
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [api, scanId]);

  const current = paths[selected];

  return (
    <>
      <ViewHeading>Focus path</ViewHeading>
      <p class="lead">
        Where keyboard focus goes when you press Tab, in order. Jumps that go backward against the
        reading order are drawn red, dashed and labelled backward.
      </p>
      {!scanId ? (
        <NoScans />
      ) : (
        <>
          <div class="toolbar">
            <ScanPicker
              id="focus-scan"
              scans={scans}
              value={scanId}
              onChange={(id) => navigate({ view: 'focus', scanId: id })}
            />
            {paths.length > 1 ? (
              <div class="field field-inline">
                <label for="focus-walk">Keyboard walk</label>
                <select
                  id="focus-walk"
                  value={String(selected)}
                  onChange={(e) =>
                    setSelected(Number((e.currentTarget as HTMLSelectElement).value))
                  }
                >
                  {paths.map((p, i) => (
                    <option key={p.findingId} value={String(i)}>
                      {TIER_LABEL[p.tier]}: {p.message.slice(0, 80)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <ErrorText message={error} />
          {loaded && !paths.length ? (
            <p>This scan recorded no keyboard focus walks with problems.</p>
          ) : null}
          {current ? (
            <section aria-labelledby="walk-heading">
              <h2 id="walk-heading">{current.message}</h2>
              <p class="item-meta">
                <span class={`tier tier-${current.tier}`}>{TIER_LABEL[current.tier]}</span>{' '}
                <span class="mono">{current.ruleId}</span>
              </p>
              <FocusDiagram path={current} />
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
