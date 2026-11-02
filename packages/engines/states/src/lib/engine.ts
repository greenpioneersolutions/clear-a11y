import {
  captureElement,
  ensureHelpers,
  type Engine,
  type Page,
  type PageContext,
} from '@clear-a11y/browser';
import { createFinding, type Finding, type RuleMeta, type Tier } from '@clear-a11y/core';
import { describe, performAction, reload, snapshot } from './actions.js';
import { significant, type Candidate } from './classify.js';
import { formAction, submitAndObserve, type FormMode } from './forms.js';
import { collectInputs, inputWarned, probeInput } from './inputs.js';
import {
  collectCandidates,
  collectForms,
  expandedProbe,
  type FieldObservation,
} from './in-page.js';
import { resolveStatesOptions, type StatesOptions } from './options.js';
import { DESTRUCTIVE_NAME, installRouteGuard } from './safety.js';
import { stateId } from './state-id.js';
import { visibleSetDiff } from './visible-set-diff.js';
import { detectErrorNotAssociated, errorNotAssociatedRule } from '../rules/error-not-associated.js';
import { detectErrorNotInText, errorNotInTextRule } from '../rules/error-not-in-text.js';
import {
  contextChangeOnInputRule,
  describeInputChange,
  detectContextChangeOnInput,
} from '../rules/context-change-on-input.js';
import {
  detectExpandedStateMismatch,
  expandedStateMismatchRule,
} from '../rules/expanded-state-mismatch.js';

export const ENGINE_NAME = 'engine-states';

const TIER_RANK: Record<Tier, number> = { violation: 0, likely: 1, 'needs-review': 2 };

interface Explorer {
  ctx: PageContext;
  page: Page;
  url: string;
  opts: StatesOptions;
  deadline: number;
  dirty: boolean;
  findings: Map<string, Finding>;
}

async function fresh(ex: Explorer): Promise<void> {
  if (ex.dirty) await reload(ex.page, ex.url, ex.ctx.config.timeoutMs);
  ex.dirty = true;
}

/** Keeps one finding per rule and selector: the strongest tier wins. */
function keep(ex: Explorer, finding: Finding): void {
  const key = `${finding.ruleId}|${finding.target.selector}`;
  const prev = ex.findings.get(key);
  if (!prev || TIER_RANK[finding.tier] < TIER_RANK[prev.tier]) ex.findings.set(key, finding);
}

function finding(
  ex: Explorer,
  rule: RuleMeta,
  input: {
    tier: Tier;
    state: string;
    selector: string;
    name?: string;
    message: string;
    html?: string;
    data: Record<string, unknown>;
    question?: string;
  },
): Finding {
  return createFinding({
    ruleId: rule.id,
    wcag: rule.wcag,
    tier: input.tier,
    confidence: input.tier === 'violation' ? 0.9 : 0.7,
    engine: ENGINE_NAME,
    page: { url: ex.ctx.url, state: input.state, viewport: ex.ctx.viewport.name },
    target: { selector: input.selector, ...(input.name ? { name: input.name } : {}) },
    evidence: { ...(input.html ? { html: input.html } : {}), data: input.data },
    message: input.message,
    fix: rule.fix,
    ...(input.question ? { question: input.question } : {}),
  });
}

async function withScreenshot(ex: Explorer, f: Finding): Promise<Finding> {
  if (f.tier !== 'violation') return f;
  const shot = await captureElement(ex.ctx, f.target.selector, f.ruleId.replace('/', '-')).catch(
    () => undefined,
  );
  return shot ? { ...f, evidence: { ...f.evidence, screenshot: shot } } : f;
}

/** Opens each collapsed aria-expanded trigger (and closes it again) and compares state vs content. */
async function checkExpanded(ex: Explorer, candidates: readonly Candidate[]): Promise<void> {
  for (const c of candidates) {
    if (c.expanded !== 'false' || Date.now() > ex.deadline) continue;
    await fresh(ex);
    const before = await ex.page.evaluate(expandedProbe, c.selector);
    if (before.controlledVisible === true) continue; // already showing: can't judge
    const verified = before.controlledVisible === false;
    const snapBefore = verified ? undefined : await snapshot(ex.page, ex.opts.maxElements);
    try {
      await performAction(ex.page, { type: 'click', selector: c.selector }, ex.opts);
    } catch {
      continue;
    }
    const after = await ex.page.evaluate(expandedProbe, c.selector);
    let opened = after.controlledVisible === true;
    if (snapBefore) {
      const diff = visibleSetDiff(
        snapBefore.visible,
        (await snapshot(ex.page, ex.opts.maxElements)).visible,
      );
      opened = significant(await describe(ex.page, diff.roots.slice(0, 20))).length > 0;
    }
    if (!opened) continue;
    const state = stateId(c.inHeading ? 'accordion' : 'disclosure', c.controls || c.id || c.name);
    const report = (phase: 'open' | 'close', expandedAfter: string | null) =>
      keep(
        ex,
        finding(ex, expandedStateMismatchRule, {
          // Without aria-controls we only know that *something* appeared: not certain enough to fail CI.
          tier: verified ? 'violation' : 'likely',
          state: phase === 'open' ? state : 'default',
          selector: c.selector,
          name: c.name,
          message:
            phase === 'open'
              ? `Activating "${c.name}" shows its content, but the button still has aria-expanded="${expandedAfter}". Screen reader users hear "collapsed" while the content is open.`
              : `Activating "${c.name}" again hides its content, but the button still has aria-expanded="${expandedAfter}". Screen reader users hear "expanded" while the content is closed.`,
          data: { phase, expandedBefore: before.expanded, expandedAfter, controls: c.controls },
        }),
      );
    if (
      detectExpandedStateMismatch({
        phase: 'open',
        expandedAfter: after.expanded,
        contentVisible: true,
      })
    ) {
      report('open', after.expanded);
      continue;
    }
    if (!verified) continue;
    try {
      await performAction(ex.page, { type: 'click', selector: c.selector }, ex.opts);
    } catch {
      continue;
    }
    const closed = await ex.page.evaluate(expandedProbe, c.selector);
    if (
      closed.controlledVisible !== null &&
      detectExpandedStateMismatch({
        phase: 'close',
        expandedAfter: closed.expanded,
        contentVisible: closed.controlledVisible,
      })
    ) {
      report('close', closed.expanded);
    }
  }
}

function errorAssociationMessage(field: FieldObservation, tier: Tier): string {
  const text = field.texts[0]?.text ?? '';
  const label = field.name || field.selector;
  return tier === 'violation'
    ? `After submitting the form, the message "${text}" appears next to "${label}", but the field has no aria-invalid and the message is not linked with aria-describedby or aria-errormessage. Screen reader users are not told that this field is wrong or why.`
    : `After submitting the form, "${label}" is marked aria-invalid but the message "${text}" next to it is not linked with aria-describedby or aria-errormessage, so screen reader users hear that the field is wrong but not why.`;
}

/** Submits each form empty and with invalid values, then checks how errors are identified. */
async function checkForms(ex: Explorer): Promise<void> {
  const { forms } = await ex.page.evaluate(collectForms, {
    max: ex.opts.maxForms,
    destructive: DESTRUCTIVE_NAME.source,
  });
  for (const form of forms) {
    for (const mode of ['empty', 'invalid'] as FormMode[]) {
      const action = formAction(form, mode);
      if (!action || Date.now() > ex.deadline) continue;
      await fresh(ex);
      const obs = await submitAndObserve(ex.page, ex.url, form, action, ex.opts).catch(
        () => undefined,
      );
      if (!obs || obs.navigated) continue;
      const state = stateId(
        mode === 'empty' ? 'form-empty' : 'form-invalid',
        form.id || form.selector,
      );
      for (const field of obs.fields) {
        const tier = detectErrorNotAssociated(field);
        if (tier) {
          keep(
            ex,
            await withScreenshot(
              ex,
              finding(ex, errorNotAssociatedRule, {
                tier,
                state,
                selector: field.selector,
                name: field.name,
                message: errorAssociationMessage(field, tier),
                html: field.html,
                data: {
                  errorText: field.texts.map((t) => t.text),
                  errorSelector: field.texts.map((t) => t.selector),
                  ariaInvalid: field.ariaInvalid,
                  ariaDescribedby: field.describedBy,
                  ariaErrormessage: field.errorMessage,
                  filled: action.fill[field.selector] ?? null,
                },
              }),
            ),
          );
          continue;
        }
        if (
          detectErrorNotInText({
            newTextOnPage: obs.textSelectors.length,
            styleChanged: field.styleChanged,
            focused: field.focused,
            ariaInvalidBefore: field.ariaInvalidBefore,
            ariaInvalid: field.ariaInvalid,
            nativeInvalid: obs.nativeInvalid,
          })
        ) {
          keep(
            ex,
            finding(ex, errorNotInTextRule, {
              tier: 'likely',
              state,
              selector: field.selector,
              name: field.name,
              message: `After submitting the form, "${field.name || field.selector}" changes its look${field.ariaInvalid === 'true' ? ' and is marked aria-invalid' : ''}, but no text on the page says what is wrong. People who cannot see the colour change are not told about the error.`,
              html: field.html,
              data: {
                styleChanged: field.styleChanged,
                ariaInvalid: field.ariaInvalid,
                filled: action.fill[field.selector] ?? null,
              },
            }),
          );
        }
      }
    }
  }
}

const INPUT_ACTION: Record<string, string> = {
  select: 'Choosing',
  checkbox: 'Ticking or unticking',
  radio: 'Selecting',
  text: 'Typing into',
};

/**
 * SC 3.2.2: changes each form control without submitting (choose another option, toggle a
 * checkbox or radio, type into a field and leave it) on a fresh, route-guarded page and looks for
 * a change of context: a submitted form, a navigation, a new window, a modal, moved focus, or most
 * of the page replaced.
 */
async function checkInputs(ex: Explorer): Promise<void> {
  if (ex.opts.maxInputs === 0) return;
  if (ex.dirty) await reload(ex.page, ex.url, ex.ctx.config.timeoutMs);
  ex.dirty = false;
  const collected = await ex.page
    .evaluate(collectInputs, { max: ex.opts.maxInputs, destructive: DESTRUCTIVE_NAME.source })
    .catch((err) => {
      ex.ctx.log.debug('states: could not collect form controls', { error: String(err) });
      return null;
    });
  if (!collected) return;
  const { inputs, skipped } = collected;
  for (const s of skipped) {
    ex.ctx.log.debug('states: control not changed (destructive name)', { ...s });
  }
  for (const input of inputs) {
    if (Date.now() > ex.deadline) {
      ex.ctx.log.debug('states: input budget used up', { remaining: input.selector });
      break;
    }
    await fresh(ex);
    const obs = await probeInput(ex.page, ex.url, input, ex.opts).catch(() => null);
    if (!obs) continue;
    const warned = inputWarned(input);
    const change = detectContextChangeOnInput({ ...obs, warned });
    if (!change) continue;
    const label = input.name ? `"${input.name}"` : `\`${input.selector}\``;
    const value = input.kind === 'select' ? ` the option "${input.valueLabel}" in` : '';
    const action = `${INPUT_ACTION[input.kind] ?? 'Changing'}${value} ${label}`;
    keep(
      ex,
      finding(ex, contextChangeOnInputRule, {
        tier: change.tier,
        state: 'default',
        selector: input.selector,
        name: input.name,
        message: `${action} ${describeInputChange(change)}, without the user pressing a submit button${warned ? '' : ' and with no warning on the page'}. Keyboard and screen reader users who change a value to explore the options are taken somewhere they did not choose to go.`,
        data: {
          change: change.kind,
          ...(change.detail ? { detail: change.detail } : {}),
          control: input.kind,
          value: input.value,
          visibleBefore: obs.visibleBefore,
          visibleRemoved: obs.visibleRemoved,
          warned,
        },
        ...(change.tier === 'needs-review'
          ? {
              question:
                change.kind === 'content-replaced'
                  ? `Is it clear to users, before they change ${label}, that most of the page will be replaced?`
                  : `Does the text near ${label} tell users, before they change it, that doing so ${describeInputChange(change)}?`,
            }
          : {}),
      }),
    );
  }
}

/**
 * State explorer engine. As an engine it reports barriers it observes while opening states from the
 * default page (aria-expanded mismatches, form errors that are not identified or not associated).
 * Discovery of states for other engines is the separate `discoverStates` export, which the runner
 * calls. In non-default states it does nothing: states are explored from the default page only.
 */
export function createStatesEngine(): Engine {
  return {
    name: ENGINE_NAME,
    async run(ctx: PageContext): Promise<Finding[]> {
      if (ctx.state !== 'default') return [];
      const opts = resolveStatesOptions(ctx.config);
      const page = ctx.page;
      const url = page.url();
      await installRouteGuard(page, url);
      await ensureHelpers(page);
      const ex: Explorer = {
        ctx,
        page,
        url,
        opts,
        deadline: Date.now() + opts.budgetMs,
        dirty: false,
        findings: new Map(),
      };
      const { candidates } = await page.evaluate(collectCandidates, {
        max: opts.maxCandidates,
        destructive: DESTRUCTIVE_NAME.source,
      });
      await checkExpanded(ex, candidates);
      if (ex.dirty) await reload(page, url, ctx.config.timeoutMs);
      ex.dirty = false;
      await checkForms(ex);
      await checkInputs(ex);
      return [...ex.findings.values()];
    },
  };
}
