import { ensureHelpers, type PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { detectLabelInName, labelInNameRule } from '../rules/label-in-name.js';
import {
  detectPlaceholderOnlyLabel,
  placeholderOnlyLabelRule,
} from '../rules/placeholder-only-label.js';
import { detectRoleMissing, roleMissingRule } from '../rules/role-missing.js';
import { detectStateMissing, stateMissingRule, type Attributes } from '../rules/state-missing.js';
import { axSnippet, mapAxTree, type AxModel, type AxNode } from './ax-tree.js';
import type { Cdp } from './cdp.js';
import { atFinding, quote } from './findings.js';

/** Max candidates per check, so huge pages stay fast. */
const MAX_PER_CHECK = 50;

function selectorOf(cdp: Cdp, objectId: string): Promise<string | undefined> {
  return cdp.call(objectId, function (this: Element) {
    return window.__clearA11y ? window.__clearA11y.selector(this) : '';
  });
}

/** The text a sighted user reads as the control's label: its <label>s for fields, else its rendered text. */
function visibleLabelOf(cdp: Cdp, objectId: string): Promise<string | undefined> {
  return cdp.call(objectId, function (this: Element) {
    const el = this as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null };
    if (el.labels && el.labels.length > 0) {
      return Array.from(el.labels)
        .map((l) => l.innerText)
        .join(' ');
    }
    if (el.matches('input, textarea, select')) return '';
    return el.innerText ?? '';
  });
}

async function nodesWithSelector(
  cdp: Cdp,
  model: AxModel,
  pick: (n: AxNode) => boolean,
): Promise<Array<{ node: AxNode; objectId: string; selector: string }>> {
  const out: Array<{ node: AxNode; objectId: string; selector: string }> = [];
  for (const node of model.nodes.values()) {
    if (out.length >= MAX_PER_CHECK) break;
    if (node.ignored || node.backendNodeId === undefined || !pick(node)) continue;
    const objectId = await cdp.resolve(node.backendNodeId);
    if (!objectId) continue;
    const selector = await selectorOf(cdp, objectId);
    if (selector) out.push({ node, objectId, selector });
  }
  return out;
}

/**
 * Checks that read the accessibility tree of the page as it is (any state): placeholder-only
 * labels, label-in-name, missing tab state, focusable elements without a role.
 */
export async function runTreeChecks(ctx: PageContext, cdp: Cdp): Promise<Finding[]> {
  await ensureHelpers(ctx.page);
  const model = mapAxTree(await cdp.fullAxTree());
  const findings: Finding[] = [];

  // at/placeholder-only-label
  for (const { node, selector } of await nodesWithSelector(cdp, model, (n) =>
    detectPlaceholderOnlyLabel(n),
  )) {
    findings.push(
      atFinding(ctx, placeholderOnlyLabelRule, {
        selector,
        role: node.role,
        name: node.name,
        confidence: 0.85,
        message: `This ${node.role} has no label: its only name is the placeholder ${quote(node.name)}, which disappears as soon as someone types.`,
        evidence: { axTree: axSnippet(model, node, ['name from placeholder']) },
      }),
    );
  }

  // at/label-in-name
  for (const { node, objectId, selector } of await nodesWithSelector(
    cdp,
    model,
    (n) => n.nameSource === 'aria-label' || n.nameSource === 'aria-labelledby',
  )) {
    const visibleLabel = (await visibleLabelOf(cdp, objectId)) ?? '';
    if (!detectLabelInName({ ...node, visibleLabel })) continue;
    findings.push(
      atFinding(ctx, labelInNameRule, {
        selector,
        role: node.role,
        name: node.name,
        confidence: 0.8,
        message: `The ${node.role} shows ${quote(visibleLabel)} on screen but its accessible name is ${quote(node.name)} (from ${node.nameSource}). Speech-input users who say what they see cannot activate it.`,
        evidence: {
          axTree: axSnippet(model, node, [`name from ${node.nameSource}`]),
          data: { visibleLabel, accessibleName: node.name },
        },
      }),
    );
  }

  // at/state-missing (tabs; the roles axe's aria-required-attr covers are left to axe)
  const tablists = await ctx.page.evaluate(() =>
    Array.from(document.querySelectorAll('[role=tablist]'))
      .filter((t) => window.__clearA11y!.isVisible(t))
      .map((t) => ({
        selector: window.__clearA11y!.selector(t),
        tabs: Array.from(t.querySelectorAll('[role=tab]')).map((tab) => ({
          'aria-selected': tab.getAttribute('aria-selected'),
        })),
      }))
      .filter((t) => t.tabs.length > 0),
  );
  for (const list of tablists.slice(0, MAX_PER_CHECK)) {
    const group: Attributes[] = list.tabs;
    const missing = detectStateMissing({ role: 'tab', attributes: group[0]!, group });
    if (!missing) continue;
    findings.push(
      atFinding(ctx, stateMissingRule, {
        selector: list.selector,
        role: 'tablist',
        confidence: 0.9,
        message: `None of the ${group.length} tabs in this tablist has aria-selected="true", so screen readers announce every tab as not selected and nobody can tell which panel is showing.`,
        evidence: {
          axTree: `tablist\n${group.map((g, i) => `  tab #${i + 1} (aria-selected=${g['aria-selected'] ?? 'absent'})`).join('\n')}`,
          data: { missing },
        },
      }),
    );
  }

  // at/role-missing
  const focusables = await cdp.elements(
    `Array.from(document.querySelectorAll('[tabindex]')).filter((e) => e.tabIndex >= 0 && !e.matches('a[href], area[href], button, input, select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"]')).slice(0, ${MAX_PER_CHECK})`,
  );
  for (const el of focusables) {
    const node = model.byBackendId.get(el.backendNodeId);
    const listenerTypes = await cdp.listenerTypes(el.objectId);
    const input = {
      axRole: node?.role ?? 'none',
      tabIndex: 0,
      nativeControl: false,
      listenerTypes,
    };
    if (!detectRoleMissing(input)) continue;
    const selector = await selectorOf(cdp, el.objectId);
    if (!selector) continue;
    findings.push(
      atFinding(ctx, roleMissingRule, {
        selector,
        role: input.axRole,
        ...(node?.name ? { name: node.name } : {}),
        confidence: 0.75,
        message: `This element is in the Tab order and has a ${listenerTypes.filter((t) => t !== 'keydown').join('/')} handler, but its role is "${input.axRole}", so screen readers don't announce it as something you can activate.`,
        evidence: {
          ...(node ? { axTree: axSnippet(model, node) } : {}),
          data: { listenerTypes },
        },
      }),
    );
  }

  return findings;
}
