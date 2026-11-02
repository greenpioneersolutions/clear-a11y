import { captureElement, gotoAndSettle, type Engine, type PageContext } from '@clear-a11y/browser';
import {
  createFinding,
  type Evidence,
  type FocusStop,
  type Finding,
  type PageRef,
  type RuleMeta,
  type Tier,
} from '@clear-a11y/core';
import { classifyClickCandidate, clickNotFocusableRule } from '../rules/click-not-focusable.js';
import {
  contextChangeOnFocusRule,
  describeContextChange,
  detectContextChangeOnFocus,
  type FocusContextChange,
} from '../rules/context-change-on-focus.js';
import {
  detectEscapeDoesNotClose,
  escapeDoesNotCloseRule,
  isOverlayKind,
} from '../rules/escape-does-not-close.js';
import { detectFocusNotReturned, focusNotReturnedRule } from '../rules/focus-not-returned.js';
import { focusNotVisibleRule } from '../rules/focus-not-visible.js';
import {
  focusObscuredRule,
  isEntirelyObscured,
  userCanRevealByEscape,
} from '../rules/focus-obscured.js';
import { detectFocusOrderBackward, focusOrderBackwardRule } from '../rules/focus-order-backward.js';
import { detectKeyboardTrap, keyboardTrapRule } from '../rules/keyboard-trap.js';
import {
  detectOverlayFocusNotMoved,
  overlayFocusNotMovedRule,
} from '../rules/overlay-focus-not-moved.js';
import {
  detectSkipLinkBroken,
  isSkipLinkCandidate,
  skipLinkBrokenRule,
  skipTargetId,
} from '../rules/skip-link-broken.js';
import { detectSkipLinkMissing, skipLinkMissingRule } from '../rules/skip-link-missing.js';
import { startContextWatch, type ContextWatch } from './context-watch.js';
import { collectClickCandidates } from './listeners.js';
import { parseKeyboardOptions, type KeyboardOptions } from './options.js';
import { closeOverlay, findOverlay } from './overlay.js';
import {
  countTabbable,
  describeActive,
  focusInView,
  inModalWithCloseControl,
  hasFocusableAfter,
  landedAfter,
  leadingNavStops,
  linkInfo,
  nextFrames,
  pageStructure,
  refocus,
  skipTargetExists,
} from './page-scripts.js';
import { measureFocusIndicator, preparePage, type FocusMeasure } from './screenshot.js';
import { detectCycle, isStrictSubset } from './trap.js';
import { escapesSet, toFocusStop, walkFocus, type WalkResult, type WalkStop } from './walker.js';

export const ENGINE_NAME = 'engine-keyboard';

/** Screenshot crops saved per page state. */
const MAX_SCREENSHOTS = 10;
/** Stops on either side of the relevant stop in a windowed focus path. */
const PATH_WINDOW = 5;

const WHO = 'Keyboard-only and switch users';
const WHO_LOWER = 'keyboard-only and switch users';

interface Draft {
  rule: RuleMeta;
  selector: string;
  message: string;
  confidence: number;
  evidence: Evidence;
  tier?: Tier;
  wcag?: string[];
  role?: string;
  name?: string;
  question?: string;
}

/** Builds findings with per-rule caps and a screenshot budget. */
class Findings {
  readonly list: Finding[] = [];
  private readonly perRule = new Map<string, number>();
  private shots = 0;

  constructor(
    private readonly ctx: PageContext,
    private readonly page: PageRef,
    private readonly maxPerRule: number,
  ) {}

  full(ruleId: string): boolean {
    return (this.perRule.get(ruleId) ?? 0) >= this.maxPerRule;
  }

  async add(d: Draft, screenshot: Buffer | 'capture' | undefined = 'capture'): Promise<void> {
    if (this.full(d.rule.id)) return;
    this.perRule.set(d.rule.id, (this.perRule.get(d.rule.id) ?? 0) + 1);
    const evidence: Evidence = { ...d.evidence };
    if (screenshot && this.shots < MAX_SCREENSHOTS && this.ctx.config.output.screenshots) {
      const name = `${d.rule.id.replace('/', '-')}`;
      const path =
        screenshot === 'capture'
          ? await captureElement(this.ctx, d.selector, name)
          : await this.ctx.artifacts.save(name, screenshot).catch(() => undefined);
      if (path) {
        evidence.screenshot = path;
        this.shots++;
      }
    }
    this.list.push(
      createFinding({
        ruleId: d.rule.id,
        wcag: d.wcag ?? d.rule.wcag,
        tier: d.tier ?? d.rule.tier,
        confidence: d.confidence,
        engine: ENGINE_NAME,
        page: this.page,
        target: {
          selector: d.selector,
          ...(d.role ? { role: d.role } : {}),
          ...(d.name ? { name: d.name } : {}),
        },
        message: d.message,
        fix: d.rule.fix,
        evidence,
        ...(d.question ? { question: d.question } : {}),
      }),
    );
  }
}

/** A window of the focus path around one stop. */
function pathAround(stops: readonly WalkStop[], index: number, backward = new Set<number>()) {
  const from = Math.max(0, index - PATH_WINDOW);
  return stops
    .slice(from, index + PATH_WINDOW + 1)
    .map((s) => toFocusStop(s, backward.has(s.index)));
}

const label = (s: { name?: string; selector: string }) =>
  s.name ? `"${s.name.slice(0, 60)}"` : `\`${s.selector}\``;

/**
 * Keyboard-only testing: walks the Tab order and compares it with the visual order, checks that
 * focus is visible and not hidden, detects traps and mouse-only controls, checks Escape and focus
 * return on overlays (when the state explorer hands over an overlay state), and verifies skip links.
 */
export function createKeyboardEngine(): Engine {
  return {
    name: ENGINE_NAME,
    // Presses keys, blurs, closes overlays and follows skip links: needs its own page load.
    mutatesPage: true,
    run: (ctx) => runKeyboard(ctx),
  };
}

async function runKeyboard(ctx: PageContext): Promise<Finding[]> {
  const options = parseKeyboardOptions(ctx.config.keyboard);
  const { page } = ctx;
  const out = new Findings(
    ctx,
    { url: ctx.url, state: ctx.state, viewport: ctx.viewport.name },
    options.maxFindingsPerRule,
  );
  await preparePage(page);

  const meta = ctx.stateMeta;
  const overlayState = isOverlayKind(meta?.kind);
  let overlaySelector: string | null = null;
  if (overlayState) overlaySelector = await checkOverlay(ctx, out);

  const measures = new Map<number, FocusMeasure>();
  const contextChanges: FocusContextChange[] = [];
  const watch: ContextWatch | null = await startContextWatch(page).catch((err) => {
    ctx.log.debug('context watch failed', { error: String(err) });
    return null;
  });
  const walk = await walkFocus(page, {
    maxStops: options.maxStops,
    overlaySelector,
    onPress: async () => {
      const press = await watch?.take();
      const change = press ? detectContextChangeOnFocus(press) : null;
      if (change) contextChanges.push(change);
    },
    onStop: async (stop) => {
      if (measures.size >= options.focusVisibleMaxStops) return;
      if (overlaySelector && !stop.inOverlay) return; // behind an open overlay
      // Covered by sticky content: focus-obscured (2.4.11) reports the real cause.
      if (isEntirelyObscured(stop.hits)) return;
      const m = await measureFocusIndicator(page, stop, options.focusCropPadding).catch((err) => {
        ctx.log.debug('focus measure failed', { selector: stop.selector, error: String(err) });
        return null;
      });
      if (m) measures.set(stop.index, m);
    },
  });
  ctx.log.debug('focus walk', { stops: walk.stops.length, end: walk.end, fromTop: walk.fromTop });

  await reportContextChanges(walk, contextChanges, out);
  await reportFocusOrder(walk, out);
  await reportFocusVisible(walk, measures, out);
  await checkTrap(ctx, walk, out);
  await checkClickable(ctx, walk, options, out);
  if (!meta || meta.kind === 'default') await checkSkipLinks(ctx, walk, out);
  // Last: the 2.4.11 exception check presses Escape, which may close the state.
  await reportObscured(ctx, walk, overlaySelector, out);
  await watch?.stop();
  return out.list;
}

/** SC 3.2.1: changes of context caused only by Tab moving focus onto an element. */
async function reportContextChanges(
  walk: WalkResult,
  changes: readonly FocusContextChange[],
  out: Findings,
): Promise<void> {
  const seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.trigger)) continue;
    seen.add(change.trigger);
    const stop = walk.stops.find((s) => s.selector === change.trigger);
    const target = stop ?? { selector: change.trigger, name: '' };
    const who =
      change.kind === 'focus-moved' || change.kind === 'focus-removed'
        ? `${WHO} lose their place and may not be able to reach or use this control.`
        : `${WHO} and screen reader users explore a page by tabbing through it and are taken somewhere they did not ask to go.`;
    await out.add(
      {
        rule: contextChangeOnFocusRule,
        selector: change.trigger,
        ...(stop ? { role: stop.role, name: stop.name } : {}),
        tier: change.tier,
        confidence: change.tier === 'violation' ? 0.95 : 0.75,
        message: `${describeContextChange(change, label(target))} ${who}`,
        evidence: {
          ...(stop ? { focusPath: pathAround(walk.stops, stop.index) } : {}),
          data: { change: change.kind, ...(change.detail ? { detail: change.detail } : {}) },
        },
      },
      undefined,
    );
  }
}

/**
 * Overlay states (from the state explorer): focus should move into a dialog when it opens,
 * Escape should close it, and closing should return focus to the trigger. Afterwards the state
 * is replayed so the walk sees the overlay open. Returns the overlay selector for the walk.
 */
async function checkOverlay(ctx: PageContext, out: Findings): Promise<string | null> {
  const { page } = ctx;
  const meta = ctx.stateMeta;
  const overlay = await findOverlay(page, meta?.triggerSelector);
  if (!overlay) {
    ctx.log.debug('overlay state but no visible overlay found', { state: ctx.state });
    return null;
  }
  const trigger = meta?.triggerSelector;
  const trail: FocusStop[] = [
    ...(trigger ? [{ index: 0, selector: trigger, name: 'trigger' }] : []),
  ];

  if (
    detectOverlayFocusNotMoved({
      kind: meta?.kind,
      overlayVisible: true,
      focusInside: overlay.focusInside,
    })
  ) {
    await out.add({
      rule: overlayFocusNotMovedRule,
      selector: overlay.selector,
      confidence: 0.85,
      message: `Opening this dialog leaves keyboard focus on ${overlay.activeSelector ? `\`${overlay.activeSelector}\`` : 'the page body'}, behind the dialog. ${WHO} must Tab through the page to reach it, and screen reader users may not notice it opened.`,
      evidence: {
        focusPath: [
          ...trail,
          {
            index: trail.length,
            selector: overlay.activeSelector ?? 'body',
            name: 'focus after open',
          },
        ],
        data: {
          overlay: overlay.selector,
          activeAfterOpen: overlay.activeSelector,
          kind: meta?.kind,
        },
      },
    });
  }

  const closed = await closeOverlay(page, overlay.selector, trigger);
  if (detectEscapeDoesNotClose({ openBefore: true, openAfter: !closed.escapeClosed })) {
    await out.add({
      rule: escapeDoesNotCloseRule,
      selector: overlay.selector,
      confidence: 0.6,
      message: `Pressing Escape inside this ${meta?.kind ?? 'overlay'} does not close it. ${WHO} expect Escape to dismiss overlays${closed.closeControl ? `; they have to find the close button (\`${closed.closeControl}\`) instead` : ''}.`,
      question:
        'Is there another obvious keyboard way to close this overlay, so Escape is not needed?',
      evidence: {
        focusPath: trail,
        data: { overlay: overlay.selector, closeControl: closed.closeControl, kind: meta?.kind },
      },
    });
  }

  if (
    trigger &&
    detectFocusNotReturned({
      closed: closed.closedBy !== null,
      triggerAvailable: closed.triggerAvailable,
      focusOnTrigger: closed.focusOnTrigger,
    })
  ) {
    const via = closed.closedBy === 'escape' ? 'Escape' : `its close control`;
    await out.add(
      {
        rule: focusNotReturnedRule,
        selector:
          closed.closedBy === 'close-control' && closed.closeControl
            ? closed.closeControl
            : overlay.selector,
        confidence: 0.85,
        message: `After closing the ${meta?.kind ?? 'overlay'} with ${via}, focus lands on ${closed.activeAfterClose ? `\`${closed.activeAfterClose}\`` : 'the page body'} instead of returning to the control that opened it (\`${trigger}\`). ${WHO} and screen reader users lose their place.`,
        evidence: {
          focusPath: [
            ...trail,
            ...(closed.closeControl
              ? [{ index: trail.length, selector: closed.closeControl, name: 'close control' }]
              : []),
            {
              index: trail.length + (closed.closeControl ? 1 : 0),
              selector: closed.activeAfterClose ?? 'body',
              name: 'focus after close',
            },
          ],
          data: {
            overlay: overlay.selector,
            closedBy: closed.closedBy,
            activeAfterClose: closed.activeAfterClose,
            trigger,
          },
        },
      },
      undefined,
    );
  }

  // Re-open the state so the walk and the other checks see the overlay.
  if (!meta?.replay) return null;
  try {
    await gotoAndSettle(page, ctx.url, ctx.config.timeoutMs);
    await meta.replay(page);
    await preparePage(page);
    return (await findOverlay(page, trigger))?.selector ?? null;
  } catch (err) {
    ctx.log.warn('could not replay overlay state', { state: ctx.state, error: String(err) });
    return null;
  }
}

async function reportFocusOrder(walk: WalkResult, out: Findings): Promise<void> {
  const backward = detectFocusOrderBackward(walk.stops, { rtl: walk.stops[0]?.rtl ?? false });
  if (!backward.length) return;
  const marks = new Set(backward);
  const path = walk.stops.map((s) => toFocusStop(s, marks.has(s.index)));
  for (const i of backward) {
    const prev = walk.stops[i - 1] as WalkStop;
    const next = walk.stops[i] as WalkStop;
    await out.add(
      {
        rule: focusOrderBackwardRule,
        selector: next.selector,
        role: next.role,
        name: next.name,
        confidence: 0.75,
        message: `Tab moves from ${label(prev)} back up to ${label(next)}, against the visual reading order. ${WHO} lose their place, and screen magnifier users have to search for focus.`,
        evidence: {
          focusPath: path,
          data: { from: prev.selector, to: next.selector, fromRect: prev.rect, toRect: next.rect },
        },
      },
      undefined,
    );
  }
}

async function reportFocusVisible(
  walk: WalkResult,
  measures: Map<number, FocusMeasure>,
  out: Findings,
): Promise<void> {
  for (const [index, m] of measures) {
    if (m.indicator === 'visible') continue;
    const stop = walk.stops[index] as WalkStop;
    const none = m.indicator === 'none';
    await out.add(
      {
        rule: focusNotVisibleRule,
        selector: stop.selector,
        role: stop.role,
        name: stop.name,
        tier: none ? 'violation' : 'needs-review',
        wcag: none ? ['2.4.7'] : ['2.4.7', '1.4.11'],
        confidence: none ? 0.95 : 0.5,
        message: none
          ? `Nothing on screen changes when ${label(stop)} receives keyboard focus. Sighted ${WHO_LOWER} cannot tell where they are.`
          : `The focus indicator on ${label(stop)} is very small or faint (${m.change.strong} pixels with 3:1 contrast change, largest change ${m.change.maxContrast}:1). Sighted ${WHO_LOWER} and people with low vision may not see where focus is.`,
        ...(none ? {} : { question: 'Can you see where focus is on this control?' }),
        evidence: {
          focusPath: pathAround(walk.stops, index),
          data: {
            changedPixels: m.change.changed,
            strongPixels: m.change.strong,
            maxContrastChange: m.change.maxContrast,
            ...(m.viewportChanged !== undefined
              ? { viewportChangedPixels: m.viewportChanged }
              : {}),
            clip: m.clip,
          },
        },
      },
      m.focusedPng,
    );
  }
}

/** Obscured stops checked for the 2.4.11 user-opened-content exception, per state. */
const MAX_DISMISS_CHECKS = 5;

/**
 * 2.4.11 exception (Understanding 2.4.11, "content opened by the user"): in a state the user
 * opened, focus the covered stop again, press Escape and look again. When focus stayed and the
 * stop is no longer entirely covered, the user can reveal it without moving focus. Escape may
 * close the state, so it is replayed when the stop is no longer covered before the test.
 */
async function revealedByEscape(
  ctx: PageContext,
  stop: WalkStop,
  overlaySelector: string | null,
): Promise<boolean> {
  const { page } = ctx;
  const kind = ctx.stateMeta?.kind;
  if (!kind || kind === 'default') return false;
  try {
    const focusStop = async () => {
      if (!(await page.evaluate(focusInView, stop.selector))) return undefined;
      await page.evaluate(nextFrames);
      return page.evaluate(describeActive, overlaySelector);
    };
    let before = await focusStop();
    if (before && !isEntirelyObscured(before.hits) && ctx.stateMeta?.replay) {
      await ctx.stateMeta.replay(page);
      before = await focusStop();
    }
    if (!before) return false;
    await page.keyboard.press('Escape');
    await page.evaluate(nextFrames);
    const after = await page.evaluate(describeActive, overlaySelector);
    return userCanRevealByEscape({
      stateKind: kind,
      before: before.hits,
      afterEscape: after?.hits ?? [],
      focusStayed: after?.selector === stop.selector,
    });
  } catch (err) {
    ctx.log.debug('focus-obscured dismiss check failed', {
      selector: stop.selector,
      error: String(err),
    });
    return false;
  }
}

async function reportObscured(
  ctx: PageContext,
  walk: WalkResult,
  overlaySelector: string | null,
  out: Findings,
): Promise<void> {
  let dismissChecks = 0;
  for (const stop of walk.stops) {
    // Behind an open overlay the real problem is focus leaving it, not the overlay covering it.
    if (overlaySelector && !stop.inOverlay) continue;
    if (!isEntirelyObscured(stop.hits)) continue;
    if (dismissChecks < MAX_DISMISS_CHECKS) {
      dismissChecks++;
      if (await revealedByEscape(ctx, stop, overlaySelector)) {
        ctx.log.debug('focus-obscured: user-opened content closes with Escape', {
          selector: stop.selector,
        });
        continue;
      }
    }
    await out.add({
      rule: focusObscuredRule,
      selector: stop.selector,
      role: stop.role,
      name: stop.name,
      confidence: 0.9,
      message: `When ${label(stop)} receives keyboard focus it is completely covered by fixed or sticky content. ${WHO} cannot see what they are about to activate.`,
      evidence: {
        focusPath: pathAround(walk.stops, stop.index),
        data: { samples: stop.hits.length, viewportRect: stop.client },
      },
    });
  }
}

async function checkTrap(ctx: PageContext, walk: WalkResult, out: Findings): Promise<void> {
  if (walk.end !== 'cycle') return;
  const cycle = detectCycle(walk.sequence);
  if (!cycle) return;
  const { page } = ctx;
  const tabbableCount = await page.evaluate(countTabbable);
  if (!isStrictSubset(cycle, tabbableCount)) return;
  const members = new Set(cycle.members);
  const presses = cycle.members.length + 2;
  const first = cycle.members[0] as string;

  await page.evaluate(refocus, first);
  const escapedBackward = await escapesSet(page, members, 'Shift+Tab', presses);
  let escapedAfterEscape = false;
  let modalWithCloseControl = false;
  if (!escapedBackward) {
    await page.evaluate(refocus, first);
    await page.keyboard.press('Escape');
    await page.evaluate(nextFrames);
    escapedAfterEscape = await escapesSet(page, members, 'Tab', presses);
    if (!escapedAfterEscape)
      modalWithCloseControl = await page.evaluate(inModalWithCloseControl, first);
  }
  const input = {
    cycleSize: cycle.members.length,
    tabbableCount,
    escapedBackward,
    escapedAfterEscape,
    modalWithCloseControl,
  };
  if (!detectKeyboardTrap(input)) return;
  const stop = walk.stops[cycle.start] as WalkStop;
  await out.add({
    rule: keyboardTrapRule,
    selector: first,
    role: stop?.role,
    name: stop?.name,
    confidence: 0.95,
    message: `Keyboard focus gets stuck in ${cycle.members.length === 1 ? label(stop) : `a group of ${cycle.members.length} controls starting at ${label(stop)}`}: Tab, Shift+Tab and Escape do not move it out (the page has ${tabbableCount} tabbable elements). ${WHO} cannot reach the rest of the page.`,
    evidence: {
      focusPath: pathAround(walk.stops, cycle.start),
      data: { cycle: cycle.members, ...input },
    },
  });
}

async function checkClickable(
  ctx: PageContext,
  walk: WalkResult,
  options: KeyboardOptions,
  out: Findings,
): Promise<void> {
  const candidates = await collectClickCandidates(ctx.page, options.maxClickCandidates).catch(
    (err) => {
      ctx.log.debug('click candidates failed', { error: String(err) });
      return [];
    },
  );
  const path = walk.stops.slice(0, 30).map((s) => toFocusStop(s));
  for (const c of candidates) {
    const tier = classifyClickCandidate(c);
    if (!tier) continue;
    const listener = tier === 'likely';
    await out.add({
      rule: clickNotFocusableRule,
      selector: c.selector,
      ...(c.name ? { name: c.name } : {}),
      tier,
      confidence: listener ? 0.8 : 0.4,
      message: listener
        ? `${c.name ? `"${c.name}"` : 'This element'} responds to mouse clicks but cannot be reached with Tab, and nothing focusable around it does the same thing. Keyboard-only, switch and voice control users cannot use it.`
        : `${c.name ? `"${c.name}"` : 'This element'} shows a pointer cursor like a control but cannot be reached with Tab.`,
      ...(listener
        ? {}
        : {
            question:
              'Does clicking this element do something that keyboard users cannot do another way?',
          }),
      evidence: {
        html: c.html,
        focusPath: path,
        data: {
          clickListener: c.hasListener,
          onclick: c.hasOnclick,
          pointerCursor: c.pointerCursor,
        },
      },
    });
  }
}

async function checkSkipLinks(ctx: PageContext, walk: WalkResult, out: Findings): Promise<void> {
  const { page } = ctx;
  let hasSkipLink = false;
  for (const stop of walk.stops.slice(0, 3)) {
    const info = await page.evaluate(linkInfo, stop.selector);
    if (!info || !isSkipLinkCandidate(info.name, info.href)) continue;
    hasSkipLink = true;
    const id = skipTargetId(info.href as string);
    const targetExists = await page.evaluate(skipTargetExists, id);
    let landedAfterTarget: boolean | undefined;
    if (targetExists && (await page.evaluate(hasFocusableAfter, id))) {
      await page.evaluate(refocus, stop.selector);
      await page.keyboard.press('Enter');
      await page.evaluate(nextFrames);
      await page.keyboard.press('Tab');
      landedAfterTarget = (await page.evaluate(landedAfter, id)) ?? undefined;
    }
    if (!detectSkipLinkBroken({ targetExists, landedAfterTarget })) continue;
    await out.add({
      rule: skipLinkBrokenRule,
      selector: stop.selector,
      role: stop.role,
      name: stop.name,
      confidence: 0.95,
      message: targetExists
        ? `After activating the skip link ${label(stop)}, the next Tab does not land in or after \`#${id}\`. ${WHO} still have to Tab through the repeated content.`
        : `The skip link ${label(stop)} points at \`#${id}\`, which does not exist on the page. ${WHO} still have to Tab through the repeated content.`,
      evidence: {
        focusPath: pathAround(walk.stops, stop.index),
        data: { href: info.href, targetExists, landedAfterTarget: landedAfterTarget ?? null },
      },
    });
  }

  if (hasSkipLink) return;
  const structure = await page.evaluate(pageStructure);
  const nav = await page.evaluate(
    leadingNavStops,
    walk.stops.slice(0, 40).map((s) => s.selector),
  );
  if (
    !detectSkipLinkMissing({ hasSkipLink, ...structure, leadingNavStops: nav.count }) ||
    !nav.container
  ) {
    return;
  }
  await out.add({
    rule: skipLinkMissingRule,
    selector: nav.container,
    confidence: 0.5,
    message: `${WHO} must press Tab ${nav.count} times to get past this navigation, and the page has no skip link, no main landmark and no headings to jump past it.`,
    question: 'Can keyboard users skip this repeated navigation block some other way?',
    evidence: {
      focusPath: walk.stops.slice(0, nav.count + 1).map((s) => toFocusStop(s)),
      data: { leadingNavStops: nav.count, ...structure },
    },
  });
}
