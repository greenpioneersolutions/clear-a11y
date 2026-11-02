import type { Page, PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { authPasteBlockedRule, detectAuthPasteBlocked } from '../rules/auth-paste-blocked.js';
import {
  characterKeyShortcutRule,
  detectCharacterKeyShortcut,
  SHORTCUT_KEYS,
  type KeyPressEffect,
} from '../rules/character-key-shortcut.js';
import {
  detectDragWithoutAlternative,
  dragWithoutAlternativeRule,
} from '../rules/drag-without-alternative.js';
import { detectMotionActuation, motionActuationRule } from '../rules/motion-actuation.js';
import {
  detectPointerDownAction,
  isPointerDownCandidate,
  pointerDownActionRule,
} from '../rules/pointer-down-action.js';
import { atFinding, quote } from './findings.js';
import type { WatchEffects } from './listener-spy.js';

/** What the interaction probes need from the Prober. */
export interface ProbeDriver {
  readonly ctx: PageContext;
  readonly page: Page;
  fresh(replay?: boolean): Promise<void>;
  outOfTime(): boolean;
  /** True when the main frame navigated since the last `fresh()`. */
  navigatedSinceFresh(): boolean;
}

/** At most this many pointer-down candidates are pressed per page. */
const MAX_POINTER_TARGETS = 10;
/** How long a probe waits for a handler's effect (ms). */
const EFFECT_WAIT_MS = 60;

interface ReadResult {
  windowListeners: string[];
  drag: Array<{
    selector: string;
    draggable: boolean;
    listeners: string[];
    nativeControl: boolean;
    alternative: boolean;
    name: string;
  }>;
  auth: Array<{
    selector: string;
    pasteBlocked: boolean;
    autocompleteOff: boolean;
    loginPassword: boolean;
    label: string;
  }>;
  pointer: Array<{ selector: string; listeners: string[]; name: string }>;
  documentKeys: boolean;
}

const wait = (page: Page, ms: number) =>
  page.evaluate((t) => new Promise<void>((r) => setTimeout(r, t)), ms);

/**
 * Interaction probes on a fresh load with the listener spy installed:
 * motion listeners (2.5.4), drag/swipe targets without alternatives (2.5.7, 2.5.1), password and
 * code fields that block paste (3.3.8), actions on pointer down (2.5.2) and single-character
 * shortcuts (2.1.4).
 */
export async function probeInteractions(d: ProbeDriver): Promise<Finding[]> {
  const findings: Finding[] = [];
  await d.fresh();
  const read = await readPage(d.page);

  // at/motion-actuation
  const motion = detectMotionActuation({ windowListeners: read.windowListeners });
  if (motion.length) {
    findings.push(
      atFinding(d.ctx, motionActuationRule, {
        selector: 'html',
        confidence: 0.6,
        message: `The page listens to ${motion.join(' and ')} as soon as it loads, so something on it reacts to shaking or tilting the device. People with a mounted device or tremors cannot use or avoid it unless there is a normal control and a way to turn motion off.`,
        question:
          'Can everything that responds to moving the device also be done with a normal control, and can the motion response be turned off?',
        evidence: { data: { listeners: motion } },
      }),
    );
  }

  // at/drag-without-alternative
  for (const target of read.drag) {
    if (!detectDragWithoutAlternative(target)) continue;
    findings.push(
      atFinding(d.ctx, dragWithoutAlternativeRule, {
        selector: target.selector,
        ...(target.name ? { name: target.name } : {}),
        confidence: 0.6,
        message: `${target.draggable ? 'These items are draggable' : 'This element is operated by dragging or swiping'} (${[target.draggable ? 'draggable="true"' : '', ...target.listeners].filter(Boolean).join(', ')}), and there is no button, menu or field next to it. People who cannot hold a press while moving may have no other way to do the same thing.`,
        question:
          'Can everything done by dragging or swiping here also be done with single taps or clicks (for example Previous/Next or Move up/Move down buttons)?',
        evidence: { data: { draggable: target.draggable, listeners: target.listeners } },
      }),
    );
  }

  // at/auth-paste-blocked
  for (const field of read.auth) {
    const problem = detectAuthPasteBlocked(field);
    if (!problem) continue;
    const label = field.label ? quote(field.label) : field.selector;
    findings.push(
      atFinding(d.ctx, authPasteBlockedRule, {
        selector: field.selector,
        ...(field.label ? { name: field.label } : {}),
        confidence: problem === 'paste-blocked' ? 0.85 : 0.6,
        message:
          problem === 'paste-blocked'
            ? `The ${label} field cancels paste, so people cannot paste a password or code from a password manager or another app and must remember and retype it.`
            : `The login field ${label} sets autocomplete="off", which tells password managers not to fill it, pushing people to remember and retype their password.`,
        evidence: { data: { ...field } },
      }),
    );
  }

  // at/pointer-down-action
  const pointerTargets = read.pointer
    .filter((p) => isPointerDownCandidate(p.listeners))
    .slice(0, MAX_POINTER_TARGETS);
  let dirty = true; // the paste check above may have changed the page
  for (const target of pointerTargets) {
    if (d.outOfTime()) break;
    if (dirty) await d.fresh();
    dirty = false;
    const effects = await pressDown(d, target.selector);
    if (!effects) continue;
    const changedOnDown = effects.domChanged || effects.navigated;
    dirty = changedOnDown || effects.focusMoved || effects.scrolled;
    if (!detectPointerDownAction({ listeners: target.listeners, changedOnDown })) continue;
    findings.push(
      atFinding(d.ctx, pointerDownActionRule, {
        selector: target.selector,
        ...(target.name ? { name: target.name } : {}),
        confidence: 0.75,
        message: `${target.name ? quote(target.name) : target.selector} acts as soon as the pointer goes down (${target.listeners.join(', ')}, no click or up handler): the page ${effects.navigated ? 'navigated' : 'changed'} before the button was released, so moving away to cancel is impossible.`,
        evidence: { data: { listeners: target.listeners, effects } },
      }),
    );
  }

  // at/character-key-shortcut
  if (read.documentKeys && !d.outOfTime()) {
    const hits = await probeShortcutKeys(d);
    if (hits.length) {
      const keys = hits.map((h) => h.key);
      findings.push(
        atFinding(d.ctx, characterKeyShortcutRule, {
          selector: 'html',
          confidence: 0.6,
          message: `Pressing ${keys.map((k) => `"${k}"`).join(', ')} with nothing focused does something on the page (${describeEffects(hits)}). Speech input users trigger single-key shortcuts by accident when they dictate.`,
          question: `Can the single-key shortcut${keys.length > 1 ? 's' : ''} ${keys.join(', ')} be turned off or remapped to use Ctrl/Alt/Meta, or do ${keys.length > 1 ? 'they' : 'it'} only work while a specific component has focus?`,
          evidence: { data: { keys: hits } },
        }),
      );
    }
  }
  return findings;
}

function describeEffects(hits: KeyPressEffect[]): string {
  const kinds = new Set<string>();
  for (const h of hits) {
    if (h.focusMoved) kinds.add('focus moved');
    if (h.domChanged) kinds.add('content changed');
    if (h.scrolled) kinds.add('the page scrolled');
    if (h.navigated) kinds.add('the URL changed');
  }
  return [...kinds].join(', ');
}

function readPage(page: Page): Promise<ReadResult> {
  return page.evaluate((): ReadResult => {
    const h = window.__clearA11y!;
    const spy = window.__clearA11yListeners;
    const types = (t: EventTarget | null) => spy?.types(t) ?? [];
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const nameOf = (el: Element) =>
      clean(el.getAttribute('aria-label') ?? (el as HTMLElement).innerText).slice(0, 80);
    const live = (el: Element) => !el.closest('[aria-hidden=true], [inert]') && h.isVisible(el);
    const all = Array.from(document.body?.querySelectorAll('*') ?? []).filter(live);

    // Drag and swipe targets, grouped: draggable items by their list, handlers by element.
    const DOWN = ['mousedown', 'pointerdown', 'touchstart'];
    const MOVE = ['mousemove', 'pointermove', 'touchmove'];
    const ALT = 'button, [role=button], select, input:not([type=hidden]), [role=slider]';
    const groups = new Map<Element, { draggable: boolean; listeners: Set<string> }>();
    for (const el of all) {
      const t = types(el);
      const draggable = el.getAttribute('draggable') === 'true';
      const handlers =
        t.includes('dragstart') ||
        t.includes('drop') ||
        (t.some((x) => DOWN.includes(x)) && t.some((x) => MOVE.includes(x)));
      if (!draggable && !handlers) continue;
      // Draggable items are reported once, on their list; handler elements on themselves.
      const container = draggable ? (el.parentElement ?? el) : el;
      const g = groups.get(container) ?? { draggable: false, listeners: new Set<string>() };
      g.draggable ||= draggable;
      for (const x of t) g.listeners.add(x);
      groups.set(container, g);
    }
    const drag = [...groups].map(([container, g]) => {
      const region = container.parentElement ?? container;
      return {
        selector: h.selector(container),
        draggable: g.draggable,
        listeners: [...g.listeners].filter((x) => x !== 'click'),
        // Native controls, and slider widgets (dragging the thumb; the track takes clicks).
        nativeControl: container.matches(
          'input, textarea, select, [contenteditable=true], [role=slider], [role=scrollbar]',
        ),
        alternative: Array.from(region.querySelectorAll(ALT)).some(
          (b) => b !== container && !b.contains(container) && h.isVisible(b),
        ),
        name: nameOf(container).slice(0, 60),
      };
    });

    // Password and one-time-code fields: does a cancelable paste get cancelled?
    const auth = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[type=password], input[autocomplete~="one-time-code" i]',
      ),
    )
      .filter(live)
      .map((el) => {
        const paste = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        });
        const notCancelled = el.dispatchEvent(paste);
        const ac = (
          el.getAttribute('autocomplete') ??
          el.form?.getAttribute('autocomplete') ??
          ''
        ).toLowerCase();
        return {
          selector: h.selector(el),
          pasteBlocked: !notCancelled || paste.defaultPrevented,
          autocompleteOff: ac.trim() === 'off',
          loginPassword:
            el.type === 'password' &&
            !!el.form &&
            el.form.querySelectorAll('input[type=password]').length === 1 &&
            !ac.includes('new-password'),
          label: clean(
            Array.from(el.labels ?? [])
              .map((l) => l.textContent)
              .join(' ') || el.getAttribute('aria-label'),
          ),
        };
      });

    const pointer = all
      .map((el) => ({ el, listeners: types(el) }))
      .filter((p) => p.listeners.some((x) => DOWN.includes(x)))
      .map((p) => ({ selector: h.selector(p.el), listeners: p.listeners, name: nameOf(p.el) }));

    return {
      windowListeners: [...types(window), ...types(document)],
      drag,
      auth,
      pointer,
      documentKeys: [window, document, document.documentElement, document.body].some((t) =>
        types(t).some((x) => x.startsWith('key')),
      ),
    };
  });
}

/** Presses (without releasing) the centre of the element, then releases far away. */
async function pressDown(d: ProbeDriver, selector: string): Promise<WatchEffects | undefined> {
  const box = await d.page
    .locator(selector)
    .first()
    .boundingBox({ timeout: 1_000 })
    .catch(() => null);
  if (!box || box.width < 1 || box.height < 1) return undefined;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await d.page.mouse.move(x, y);
  await d.page.evaluate(() => window.__clearA11yListeners?.watch(false));
  await d.page.mouse.down();
  let effects: WatchEffects | undefined;
  try {
    await wait(d.page, EFFECT_WAIT_MS);
    effects = await d.page.evaluate(() => window.__clearA11yListeners?.effects());
  } catch {
    // The press navigated away and destroyed the context.
  }
  if (d.navigatedSinceFresh()) {
    effects = { domChanged: true, focusMoved: false, scrolled: false, navigated: true };
  }
  // Release outside the element (an up there must not trigger anything).
  await d.page.mouse.move(0, 0).catch(() => undefined);
  await d.page.mouse.up().catch(() => undefined);
  return effects;
}

/** Presses each shortcut key with nothing focused and records what happened. */
async function probeShortcutKeys(d: ProbeDriver): Promise<KeyPressEffect[]> {
  await d.fresh();
  const blurAndWatch = (withStyle: boolean) =>
    d.page.evaluate((s) => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.getSelection()?.removeAllRanges();
      window.__clearA11yListeners?.watch(s);
    }, withStyle);
  // Baseline: does the page change by itself while nobody presses anything?
  await blurAndWatch(true);
  await wait(d.page, EFFECT_WAIT_MS * 2);
  const baseline = await d.page.evaluate(() => window.__clearA11yListeners?.effects());
  const baselineChanges = baseline?.domChanged ?? false;

  // Quick pass: every key in a row under one watch. Most pages (an Escape handler, a Ctrl+K
  // search) react to none of them, and then one pass is enough. Only if something happened is
  // each key pressed on its own to find which ones are shortcuts.
  await blurAndWatch(true);
  for (const key of SHORTCUT_KEYS) await d.page.keyboard.press(key);
  let quick: WatchEffects | undefined;
  try {
    await wait(d.page, EFFECT_WAIT_MS);
    quick = await d.page.evaluate(() => window.__clearA11yListeners?.effects());
  } catch {
    quick = undefined;
  }
  const navigated = d.navigatedSinceFresh();
  if (
    quick &&
    !navigated &&
    !detectCharacterKeyShortcut({ baselineChanges, presses: [{ key: '*', ...quick }] }).length
  )
    return [];
  await d.fresh();

  const presses: KeyPressEffect[] = [];
  for (const key of SHORTCUT_KEYS) {
    if (d.outOfTime()) break;
    await blurAndWatch(true);
    await d.page.keyboard.press(key);
    let effects: WatchEffects | undefined;
    try {
      await wait(d.page, EFFECT_WAIT_MS);
      effects = await d.page.evaluate(() => window.__clearA11yListeners?.effects());
    } catch {
      effects = undefined;
    }
    if (d.navigatedSinceFresh())
      effects = { domChanged: true, focusMoved: false, scrolled: false, navigated: true };
    if (!effects) continue;
    const press = { key, ...effects };
    presses.push(press);
    // Reload only after a press that did something, so the next key starts from the same page.
    if (detectCharacterKeyShortcut({ baselineChanges, presses: [press] }).length) await d.fresh();
  }
  return detectCharacterKeyShortcut({ baselineChanges, presses });
}
