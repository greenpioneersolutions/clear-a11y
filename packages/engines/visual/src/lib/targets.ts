import {
  detectTargetSize,
  TARGET_SIZE_EQUIVALENT_QUESTION,
  targetSizeRule,
} from '../rules/target-size.js';
import { round, type VisualRun } from './context.js';
import type { TargetInfo } from './probe.js';

/** SC 2.5.8: targets under 24 x 24 CSS px whose 24px circle hits a neighbor. */
export async function checkTargetSize(run: VisualRun): Promise<void> {
  const { page } = run.ctx;
  const targets: TargetInfo[] = await page.evaluate(
    (eq) => window.__ca11yVisual.targets(eq),
    run.config.targetSizeEquivalent,
  );
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const f of detectTargetSize(targets)) {
    const t = byId.get(f.id);
    if (!t) continue;
    await run.emit(targetSizeRule, {
      selector: t.selector,
      tier: f.tier,
      message: `This target is ${round(t.box.width, 1)} x ${round(t.box.height, 1)} CSS px, smaller than 24 x 24, and a 24px circle centered on it touches another target. People with limited dexterity may activate the wrong one.`,
      evidence: { html: t.html, data: { width: round(t.box.width), height: round(t.box.height) } },
      ...(f.tier === 'needs-review' ? { question: TARGET_SIZE_EQUIVALENT_QUESTION } : {}),
      screenshot: true,
    });
  }
}
