import type { RepoConfig } from '../config.js';
import type { RepoDetection } from '../detect/detect-repo.js';
import type { StorybookSource } from './storybook.js';

/** What the runtime layer will scan for a repo. */
export type RuntimePlan =
  | { mode: 'storybook'; source: StorybookSource; notes: string[] }
  | { mode: 'dev-server'; notes: string[] }
  | { mode: 'none'; reason: string };

/**
 * Picks the runtime layer for a repo. Pure. In order:
 * 1. `storybookUrl` (the user pointed at a running local Storybook),
 * 2. a built Storybook (`storybookStatic`, else a detected `storybook-static/`),
 * 3. the dev server, only when the user opted in with `boot` (it runs the repo's code),
 * 4. nothing: static lint only, with a reason that says how to enable runtime scanning.
 */
export function chooseRuntime(
  detection: Pick<RepoDetection, 'storybook'>,
  config: Pick<RepoConfig, 'runtime' | 'storybookUrl' | 'storybookStatic' | 'boot'>,
): RuntimePlan {
  if (!config.runtime)
    return { mode: 'none', reason: 'Runtime layer disabled (repo.runtime: false).' };
  const bootNote = config.boot
    ? [
        'Storybook found, so stories were scanned and the dev server was not started (--boot not needed).',
      ]
    : [];
  if (config.storybookUrl)
    return {
      mode: 'storybook',
      source: { kind: 'url', url: config.storybookUrl },
      notes: bootNote,
    };
  const staticDir = config.storybookStatic ?? detection.storybook.staticDirs[0];
  if (staticDir)
    return { mode: 'storybook', source: { kind: 'static', dir: staticDir }, notes: bootNote };
  if (config.boot) return { mode: 'dev-server', notes: [] };
  const sb = detection.storybook;
  const reason =
    sb.configDirs.length || sb.inDependencies
      ? `Storybook is set up${sb.configDirs[0] ? ` (${sb.configDirs[0]})` : ''} but not built: run \`storybook build\` yourself and scan again, or pass --storybook-url with your local Storybook, to test every story with the full engine set.`
      : "Runtime checks skipped: pass --boot to start the app's dev server (runs the repo's code), or scan the running app's URL, to cover keyboard, states, reflow and contrast.";
  return { mode: 'none', reason };
}
