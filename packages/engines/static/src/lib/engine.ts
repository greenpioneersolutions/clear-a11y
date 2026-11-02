import {
  captureElement,
  ensureHelpers,
  type Engine,
  type Page,
  type PageContext,
} from '@clear-a11y/browser';
import { findingId, type Finding } from '@clear-a11y/core';
import axe from 'axe-core';
import type { AxeResults, RunOptions } from 'axe-core';
import { AXE_TAGS, ENGINE_NAME, mapAxeResults } from './map-axe.js';

export { ENGINE_NAME };

/** Screenshot crops per page are capped to keep scans fast. */
const MAX_SCREENSHOTS = 10;

declare global {
  interface Window {
    axe?: { run(context: Document, options: RunOptions): Promise<AxeResults> };
  }
}

/**
 * Rewrites axe's selectors (`p:nth-child(3)`) to the shared selector convention
 * (`window.__clearA11y.selector`, `#id` when unique) so static findings line up with other
 * engines for dedupe, benchmark matching and pass records (ADR 0003). Targets inside shadow
 * roots or frames, and selectors that don't resolve to exactly one element, keep axe's form.
 * The original is kept in `evidence.data.axeSelector` when it differs.
 */
async function withSharedSelectors(page: Page, findings: Finding[]): Promise<Finding[]> {
  const plain = [...new Set(findings.map((f) => f.target.selector))].filter(
    (s) => !s.includes('>>>'),
  );
  if (!plain.length) return findings;
  await ensureHelpers(page);
  const shared = await page.evaluate((selectors) => {
    const out: Record<string, string> = {};
    for (const s of selectors) {
      try {
        const els = document.querySelectorAll(s);
        const el = els.item(0);
        if (els.length === 1 && el && window.__clearA11y) out[s] = window.__clearA11y.selector(el);
      } catch {
        // Not a valid selector for querySelectorAll: keep axe's.
      }
    }
    return out;
  }, plain);
  return findings.map((f) => {
    const selector = shared[f.target.selector];
    if (!selector || selector === f.target.selector) return f;
    const moved: Finding = {
      ...f,
      target: { ...f.target, selector },
      evidence: { ...f.evidence, data: { ...f.evidence.data, axeSelector: f.target.selector } },
    };
    return { ...moved, id: findingId(moved) };
  });
}

/**
 * axe-core rules layer: fast, deterministic checks mapped to Clear A11Y findings.
 * axe violations become `violation`; axe "incomplete" results become `needs-review`.
 */
export function createStaticEngine(): Engine {
  return {
    name: ENGINE_NAME,
    mutatesPage: false,
    async run(ctx: PageContext): Promise<Finding[]> {
      const hasAxe = await ctx.page.evaluate(() => typeof window.axe !== 'undefined');
      if (!hasAxe) await ctx.page.addScriptTag({ content: axe.source });
      const options: RunOptions = {
        runOnly: { type: 'tag', values: AXE_TAGS },
        resultTypes: ['violations', 'incomplete'],
      };
      const results = await ctx.page.evaluate((opts) => window.axe!.run(document, opts), options);
      const findings = await withSharedSelectors(
        ctx.page,
        mapAxeResults(results, {
          url: ctx.url,
          state: ctx.state,
          viewport: ctx.viewport.name,
        }),
      );

      let shots = 0;
      for (const f of findings) {
        if (f.tier !== 'violation' || shots >= MAX_SCREENSHOTS || f.target.selector.includes('>>>'))
          continue;
        const screenshot = await captureElement(ctx, f.target.selector, f.ruleId.replace('/', '-'));
        if (screenshot) {
          f.evidence.screenshot = screenshot;
          shots++;
        }
      }
      return findings;
    },
  };
}
