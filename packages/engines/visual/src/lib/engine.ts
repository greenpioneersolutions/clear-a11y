import type { Engine, PageContext } from '@clear-a11y/browser';
import type { Finding } from '@clear-a11y/core';
import { parseVisualConfig } from './config.js';
import { checkNonTextContrast, checkTextContrast } from './contrast.js';
import { ENGINE_NAME, VisualRun } from './context.js';
import { checkHoverContent } from './hover.js';
import { measureLayout } from './layout.js';
import { checkMotion } from './motion.js';
import { checkOrientation } from './orientation.js';
import { ensureProbe } from './probe.js';
import { checkReflow } from './reflow.js';
import { checkTextResize } from './resize.js';
import { checkTextSpacing } from './spacing.js';
import { checkTargetSize } from './targets.js';

export { ENGINE_NAME };

/** Share of the runner's per-state timeout the engine plans to use; slow checks stop early. */
const BUDGET_SHARE = 0.8;

/**
 * Measures what low-vision and mobile users see: reflow, text resize, text spacing, real-pixel
 * contrast, target size and content on hover or focus.
 *
 * The engine changes the viewport, injects styles and moves the pointer, so it keeps the default
 * `mutatesPage` (the runner gives it a fresh page). Each check restores what it changed.
 */
export function createVisualEngine(): Engine {
  return {
    name: ENGINE_NAME,
    async run(ctx: PageContext): Promise<Finding[]> {
      const config = parseVisualConfig(ctx.config.visual);
      const deadline = Date.now() + Math.max(5_000, ctx.config.timeoutMs * BUDGET_SHARE);
      const run = new VisualRun(ctx, config, deadline);
      // SC 2.2.2 watches the page for seconds; it runs on its own page of the same context, in
      // parallel with the other checks, and only for the default state (motion is page-wide).
      const motion =
        config.motion && ctx.state === 'default'
          ? checkMotion(run, {
              shortMs: config.motionObserveMs,
              longMs: config.motionCarouselObserveMs,
              maxEntries: 300,
              timeoutMs: ctx.config.timeoutMs,
            }).catch((err: unknown) => {
              ctx.log.warn('engine-visual: motion check failed', {
                url: ctx.url,
                error: String(err),
              });
            })
          : Promise.resolve();
      await ensureProbe(ctx.page);
      const base = await measureLayout(ctx.page);

      const phases: [boolean, string, () => Promise<void>][] = [
        [config.targetSize, 'target size', () => checkTargetSize(run)],
        [config.contrast, 'contrast', () => checkTextContrast(run)],
        [config.nonTextContrast, 'non-text contrast', () => checkNonTextContrast(run)],
        [config.textSpacing, 'text spacing', () => checkTextSpacing(run, base)],
        [config.textResize, 'text resize', () => checkTextResize(run, base)],
        [config.reflow, 'reflow', () => checkReflow(run, base)],
        [config.hover, 'hover content', () => checkHoverContent(run)],
        [config.orientation && ctx.state === 'default', 'orientation', () => checkOrientation(run)],
      ];
      for (const [enabled, name, phase] of phases) {
        if (!enabled) continue;
        try {
          await phase();
        } catch (err) {
          ctx.log.warn(`engine-visual: ${name} check failed`, { url: ctx.url, error: String(err) });
        }
      }
      await motion;
      return run.findings;
    },
  };
}
