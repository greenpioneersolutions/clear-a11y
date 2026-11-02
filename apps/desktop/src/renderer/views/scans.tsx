import { useEffect, useState } from 'preact/hooks';
import type { ScanRecord } from '../../shared/api-types.js';
import { errorMessage, formatDate, plural, STATUS_LABEL } from '../api.js';
import type { ViewProps } from '../app.js';
import { ErrorText, ViewHeading } from '../components/common.js';
import { hrefFor } from '../router.js';

function Progress({ scan }: { scan: ScanRecord }) {
  const p = scan.progress;
  const id = `progress-${scan.id}`;
  if (scan.status === 'queued') return <p class="item-meta">Waiting for the scan before it.</p>;
  if (!p || p.total === 0) {
    return (
      <div class="progress-row">
        <label for={id}>Progress</label>
        <progress id={id} aria-describedby={`${id}-text`} />
        <span id={`${id}-text`}>Starting</span>
      </div>
    );
  }
  return (
    <div class="progress-row">
      <label for={id}>Progress</label>
      <progress id={id} max={p.total} value={p.done} aria-describedby={`${id}-text`} />
      <span id={`${id}-text`}>
        {`${p.done} of ${p.total} ${p.total === 1 ? 'page' : 'pages'}`}
        {p.message ? <span class="break">: {p.message}</span> : null}
      </span>
    </div>
  );
}

function Counts({ scan }: { scan: ScanRecord }) {
  const s = scan.summary;
  if (!s) return null;
  const pages = scan.pages ?? 0;
  const text =
    `${plural(s.total, 'finding')}: ` +
    `${plural(s.byTier['violation'] ?? 0, 'violation')}, ` +
    `${plural(s.byTier['likely'] ?? 0, 'likely issue')}, ` +
    `${s.byTier['needs-review'] ?? 0} needing review. ` +
    `${plural(pages, 'page')} scanned` +
    `${scan.errors ? `, ${scan.errors} could not be fully checked` : ''}.`;
  return <p class="item-meta">{text}</p>;
}

export function ScansView({ api, scans, refreshScans, announce }: ViewProps) {
  const [error, setError] = useState<string>();

  useEffect(() => {
    void refreshScans();
  }, [refreshScans]);

  const cancel = async (scan: ScanRecord) => {
    setError(undefined);
    try {
      await api.scans.cancel(scan.id);
      await refreshScans();
      announce(`Cancelled the scan of ${scan.label}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const active = scans.filter((s) => s.status === 'queued' || s.status === 'running');
  const past = scans.filter((s) => !(s.status === 'queued' || s.status === 'running'));

  return (
    <>
      <ViewHeading>Scans</ViewHeading>
      <p class="lead">
        Scans run one at a time on this computer. You can keep using the app while they run.
      </p>
      <ErrorText message={error} />

      <section aria-labelledby="active-heading">
        <h2 id="active-heading">{`Running and waiting (${active.length})`}</h2>
        {active.length === 0 ? (
          <p>
            Nothing is running. Start a scan from <a href="#/targets">Targets</a>.
          </p>
        ) : (
          <ul class="item-list">
            {active.map((s) => (
              <li key={s.id} class="item">
                <div class="item-main">
                  <p class="item-title">{s.label}</p>
                  <p class="item-meta">
                    <span class="tag">{STATUS_LABEL[s.status]}</span>{' '}
                    <span class="mono break">{s.target}</span>
                  </p>
                  <Progress scan={s} />
                </div>
                <div class="item-actions">
                  <button type="button" class="button" onClick={() => cancel(s)}>
                    Cancel<span class="visually-hidden"> the scan of {s.label}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past-heading">
        <h2 id="past-heading">{`Past scans (${past.length})`}</h2>
        {past.length === 0 ? (
          <p>No finished scans yet.</p>
        ) : (
          <ul class="item-list">
            {past.map((s) => (
              <li key={s.id} class="item">
                <div class="item-main">
                  <p class="item-title">{s.label}</p>
                  <p class="item-meta">
                    <span class={`tag status-${s.status}`}>{STATUS_LABEL[s.status]}</span>{' '}
                    {formatDate(s.finishedAt ?? s.createdAt)}{' '}
                    <span class="mono break">{s.target}</span>
                  </p>
                  {s.status === 'succeeded' ? <Counts scan={s} /> : null}
                  {s.status === 'failed' && s.error ? (
                    <p class="item-meta">Reason: {s.error}</p>
                  ) : null}
                </div>
                {s.status === 'succeeded' ? (
                  <div class="item-actions">
                    <a class="button primary" href={hrefFor({ view: 'report', scanId: s.id })}>
                      Report<span class="visually-hidden"> for {s.label}</span>
                    </a>
                    <a class="button" href={hrefFor({ view: 'focus', scanId: s.id })}>
                      Focus path<span class="visually-hidden"> for {s.label}</span>
                    </a>
                    {(s.summary?.byTier['needs-review'] ?? 0) > 0 ? (
                      <a class="button" href={hrefFor({ view: 'review', scanId: s.id })}>
                        Review<span class="visually-hidden"> questions for {s.label}</span>
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
