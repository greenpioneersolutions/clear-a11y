/**
 * Compact, pure model of the browser accessibility tree (CDP `Accessibility.getFullAXTree`).
 * No browser I/O here: the engine fetches the raw nodes, these functions shape and explain them.
 */

/** The subset of a CDP `Accessibility.AXNode` we read. */
export interface RawAxValue {
  type?: string;
  value?: unknown;
}

export interface RawAxNameSource {
  type: string;
  attribute?: string;
  nativeSource?: string;
  value?: RawAxValue;
  attributeValue?: RawAxValue;
  superseded?: boolean;
  invalid?: boolean;
}

export interface RawAxNode {
  nodeId: string;
  ignored: boolean;
  role?: RawAxValue;
  name?: RawAxValue & { sources?: RawAxNameSource[] };
  description?: RawAxValue;
  value?: RawAxValue;
  properties?: Array<{ name: string; value: RawAxValue }>;
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

/**
 * Where the accessible name came from: `contents`, `placeholder`, `aria-label`,
 * `aria-labelledby`, `label` (a `<label>` element), `title`, `alt`, another attribute name,
 * or `none` when the name is empty.
 */
export type NameSource = string;

export interface AxNode {
  id: string;
  role: string;
  name: string;
  nameSource: NameSource;
  description: string;
  /** AX properties such as focusable, expanded, checked, selected, invalid. */
  states: Record<string, string | number | boolean>;
  ignored: boolean;
  backendNodeId?: number;
  parentId?: string;
  children: string[];
}

export interface AxModel {
  nodes: Map<string, AxNode>;
  byBackendId: Map<number, AxNode>;
  root?: AxNode;
}

const str = (v: RawAxValue | undefined): string =>
  v?.value === undefined || v.value === null ? '' : String(v.value);

/** Picks the name source the browser actually used (the first non-superseded source with a value). */
export function nameSourceOf(raw: Pick<RawAxNode, 'name'>): NameSource {
  if (!str(raw.name).trim()) return 'none';
  const used = raw.name?.sources?.find(
    (s) => !s.superseded && !s.invalid && s.value !== undefined && str(s.value).trim() !== '',
  );
  if (!used) return 'contents';
  if (used.type === 'placeholder') return 'placeholder';
  if (used.type === 'relatedElement') {
    if (used.attribute === 'aria-labelledby') return 'aria-labelledby';
    if (used.nativeSource === 'labelfor' || used.nativeSource === 'labelwrapped') return 'label';
    return used.nativeSource ?? 'related';
  }
  if (used.type === 'attribute') {
    if (used.attribute === 'placeholder' || used.attribute === 'aria-placeholder')
      return 'placeholder';
    return used.attribute ?? 'attribute';
  }
  return used.type;
}

function statesOf(raw: RawAxNode): AxNode['states'] {
  const out: AxNode['states'] = {};
  for (const p of raw.properties ?? []) {
    const v = p.value?.value;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[p.name] = v;
  }
  return out;
}

/** Maps raw CDP nodes to the compact model, indexed by AX id and DOM backend node id. */
export function mapAxTree(raw: readonly RawAxNode[]): AxModel {
  const nodes = new Map<string, AxNode>();
  const byBackendId = new Map<number, AxNode>();
  for (const r of raw) {
    const node: AxNode = {
      id: r.nodeId,
      role: str(r.role) || 'none',
      name: str(r.name).replace(/\s+/g, ' ').trim(),
      nameSource: nameSourceOf(r),
      description: str(r.description).replace(/\s+/g, ' ').trim(),
      states: statesOf(r),
      ignored: r.ignored,
      ...(r.backendDOMNodeId !== undefined ? { backendNodeId: r.backendDOMNodeId } : {}),
      ...(r.parentId !== undefined ? { parentId: r.parentId } : {}),
      children: [...(r.childIds ?? [])],
    };
    nodes.set(node.id, node);
    // Several AX nodes can share a DOM node (e.g. a textbox and its inner editor); keep the first.
    if (node.backendNodeId !== undefined && !byBackendId.has(node.backendNodeId)) {
      byBackendId.set(node.backendNodeId, node);
    }
  }
  const root = raw.find((r) => r.parentId === undefined);
  return { nodes, byBackendId, ...(root ? { root: nodes.get(root.nodeId)! } : {}) };
}

/** Nearest non-ignored ancestor. */
export function parentOf(model: AxModel, node: AxNode): AxNode | undefined {
  let id = node.parentId;
  while (id) {
    const p = model.nodes.get(id);
    if (!p) return undefined;
    if (!p.ignored) return p;
    id = p.parentId;
  }
  return undefined;
}

const SHOWN_STATES = [
  'focusable',
  'expanded',
  'checked',
  'selected',
  'pressed',
  'invalid',
  'required',
  'disabled',
];

/** One line like `button "Search" (focusable, expanded=false)`, as a screen reader would see it. */
export function axLine(node: AxNode, extra: string[] = []): string {
  const states = SHOWN_STATES.flatMap((k) => {
    const v = node.states[k];
    if (v === undefined || v === false || v === 'false' || (k === 'focusable' && v !== true))
      return [];
    return v === true ? [k] : [`${k}=${String(v)}`];
  });
  const notes = [...states, ...extra];
  return `${node.role} "${node.name}"${notes.length ? ` (${notes.join(', ')})` : ''}`;
}

/** Short indented snippet of a node and its parent, for `evidence.axTree`. */
export function axSnippet(model: AxModel, node: AxNode, extra: string[] = []): string {
  const parent = parentOf(model, node);
  const self = axLine(node, extra);
  return parent ? `${axLine(parent)}\n  ${self}` : self;
}
