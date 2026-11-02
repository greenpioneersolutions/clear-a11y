/**
 * The screen-reader persona's view of the page: the browser accessibility tree (CDP
 * `Accessibility.getFullAXTree`) flattened into an outline of nodes addressed by `ref`.
 * A small, pure copy of what engine-at does (engines never import each other).
 */
import type { SrNode } from './types.js';

/** The subset of a CDP `Accessibility.AXNode` we read. */
export interface RawAxValue {
  type?: string;
  value?: unknown;
}

export interface RawAxNode {
  nodeId: string;
  ignored: boolean;
  role?: RawAxValue;
  name?: RawAxValue;
  value?: RawAxValue;
  properties?: Array<{ name: string; value: RawAxValue }>;
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

const str = (v: RawAxValue | undefined): string =>
  v?.value === undefined || v.value === null ? '' : String(v.value);

/** Roles that only structure the tree; their children are kept, they are not. */
const SKIPPED_ROLES = new Set(['none', 'generic', 'InlineTextBox', 'LineBreak', 'presentation']);
const ROLE_ALIASES: Record<string, string> = { RootWebArea: 'document', StaticText: 'text' };
/** Fields whose inner text nodes are their value: shown as `value="…"`, children not listed. */
const FIELD_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

const SHOWN_STATES = [
  'expanded',
  'checked',
  'selected',
  'pressed',
  'invalid',
  'required',
  'disabled',
] as const;

function statesOf(raw: RawAxNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of raw.properties ?? []) out[p.name] = p.value?.value;
  return out;
}

/**
 * Flattens the raw tree in document order (depth-first from the root). Ignored and purely
 * structural nodes are dropped but their children kept. Text nodes that repeat their parent's
 * name are dropped (a screen reader reads the button "Pay", not "Pay" twice), and text fields
 * show their value instead of their inner text nodes, so typing doesn't renumber later refs.
 */
export function flattenAxTree(raw: readonly RawAxNode[]): SrNode[] {
  const byId = new Map(raw.map((n) => [n.nodeId, n]));
  const root = raw.find((n) => n.parentId === undefined || !byId.has(n.parentId));
  const out: SrNode[] = [];
  const visit = (node: RawAxNode, depth: number, parentName: string) => {
    const rawRole = str(node.role);
    const role = ROLE_ALIASES[rawRole] ?? rawRole;
    const name = str(node.name).replace(/\s+/g, ' ').trim();
    const keep =
      !node.ignored &&
      node.backendDOMNodeId !== undefined &&
      !SKIPPED_ROLES.has(rawRole) &&
      !(role === 'text' && (!name || name === parentName));
    let nextDepth = depth;
    let nextParentName = parentName;
    if (keep) {
      const props = statesOf(node);
      const states = SHOWN_STATES.flatMap((k) => {
        const v = props[k];
        if (v === undefined || v === false || v === 'false') return [];
        return v === true ? [k] : [`${k}=${String(v)}`];
      });
      if (props['expanded'] === false) states.unshift('expanded=false');
      const value = str(node.value).replace(/\s+/g, ' ').trim();
      if (FIELD_ROLES.has(role) && value) states.push(`value="${value.slice(0, 80)}"`);
      out.push({
        ref: `n${out.length + 1}`,
        backendId: node.backendDOMNodeId!,
        role,
        name,
        depth,
        focusable: props['focusable'] === true,
        focused: props['focused'] === true,
        states,
      });
      nextDepth = depth + 1;
      nextParentName = name;
      if (FIELD_ROLES.has(role)) return;
    }
    for (const id of node.childIds ?? []) {
      const child = byId.get(id);
      if (child) visit(child, nextDepth, nextParentName);
    }
  };
  if (root) visit(root, 0, '');
  // The document reports focus whenever the page has it; only the deepest focused node counts.
  const focused = out.filter((n) => n.focused);
  for (const n of focused.slice(0, -1)) n.focused = false;
  return out;
}

/** A short, stable digest of the tree: changes when nodes, names or states change. */
export function treeDigest(nodes: readonly SrNode[]): string {
  return nodes.map((n) => `${n.role}|${n.name}|${n.states.join(',')}`).join('\n');
}
