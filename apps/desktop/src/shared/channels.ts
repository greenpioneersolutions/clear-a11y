/** IPC channel names. Plain constants (no zod) so the sandboxed preload stays tiny. */
export const INVOKE_CHANNELS = [
  'app:info',
  'targets:list',
  'targets:add',
  'targets:remove',
  'targets:pickFolder',
  'scans:start',
  'scans:cancel',
  'scans:list',
  'scans:get',
  'findings:list',
  'report:html',
  'report:focusPaths',
  'review:queue',
  'review:answer',
  'review:export',
  'settings:get',
  'settings:set',
  'providers:list',
  'providers:envStatus',
  'providers:test',
  'browsers:status',
  'browsers:install',
  'browsers:useFolder',
] as const;
export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

/** Main -> renderer events. */
export const EVENT_CHANNELS = ['scans:progress', 'browsers:progress', 'app:command'] as const;
export type EventChannel = (typeof EVENT_CHANNELS)[number];

export const isInvokeChannel = (value: unknown): value is InvokeChannel =>
  typeof value === 'string' && (INVOKE_CHANNELS as readonly string[]).includes(value);
