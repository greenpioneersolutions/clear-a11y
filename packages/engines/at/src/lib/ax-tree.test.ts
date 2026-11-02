import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axLine, axSnippet, mapAxTree, nameSourceOf, type RawAxNode } from './ax-tree.js';

// Recorded from Chromium's Accessibility.getFullAXTree (see the "//" note in the file).
const recorded = JSON.parse(
  readFileSync(join(import.meta.dirname, '../__fixtures__/ax-tree.json'), 'utf-8'),
) as { nodes: RawAxNode[] };

const model = mapAxTree(recorded.nodes);
const byName = (role: string, name: string) =>
  [...model.nodes.values()].find((n) => n.role === role && n.name === name)!;

describe('mapAxTree', () => {
  it('maps the recorded CDP tree to a compact model indexed by backend node id', () => {
    expect(model.root?.role).toBe('RootWebArea');
    const email = byName('textbox', 'Email address');
    expect(email.backendNodeId).toBeTypeOf('number');
    expect(model.byBackendId.get(email.backendNodeId!)).toBe(email);
    expect(email.states).toMatchObject({ focusable: true, invalid: 'false' });
  });

  it('records where each name came from', () => {
    expect(byName('textbox', 'Email address').nameSource).toBe('placeholder');
    expect(byName('textbox', 'Name').nameSource).toBe('label');
    expect(byName('textbox', 'Phone').nameSource).toBe('title');
    expect(byName('button', 'Find products').nameSource).toBe('aria-label');
    expect(byName('checkbox', 'Agree').nameSource).toBe('contents');
  });

  it('exposes computed states (Chromium reports checked=false even without aria-checked)', () => {
    expect(byName('checkbox', 'Agree').states['checked']).toBe('false');
    expect(byName('tab', 'A').states['selected']).toBe(false);
  });

  it('writes a short snippet of the node and its parent', () => {
    const email = byName('textbox', 'Email address');
    expect(axSnippet(model, email, ['name from placeholder'])).toBe(
      'main ""\n  textbox "Email address" (focusable, name from placeholder)',
    );
  });
});

describe('nameSourceOf', () => {
  it('returns none for empty names and labelledby for related elements', () => {
    expect(nameSourceOf({ name: { value: '' } })).toBe('none');
    expect(
      nameSourceOf({
        name: {
          value: 'Query',
          sources: [
            { type: 'relatedElement', attribute: 'aria-labelledby', value: { value: 'Query' } },
          ],
        },
      }),
    ).toBe('aria-labelledby');
  });
});

describe('axLine', () => {
  it('lists true and valued states', () => {
    expect(
      axLine({
        id: '1',
        role: 'button',
        name: '',
        nameSource: 'none',
        description: '',
        states: { focusable: true, expanded: 'false', pressed: 'true' },
        ignored: false,
        children: [],
      }),
    ).toBe('button "" (focusable, pressed=true)');
  });
});
