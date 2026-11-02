/**
 * Browser-side fake bridge for the dogfood scan: answers every call from a snapshot of real data
 * (`window.__clearA11ySnapshot`, captured from the real services after real scans). Changes the
 * scanner's state explorer makes (clicking Remove, answering a question) stay in this page only.
 */
import type {
  AppInfo,
  BrowserStatus,
  CalibrationAnswer,
  EnvVarStatus,
  FindingView,
  FocusPathView,
  IpcEnvelope,
  ProviderInfo,
  ReviewItem,
  ScanRecord,
  Settings,
  Target,
} from '../../src/shared/api-types.js';
import { createBridge } from '../../src/shared/bridge.js';
import type { InvokeChannel } from '../../src/shared/channels.js';

export interface Snapshot {
  info: AppInfo;
  targets: Target[];
  scans: ScanRecord[];
  findings: Record<string, FindingView[]>;
  html: Record<string, string>;
  focusPaths: Record<string, FocusPathView[]>;
  review: Record<string, ReviewItem[]>;
  settings: Settings;
  providers: ProviderInfo[];
  env: EnvVarStatus[];
  browser: BrowserStatus;
}

interface TestWindow {
  clearA11y: unknown;
  __clearA11ySnapshot: Snapshot;
}

const w = window as unknown as TestWindow;
const snap = w.__clearA11ySnapshot;

function answer(channel: InvokeChannel, p: Record<string, unknown>): unknown {
  const scanId = p['scanId'] as string;
  switch (channel) {
    case 'app:info':
      return snap.info;
    case 'targets:list':
      return snap.targets;
    case 'targets:add':
      throw new Error('Adding targets is turned off in this demo.');
    case 'targets:remove':
      snap.targets = snap.targets.filter((t) => t.id !== p['id']);
      return null;
    case 'targets:pickFolder':
      return null;
    case 'scans:start':
      return [];
    case 'scans:cancel':
    case 'scans:get':
      return snap.scans.find((s) => s.id === p['id']);
    case 'scans:list':
      return snap.scans;
    case 'findings:list':
      return (snap.findings[scanId] ?? []).filter((f) => !p['tier'] || f.tier === p['tier']);
    case 'report:html':
      return snap.html[scanId] ?? '';
    case 'report:focusPaths':
      return snap.focusPaths[scanId] ?? [];
    case 'review:queue':
      return snap.review[scanId] ?? [];
    case 'review:answer': {
      const item = (snap.review[scanId] ?? []).find((i) => i.findingId === p['findingId']);
      const row = {
        findingId: p['findingId'],
        scanId,
        ruleId: item?.ruleId ?? '',
        engine: item?.engine ?? '',
        wcag: item?.wcag ?? [],
        tierAtTime: 'needs-review',
        confidence: item?.confidence ?? 0,
        answer: p['answer'],
        answeredAt: new Date().toISOString(),
        appVersion: snap.info.version,
      } as CalibrationAnswer;
      if (item) item.answer = { answer: row.answer, answeredAt: row.answeredAt };
      return row;
    }
    case 'review:export':
      return { saved: false, count: 0 };
    case 'settings:get':
      return snap.settings;
    case 'settings:set':
      snap.settings = { ...snap.settings, ...(p as Partial<Settings>) };
      return snap.settings;
    case 'providers:list':
      return snap.providers;
    case 'providers:envStatus':
      return snap.env;
    case 'providers:test':
      return {
        ok: true,
        message: 'No provider is set. AI judges are off and nothing is sent anywhere.',
      };
    case 'browsers:status':
    case 'browsers:install':
    case 'browsers:useFolder':
      return snap.browser;
  }
}

w.clearA11y = createBridge(
  async (channel, payload): Promise<IpcEnvelope<unknown>> => {
    try {
      const value = answer(channel, (payload ?? {}) as Record<string, unknown>);
      return { ok: true, value: value === undefined ? null : value };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
  () => () => undefined,
);
