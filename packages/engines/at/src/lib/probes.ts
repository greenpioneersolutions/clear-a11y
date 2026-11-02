import { gotoAndSettle, installHelpers, type Page, type PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { errorNotAnnouncedRule, detectErrorNotAnnounced } from '../rules/error-not-announced.js';
import { detectErrorNotAssociated, errorNotAssociatedRule } from '../rules/error-not-associated.js';
import {
  detectErrorNotIdentified,
  errorNotIdentifiedRule,
  type FieldChange,
} from '../rules/error-not-identified.js';
import {
  declaresExpandedState,
  detectExpandedStateMissing,
  expandedStateMissingRule,
  toggledContent,
} from '../rules/expanded-state-missing.js';
import {
  detectLiveRegionInsertedWithContent,
  liveRegionInsertedWithContentRule,
} from '../rules/live-region-inserted-with-content.js';
import {
  detectStatusMessageNotAnnounced,
  statusMessageNotAnnouncedRule,
} from '../rules/status-message-not-announced.js';
import { formatAnnouncements, reduceAnnouncements } from './announcements.js';
import type { AtConfig } from './config.js';
import { atFinding, quote } from './findings.js';
import { hasReadableText } from './normalize-name.js';
import { probeInteractions, type ProbeDriver } from './interaction-probes.js';
import { installListenerSpy } from './listener-spy.js';
import { installAtRecorder, type ChangedElement, type ProbeReport } from './recorder.js';

/** At most this many messages are reported per probe. */
const MAX_MESSAGES = 3;

interface ButtonInfo {
  selector: string;
  name: string;
  declaresState: boolean;
  controls: boolean;
}

interface FieldSnapshot {
  selector: string;
  invalid: boolean;
  style: string;
  focused: boolean;
  exposed: string;
}

interface FormInfo {
  selector: string;
  submitter: string | null;
  /** Browser constraint validation will block the submit and show its own (announced) message. */
  nativeValidation: boolean;
}

interface FieldAnalysis {
  fields: FieldSnapshot[];
  associations: Array<{ error: string; errorText: string; field: string; exposed: string }>;
}

/**
 * Drives the page with the announcement recorder installed. Every probe starts from a fresh
 * load (`page.addInitScript` installs the recorder before the page's own scripts).
 */
export class Prober implements ProbeDriver {
  private navigated = false;
  private readonly deadline: number;

  constructor(
    readonly ctx: PageContext,
    private readonly config: AtConfig,
  ) {
    this.deadline = Date.now() + Math.min(config.budgetMs, Math.floor(ctx.config.timeoutMs * 0.7));
  }

  get page(): Page {
    return this.ctx.page;
  }

  outOfTime(): boolean {
    return Date.now() > this.deadline;
  }

  navigatedSinceFresh(): boolean {
    return this.navigated;
  }

  /** Motion, drag, paste, pointer-down and shortcut-key probes (default state). */
  probeInteractions(): Promise<Finding[]> {
    return probeInteractions(this);
  }

  async install(): Promise<void> {
    await this.page.addInitScript(installHelpers);
    await this.page.addInitScript(installAtRecorder);
    // After the helpers and the recorder, so only the page's own listeners are recorded.
    await this.page.addInitScript(installListenerSpy);
    this.page.on('framenavigated', (frame) => {
      if (frame === this.page.mainFrame()) this.navigated = true;
    });
  }

  /** Fresh load of the page with the recorder; replays the state unless told not to. */
  async fresh(replay = true): Promise<void> {
    await gotoAndSettle(this.page, this.ctx.url, this.ctx.config.timeoutMs);
    await this.page.evaluate(installHelpers);
    await this.page.evaluate(installAtRecorder);
    await this.page.evaluate(installListenerSpy);
    if (replay && this.ctx.stateMeta?.replay) await this.ctx.stateMeta.replay(this.page);
    this.navigated = false;
  }

  private async settle(): Promise<ProbeReport> {
    const { settleMs, maxSettleMs } = this.config;
    return this.page.evaluate(
      async ([q, m]) => {
        await window.__clearA11yAt!.quiet(q, m);
        return window.__clearA11yAt!.report();
      },
      [settleMs, maxSettleMs] as const,
    );
  }

  /** Marks, presses the control (a trusted click), waits for the DOM to settle and reports. */
  private async press(selector: string): Promise<ProbeReport | undefined> {
    const found = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      window.__clearA11yAt!.mark(el);
      (el as HTMLElement).focus();
      return true;
    }, selector);
    if (!found) return undefined;
    try {
      await this.page
        .locator(selector)
        .first()
        .click({ force: true, timeout: 2_000, noWaitAfter: true });
    } catch {
      await this.page
        .evaluate((sel) => (document.querySelector(sel) as HTMLElement | null)?.click(), selector)
        .catch(() => undefined);
    }
    if (this.navigated) return undefined;
    return this.settle().catch(() => undefined);
  }

  /** Buttons worth pressing: plain buttons outside composite widgets and dialogs, not submit/reset. */
  private async buttons(max: number): Promise<ButtonInfo[]> {
    const found = await this.page.evaluate((limit) => {
      const h = window.__clearA11y!;
      const composite =
        'dialog, [role=dialog], [role=alertdialog], [role=menu], [role=menubar], [role=listbox], [role=tablist], [role=tree], [role=grid], [role=combobox]';
      return Array.from(document.querySelectorAll('button, [role=button], input[type=button]'))
        .filter((el) => {
          const role = el.getAttribute('role');
          if (role && role !== 'button') return false;
          if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true')
            return false;
          if (el instanceof HTMLButtonElement && el.type !== 'button' && el.form) return false;
          if ((el.getAttribute('aria-haspopup') ?? 'false') !== 'false') return false;
          if (el.closest(composite)) return false;
          return h.isVisible(el);
        })
        .slice(0, limit)
        .map((el) => ({
          selector: h.selector(el),
          name: (el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? '').trim(),
          attributes: el.getAttributeNames(),
          controls: el.hasAttribute('aria-controls'),
        }));
    }, max);
    return found.map(({ attributes, ...button }) => ({
      ...button,
      declaresState: declaresExpandedState(attributes),
    }));
  }

  /**
   * Button probe (default state): press each button, watch what changes. Toggles without
   * aria-expanded, silent status messages and live regions inserted with content are reported.
   */
  async probeButtons(): Promise<Finding[]> {
    if (this.config.probeButtons === 0) return [];
    const findings: Finding[] = [];
    await this.fresh();
    const buttons = await this.buttons(this.config.probeButtons);
    let dirty = false;
    for (const button of buttons) {
      if (this.outOfTime()) break;
      if (dirty) {
        await this.fresh();
        dirty = false;
      }
      const first = await this.press(button.selector);
      if (!first) {
        dirty = true;
        continue;
      }
      let reverted = false;
      if (toggledContent(first).length > 0) {
        const second = await this.press(button.selector);
        reverted = second?.reverted ?? false;
      }
      // Anything that changed visibility and wasn't undone leaves the page in another state.
      dirty = first.shown.length + first.hidden.length > 0 && !reverted;
      if (first.changedText.length || first.insertedWithContent.length) dirty = true;
      findings.push(...this.judgeButton(button, first, reverted));
    }
    return findings;
  }

  private judgeButton(button: ButtonInfo, report: ProbeReport, reverted: boolean): Finding[] {
    const out: Finding[] = [];
    const label = button.name ? quote(button.name) : button.selector;

    if (
      detectExpandedStateMissing({
        declaresState: button.declaresState,
        shown: report.shown,
        hidden: report.hidden,
        reverted,
      })
    ) {
      const content = toggledContent(report);
      const what = content.find((c) => c.selector)?.selector ?? 'a section';
      out.push(
        atFinding(this.ctx, expandedStateMissingRule, {
          selector: button.selector,
          role: 'button',
          ...(button.name ? { name: button.name } : {}),
          confidence: 0.9,
          message: `The ${label} button shows and hides ${what}, but has no aria-expanded, so screen reader users are not told whether it is open or closed.`,
          evidence: {
            axTree: `button ${quote(button.name)} (focusable) — no expanded state`,
            data: {
              toggled: content.map((c) => c.selector || '(removed)'),
              revertedOnSecondPress: true,
            },
          },
        }),
      );
    }

    const silent = detectStatusMessageNotAnnounced({
      report,
      revealsSection: reverted || button.declaresState || button.controls,
    });
    for (const msg of silent.slice(0, MAX_MESSAGES)) {
      out.push(
        atFinding(this.ctx, statusMessageNotAnnouncedRule, {
          selector: msg.selector,
          confidence: 0.8,
          message: `Pressing ${label} shows ${quote(msg.text)}, but it is not in a live region and focus does not move to it, so screen reader users are not told.`,
          evidence: {
            announcement: formatAnnouncements(report.announcements),
            data: { trigger: button.selector, text: msg.text, focusAfter: report.focus.after },
          },
        }),
      );
    }

    for (const region of detectLiveRegionInsertedWithContent(report.insertedWithContent).slice(
      0,
      MAX_MESSAGES,
    )) {
      out.push(
        atFinding(this.ctx, liveRegionInsertedWithContentRule, {
          selector: region.selector,
          confidence: 0.75,
          message: `Pressing ${label} inserts a ${region.politeness} live region that already contains ${quote(region.text)}. Screen readers usually ignore live regions that arrive with their message, so it is probably never spoken.`,
          evidence: {
            announcement: formatAnnouncements(report.announcements),
            data: { trigger: button.selector, text: region.text },
          },
        }),
      );
    }
    return out;
  }

  private forms(max: number): Promise<FormInfo[]> {
    return this.page.evaluate((limit) => {
      const h = window.__clearA11y!;
      return Array.from(document.forms)
        .filter((f) => h.isVisible(f) && f.querySelector('input, select, textarea'))
        .slice(0, limit)
        .map((f) => {
          const submitter =
            Array.from(
              f.querySelectorAll<HTMLElement>(
                'button:not([type]), button[type=submit], input[type=submit], input[type=image]',
              ),
            ).find((b) => h.isVisible(b)) ?? null;
          return {
            selector: h.selector(f),
            submitter: submitter ? h.selector(submitter) : null,
            nativeValidation: !f.noValidate && !f.checkValidity(),
          };
        });
    }, max);
  }

  /** Per-field state: aria-invalid, a style signature, focus, and the text AT exposes for it. */
  private fields(scope: string, errors: string[] = []): Promise<FieldAnalysis> {
    return this.page.evaluate(
      ([scopeSel, errorSels]) => {
        const h = window.__clearA11y!;
        const root = document.querySelector(scopeSel) ?? document.body;
        const FIELD =
          'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea';
        const textOf = (ids: string | null) =>
          (ids ?? '')
            .split(/\s+/)
            .filter(Boolean)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ');
        const exposed = (el: Element) => {
          const f = el as HTMLInputElement;
          return [
            Array.from(f.labels ?? [])
              .map((l) => l.textContent ?? '')
              .join(' '),
            textOf(el.getAttribute('aria-labelledby')),
            el.getAttribute('aria-label') ?? '',
            textOf(el.getAttribute('aria-describedby')),
            textOf(el.getAttribute('aria-errormessage')),
            el.getAttribute('title') ?? '',
          ]
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        };
        const style = (el: Element) => {
          const s = getComputedStyle(el);
          return [
            s.borderTopColor,
            s.borderBottomColor,
            s.borderTopWidth,
            s.backgroundColor,
            s.boxShadow,
          ].join('|');
        };
        const fieldEls = Array.from(root.querySelectorAll(FIELD)).filter((f) => h.isVisible(f));
        const fields = fieldEls.map((f) => ({
          selector: h.selector(f),
          invalid: f.getAttribute('aria-invalid') === 'true',
          style: style(f),
          focused: document.activeElement === f,
          exposed: exposed(f),
        }));
        // An error belongs to a field when it sits right next to it: inside its <label>, or in a
        // small wrapper (at most two levels up, below the form) that holds exactly one field.
        // Error summaries further away are not tied to one field.
        const STOP = 'form, fieldset, main, body, section, article, [role=form], [role=main]';
        const associations: FieldAnalysis['associations'] = [];
        for (const sel of errorSels) {
          const err = document.querySelector(sel);
          if (!err) continue;
          let field: Element | null = null;
          const label = err.closest('label') as HTMLLabelElement | null;
          if (label?.control) field = label.control;
          for (
            let up: Element | null = err.parentElement, i = 0;
            !field && up && i < 2 && !up.matches(STOP);
            up = up.parentElement, i++
          ) {
            const inside = Array.from(up.querySelectorAll(FIELD)).filter((f) => h.isVisible(f));
            if (inside.length === 1) field = inside[0]!;
            if (inside.length > 1) break;
          }
          if (!field) continue;
          associations.push({
            error: sel,
            errorText: (err.textContent ?? '').replace(/\s+/g, ' ').trim(),
            field: h.selector(field),
            exposed: exposed(field),
          });
        }
        return { fields, associations };
      },
      [scope, errors] as const,
    );
  }

  /**
   * Form probe (default state): submit each form empty and look at what happens. In a
   * `form-invalid`/`form-empty` state from the state explorer, the state's replay is the submit.
   */
  async probeForms(): Promise<Finding[]> {
    if (this.config.probeForms === 0) return [];
    const findings: Finding[] = [];
    await this.fresh();
    const forms = await this.forms(this.config.probeForms);
    for (const form of forms) {
      if (this.outOfTime()) break;
      if (!form.submitter || form.nativeValidation) continue;
      await this.fresh();
      const before = await this.fields(form.selector);
      const report = await this.press(form.submitter);
      if (!report || report.nativeSubmit) continue;
      findings.push(...(await this.judgeSubmit(form.selector, before, report, true)));
    }
    return findings;
  }

  /** Replays a form-invalid/form-empty state with the recorder watching. */
  async probeReplay(): Promise<Finding[]> {
    const replay = this.ctx.stateMeta?.replay;
    if (!replay) return [];
    await this.fresh(false);
    const before = await this.fields('body');
    await this.page.evaluate(() => window.__clearA11yAt!.mark(null));
    await replay(this.page);
    if (this.navigated) return [];
    const report = await this.settle();
    if (report.nativeSubmit) return [];
    return this.judgeSubmit('body', before, report, false);
  }

  private async judgeSubmit(
    scope: string,
    before: FieldAnalysis,
    report: ProbeReport,
    knownTrigger: boolean,
  ): Promise<Finding[]> {
    const out: Finding[] = [];
    const messages = dedupe([...report.changedText, ...report.shown]).filter(
      (c) =>
        c.selector &&
        !c.isPopup &&
        !c.hasFocusable &&
        !c.insideTrigger &&
        c.text.length <= 200 &&
        hasReadableText(c.text),
    );
    const silent = messages.filter((m) => !m.inLiveRegion);
    const after = await this.fields(
      scope,
      messages.map((m) => m.selector),
    );

    // at/error-not-announced
    if (
      detectErrorNotAnnounced({
        errors: silent,
        announcements: report.announcements,
        focus: report.focus,
        knownTrigger,
      })
    ) {
      const first = silent[0]!;
      out.push(
        atFinding(this.ctx, errorNotAnnouncedRule, {
          selector: first.selector,
          confidence: 0.8,
          message: `After submitting, ${silent.length} error message${silent.length > 1 ? 's' : ''} appeared (${silent
            .slice(0, 3)
            .map((m) => quote(m.text, 40))
            .join(
              ', ',
            )}) without a live region or a focus move, so screen reader users are not told the form was rejected.`,
          evidence: {
            announcement: formatAnnouncements(report.announcements),
            data: {
              errors: silent.map((m) => ({ selector: m.selector, text: m.text })),
              focusAfter: report.focus.after,
            },
          },
        }),
      );
    }

    // at/error-not-associated
    const reported = new Set<string>();
    for (const a of after.associations) {
      if (reported.has(a.field)) continue;
      if (!detectErrorNotAssociated({ errorText: a.errorText, exposedText: a.exposed })) continue;
      reported.add(a.field);
      out.push(
        atFinding(this.ctx, errorNotAssociatedRule, {
          selector: a.field,
          confidence: 0.8,
          message: `The error ${quote(a.errorText)} shown next to this field is not part of its accessible name or description, so a screen reader user on the field never hears it.`,
          evidence: {
            axTree: `field "${a.exposed}" (description does not include the error)`,
            data: { error: a.error, errorText: a.errorText },
          },
        }),
      );
    }

    // at/error-not-identified
    const beforeBy = new Map(before.fields.map((f) => [f.selector, f]));
    const changes: FieldChange[] = after.fields.flatMap((f) => {
      const b = beforeBy.get(f.selector);
      if (!b) return [];
      return [
        {
          selector: f.selector,
          invalidBefore: b.invalid,
          invalidAfter: f.invalid,
          styleChanged: !f.focused && !b.focused && f.style !== b.style,
        },
      ];
    });
    const flagged = detectErrorNotIdentified({
      fields: changes,
      newText: messages.length > 0 || reduceAnnouncements(report.announcements).length > 0,
      describedChange: after.fields.some(
        (f) => beforeBy.has(f.selector) && beforeBy.get(f.selector)!.exposed !== f.exposed,
      ),
    });
    for (const f of flagged) {
      out.push(
        atFinding(this.ctx, errorNotIdentifiedRule, {
          selector: f.selector,
          confidence: 0.9,
          message: `After submitting, this field is marked invalid ${f.styleChanged ? 'only by a visual change (border, background or shadow)' : 'only with aria-invalid'}, and no text anywhere on the page says what is wrong.`,
          evidence: {
            announcement: formatAnnouncements(report.announcements),
            data: { ...f },
          },
        }),
      );
    }
    return out;
  }
}

function dedupe(list: ChangedElement[]): ChangedElement[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.selector) ? false : (seen.add(c.selector), true)));
}
