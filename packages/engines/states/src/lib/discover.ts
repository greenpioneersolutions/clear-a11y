import { ensureHelpers, type Page, type PageContext } from '@clear-a11y/browser';
import { describe, performAction, reload, snapshot } from './actions.js';
import { classifyState, significant, type Candidate, type Revealed } from './classify.js';
import type { StateAction, StateDescriptor, StateKind } from './descriptor.js';
import { formAction, submitAndObserve, type FormMode } from './forms.js';
import { collectCandidates, collectForms, hasNativeInvalid, type FormInfo } from './in-page.js';
import { resolveStatesOptions, type StatesOptions, type StatesOptionsInput } from './options.js';
import { DESTRUCTIVE_NAME, installRouteGuard, sameDocument } from './safety.js';
import { stateId, uniqueId } from './state-id.js';
import { visibleSetDiff } from './visible-set-diff.js';

const KIND_LABEL: Record<StateKind, string> = {
  menu: 'Menu',
  dialog: 'Dialog',
  accordion: 'Accordion panel',
  tab: 'Tab panel',
  tooltip: 'Tooltip',
  disclosure: 'Disclosed content',
  popover: 'Popover',
  'form-empty': 'Form submitted empty',
  'form-invalid': 'Form submitted with invalid values',
};

export interface CandidateResult {
  /** The page changed and must be reloaded before the next candidate. */
  dirty: boolean;
  found?: { action: Extract<StateAction, { selector: string }>; revealed: Revealed[] };
}

/** Activates one candidate (hover, focus and/or click) and reports what became visible. */
export async function tryCandidate(
  page: Page,
  url: string,
  candidate: Candidate,
  opts: StatesOptions,
): Promise<CandidateResult> {
  const types: ('hover' | 'focus' | 'click')[] =
    candidate.reason === 'tooltip'
      ? ['hover', 'focus', ...(candidate.clickable ? (['click'] as const) : [])]
      : ['click'];
  let dirty = false;
  await page.mouse.move(0, 0);
  for (const type of types) {
    const before = await snapshot(page, opts.maxElements);
    const action = { type, selector: candidate.selector };
    if (type === 'click') dirty = true;
    try {
      await performAction(page, action, opts);
    } catch {
      continue;
    }
    if (!sameDocument(page.url(), url)) return { dirty: true };
    const after = await snapshot(page, opts.maxElements);
    const diff = visibleSetDiff(before.visible, after.visible);
    const revealed = significant(await describe(page, diff.roots.slice(0, 20)));
    if (revealed.length) return { dirty: true, found: { action, revealed } };
    if (type === 'hover') await page.mouse.move(0, 0);
    if (type === 'focus') {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    }
  }
  return { dirty };
}

const anyVisible = async (page: Page, selectors: readonly string[]): Promise<boolean> => {
  for (const sel of selectors.slice(0, 3)) {
    if (
      await page
        .locator(sel)
        .first()
        .isVisible()
        .catch(() => false)
    )
      return true;
  }
  return false;
};

function descriptor(input: {
  id: string;
  kind: StateKind;
  trigger: string;
  label: string;
  action: StateAction;
  content: string[];
  opts: StatesOptions;
  verify?: (page: Page) => Promise<boolean>;
}): StateDescriptor {
  const { action, content, opts } = input;
  return {
    id: input.id,
    kind: input.kind,
    trigger: input.trigger,
    label: input.label,
    action,
    content,
    async open(page) {
      await installRouteGuard(page, page.url());
      await performAction(page, action, opts);
    },
    verify: input.verify ?? ((page) => anyVisible(page, content)),
  };
}

/**
 * Finds the hidden states of the page in `ctx` (menus, dialogs, accordions, tabs, tooltips,
 * disclosures, popovers, form error states) and returns them as replayable descriptors.
 *
 * Discovery interacts with `ctx.page` and reloads it between candidates; reload the page before
 * analyzing its default state again. A route guard blocks non-GET requests and navigations away
 * from the page, and controls with destructive names are never activated.
 */
export async function discoverStates(
  ctx: PageContext,
  overrides: StatesOptionsInput = {},
): Promise<StateDescriptor[]> {
  const opts = resolveStatesOptions(ctx.config, overrides);
  if (opts.maxStates === 0) return [];
  if (opts.viewports && !opts.viewports.includes(ctx.viewport.name)) return [];
  const { page, log } = ctx;
  const url = page.url();
  const deadline = Date.now() + opts.budgetMs;
  await installRouteGuard(page, url);
  await ensureHelpers(page);

  const destructive = DESTRUCTIVE_NAME.source;
  const { candidates, skipped } = await page.evaluate(collectCandidates, {
    max: opts.maxCandidates,
    destructive,
  });
  const forms = await page.evaluate(collectForms, { max: opts.maxForms, destructive });
  for (const s of [...skipped, ...forms.skipped]) {
    log.info('states: not activating a control with a destructive name', { url, ...s });
  }

  const states: StateDescriptor[] = [];
  const ids = new Set<string>();
  const signatures = new Set<string>();
  const add = (
    signature: string,
    d: Omit<Parameters<typeof descriptor>[0], 'id' | 'opts'> & { target: string },
  ) => {
    if (signatures.has(signature)) return;
    signatures.add(signature);
    const id = uniqueId(stateId(d.kind, d.target), ids);
    ids.add(id);
    states.push(descriptor({ ...d, id, opts }));
  };
  const stop = (what: string, remaining: number) => {
    if (remaining > 0) {
      log.info(`states: ${remaining} ${what} not explored (limit reached)`, {
        url,
        maxStates: opts.maxStates,
        budgetMs: opts.budgetMs,
      });
    }
  };
  const exhausted = () => states.length >= opts.maxStates || Date.now() > deadline;

  let dirty = false;
  for (const [i, candidate] of candidates.entries()) {
    if (exhausted()) {
      stop('candidate controls', candidates.length - i);
      break;
    }
    if (dirty) await reload(page, url, ctx.config.timeoutMs);
    const result = await tryCandidate(page, url, candidate, opts).catch((): CandidateResult => ({
      dirty: true,
    }));
    dirty = result.dirty;
    if (!result.found) continue;
    const { action, revealed } = result.found;
    const { kind, target } = classifyState(candidate, action.type, revealed);
    const content = revealed.map((r) => r.selector);
    add([...content].sort().join(','), {
      kind,
      target,
      trigger: candidate.selector,
      label: `${KIND_LABEL[kind]} opened by ${action.type} on "${candidate.name || candidate.selector}"`,
      action,
      content,
    });
  }

  const formRuns: [FormInfo, FormMode][] = forms.forms.flatMap((f) => [
    [f, 'empty'],
    [f, 'invalid'],
  ]);
  for (const [i, [form, mode]] of formRuns.entries()) {
    if (exhausted()) {
      stop('form submissions', formRuns.length - i);
      break;
    }
    const action = formAction(form, mode);
    if (!action) continue;
    if (dirty) await reload(page, url, ctx.config.timeoutMs);
    dirty = true;
    const obs = await submitAndObserve(page, url, form, action, opts).catch(() => undefined);
    if (!obs || obs.navigated) continue;
    const invalidFields = obs.fields
      .filter((f) => f.ariaInvalid === 'true' && f.ariaInvalidBefore !== 'true')
      .map((f) => f.selector);
    if (!obs.textSelectors.length && !invalidFields.length && !obs.nativeInvalid) continue;
    const kind: StateKind = mode === 'empty' ? 'form-empty' : 'form-invalid';
    const native = obs.nativeInvalid && !obs.textSelectors.length && !invalidFields.length;
    add(
      [
        'form',
        form.selector,
        ...[...obs.textSelectors].sort(),
        '|',
        ...invalidFields.sort(),
        native,
      ].join(','),
      {
        kind,
        target: form.id || form.selector,
        trigger: form.submit,
        label: `${KIND_LABEL[kind]} ("${form.submitName}")${native ? ' (native validation)' : ''}`,
        action,
        content: obs.textSelectors.length ? obs.textSelectors : invalidFields,
        verify: async (p) => {
          if (await anyVisible(p, obs.textSelectors)) return true;
          for (const sel of invalidFields.slice(0, 3)) {
            const v = await p
              .locator(sel)
              .first()
              .getAttribute('aria-invalid')
              .catch(() => null);
            if (v === 'true') return true;
          }
          return native ? p.evaluate(hasNativeInvalid, form.selector) : false;
        },
      },
    );
  }
  return states;
}
