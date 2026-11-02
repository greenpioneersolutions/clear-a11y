import { StepHintSchema, type StepHintInput } from './config.js';
import {
  createKeyboardPlanner,
  createScreenReaderPlanner,
  findSrTarget,
} from './planners/deterministic.js';
import { createScriptedPlanner } from './planners/scripted.js';
import type { FocusedInfo, KeyboardObservation, SrNode, SrObservation } from './types.js';

const hints = (...h: StepHintInput[]) => h.map((x) => StepHintSchema.parse(x));

const el = (selector: string, name: string, role = 'button', state = ''): FocusedInfo => ({
  selector,
  name,
  role,
  tag: role === 'link' ? 'a' : 'button',
  state,
  visible: true,
  rect: { x: 0, y: 0, width: 10, height: 10 },
});

const kb = (focused: FocusedInfo | null, changed = false): KeyboardObservation => ({
  constraint: 'keyboard-only',
  url: 'http://x/',
  focused,
  screen: [],
  changed,
});

const node = (ref: string, role: string, name: string, extra: Partial<SrNode> = {}): SrNode => ({
  ref,
  backendId: Number(ref.slice(1)),
  role,
  name,
  depth: 1,
  focusable: !['text', 'heading', 'document'].includes(role),
  focused: false,
  states: [],
  ...extra,
});

const sr = (nodes: SrNode[], changed = false): SrObservation => ({
  constraint: 'screen-reader',
  url: 'http://x/',
  nodes,
  changed,
});

describe('deterministic keyboard planner', () => {
  it('Tabs to the target, activates it with Enter and finishes', async () => {
    const p = createKeyboardPlanner(hints({ name: 'Pay now' }));
    expect(await p.next(kb(null), [])).toMatchObject({ type: 'press', key: 'Tab' });
    expect(await p.next(kb(el('a', 'Back', 'link')), [])).toMatchObject({ key: 'Tab' });
    expect(await p.next(kb(el('#pay', 'Pay now')), [])).toMatchObject({ key: 'Enter' });
    expect(await p.next(kb(el('#pay', 'Pay now'), true), [])).toMatchObject({ type: 'done' });
  });

  it('toggles checkboxes with Space and types into fields', async () => {
    const p = createKeyboardPlanner(
      hints({ name: 'terms' }, { name: 'Email', action: 'type', text: 'a@example.test' }),
    );
    expect(await p.next(kb(el('#t', 'I accept the terms', 'checkbox')), [])).toMatchObject({
      key: 'Space',
    });
    expect(await p.next(kb(el('#t', 'I accept the terms', 'checkbox'), true), [])).toMatchObject({
      key: 'Tab',
    });
    expect(await p.next(kb(el('#e', 'Email', 'textbox')), [])).toMatchObject({
      type: 'type',
      text: 'a@example.test',
    });
    expect(await p.next(kb(el('#e', 'Email', 'textbox'), true), [])).toMatchObject({
      type: 'done',
    });
  });

  it('falls back from Enter to Space, then reports a control that does nothing', async () => {
    const p = createKeyboardPlanner(hints({ name: 'Add to basket' }));
    const add = el('#add', 'Add to basket', 'button');
    expect(await p.next(kb(add), [])).toMatchObject({ key: 'Enter' });
    expect(await p.next(kb(add, false), [])).toMatchObject({ key: 'Space' });
    expect(await p.next(kb(add, false), [])).toMatchObject({
      type: 'give_up',
      cause: 'not-operable',
      ref: '#add',
    });
    expect(p.hintIndex?.()).toBe(0);
  });

  it('gives up as unreachable after Tab went all the way around the page', async () => {
    const p = createKeyboardPlanner(hints({ name: 'Pay now' }));
    const a = el('#a', 'Back', 'link');
    const t = el('#t', 'Terms', 'checkbox');
    for (const f of [null, a, t, null]) {
      expect(await p.next(kb(f), [])).toMatchObject({ key: 'Tab' });
    }
    expect(await p.next(kb(a), [])).toMatchObject({ type: 'give_up', cause: 'unreachable' });
  });

  it('gives up when Tab never focuses anything', async () => {
    const p = createKeyboardPlanner(hints({ name: 'Pay now' }));
    expect(await p.next(kb(null), [])).toMatchObject({ key: 'Tab' });
    expect(await p.next(kb(null), [])).toMatchObject({ type: 'give_up', cause: 'unreachable' });
  });

  it('tries Escape when focus circles without leaving, then reports a trap', async () => {
    const p = createKeyboardPlanner(hints({ name: 'Continue' }));
    const a = el('#a', 'One');
    const b = el('#b', 'Two');
    expect(await p.next(kb(a), [])).toMatchObject({ key: 'Tab' });
    expect(await p.next(kb(b), [])).toMatchObject({ key: 'Tab' });
    expect(await p.next(kb(a), [])).toMatchObject({ key: 'Escape' });
    expect(await p.next(kb(a), [])).toMatchObject({ key: 'Tab' });
    expect(await p.next(kb(b), [])).toMatchObject({ key: 'Tab' });
    expect(await p.next(kb(a), [])).toMatchObject({ type: 'give_up', cause: 'trap', ref: '#a' });
  });

  it('only reads keyboard observations', async () => {
    await expect(createKeyboardPlanner(hints({ name: 'x' })).next(sr([]), [])).rejects.toThrow();
  });
});

describe('deterministic screen-reader planner', () => {
  const tree = [
    node('n1', 'document', 'Newsletter'),
    node('n2', 'heading', 'Stay in the loop'),
    node('n3', 'textbox', 'Email address'),
    node('n4', 'button', 'Sign up'),
  ];

  it('finds controls by role and name, types and activates', async () => {
    const p = createScreenReaderPlanner(
      hints(
        { role: 'textbox', name: 'Email', action: 'type', text: 'r@example.test' },
        { role: 'button', name: 'Sign up' },
      ),
    );
    expect(await p.next(sr(tree), [])).toMatchObject({
      type: 'type',
      ref: 'n3',
      text: 'r@example.test',
    });
    expect(await p.next(sr(tree, true), [])).toMatchObject({ type: 'activate', ref: 'n4' });
    expect(await p.next(sr(tree, true), [])).toMatchObject({ type: 'done' });
  });

  it('reports unnamed controls of the right role', async () => {
    const p = createScreenReaderPlanner(hints({ role: 'button', name: 'Sign up' }));
    const unnamed = [tree[0]!, node('n9', 'button', '')];
    expect(await p.next(sr(unnamed), [])).toMatchObject({
      type: 'give_up',
      cause: 'unnamed',
      ref: 'n9',
    });
  });

  it('reports a target missing from the tree, and one that does nothing', async () => {
    const missing = createScreenReaderPlanner(hints({ role: 'button', name: 'Claim offer' }));
    expect(await missing.next(sr(tree), [])).toMatchObject({
      type: 'give_up',
      cause: 'not-exposed',
    });
    const inert = createScreenReaderPlanner(hints({ role: 'button', name: 'Sign up' }));
    expect(await inert.next(sr(tree), [])).toMatchObject({ type: 'activate' });
    expect(await inert.next(sr(tree, false), [])).toMatchObject({
      type: 'give_up',
      cause: 'not-operable',
      ref: 'n4',
    });
  });

  it('ignores text and headings when a hint has no role', () => {
    const [hint] = hints({ name: 'Stay in the loop' });
    expect(findSrTarget(tree, hint!)).toBeUndefined();
    const [button] = hints({ name: 'sign' });
    expect(findSrTarget(tree, button!)?.ref).toBe('n4');
  });
});

describe('scripted planner', () => {
  it('replays its actions, then says done', async () => {
    const p = createScriptedPlanner([{ type: 'press', key: 'Tab' }]);
    expect(await p.next(kb(null), [])).toEqual({ type: 'press', key: 'Tab' });
    expect(await p.next(kb(null), [])).toMatchObject({ type: 'done' });
  });
});
