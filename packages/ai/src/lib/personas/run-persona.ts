import {
  ensureHelpers,
  getCdpSession,
  silentLogger,
  type CDPSession,
  type Logger,
  type Page,
} from '@clear-a11y/browser';
import type { FocusStop } from '@clear-a11y/core';
import { describeAction, validateAction } from './actions.js';
import { flattenAxTree, treeDigest, type RawAxNode } from './ax-tree.js';
import type { PersonaTask, StepHint } from './config.js';
import {
  checkSuccess,
  describeFocused,
  findVisibleByName,
  installMutationCounter,
  readMutations,
  screenText,
} from './page-scripts.js';
import { PlannerOutputError } from './planners/ai.js';
import type {
  BlockCause,
  FocusedInfo,
  Observation,
  PersonaAction,
  PersonaBlock,
  PersonaOutcome,
  PersonaPlanner,
  PersonaRun,
  SrNode,
  TraceStep,
} from './types.js';

export interface RunPersonaOptions {
  task: PersonaTask;
  planner: PersonaPlanner;
  /** Consecutive invalid planner answers before the run gives up. Default 3. */
  maxInvalid?: number;
  /** Pause after each action so the page can react. Default 50 ms. */
  settleMs?: number;
  log?: Logger;
}

const SCREEN_LINES = 120;
const MAX_FOCUS_PATH = 100;
const GROUP = 'clear-a11y-persona';

interface Snapshot {
  url: string;
  mutations: number;
  focus: string;
  digest: string;
}

/** Page I/O for one persona run. Everything the planner sees goes through `observe`. */
class PersonaPage {
  private cdp?: CDPSession;
  private lastNodes: SrNode[] = [];

  constructor(
    readonly page: Page,
    readonly constraint: PersonaTask['constraint'],
  ) {}

  async prepare(): Promise<void> {
    await ensureHelpers(this.page);
    await this.page.evaluate(installMutationCounter);
  }

  /** Runs `fn` against the page, retrying once a navigation has settled. */
  async safely<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.prepare();
        return await fn();
      } catch (err) {
        if (attempt >= 3) throw err;
        await this.page.waitForLoadState('load', { timeout: 5_000 }).catch(() => undefined);
      }
    }
  }

  private async session(): Promise<CDPSession> {
    if (!this.cdp) {
      this.cdp = await getCdpSession(this.page);
      await this.cdp.send('DOM.enable');
    }
    return this.cdp;
  }

  async srNodes(): Promise<SrNode[]> {
    const cdp = await this.session();
    await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    this.lastNodes = flattenAxTree(nodes as unknown as RawAxNode[]);
    return this.lastNodes;
  }

  node(ref: string): SrNode | undefined {
    return this.lastNodes.find((n) => n.ref === ref);
  }

  focused(): Promise<FocusedInfo | null> {
    return this.safely(() => this.page.evaluate(describeFocused));
  }

  async snapshot(): Promise<Snapshot> {
    return this.safely(async () => {
      const f = await this.page.evaluate(describeFocused);
      return {
        url: this.page.url(),
        mutations: await this.page.evaluate(readMutations),
        focus: f ? `${f.selector}|${f.state}` : '',
        digest: this.constraint === 'screen-reader' ? treeDigest(await this.srNodes()) : '',
      };
    });
  }

  async observe(changed: boolean): Promise<Observation> {
    return this.safely(async () => {
      if (this.constraint === 'keyboard-only') {
        return {
          constraint: 'keyboard-only' as const,
          url: this.page.url(),
          focused: await this.page.evaluate(describeFocused),
          screen: await this.page.evaluate(screenText, SCREEN_LINES),
          changed,
        };
      }
      const nodes = await this.srNodes();
      const focusedRef = nodes.find((n) => n.focused)?.ref;
      return {
        constraint: 'screen-reader' as const,
        url: this.page.url(),
        nodes,
        ...(focusedRef ? { focusedRef } : {}),
        changed,
      };
    });
  }

  /** Calls `fn` on the DOM node behind an accessibility-tree ref. */
  async callOnRef<T>(ref: string, fn: string): Promise<T | undefined> {
    const backendNodeId = this.node(ref)?.backendId;
    if (backendNodeId === undefined) return undefined;
    const cdp = await this.session();
    try {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId, objectGroup: GROUP });
      if (!object.objectId) return undefined;
      const { result } = await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: fn,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.value as T;
    } catch {
      return undefined;
    }
  }

  async selectorOfRef(ref: string): Promise<string | undefined> {
    await this.prepare().catch(() => undefined);
    const s = await this.callOnRef<string>(
      ref,
      'function () { return window.__clearA11y ? window.__clearA11y.selector(this) : ""; }',
    );
    return s || undefined;
  }

  async findVisible(hint: StepHint) {
    return this.safely(() =>
      this.page.evaluate(findVisibleByName, {
        ...(hint.name ? { name: hint.name } : {}),
        ...(hint.namePattern ? { namePattern: hint.namePattern } : {}),
      }),
    );
  }

  async succeeded(task: PersonaTask): Promise<boolean> {
    const s = task.success;
    if (s.urlIncludes && !this.page.url().includes(s.urlIncludes)) return false;
    if (!s.selector && !s.text) return true;
    return this.safely(() =>
      this.page.evaluate(checkSuccess, {
        ...(s.selector ? { selector: s.selector } : {}),
        ...(s.text ? { text: s.text } : {}),
      }),
    ).catch(() => false);
  }

  async settle(ms: number): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
    await this.page.waitForTimeout(ms).catch(() => undefined);
  }

  async close(): Promise<void> {
    if (!this.cdp) return;
    await this.cdp
      .send('Runtime.releaseObjectGroup', { objectGroup: GROUP })
      .catch(() => undefined);
    await this.cdp.detach().catch(() => undefined);
  }
}

const changedBetween = (a: Snapshot, b: Snapshot) =>
  a.url !== b.url ||
  b.mutations < 0 ||
  a.mutations !== b.mutations ||
  a.focus !== b.focus ||
  a.digest !== b.digest;

const toStop = (f: FocusedInfo, index: number): FocusStop => ({
  index,
  selector: f.selector,
  ...(f.name ? { name: f.name } : {}),
  ...(f.role ? { role: f.role } : {}),
  rect: {
    x: Math.round(f.rect.x),
    y: Math.round(f.rect.y),
    width: Math.round(f.rect.width),
    height: Math.round(f.rect.height),
  },
});

const brief = (f: FocusedInfo | null) =>
  f ? { selector: f.selector, role: f.role, name: f.name } : null;

/**
 * Runs one persona task on an already loaded page: observe, ask the planner, check the action is
 * allowed under the constraint, perform it with real key presses (or, for the screen reader,
 * the accessibility tree's default action), record the step, repeat. Stops on success, when the
 * planner gives up, after `maxSteps`, or after too many invalid answers.
 */
export async function runPersona(page: Page, options: RunPersonaOptions): Promise<PersonaRun> {
  const { task, planner } = options;
  const log = options.log ?? silentLogger;
  const settleMs = options.settleMs ?? 50;
  const maxInvalid = options.maxInvalid ?? 3;
  const p = new PersonaPage(page, task.constraint);
  const trace: TraceStep[] = [];
  const focusPath: FocusStop[] = [];
  let focusLost: { selector: string; name: string; step: number } | undefined;
  let lastActed: { selector?: string; role: string; name: string } | undefined;
  let invalid = 0;
  let changed = false;

  const record = (step: Omit<TraceStep, 'n'>) => trace.push({ n: trace.length + 1, ...step });
  const hintAt = (): StepHint | undefined =>
    planner.hintIndex ? task.steps[planner.hintIndex()] : undefined;

  const blocked = async (
    cause: BlockCause,
    reason: string,
    ref?: string,
  ): Promise<PersonaOutcome> => {
    const block = await resolveBlock(p, task, cause, reason, ref, hintAt(), lastActed);
    if (planner.hintIndex) block.hint = planner.hintIndex();
    // A focus loss earlier in the run is the better explanation for an unexplained failure.
    if (focusLost && (cause === 'budget' || cause === 'success-not-met')) {
      return {
        status: 'blocked',
        steps: trace.length,
        block: {
          cause: 'focus-lost',
          reason: `After step ${focusLost.step}, focus fell back to the start of the page instead of staying on or near "${focusLost.name}", and the task was never completed (${reason})`,
          selector: focusLost.selector,
          name: focusLost.name,
          measured: false,
        },
      };
    }
    return { status: 'blocked', steps: trace.length, block };
  };

  let outcome: PersonaOutcome | undefined;
  try {
    await p.safely(async () => undefined);
    while (!outcome) {
      if (await p.succeeded(task)) {
        outcome = { status: 'success', steps: trace.length };
        break;
      }
      if (trace.length >= task.maxSteps) {
        outcome = await blocked(
          'budget',
          `The step budget (${task.maxSteps}) ran out before the task was done.`,
        );
        break;
      }
      const obs = await p.observe(changed);
      let action: PersonaAction;
      try {
        action = await planner.next(obs, trace);
      } catch (err) {
        if (!(err instanceof PlannerOutputError)) throw err;
        invalid++;
        record({ action: 'invalid planner output', result: `rejected: ${err.message}` });
        if (invalid >= maxInvalid) {
          outcome = await blocked(
            'invalid-output',
            `The planner gave ${invalid} invalid answers in a row (${err.message}).`,
          );
        }
        changed = false;
        continue;
      }
      const problem = validateAction(action, task.constraint);
      if (problem) {
        invalid++;
        record({ action: describeAction(action), result: `rejected: ${problem}` });
        if (invalid >= maxInvalid) {
          outcome = await blocked(
            'invalid-output',
            `The planner chose ${invalid} disallowed actions in a row (${problem}).`,
          );
        }
        changed = false;
        continue;
      }
      invalid = 0;

      if (action.type === 'give_up') {
        record({ action: describeAction(action), result: 'stuck', reason: action.reason });
        outcome = await blocked(action.cause, action.reason, action.ref);
        break;
      }
      if (action.type === 'done') {
        await p.settle(settleMs);
        const ok = await p.succeeded(task);
        record({
          action: 'done',
          result: ok ? 'success condition met' : 'success condition not met',
          ...(action.reason ? { reason: action.reason } : {}),
        });
        outcome = ok
          ? { status: 'success', steps: trace.length }
          : await blocked(
              planner.kind === 'ai' ? 'planner-gave-up' : 'success-not-met',
              'Every step of the task was carried out, but the success condition never became true.',
            );
        break;
      }

      const before = await p.snapshot();
      const focusBefore = task.constraint === 'keyboard-only' ? await p.focused() : null;
      let acted: TraceStep['focused'];
      if (action.type === 'press') {
        await page.keyboard.press(action.key);
      } else if (action.type === 'type') {
        if (action.ref) {
          const node = p.node(action.ref);
          acted = node ? { role: node.role, name: node.name } : undefined;
          await p.callOnRef(action.ref, 'function () { this.focus(); }');
        }
        await page.keyboard.type(action.text);
      } else {
        const node = p.node(action.ref);
        acted = node ? { role: node.role, name: node.name } : { role: '?', name: action.ref };
        await p.callOnRef(
          action.ref,
          action.type === 'activate'
            ? 'function () { if (typeof this.focus === "function") this.focus(); this.click(); }'
            : 'function () { if (typeof this.focus === "function") this.focus(); }',
        );
      }
      if (acted && 'ref' in action && action.ref) {
        const selector = await p.selectorOfRef(action.ref);
        if (selector) acted = { ...acted, selector };
      }
      await p.settle(settleMs);
      const after = await p.snapshot();
      changed = changedBetween(before, after);

      let result = changed ? (before.url !== after.url ? 'url changed' : 'changed') : 'no change';
      let focused: TraceStep['focused'] = acted;
      if (task.constraint === 'keyboard-only') {
        const f = await p.focused();
        focused = brief(f);
        if (f && f.selector !== focusPath.at(-1)?.selector && focusPath.length < MAX_FOCUS_PATH) {
          focusPath.push(toStop(f, focusPath.length));
        }
        const activation =
          action.type === 'press' && (action.key === 'Enter' || action.key === 'Space');
        if (activation && focusBefore && !f && changed && before.url === after.url) {
          result = 'focus lost';
          focusLost ??= {
            selector: focusBefore.selector,
            name: focusBefore.name,
            step: trace.length + 1,
          };
        }
        if (activation && focusBefore) {
          lastActed = {
            selector: focusBefore.selector,
            role: focusBefore.role,
            name: focusBefore.name,
          };
        }
      } else if (acted) {
        lastActed = acted;
      }
      record({
        action: describeAction(action),
        focused: focused ?? null,
        result,
        ...(action.reason ? { reason: action.reason } : {}),
      });
    }
  } finally {
    await p.close();
  }
  log.debug('persona run finished', { task: task.id, status: outcome.status, steps: trace.length });
  return {
    taskId: task.id,
    constraint: task.constraint,
    planner: planner.kind,
    outcome,
    trace,
    focusPath,
  };
}

/**
 * Points the block at an element. The planner only says why it is stuck; this sighted
 * cross-check finds the blocking element for the report: the visible control matching the hint
 * (unreachable, not exposed), the node behind a tree ref (unnamed), or the focused element.
 */
async function resolveBlock(
  p: PersonaPage,
  task: PersonaTask,
  cause: BlockCause,
  reason: string,
  ref: string | undefined,
  hint: StepHint | undefined,
  lastActed: { selector?: string; role: string; name: string } | undefined,
): Promise<PersonaBlock> {
  const fromRef = async () => {
    if (!ref) return undefined;
    if (task.constraint === 'keyboard-only') return { selector: ref } as const;
    const node = p.node(ref);
    const selector = await p.selectorOfRef(ref);
    return selector
      ? { selector, ...(node ? { role: node.role, name: node.name } : {}) }
      : undefined;
  };
  switch (cause) {
    case 'unreachable':
    case 'not-exposed':
    case 'target-not-found': {
      const seen = hint ? await p.findVisible(hint).catch(() => null) : null;
      if (seen) {
        return {
          cause: cause === 'target-not-found' ? 'unreachable' : cause,
          reason: `${reason} It is visible on screen as ${seen.tag} "${seen.name}".`,
          selector: seen.selector,
          role: seen.role,
          name: seen.name,
          measured: true,
        };
      }
      return { cause: 'target-not-found', reason, measured: false };
    }
    case 'unnamed':
    case 'trap': {
      const el = await fromRef();
      return { cause, reason, ...el, measured: Boolean(el) };
    }
    case 'not-operable': {
      const el = await fromRef();
      return { cause, reason, ...el, measured: task.constraint === 'keyboard-only' && Boolean(el) };
    }
    default: {
      const el = (await fromRef()) ?? (lastActed?.selector ? lastActed : undefined);
      return { cause, reason, ...el, measured: false };
    }
  }
}
