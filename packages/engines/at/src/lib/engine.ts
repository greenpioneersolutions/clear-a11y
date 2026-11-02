import { captureElement, type Engine, type PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { Cdp } from './cdp.js';
import { runContentChecks } from './content-checks.js';
import { runMediaAndFormChecks } from './media-form-checks.js';
import { parseAtConfig } from './config.js';
import { ENGINE_NAME } from './engine-name.js';
import { loadGuidepup } from './guidepup.js';
import { Prober } from './probes.js';
import { runTreeChecks } from './tree-checks.js';

export { ENGINE_NAME };

/** Screenshot crops per page are capped to keep scans fast. */
const MAX_SCREENSHOTS = 5;

const FORM_STATES = new Set(['form-invalid', 'form-empty']);

/** Which phases run in a state. Probes start from a fresh load, so they run once per page. */
export function phasesFor(ctx: Pick<PageContext, 'state' | 'stateMeta'>): {
  tree: boolean;
  buttons: boolean;
  forms: boolean;
  replay: boolean;
} {
  const kind = ctx.stateMeta?.kind ?? (ctx.state === 'default' ? 'default' : 'other');
  const isDefault = ctx.state === 'default' && kind === 'default';
  return {
    tree: true,
    buttons: isDefault,
    forms: isDefault,
    replay: FORM_STATES.has(kind) && typeof ctx.stateMeta?.replay === 'function',
  };
}

/**
 * Accessibility tree engine: names, roles, states, labels, live regions and error
 * announcements as assistive technology sees them.
 *
 * 1. Tree checks read the CDP accessibility tree of the page in its current state; content checks
 *    flag alt text and link text that code can judge on its own (file names, generic duplicates).
 * 2. Probes reload the page with an announcement recorder installed before the page's scripts,
 *    press buttons and submit forms (or replay a form-invalid state), and compare what changed
 *    on screen with what a screen reader would have been told.
 */
export function createAtEngine(): Engine {
  return {
    name: ENGINE_NAME,
    async run(ctx: PageContext): Promise<Finding[]> {
      const config = parseAtConfig(ctx.config.at);
      const phases = phasesFor(ctx);
      const findings: Finding[] = [];

      const cdp = await Cdp.open(ctx.page);
      try {
        findings.push(...(await runTreeChecks(ctx, cdp)));
      } finally {
        await cdp.close();
      }
      findings.push(...(await runContentChecks(ctx)));
      findings.push(...(await runMediaAndFormChecks(ctx)));

      const screenReader = await loadGuidepup(config.guidepup, ctx.log);
      if (screenReader) {
        ctx.log.info(
          `engine-at: ${screenReader.name} available through Guidepup; findings come from the recorder`,
        );
      }

      if (phases.buttons || phases.forms || phases.replay) {
        const prober = new Prober(ctx, config);
        await prober.install();
        if (phases.buttons) findings.push(...(await prober.probeButtons()));
        if (phases.forms && !prober.outOfTime()) findings.push(...(await prober.probeForms()));
        if (phases.replay) findings.push(...(await prober.probeReplay()));
        if (phases.buttons && !prober.outOfTime())
          findings.push(...(await prober.probeInteractions()));
        if (findings.some((f) => f.tier === 'violation')) {
          await prober.fresh().catch(() => undefined);
          await addScreenshots(ctx, findings);
        }
      } else {
        await addScreenshots(ctx, findings);
      }
      return findings;
    },
  };
}

async function addScreenshots(ctx: PageContext, findings: Finding[]): Promise<void> {
  let shots = 0;
  for (const f of findings) {
    if (f.tier !== 'violation' || shots >= MAX_SCREENSHOTS) continue;
    const shot = await captureElement(ctx, f.target.selector, f.ruleId.replace('/', '-'));
    if (shot) {
      f.evidence.screenshot = shot;
      shots++;
    }
  }
}
