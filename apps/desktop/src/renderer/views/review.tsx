import { useEffect, useRef, useState } from 'preact/hooks';
import type { ReviewAnswer, ReviewItem } from '../../shared/api-types.js';
import { errorMessage } from '../api.js';
import { defaultScanId, type ViewProps } from '../app.js';
import { ErrorText, NoScans, ScanPicker, ViewHeading } from '../components/common.js';
import { navigate } from '../router.js';

const ANSWER_LABEL: Record<ReviewAnswer, string> = { yes: 'Yes', no: 'No', skip: 'Skipped' };

/** Alt+Shift+Y / N / S. Never a single character key (WCAG 2.1.4). Uses `code` so layouts agree. */
export function shortcutAnswer(e: KeyboardEvent): ReviewAnswer | undefined {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return undefined;
  if (e.code === 'KeyY') return 'yes';
  if (e.code === 'KeyN') return 'no';
  if (e.code === 'KeyS') return 'skip';
  return undefined;
}

export function ReviewView({ api, route, scans, announce }: ViewProps) {
  const scanId = defaultScanId(scans, route.scanId);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setItems([]);
    setLoaded(false);
    setError(undefined);
    if (!scanId) return;
    api.review
      .queue(scanId)
      .then((list) => {
        setItems(list);
        const firstOpen = list.findIndex((i) => !i.answer);
        setIndex(firstOpen === -1 ? 0 : firstOpen);
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [api, scanId]);

  const current = items[index];
  useEffect(() => setNote(current?.answer?.note ?? ''), [current?.findingId]);

  const answered = items.filter((i) => i.answer && i.answer.answer !== 'skip').length;
  const open = items.filter((i) => !i.answer).length;

  const goTo = (i: number) => {
    setIndex(i);
    window.setTimeout(() => questionRef.current?.focus(), 0);
  };

  const answer = async (value: ReviewAnswer) => {
    if (!current || !scanId || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const saved = await api.review.answer({
        scanId,
        findingId: current.findingId,
        answer: value,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const next = items.map((i) =>
        i.findingId === current.findingId
          ? {
              ...i,
              answer: {
                answer: saved.answer,
                answeredAt: saved.answeredAt,
                ...(saved.note ? { note: saved.note } : {}),
              },
            }
          : i,
      );
      setItems(next);
      const after = next.findIndex((i, n) => n > index && !i.answer);
      const wrap = after === -1 ? next.findIndex((i) => !i.answer) : after;
      if (wrap === -1) {
        announce(`Saved: ${ANSWER_LABEL[value]}. All questions in this scan have an answer.`);
        goTo(index);
      } else {
        announce(`Saved: ${ANSWER_LABEL[value]}. Next question.`);
        goTo(wrap);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const value = shortcutAnswer(e);
    if (value) {
      e.preventDefault();
      void answer(value);
    }
  };

  return (
    <>
      <ViewHeading>Review questions</ViewHeading>
      <p class="lead">
        Some checks need a person to decide. Your answers are saved on this computer as calibration
        data, never sent anywhere, and never change a finding by themselves.
      </p>
      {!scanId ? (
        <NoScans />
      ) : (
        <div onKeyDown={onKeyDown}>
          <div class="toolbar">
            <ScanPicker
              id="review-scan"
              scans={scans}
              value={scanId}
              onChange={(id) => navigate({ view: 'review', scanId: id })}
            />
          </div>
          <ErrorText message={error} />
          {loaded && !items.length ? <p>This scan has no questions for you.</p> : null}
          {current ? (
            <>
              <p class="review-progress" id="review-progress">
                {`Question ${index + 1} of ${items.length}. ${answered} answered, ${open} still open.`}
              </p>
              <section class="card question-card" aria-labelledby="review-question">
                <h2 id="review-question" tabIndex={-1} ref={questionRef}>
                  {current.question}
                </h2>
                <dl class="facts">
                  <dt>What we found</dt>
                  <dd>{current.message}</dd>
                  <dt>Element</dt>
                  <dd class="mono break">{current.selector}</dd>
                  <dt>Page</dt>
                  <dd class="mono break">{current.pageUrl}</dd>
                  <dt>WCAG</dt>
                  <dd>
                    {current.criteria.length
                      ? current.criteria.map((c) => `${c.sc} ${c.title}`).join(', ')
                      : 'Best practice'}
                  </dd>
                </dl>
                {current.answer ? (
                  <p class="saved-answer">
                    Your answer: <strong>{ANSWER_LABEL[current.answer.answer]}</strong>. Answer
                    again to change it.
                  </p>
                ) : null}
                <div class="field">
                  <label for="review-note">Note (optional)</label>
                  <textarea
                    id="review-note"
                    rows={3}
                    value={note}
                    maxLength={2000}
                    onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)}
                  />
                </div>
                <div class="answer-buttons" role="group" aria-label="Answer">
                  <button
                    type="button"
                    class="button primary"
                    disabled={saving}
                    aria-keyshortcuts="Alt+Shift+Y"
                    onClick={() => answer('yes')}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="button primary"
                    disabled={saving}
                    aria-keyshortcuts="Alt+Shift+N"
                    onClick={() => answer('no')}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    class="button"
                    disabled={saving}
                    aria-keyshortcuts="Alt+Shift+S"
                    onClick={() => answer('skip')}
                  >
                    Skip
                  </button>
                </div>
                <p class="hint">
                  Keyboard shortcuts: Alt+Shift+Y answers Yes, Alt+Shift+N answers No, Alt+Shift+S
                  skips.
                </p>
              </section>
              <nav class="pager" aria-label="Questions">
                <button
                  type="button"
                  class="button"
                  disabled={index === 0}
                  onClick={() => goTo(index - 1)}
                >
                  Previous question
                </button>
                <button
                  type="button"
                  class="button"
                  disabled={index >= items.length - 1}
                  onClick={() => goTo(index + 1)}
                >
                  Next question
                </button>
              </nav>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
