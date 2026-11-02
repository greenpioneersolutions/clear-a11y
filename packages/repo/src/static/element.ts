/**
 * Element descriptions from parsed source (JSX, Vue templates, Angular templates). Works on plain
 * AST objects so it can be unit-tested without ESLint.
 */

/** A literal attribute value, `true` for a bare attribute, or "{…}" for a computed value. */
export type AttributeValue = string | true;

export interface ElementInfo {
  /** Tag as written: "img", "Button", "Foo.Bar". */
  tag: string;
  attributes: Record<string, AttributeValue>;
  /** `{...props}` in JSX or `v-bind="obj"` in Vue: attributes we cannot see statically. */
  hasSpread: boolean;
  /** A native HTML element (lowercase, no hyphen), not a component. */
  isDomElement: boolean;
  /** Template syntax, used to write computed attributes the way the source does. */
  syntax?: 'jsx' | 'vue' | 'angular';
}

export const COMPUTED = '{…}';

// Loose AST node shape: ESTree/JSX, vue-eslint-parser and angular template nodes all fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party ASTs have no shared type
export type AstNode = Record<string, any> & { type?: string; parent?: AstNode | null };

const isDomTag = (tag: string) => /^[a-z][a-z0-9]*$/.test(tag);

function jsxName(name: AstNode | undefined): string {
  if (!name) return '';
  switch (name.type) {
    case 'JSXIdentifier':
      return String(name.name);
    case 'JSXNamespacedName':
      return `${jsxName(name.namespace)}:${jsxName(name.name)}`;
    case 'JSXMemberExpression':
      return `${jsxName(name.object)}.${jsxName(name.property)}`;
    default:
      return '';
  }
}

function jsxValue(value: AstNode | null | undefined): AttributeValue {
  if (!value) return true;
  if (value.type === 'Literal') return String(value.value);
  if (value.type === 'JSXExpressionContainer') {
    const e = value.expression as AstNode;
    if (e.type === 'Literal' && e.value !== null && typeof e.value !== 'object')
      return String(e.value);
    if (e.type === 'TemplateLiteral' && e.expressions.length === 0)
      return String(e.quasis[0]?.value?.cooked ?? '');
  }
  return COMPUTED;
}

/** Info for a JSXOpeningElement node. */
export function fromJsxOpeningElement(node: AstNode): ElementInfo {
  const tag = jsxName(node.name);
  const attributes: Record<string, AttributeValue> = {};
  let hasSpread = false;
  for (const attr of (node.attributes ?? []) as AstNode[]) {
    if (attr.type === 'JSXSpreadAttribute') hasSpread = true;
    else if (attr.type === 'JSXAttribute') attributes[jsxName(attr.name)] = jsxValue(attr.value);
  }
  return { tag, attributes, hasSpread, isDomElement: isDomTag(tag), syntax: 'jsx' };
}

/** Info for a vue-eslint-parser VElement node. */
export function fromVueElement(node: AstNode): ElementInfo {
  const tag = String(node.rawName ?? node.name ?? '');
  const attributes: Record<string, AttributeValue> = {};
  let hasSpread = false;
  for (const attr of (node.startTag?.attributes ?? []) as AstNode[]) {
    if (!attr.directive) {
      attributes[String(attr.key?.rawName ?? attr.key?.name ?? '')] = attr.value
        ? String(attr.value.value)
        : true;
      continue;
    }
    const directive = String(attr.key?.name?.name ?? '');
    const arg = attr.key?.argument;
    const argName = arg && arg.type === 'VIdentifier' ? String(arg.rawName ?? arg.name) : '';
    if (directive === 'bind' && !argName) hasSpread = true;
    else if (directive === 'bind') attributes[argName] = COMPUTED;
    else if (directive === 'on') attributes[`@${argName}`] = true;
    else attributes[`v-${directive}${argName ? `:${argName}` : ''}`] = true;
  }
  return { tag, attributes, hasSpread, isDomElement: isDomTag(tag), syntax: 'vue' };
}

/** Info for an @angular-eslint/template-parser element node (Element / Element$1). */
export function fromAngularElement(node: AstNode): ElementInfo {
  const tag = String(node.name ?? '');
  const attributes: Record<string, AttributeValue> = {};
  for (const a of (node.attributes ?? []) as AstNode[])
    attributes[String(a.name)] = String(a.value);
  for (const a of (node.inputs ?? []) as AstNode[]) attributes[String(a.name)] = COMPUTED;
  for (const o of (node.outputs ?? []) as AstNode[]) attributes[`(${String(o.name)})`] = true;
  return { tag, attributes, hasSpread: false, isDomElement: isDomTag(tag), syntax: 'angular' };
}

const KEY_ATTRIBUTES = [
  'id',
  'data-testid',
  'className',
  'class',
  'src',
  'href',
  'role',
  'type',
  'name',
  'htmlFor',
  'for',
  'aria-label',
];

const truncate = (s: string, max = 40) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * Short element description used as the finding selector, e.g. `<img src="/shoe.png">` or
 * `<div className="card" onClick>`. Key attributes first, then the first event handler and the
 * attributes the lint rule talks about.
 */
export function describeElement(el: ElementInfo, extra: readonly string[] = []): string {
  const parts: string[] = [el.tag];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (seen.has(name) || !(name in el.attributes)) return;
    seen.add(name);
    const v = el.attributes[name];
    if (v === true) parts.push(name);
    else if (v !== COMPUTED) parts.push(`${name}="${truncate(v)}"`);
    else if (el.syntax === 'vue') parts.push(`:${name}`);
    else if (el.syntax === 'angular') parts.push(`[${name}]`);
    else parts.push(`${name}={…}`);
  };
  for (const name of KEY_ATTRIBUTES) add(name);
  for (const name of extra) add(name);
  const handler = Object.keys(el.attributes).find((n) => /^(on[A-Z]|@|\()/.test(n));
  if (handler) add(handler);
  if (el.hasSpread) parts.push(el.syntax === 'vue' ? 'v-bind' : '{...}');
  return `<${parts.join(' ')}>`;
}

/** Attribute names a lint message mentions (e.g. "tabIndex", "autoFocus"), present on the element. */
export function mentionedAttributes(el: ElementInfo, lintMessage: string): string[] {
  const lower = lintMessage.toLowerCase();
  return Object.keys(el.attributes).filter((n) => n.length > 2 && lower.includes(n.toLowerCase()));
}

/** Nearest enclosing component name for a JSX node: PascalCase function, variable or class. */
export function enclosingComponent(node: AstNode | null | undefined): string | undefined {
  let fallback: string | undefined;
  for (let n = node; n; n = n.parent) {
    let name: string | undefined;
    if (
      (n.type === 'FunctionDeclaration' ||
        n.type === 'ClassDeclaration' ||
        n.type === 'FunctionExpression' ||
        n.type === 'ClassExpression') &&
      n.id?.type === 'Identifier'
    )
      name = String(n.id.name);
    else if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier')
      name = String(n.id.name);
    if (!name) continue;
    if (/^[A-Z]/.test(name)) return name;
    fallback ??= name;
  }
  return fallback;
}
