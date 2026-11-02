import type { Page, PageHelpers } from '@clear-a11y/browser';
import {
  mayAnnounceChange,
  type InputChangeObservation,
} from '../rules/context-change-on-input.js';
import { snapshot } from './actions.js';
import type { StatesOptions } from './options.js';
import { sameDocument } from './safety.js';
import { visibleSetDiff } from './visible-set-diff.js';

/** A form control whose value the explorer changes (SC 3.2.2). */
export interface InputCandidate {
  selector: string;
  kind: 'select' | 'checkbox' | 'radio' | 'text';
  /** Label text (or another approximate accessible name). */
  name: string;
  /** select: the option value to choose; text: the characters to type. */
  value: string;
  /** select: the chosen option's text, for the message. */
  valueLabel: string;
  /** Visible text around the control: label, hint, legend and its form or container. */
  context: string;
}

/**
 * Form controls worth changing, in DOM order: single selects (an option other than the current
 * one), checkboxes, one unchecked radio per group, and text-like inputs. Skips hidden, disabled,
 * read-only and inert controls and anything whose name or chosen option looks destructive.
 * Self-contained: runs in the page.
 */
export function collectInputs(args: { max: number; destructive: string }): {
  inputs: InputCandidate[];
  skipped: { selector: string; name: string }[];
} {
  const H = window.__clearA11y as PageHelpers; // installed by ensureHelpers
  const TEXT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'number', ''];
  const destructive = new RegExp(args.destructive, 'i');
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el: Element): boolean => {
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const textOf = (el: Element | null | undefined, max: number): string =>
    el ? clean((el as HTMLElement).innerText ?? el.textContent).slice(0, max) : '';
  const nameOf = (el: HTMLInputElement | HTMLSelectElement): string => {
    const aria = clean(el.getAttribute('aria-label'));
    if (aria) return aria;
    const labels = el.labels ? Array.from(el.labels, (l) => textOf(l, 120)).join(' ') : '';
    return clean(labels) || clean(el.getAttribute('title')) || clean(el.getAttribute('name'));
  };
  const contextOf = (el: HTMLInputElement | HTMLSelectElement): string => {
    const parts: string[] = [];
    if (el.labels) for (const l of Array.from(el.labels)) parts.push(textOf(l, 300));
    for (const attr of ['aria-describedby', 'aria-details']) {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
        parts.push(textOf(document.getElementById(id), 300));
      }
    }
    parts.push(clean(el.getAttribute('title')));
    parts.push(textOf(el.closest('fieldset')?.querySelector('legend'), 200));
    // The surrounding form, or the nearest container with some text.
    let box: Element | null = el.form ?? el.parentElement;
    for (let i = 0; !el.form && box && i < 3 && textOf(box, 40).length < 40; i++) {
      box = box.parentElement;
    }
    parts.push(textOf(box, 800));
    return parts.filter(Boolean).join(' | ');
  };
  const usable = (el: HTMLInputElement | HTMLSelectElement): boolean =>
    !el.disabled &&
    !(el instanceof HTMLInputElement && el.readOnly) &&
    !el.closest('[inert], [aria-hidden="true"]') &&
    visible(el);

  const inputs: InputCandidate[] = [];
  const skipped: { selector: string; name: string }[] = [];
  const radioGroups = new Set<string>();
  const all = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('select, input');
  for (const el of Array.from(all)) {
    if (inputs.length >= args.max) break;
    if (!usable(el)) continue;
    const name = nameOf(el);
    const selector = H.selector(el);
    if (destructive.test(name)) {
      skipped.push({ selector, name });
      continue;
    }
    const base = { selector, name, context: contextOf(el) };
    if (el instanceof HTMLSelectElement) {
      if (el.multiple) continue;
      const option = Array.from(el.options).find(
        (o) => !o.selected && !o.disabled && o.value !== '' && !destructive.test(o.text),
      );
      if (!option) continue;
      inputs.push({ ...base, kind: 'select', value: option.value, valueLabel: clean(option.text) });
      continue;
    }
    const type = el.type.toLowerCase();
    if (type === 'checkbox') {
      inputs.push({ ...base, kind: 'checkbox', value: '', valueLabel: '' });
    } else if (type === 'radio') {
      const group = `${el.form ? H.selector(el.form) : ''}|${el.name || selector}`;
      if (el.checked || radioGroups.has(group)) continue;
      radioGroups.add(group);
      inputs.push({ ...base, kind: 'radio', value: '', valueLabel: '' });
    } else if (TEXT_TYPES.includes(el.getAttribute('type') === null ? '' : type)) {
      const pattern = el.getAttribute('pattern') ?? '';
      const numeric =
        type === 'tel' ||
        type === 'number' ||
        el.inputMode === 'numeric' ||
        /\\d|\[0-9\]/.test(pattern);
      const max = el.maxLength > 0 && el.maxLength <= 12 ? el.maxLength : 0;
      let value =
        type === 'email'
          ? 'test@example.com'
          : type === 'url'
            ? 'https://example.com'
            : type === 'number'
              ? (el.min || '5').toString()
              : numeric
                ? '5551234567'
                : 'test';
      // A field that acts when it is full (auto-submit, auto-advance) is filled to its maxlength.
      if (max) value = (numeric ? '1234567890ab' : 'abcdefghijkl').slice(0, max);
      inputs.push({ ...base, kind: 'text', value, valueLabel: value });
    }
  }
  return { inputs, skipped };
}

interface InputRecorderLog {
  submitted: string[];
  opened: string[];
  modalsOpened: string[];
  hrefChanged: string | null;
  focusMovedTo: string | null;
}

declare global {
  interface Window {
    __ca11yInputRecorder?: { read(control: string): InputRecorderLog; reset(): void };
  }
}

/**
 * Records submits, `window.open()` calls (answered with `null`: no window opens), modals and
 * history-API URL changes. Self-contained: runs in the page.
 */
export function installInputRecorder(): void {
  if (window.__ca11yInputRecorder) return;
  const H = window.__clearA11y as PageHelpers;
  const modals = (): Set<Element> =>
    new Set(
      Array.from(document.querySelectorAll('dialog, [aria-modal="true"]')).filter((d) => {
        if (d.tagName === 'DIALOG' && !d.matches(':modal')) return false;
        return H.isVisible(d);
      }),
    );
  let before = modals();
  let href = location.href.split('#')[0];
  let submitted: string[] = [];
  let opened: string[] = [];
  document.addEventListener(
    'submit',
    (e) => {
      if (e.target instanceof Element) submitted.push(H.selector(e.target));
    },
    true,
  );
  const submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
    submitted.push(H.selector(this));
    submit.call(this); // the route guard keeps the request from leaving the browser
  };
  window.open = function (url?: string | URL): WindowProxy | null {
    opened.push(url === undefined ? '' : String(url));
    return null;
  };
  window.__ca11yInputRecorder = {
    reset() {
      before = modals();
      href = location.href.split('#')[0];
      submitted = [];
      opened = [];
    },
    read(control: string): InputRecorderLog {
      const el = document.querySelector(control);
      let active: Element | null = document.activeElement;
      while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      const onPage = active && active !== document.body && active !== document.documentElement;
      const related =
        !el ||
        !active ||
        el === active ||
        el.contains(active) ||
        active.contains(el) ||
        // Clicking a label focuses its control; a radio group may move focus inside the group.
        Array.from((el as HTMLInputElement).labels ?? []).some((l) => l.contains(active)) ||
        (el instanceof HTMLInputElement &&
          active instanceof HTMLInputElement &&
          el.type === 'radio' &&
          active.type === 'radio' &&
          active.name === el.name);
      const now = location.href.split('#')[0];
      return {
        submitted,
        opened,
        modalsOpened: Array.from(modals())
          .filter((d) => !before.has(d))
          .map((d) => H.selector(d)),
        hrefChanged: now !== href ? (now ?? null) : null,
        focusMovedTo: onPage && !related && active ? H.selector(active) : null,
      };
    },
  };
}

function readRecorder(control: string): InputRecorderLog | null {
  return window.__ca11yInputRecorder?.read(control) ?? null;
}

function resetRecorder(): void {
  window.__ca11yInputRecorder?.reset();
}

function blurActive(): void {
  (document.activeElement as HTMLElement | null)?.blur?.();
}

/**
 * Changes one control on the current (freshly loaded, route-guarded) page and records what
 * happened. Text is typed (the field is filled to its maxlength when it has a short one), focus is
 * read while it is still in the field, then the field is blurred so `change` fires. Returns null
 * when the control could not be changed.
 */
export async function probeInput(
  page: Page,
  url: string,
  input: InputCandidate,
  opts: Pick<StatesOptions, 'candidateTimeoutMs' | 'settleMs' | 'maxElements'>,
): Promise<InputChangeObservation | null> {
  const timeout = opts.candidateTimeoutMs;
  const navigations: string[] = [];
  const popups: string[] = [];
  type Request = ReturnType<Parameters<Parameters<Page['route']>[1]>[0]['request']>;
  const onRequest = (req: Request) => {
    let mainFrame = false;
    try {
      mainFrame = req.frame() === page.mainFrame();
    } catch {
      // Service worker requests have no frame.
    }
    if (req.isNavigationRequest() && mainFrame && !sameDocument(req.url(), url)) {
      navigations.push(req.url());
    }
  };
  const onPopup = (popup: Page) => {
    popups.push(popup.url());
    void popup.close().catch(() => undefined);
  };
  await page.evaluate(installInputRecorder);
  const before = await snapshot(page, opts.maxElements);
  page.on('request', onRequest);
  page.on('popup', onPopup);
  try {
    const control = page.locator(input.selector).first();
    let focusMovedTo: string | null = null;
    try {
      await control.focus({ timeout });
      // What focusing alone does is SC 3.2.1 (engine-keyboard); only the change counts here.
      await page.waitForTimeout(50);
      await page.evaluate(resetRecorder);
      navigations.length = 0;
      popups.length = 0;
      if (input.kind === 'select') {
        await control.selectOption(input.value, { timeout });
      } else if (input.kind === 'text') {
        await control.pressSequentially(input.value, { timeout });
        focusMovedTo = (await page.evaluate(readRecorder, input.selector))?.focusMovedTo ?? null;
        if (!focusMovedTo) await page.evaluate(blurActive);
      } else {
        await control.click({ timeout });
      }
    } catch {
      return null;
    }
    if (opts.settleMs > 0) await page.waitForTimeout(opts.settleMs);
    const log = await page.evaluate(readRecorder, input.selector).catch(() => null);
    if (!log) {
      // The recorder is gone: the page reloaded itself (same URL) or is navigating.
      return {
        submitted: [],
        navigations: navigations.length ? navigations : [page.url()],
        windowsOpened: popups,
        modalsOpened: [],
        focusMovedTo: null,
        visibleBefore: before.visible.length,
        visibleRemoved: 0,
        warned: false,
      };
    }
    const after = await snapshot(page, opts.maxElements);
    const diff = visibleSetDiff(before.visible, after.visible);
    return {
      submitted: log.submitted,
      navigations: [...navigations, ...(log.hrefChanged ? [log.hrefChanged] : [])],
      windowsOpened: [...log.opened, ...popups],
      modalsOpened: log.modalsOpened,
      focusMovedTo: input.kind === 'text' ? focusMovedTo : log.focusMovedTo,
      visibleBefore: before.visible.length,
      visibleRemoved: diff.removed.length,
      warned: false,
    };
  } finally {
    page.off('request', onRequest);
    page.off('popup', onPopup);
  }
}

/** Visible text near the control may announce the behaviour. Pure. */
export function inputWarned(input: Pick<InputCandidate, 'context'>): boolean {
  return mayAnnounceChange(input.context);
}
