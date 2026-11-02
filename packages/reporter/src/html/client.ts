/**
 * Inline script for the HTML report. Progressive enhancement only: every finding and question is
 * readable without it. It adds the filters, saves review answers to localStorage (wrapped in
 * try/catch: storage can be missing or blocked), offers the JSON download and opens all
 * `<details>` before printing. Plain ES2017, no template literals, no external requests.
 */
export const CLIENT_JS = `
(function () {
  'use strict';
  var doc = document;
  var toArray = function (list) { return Array.prototype.slice.call(list); };
  var reportKey = doc.documentElement.getAttribute('data-report-key') || 'report';
  var STORAGE_KEY = 'clear-a11y:answers:' + reportKey;
  var storage = null;
  try { storage = window.localStorage; } catch (e) { storage = null; }

  var findings = toArray(doc.querySelectorAll('article.finding'));
  var filters = doc.getElementById('filters');
  var filterForm = doc.getElementById('filter-form');
  var filterStatus = doc.getElementById('filter-status');
  if (filters && filterForm && findings.length) {
    filters.hidden = false;
    var value = function (name) { var el = filterForm.elements.namedItem(name); return el ? el.value : ''; };
    var apply = function () {
      var tier = value('tier');
      var engine = value('engine');
      var sc = value('sc');
      var shown = 0;
      findings.forEach(function (el) {
        var wcag = ' ' + (el.getAttribute('data-wcag') || '') + ' ';
        var ok = (!tier || el.getAttribute('data-tier') === tier) &&
          (!engine || el.getAttribute('data-engine') === engine) &&
          (!sc || wcag.indexOf(' ' + sc + ' ') !== -1);
        el.hidden = !ok;
        if (ok) shown++;
      });
      toArray(doc.querySelectorAll('section.sc-group')).forEach(function (group) {
        group.hidden = !group.querySelector('article.finding:not([hidden])');
      });
      toArray(doc.querySelectorAll('section.tier')).forEach(function (section) {
        var empty = section.querySelector('.filter-empty');
        var has = section.querySelector('article.finding');
        if (empty && has) empty.hidden = !!section.querySelector('article.finding:not([hidden])');
      });
      filterStatus.textContent = shown === findings.length
        ? 'Showing all ' + shown + ' findings.'
        : 'Showing ' + shown + ' of ' + findings.length + ' findings.';
    };
    filterForm.addEventListener('change', apply);
    filterForm.addEventListener('submit', function (event) { event.preventDefault(); apply(); });
    var reset = doc.getElementById('filter-reset');
    if (reset) reset.addEventListener('click', function () { setTimeout(apply, 0); });
  }

  var reviewForm = doc.getElementById('review-form');
  var reviewStatus = doc.getElementById('review-status');
  if (reviewForm) {
    var sets = toArray(reviewForm.querySelectorAll('fieldset[data-finding-id]'));
    var saved = {};
    try { saved = JSON.parse((storage && storage.getItem(STORAGE_KEY)) || '{}') || {}; } catch (e) { saved = {}; }
    sets.forEach(function (set) {
      var answer = saved[set.getAttribute('data-finding-id')];
      if (answer !== 'yes' && answer !== 'no') return;
      var input = set.querySelector('input[value="' + answer + '"]');
      if (input) input.checked = true;
    });
    var collect = function () {
      var out = {};
      sets.forEach(function (set) {
        var checked = set.querySelector('input:checked');
        if (checked) out[set.getAttribute('data-finding-id')] = checked.value;
      });
      return out;
    };
    var count = function (answers) { return Object.keys(answers).length; };
    reviewForm.addEventListener('change', function () {
      var answers = collect();
      try {
        if (!storage) throw new Error('no storage');
        storage.setItem(STORAGE_KEY, JSON.stringify(answers));
        reviewStatus.textContent = count(answers) + ' of ' + sets.length + ' answered. Saved in this browser.';
      } catch (e) {
        reviewStatus.textContent = count(answers) + ' of ' + sets.length + ' answered. This browser could not save them; download them instead.';
      }
    });
    var download = doc.getElementById('download-answers');
    if (download) {
      download.hidden = false;
      download.addEventListener('click', function () {
        var answers = collect();
        var data = {
          tool: 'clear-a11y',
          report: reportKey,
          exportedAt: new Date().toISOString(),
          answers: sets.map(function (set) {
            var id = set.getAttribute('data-finding-id');
            return {
              findingId: id,
              ruleId: set.getAttribute('data-rule-id'),
              url: set.getAttribute('data-url'),
              selector: set.getAttribute('data-selector'),
              question: set.getAttribute('data-question'),
              answer: answers[id] || null
            };
          })
        };
        try {
          var blob = new Blob([JSON.stringify(data, null, 2) + '\\n'], { type: 'application/json' });
          var href = URL.createObjectURL(blob);
          var link = doc.createElement('a');
          link.href = href;
          link.download = 'clear-a11y-review-answers.json';
          doc.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
          reviewStatus.textContent = 'Downloaded ' + count(answers) + ' of ' + sets.length + ' answers as JSON.';
        } catch (e) {
          reviewStatus.textContent = 'This browser could not create the download.';
        }
      });
    }
  }

  window.addEventListener('beforeprint', function () {
    toArray(doc.querySelectorAll('details')).forEach(function (d) { d.open = true; });
  });
})();
`;
