import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { BrowserStatus, CalibrationAnswer, IpcEnvelope, Target } from '../shared/api-types.js';
import { INVOKE_CHANNELS, isInvokeChannel, type InvokeChannel } from '../shared/channels.js';
import { describeIssues, IPC_SCHEMAS, type IpcPayload } from '../shared/ipc-schemas.js';
import { looksLikeBrowsersFolder } from './browsers.js';
import { toCalibrationExport } from './calibration.js';
import { PROVIDERS, envStatus, testProvider } from './providers.js';
import { findFinding, findingViews, focusPathViews, reportHtml, reviewItems } from './report.js';
import type { DesktopServices } from './services.js';
import { TargetError } from './targets.js';

/** Native dialogs, injected so handlers run without Electron in tests. */
export interface DialogDeps {
  /** Folder picker. Resolves to the chosen folder or null. */
  pickFolder(title: string): Promise<string | null>;
  /** Save dialog. Writes `content` and resolves to the path, or null when cancelled. */
  saveText(defaultName: string, content: string): Promise<string | null>;
}

export type IpcHandlers = {
  [C in InvokeChannel]: (payload: IpcPayload<C>) => Promise<unknown>;
};

export class IpcUserError extends Error {}

/** The handler behind every channel. Payloads arrive already validated by `dispatchIpc`. */
export function createIpcHandlers(services: DesktopServices, dialogs: DialogDeps): IpcHandlers {
  const { targets, settings, scans, calibration, browsers } = services;

  const answersMap = async () =>
    new Map((await calibration.list()).map((a) => [a.findingId, a] as const));

  return {
    'app:info': async () => services.info,

    'targets:list': () => targets.list(),
    'targets:add': (input) =>
      targets.add({
        kind: input.kind,
        value: input.value,
        ...(input.label ? { label: input.label } : {}),
      }),
    'targets:remove': async ({ id }) => {
      await targets.remove(id);
      return null;
    },
    'targets:pickFolder': () => dialogs.pickFolder('Choose a source repo folder to scan'),

    'scans:start': async ({ targetIds }) => {
      const all = await targets.list();
      const chosen = targetIds.map((id) => all.find((t) => t.id === id));
      if (chosen.some((t) => !t)) throw new TargetError('One of those targets no longer exists.');
      return scans.start(chosen as Target[]);
    },
    'scans:cancel': ({ id }) => scans.cancel(id),
    'scans:list': () => scans.list(),
    'scans:get': ({ id }) => scans.get(id),

    'findings:list': async ({ scanId, tier, wcag }) => {
      const { result, dir } = await scans.result(scanId);
      return findingViews(result, dir, { ...(tier ? { tier } : {}), ...(wcag ? { wcag } : {}) });
    },
    'report:html': async ({ scanId }) => {
      const { result, dir } = await scans.result(scanId);
      return reportHtml(result, dir);
    },
    'report:focusPaths': async ({ scanId }) => {
      const { result, dir } = await scans.result(scanId);
      return focusPathViews(result, dir);
    },

    'review:queue': async ({ scanId }) => {
      const { result } = await scans.result(scanId);
      return reviewItems(scanId, result, await answersMap());
    },
    'review:answer': async ({ scanId, findingId, answer, note }) => {
      const { result } = await scans.result(scanId);
      // Metadata comes from the stored finding, never from the renderer.
      const finding = findFinding(result, findingId);
      if (!finding || finding.tier !== 'needs-review') {
        throw new IpcUserError('That question is not part of this scan.');
      }
      const row: CalibrationAnswer = {
        findingId,
        scanId,
        ruleId: finding.ruleId,
        engine: finding.engine,
        wcag: [...finding.wcag],
        tierAtTime: finding.tier,
        confidence: finding.confidence,
        answer,
        ...(note?.trim() ? { note: note.trim() } : {}),
        answeredAt: new Date().toISOString(),
        appVersion: services.appVersion,
      };
      return calibration.save(row);
    },
    'review:export': async () => {
      const answers = await calibration.list();
      const content = `${JSON.stringify(toCalibrationExport(answers, services.appVersion), null, 2)}\n`;
      const path = await dialogs.saveText('clear-a11y-calibration.json', content);
      return path
        ? { saved: true, path, count: answers.length }
        : { saved: false, count: answers.length };
    },

    'settings:get': () => settings.get(),
    'settings:set': (patch) => settings.set(patch),

    'providers:list': async () => PROVIDERS,
    'providers:envStatus': async ({ names }) => envStatus(names, services.env),
    'providers:test': async () =>
      testProvider((await settings.get()).ai, {
        env: services.env,
        ...(services.fetch ? { fetch: services.fetch } : {}),
      }),

    'browsers:status': async () => browsers.status(),
    'browsers:install': () => browsers.install(),
    'browsers:useFolder': async (): Promise<BrowserStatus> => {
      const dir = await dialogs.pickFolder('Choose a Playwright browsers folder');
      if (!dir) return browsers.status();
      const path = resolve(dir);
      if (!isAbsolute(path) || !existsSync(path) || !looksLikeBrowsersFolder(path)) {
        throw new IpcUserError(
          'That folder has no Playwright Chromium in it (a folder named like chromium-1234). Choose the folder that holds the browsers, for example ~/Library/Caches/ms-playwright.',
        );
      }
      await settings.set({ browsers: { path } });
      return { ...browsers.status(), browsersPath: path, restartRequired: true };
    },
  };
}

const MAX_ERROR = 600;

function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const first = text.split('\n')[0] ?? 'Something went wrong.';
  return first.length > MAX_ERROR ? `${first.slice(0, MAX_ERROR)}...` : first;
}

/**
 * Validates and runs one IPC call. Unknown channels and invalid payloads are refused before any
 * handler runs. Errors come back as plain messages (never stacks).
 */
export async function dispatchIpc(
  handlers: IpcHandlers,
  channel: unknown,
  payload: unknown,
): Promise<IpcEnvelope<unknown>> {
  if (!isInvokeChannel(channel)) return { ok: false, error: 'Unknown request.' };
  const parsed = IPC_SCHEMAS[channel].safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: `Invalid request: ${describeIssues(parsed.error)}` };
  }
  try {
    const handler = handlers[channel] as (p: unknown) => Promise<unknown>;
    const value = await handler(parsed.data);
    return { ok: true, value: value === undefined ? null : value };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

/** The part of Electron's `ipcMain` we use (structural, so tests pass a fake). */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: { senderFrame: { url: string } | null }, ...args: unknown[]) => unknown,
  ): void;
}

/**
 * Registers every channel. Requests from any frame other than the app's own page (for example
 * the sandboxed report frame, or a page that somehow navigated) are refused.
 */
export function registerIpc(
  ipcMain: IpcMainLike,
  handlers: IpcHandlers,
  isTrustedSender: (url: string) => boolean,
): void {
  for (const channel of INVOKE_CHANNELS) {
    ipcMain.handle(channel, async (event, ...args) => {
      const url = event.senderFrame?.url;
      if (!url || !isTrustedSender(url)) {
        return { ok: false, error: 'Refused a request from a page that is not the app.' };
      }
      if (args.length > 1) return { ok: false, error: 'Invalid request: too many arguments.' };
      return dispatchIpc(handlers, channel, args[0]);
    });
  }
}
