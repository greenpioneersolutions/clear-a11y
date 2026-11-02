import { getSuccessCriterion, type Finding, type ScanResult } from '@clear-a11y/core';
import { layoutFocusPath, screenshotDataUri, sortFindings, toHtml } from '@clear-a11y/reporter';
import { allRules } from '@clear-a11y/runner';
import type {
  CalibrationAnswer,
  CriterionInfo,
  FindingFilter,
  FindingView,
  FocusPathView,
  ReviewItem,
} from '../shared/api-types.js';

/**
 * Turns a stored ScanResult into what the UI shows. Presentation only: findings, tiers and
 * evidence come from the runner unchanged; nothing here analyzes pages.
 */

export function criteriaOf(wcag: readonly string[]): CriterionInfo[] {
  return wcag.map((sc) => {
    const info = getSuccessCriterion(sc);
    return { sc, title: info?.title ?? 'Unknown success criterion', level: info?.level ?? '' };
  });
}

/** At most this many screenshots are inlined per response (they can be large). */
const MAX_INLINE_SCREENSHOTS = 100;

export function findingViews(
  result: ScanResult,
  dir: string,
  filter: FindingFilter = {},
): FindingView[] {
  let inlined = 0;
  return sortFindings(result.findings)
    .filter(
      (f) =>
        (!filter.tier || f.tier === filter.tier) && (!filter.wcag || f.wcag.includes(filter.wcag)),
    )
    .map((f) => {
      const view: FindingView = { ...f, criteria: criteriaOf(f.wcag) };
      const shot = f.evidence.screenshot;
      if (shot && inlined < MAX_INLINE_SCREENSHOTS) {
        const uri = screenshotDataUri(shot, dir);
        if (uri) {
          view.screenshotUri = uri;
          inlined++;
        }
      }
      return view;
    });
}

/** Every finding that carries a keyboard focus walk, with the reporter's diagram layout. */
export function focusPathViews(result: ScanResult, dir: string): FocusPathView[] {
  return sortFindings(result.findings)
    .filter((f) => (f.evidence.focusPath?.length ?? 0) > 0)
    .map((f) => {
      const stops = f.evidence.focusPath ?? [];
      const layout = layoutFocusPath(stops, { maxWidth: 720, maxHeight: 640 });
      const view: FocusPathView = {
        findingId: f.id,
        ruleId: f.ruleId,
        tier: f.tier,
        message: f.message,
        page: { ...f.page },
        stops,
        ...(layout ? { layout } : {}),
      };
      const uri = f.evidence.screenshot ? screenshotDataUri(f.evidence.screenshot, dir) : undefined;
      if (uri) view.screenshotUri = uri;
      return view;
    });
}

export function reviewItems(
  scanId: string,
  result: ScanResult,
  answers: ReadonlyMap<string, CalibrationAnswer>,
): ReviewItem[] {
  return sortFindings(result.findings)
    .filter((f) => f.tier === 'needs-review' && f.question)
    .map((f) => {
      const saved = answers.get(f.id);
      const item: ReviewItem = {
        findingId: f.id,
        scanId,
        ruleId: f.ruleId,
        engine: f.engine,
        wcag: [...f.wcag],
        criteria: criteriaOf(f.wcag),
        tier: f.tier,
        confidence: f.confidence,
        question: f.question as string,
        message: f.message,
        selector: f.target.selector,
        pageUrl: f.page.url,
      };
      if (saved) {
        item.answer = {
          answer: saved.answer,
          answeredAt: saved.answeredAt,
          ...(saved.note ? { note: saved.note } : {}),
        };
      }
      return item;
    });
}

export function findFinding(result: ScanResult, findingId: string): Finding | undefined {
  return result.findings.find((f) => f.id === findingId);
}

/** The reporter's self-contained HTML report, with screenshots inlined. */
export function reportHtml(result: ScanResult, dir: string): string {
  return toHtml(result, { rules: allRules(), artifactsDir: dir });
}
