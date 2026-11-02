// Entry point of the bundled action (dist/index.js). Everything else is in main.ts so tests can
// call run() in-process without exiting.
import * as core from '@actions/core';
import { run } from './main.js';

try {
  const { exitCode, failure } = await run();
  if (failure) core.setFailed(failure);
  process.exitCode = exitCode;
} catch (err) {
  core.setFailed(err instanceof Error ? err.message : String(err));
  process.exitCode = 2;
}
