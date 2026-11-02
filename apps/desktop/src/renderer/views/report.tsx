import { useEffect, useState } from 'preact/hooks';
import type { FindingView } from '../../shared/api-types.js';
import { errorMessage, TIER_LABEL, TIER_MEANING, TIER_PLURAL } from '../api.js';
import { defaultScanId, type ViewProps } from '../app.js';
import { Disclosure, ErrorText, NoScans, ScanPicker, ViewHeading } from '../components/common.js';
import { navigate } from '../router.js';

const TIERS = ['violation', 'likely', 'needs-review'] as const;
type TierFilter = (typeof TIERS)[number] | 'all';

function FindingDetails({ f }: { f: FindingView }) {
  return (
    <Disclosure
      id={`finding-${f.id}`}
      heading={3}
      class="finding"
      summary={
        <>
          <span class={`tier tier-${f.tier}`}>{TIER_LABEL[f.tier]}</span>{' '}
          <span class="finding-message">{f.message}</span>
        </>
      }
    >
      <dl class="facts">
        <dt>WCAG</dt>
        <dd>
          {f.criteria.length
            ? f.criteria
                .map((c) => `${c.sc} ${c.title}${c.level ? ` (${c.level})` : ''}`)
                .join(', ')
            : 'Best practice (no success criterion)'}
        </dd>
        <dt>Element</dt>
        <dd class="mono break">{f.target.selector}</dd>
        <dt>Page</dt>
        <dd class="mono break">
          {f.page.url} ({f.page.state}, {f.page.viewport})
        </dd>
        {f.source ? (
          <>
            <dt>Source</dt>
            <dd class="mono break">
              {f.source.file}:{f.source.line}
            </dd>
          </>
        ) : null}
        <dt>Rule</dt>
        <dd class="mono">{f.ruleId}</dd>
        <dt>Found by</dt>
        <dd>{`${f.engine}, confidence ${Math.round(f.confidence * 100)}%`}</dd>
        {f.fix ? (
          <>
            <dt>How to fix</dt>
            <dd>{f.fix}</dd>
          </>
        ) : null}
        {f.question ? (
          <>
            <dt>Question</dt>
            <dd>{f.question}</dd>
          </>
        ) : null}
      </dl>
      {f.screenshotUri ? (
        <img class="shot" src={f.screenshotUri} alt={`Screenshot of ${f.target.selector}`} />
      ) : null}
    </Disclosure>
  );
}

export function ReportView({ api, route, scans }: ViewProps) {
  const scanId = defaultScanId(scans, route.scanId);
  const [findings, setFindings] = useState<FindingView[]>([]);
  const [tier, setTier] = useState<TierFilter>('all');
  const [error, setError] = useState<string>();
  const [html, setHtml] = useState<string>();
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    setFindings([]);
    setHtml(undefined);
    setShowReport(false);
    setError(undefined);
    if (!scanId) return;
    api.findings
      .list(scanId)
      .then(setFindings)
      .catch((err) => setError(errorMessage(err)));
  }, [api, scanId]);

  // The button flips aria-expanded right away; the report HTML loads when first shown.
  const toggleReport = () => setShowReport((open) => !open);

  useEffect(() => {
    if (!showReport || html !== undefined || !scanId) return;
    api.report
      .html(scanId)
      .then(setHtml)
      .catch((err) => setError(errorMessage(err)));
  }, [api, scanId, showReport, html]);

  const shown = findings.filter((f) => tier === 'all' || f.tier === tier);
  const count = (t: (typeof TIERS)[number]) => findings.filter((f) => f.tier === t).length;

  return (
    <>
      <ViewHeading>Report</ViewHeading>
      {!scanId ? (
        <NoScans />
      ) : (
        <>
          <div class="toolbar">
            <ScanPicker
              id="report-scan"
              scans={scans}
              value={scanId}
              onChange={(id) => navigate({ view: 'report', scanId: id })}
            />
            <div class="field field-inline">
              <label for="tier-filter">Show</label>
              <select
                id="tier-filter"
                value={tier}
                onChange={(e) =>
                  setTier((e.currentTarget as HTMLSelectElement).value as TierFilter)
                }
              >
                <option value="all">All findings</option>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_PLURAL[t]} only
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ErrorText message={error} />
          <ul class="summary-cards" aria-label="Findings by tier">
            {TIERS.map((t) => (
              <li key={t} class={`summary-card card-${t}`}>
                <span class="summary-count">{String(count(t))}</span>{' '}
                <span class="summary-label">{count(t) === 1 ? TIER_LABEL[t] : TIER_PLURAL[t]}</span>
                <span class="summary-meaning">{TIER_MEANING[t]}</span>
              </li>
            ))}
          </ul>
          <p role="status" class="filter-status">
            {`Showing ${shown.length} of ${findings.length} findings.`}
          </p>
          {TIERS.filter((t) => tier === 'all' || tier === t).map((t) => {
            const inTier = shown.filter((f) => f.tier === t);
            if (!inTier.length) return null;
            return (
              <section key={t} aria-labelledby={`tier-${t}-heading`}>
                <h2 id={`tier-${t}-heading`}>{`${TIER_PLURAL[t]} (${inTier.length})`}</h2>
                {inTier.map((f) => (
                  <FindingDetails key={f.id} f={f} />
                ))}
              </section>
            );
          })}

          <section aria-labelledby="full-report-heading">
            <h2 id="full-report-heading">Full HTML report</h2>
            <p>
              The same report the command line writes, with focus-path diagrams and evidence. Its
              scripts are switched off; links to other sites open in your web browser.
            </p>
            <button
              type="button"
              class="button"
              aria-expanded={showReport ? 'true' : 'false'}
              aria-controls="full-report"
              onClick={toggleReport}
            >
              {showReport ? 'Hide the full HTML report' : 'Show the full HTML report'}
            </button>
            <div id="full-report">
              {showReport && html === undefined ? <p>Loading the report.</p> : null}
              {showReport && html !== undefined ? (
                <iframe
                  class="report-frame"
                  title="Full HTML report"
                  sandbox=""
                  referrerpolicy="no-referrer"
                  srcdoc={html}
                />
              ) : null}
            </div>
          </section>
        </>
      )}
    </>
  );
}
