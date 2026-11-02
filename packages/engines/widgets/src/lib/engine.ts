import { captureElement, type Engine, type PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { rules } from '../rules/index.js';
import { parseWidgetsConfig, type WidgetsConfig } from './config.js';
import { runCombobox } from './contracts/combobox.js';
import { probeOrphanDialogs, runDialog } from './contracts/dialog.js';
import { runDisclosure } from './contracts/disclosure.js';
import { runGrid } from './contracts/grid.js';
import { runListbox } from './contracts/listbox.js';
import { runMenuButton, runMenubar } from './contracts/menu.js';
import { runTabs } from './contracts/tabs.js';
import { detectWidgets, type Detection } from './detect.js';
import { Driver } from './driver.js';
import { ENGINE_NAME } from './engine-name.js';
import { problemsToFindings } from './findings.js';
import type { Problem, Widget, WidgetKind } from './types.js';

export { ENGINE_NAME };

const CONTRACTS: Record<WidgetKind, (drv: Driver, widget: Widget) => Promise<Problem[]>> = {
  tabs: runTabs,
  'menu-button': runMenuButton,
  menubar: runMenubar,
  combobox: runCombobox,
  listbox: runListbox,
  dialog: runDialog,
  disclosure: runDisclosure,
  grid: runGrid,
};

/** Screenshot crops per page are capped to keep scans fast. */
const MAX_SCREENSHOTS = 5;

/**
 * Widget scripts start from a fresh load of the page, so they give the same answer in every
 * state. They run once per page/viewport, in the default state, to avoid duplicate findings.
 */
export function runsInState(ctx: Pick<PageContext, 'state' | 'stateMeta'>): boolean {
  return ctx.state === 'default' && (!ctx.stateMeta || ctx.stateMeta.kind === 'default');
}

/** Pure: which detected widgets to drive, honoring `contracts` and `maxPerKind`. */
export function planWidgets(detection: Detection, config: WidgetsConfig): Widget[] {
  const counts = new Map<WidgetKind, number>();
  return detection.widgets.filter((w) => {
    if (!config.contracts.includes(w.kind)) return false;
    const n = counts.get(w.kind) ?? 0;
    counts.set(w.kind, n + 1);
    return n < config.maxPerKind;
  });
}

/**
 * Widget engine: drives custom widgets with the keyboard and checks them against the ARIA
 * Authoring Practices keyboard contracts (tabs, menu button, menubar, combobox, listbox, dialog,
 * disclosure, grid). Violations only when keyboard operation is blocked (2.1.1) or reported
 * state is wrong (4.1.2); other APG deviations are needs-review.
 */
export function createWidgetsEngine(): Engine {
  return {
    name: ENGINE_NAME,
    async run(ctx: PageContext): Promise<Finding[]> {
      if (!runsInState(ctx)) return [];
      const config = parseWidgetsConfig(ctx.config.widgets);
      const drv = new Driver(ctx);
      await drv.fresh();
      const detection = await detectWidgets(ctx.page);
      const deadline = Date.now() + config.budgetMs;
      const outOfTime = () => Date.now() > deadline;

      const problems: Problem[] = [];
      for (const widget of planWidgets(detection, config)) {
        if (outOfTime()) {
          ctx.log.info('engine-widgets: time budget used up, skipping remaining widgets');
          break;
        }
        try {
          problems.push(...(await CONTRACTS[widget.kind](drv, widget)));
        } catch (err) {
          ctx.log.debug('engine-widgets: widget script failed', {
            kind: widget.kind,
            selector: widget.selector,
            error: String(err),
          });
        }
      }
      if (config.contracts.includes('dialog') && config.maxDialogProbes > 0) {
        problems.push(
          ...(await probeOrphanDialogs(
            drv,
            detection.orphanDialogs,
            detection.probeButtons,
            config.maxDialogProbes,
            outOfTime,
          )),
        );
      }

      const findings = problemsToFindings(
        problems,
        { url: ctx.url, state: ctx.state, viewport: ctx.viewport.name },
        rules,
      );
      if (findings.length) await addEvidence(drv, findings);
      return findings;
    },
  };
}

/** HTML snippet for every finding and a screenshot crop for violations, from a clean load. */
async function addEvidence(drv: Driver, findings: Finding[]): Promise<void> {
  try {
    await drv.fresh();
  } catch {
    return;
  }
  let shots = 0;
  for (const f of findings) {
    const html = await drv.page
      .locator(f.target.selector)
      .first()
      .evaluate((el) => window.__clearA11y!.snippet(el), undefined, { timeout: 1_000 })
      .catch(() => undefined);
    if (html) f.evidence.html = html;
    if (f.tier === 'violation' && shots < MAX_SCREENSHOTS) {
      const shot = await captureElement(drv.ctx, f.target.selector, f.ruleId.replace('/', '-'));
      if (shot) {
        f.evidence.screenshot = shot;
        shots++;
      }
    }
  }
}
