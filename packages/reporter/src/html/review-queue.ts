import { escapeHtml } from './escape.js';
import { shortUrl, type RenderedFinding } from './finding.js';

/**
 * The needs-review queue: one native fieldset with Yes/No radios per question. Works without
 * JavaScript (the radios are ordinary form controls); the inline script adds saving to
 * localStorage and the "Download answers (JSON)" button.
 */
export function renderReviewQueue(items: readonly RenderedFinding[]): string {
  const questions = items.filter((i) => i.finding.tier === 'needs-review' && i.finding.question);
  const intro =
    `<p>These findings need a human decision. Answer each question with Yes or No. ` +
    `Answers stay in this browser (nothing is sent anywhere); use “Download answers (JSON)” to keep or share them.</p>`;
  if (!questions.length) {
    return (
      `<section id="review-queue" aria-labelledby="review-queue-h">` +
      `<h2 id="review-queue-h">Needs-review queue</h2><p>No questions to answer in this scan.</p></section>`
    );
  }
  const sets = questions
    .map(({ finding: f, n, rule }) => {
      const name = `answer-${n}`;
      return (
        `<fieldset class="question" id="question-${n}" data-finding-id="${escapeHtml(f.id)}" data-rule-id="${escapeHtml(f.ruleId)}" data-url="${escapeHtml(f.page.url)}" data-selector="${escapeHtml(f.target.selector)}" data-question="${escapeHtml(f.question)}">` +
        `<legend>Question ${n}: ${escapeHtml(f.question)}</legend>` +
        `<p class="question-context">${escapeHtml(rule?.title ?? f.ruleId)}: <code>${escapeHtml(f.target.selector)}</code> on ${escapeHtml(shortUrl(f.page.url))}${f.page.state !== 'default' ? ` (state: ${escapeHtml(f.page.state)})` : ''}.</p>` +
        `<p class="question-link"><a href="#finding-${n}">Details for question ${n}</a></p>` +
        `<div class="choices">` +
        `<label><input type="radio" name="${name}" value="yes"> Yes</label>` +
        `<label><input type="radio" name="${name}" value="no"> No</label>` +
        `</div></fieldset>`
      );
    })
    .join('');
  return (
    `<section id="review-queue" aria-labelledby="review-queue-h">` +
    `<h2 id="review-queue-h">Needs-review queue (${questions.length})</h2>` +
    intro +
    `<form id="review-form" class="review-form">${sets}` +
    `<p class="actions"><button type="button" id="download-answers" hidden>Download answers (JSON)</button></p>` +
    `</form>` +
    `<noscript><p class="note">Turn on JavaScript to save your answers in this browser and download them as JSON.</p></noscript>` +
    `<p id="review-status" class="status" role="status"></p>` +
    `</section>`
  );
}
