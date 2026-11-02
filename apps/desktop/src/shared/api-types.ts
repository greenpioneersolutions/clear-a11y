/**
 * The contract between the renderer and the main process. The renderer only ever sees
 * `window.clearA11y` (a `ClearA11yApi`); every call crosses IPC and is validated in main
 * (see `ipc-schemas.ts`). Types only: this file has no runtime code, so the renderer bundle and the
 * sandboxed preload can import it freely.
 */
import type { FocusStop, Finding, ScanSummary, Tier } from '@clear-a11y/core';

export type TargetKind = 'url' | 'repo';

/** Something to scan: a web page URL or a local source repo folder. */
export interface Target {
  id: string;
  kind: TargetKind;
  /** The URL, or the absolute folder path. */
  value: string;
  /** Short name shown in lists. */
  label: string;
  addedAt: string;
}

export interface TargetInput {
  kind: TargetKind;
  value: string;
  label?: string;
}

export type ScanStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ScanProgressInfo {
  done: number;
  total: number;
  message?: string;
}

/** A scan job as the UI shows it (one job per target). */
export interface ScanRecord {
  id: string;
  status: ScanStatus;
  targetId: string;
  kind: TargetKind;
  target: string;
  label: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: ScanProgressInfo;
  error?: string;
  summary?: ScanSummary;
  pages?: number;
  errors?: number;
}

export interface FindingFilter {
  tier?: Tier;
  /** A WCAG success criterion such as `2.4.3`. */
  wcag?: string;
}

export interface CriterionInfo {
  sc: string;
  title: string;
  level: string;
}

/** A finding plus what the UI needs to show it without importing core at runtime. */
export interface FindingView extends Finding {
  criteria: CriterionInfo[];
  /** `data:` URI of the screenshot crop, when the scan stored one. */
  screenshotUri?: string;
}

export interface FocusLayoutStop {
  n: number;
  cx: number;
  cy: number;
  box: { x: number; y: number; width: number; height: number };
  backward: boolean;
}

export interface FocusLayoutArrow {
  from: number;
  to: number;
  x1: number;
  y1: number;
  mx: number;
  my: number;
  x2: number;
  y2: number;
  backward: boolean;
}

/** The reporter's focus-path layout (`layoutFocusPath`), computed in main. */
export interface FocusLayout {
  width: number;
  height: number;
  stops: FocusLayoutStop[];
  arrows: FocusLayoutArrow[];
}

/** One recorded keyboard walk: the Tab stops plus a diagram layout. */
export interface FocusPathView {
  findingId: string;
  ruleId: string;
  tier: Tier;
  message: string;
  page: { url: string; state: string; viewport: string };
  stops: FocusStop[];
  layout?: FocusLayout;
  screenshotUri?: string;
}

export type ReviewAnswer = 'yes' | 'no' | 'skip';

/** A needs-review question from a scan, with the answer already saved (if any). */
export interface ReviewItem {
  findingId: string;
  scanId: string;
  ruleId: string;
  engine: string;
  wcag: string[];
  criteria: CriterionInfo[];
  tier: Tier;
  confidence: number;
  question: string;
  message: string;
  selector: string;
  pageUrl: string;
  answer?: { answer: ReviewAnswer; note?: string; answeredAt: string };
}

export interface ReviewAnswerInput {
  scanId: string;
  findingId: string;
  answer: ReviewAnswer;
  note?: string;
}

/**
 * One row of calibration data (table `calibration_answers`). Stored only on this machine; never
 * sent anywhere. See apps/desktop/README.md "Calibration data".
 */
export interface CalibrationAnswer {
  findingId: string;
  scanId: string;
  ruleId: string;
  engine: string;
  wcag: string[];
  tierAtTime: Tier;
  confidence: number;
  answer: ReviewAnswer;
  note?: string;
  answeredAt: string;
  appVersion: string;
}

export interface CalibrationExport {
  format: 'clear-a11y-calibration';
  version: 1;
  exportedAt: string;
  appVersion: string;
  answers: CalibrationAnswer[];
}

export interface ExportResult {
  saved: boolean;
  path?: string;
  count: number;
}

export type ProviderId = 'none' | 'anthropic' | 'openai' | 'azure' | 'ollama';

export interface AiSettings {
  provider: ProviderId;
  model?: string;
  /** Name of the environment variable that holds the API key. Never the key itself. */
  apiKeyEnv?: string;
  baseUrl?: string;
}

export interface Settings {
  ai: AiSettings;
  scan: {
    /** Also scan same-site pages linked from the target. */
    crawl: boolean;
    maxPages: number;
  };
  browsers: {
    /** A Playwright browsers folder chosen with "Use an existing browser folder". */
    path?: string;
  };
}

export interface SettingsPatch {
  ai?: AiSettings;
  scan?: Partial<Settings['scan']>;
  browsers?: { path?: string | null };
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  description: string;
  /** Requests stay on this machine. */
  local: boolean;
  needsModel: boolean;
  needsBaseUrl: boolean;
  /** The environment variable read when `apiKeyEnv` is not set. */
  defaultKeyEnv?: string;
}

export interface EnvVarStatus {
  name: string;
  /** True when the variable is set (its value is never read into the UI). */
  set: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
}

export interface BrowserStatus {
  installed: boolean;
  installing: boolean;
  executablePath?: string;
  /** Folder Playwright browsers are read from (default cache, or the one the user chose). */
  browsersPath?: string;
  /** A new browsers folder was chosen: it is used after the app restarts. */
  restartRequired?: boolean;
}

export type BrowserInstallPhase = 'starting' | 'downloading' | 'done' | 'error';

export interface BrowserInstallProgress {
  phase: BrowserInstallPhase;
  percent?: number;
  message: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  /** `sqlite` keeps history across restarts; `memory` is the fallback when node:sqlite is missing. */
  storage: 'sqlite' | 'memory';
  dataDir: string;
  nodeVersion: string;
  electronVersion?: string;
}

export const VIEW_IDS = ['targets', 'scans', 'report', 'focus', 'review', 'settings'] as const;
export type ViewId = (typeof VIEW_IDS)[number];

/** Sent by the app menu (keyboard accelerators) to the renderer. */
export type AppCommand = { type: 'navigate'; view: ViewId };

export type Unsubscribe = () => void;

export interface ClearA11yApi {
  app: {
    info(): Promise<AppInfo>;
    onCommand(listener: (command: AppCommand) => void): Unsubscribe;
  };
  targets: {
    list(): Promise<Target[]>;
    add(input: TargetInput): Promise<Target>;
    remove(id: string): Promise<void>;
    /** Opens the native folder picker. Resolves to the folder, or null when cancelled. */
    pickFolder(): Promise<string | null>;
  };
  scans: {
    start(targetIds: string[]): Promise<ScanRecord[]>;
    cancel(id: string): Promise<ScanRecord>;
    list(): Promise<ScanRecord[]>;
    get(id: string): Promise<ScanRecord>;
    onProgress(listener: (scan: ScanRecord) => void): Unsubscribe;
  };
  findings: {
    list(scanId: string, filter?: FindingFilter): Promise<FindingView[]>;
  };
  report: {
    /** The self-contained HTML report (reporter's `toHtml`). */
    html(scanId: string): Promise<string>;
    focusPaths(scanId: string): Promise<FocusPathView[]>;
  };
  review: {
    queue(scanId: string): Promise<ReviewItem[]>;
    answer(input: ReviewAnswerInput): Promise<CalibrationAnswer>;
    /** Saves every answer as JSON through the native save dialog. */
    export(): Promise<ExportResult>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: SettingsPatch): Promise<Settings>;
  };
  providers: {
    list(): Promise<ProviderInfo[]>;
    envStatus(names: string[]): Promise<EnvVarStatus[]>;
    /** Checks the saved provider settings; for remote providers sends one tiny request. */
    test(): Promise<ProviderTestResult>;
  };
  browsers: {
    status(): Promise<BrowserStatus>;
    install(): Promise<BrowserStatus>;
    /** Picks an existing Playwright browsers folder instead of downloading. */
    useFolder(): Promise<BrowserStatus>;
    onProgress(listener: (progress: BrowserInstallProgress) => void): Unsubscribe;
  };
}

/** What every IPC call returns: errors cross the bridge as plain messages, never stacks. */
export type IpcEnvelope<T> = { ok: true; value: T } | { ok: false; error: string };
