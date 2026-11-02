// Scan entry point
export { scanRepo, repoTarget } from './scan-repo.js';
export type { ScanRepoOptions, RepoScanResult, RepoLogger } from './scan-repo.js';
export { RepoConfigSchema, resolveRepoConfig } from './config.js';
export type { RepoConfig, RepoConfigInput } from './config.js';

// Change sets (pull requests): changed files -> routes, stories and files to lint
export * from './changes/index.js';

// Detection
export {
  detectRepo,
  detectFromInput,
  FRAMEWORKS,
  IGNORED_DIRS,
  SOURCE_DIR_CANDIDATES,
  WORKSPACE_DIRS,
} from './detect/detect-repo.js';
export type {
  DetectInput,
  Framework,
  Linter,
  PackageManager,
  PackageManifest,
  RepoDetection,
  StorybookInfo,
} from './detect/detect-repo.js';
export { listSourceFiles, globToRegExp, DEFAULT_EXCLUDES } from './detect/files.js';
export type { ListFilesOptions, ListedFiles } from './detect/files.js';

// Static layer
export { lintRepo, lintSource, kindOfFile, normalizeRuleId } from './static/lint.js';
export type { LintMessage, LintRepoOptions, LintRepoResult, SourceKind } from './static/lint.js';
export { jsxConfig, vueConfig, angularConfig, loadAngularPlugin } from './static/eslint-config.js';
export type { AngularPlugin, AngularLoadResult } from './static/eslint-config.js';
export {
  RULE_MAP,
  SKIPPED_RULES,
  LINT_PLUGINS,
  CONFIDENCE,
  enabledRules,
  tierFor,
} from './static/rule-map.js';
export type { LintPlugin, RepoRuleEntry, TierContext } from './static/rule-map.js';
export {
  toFinding,
  toFindings,
  selectorFor,
  repoPageUrl,
  repoRuleId,
  REPO_ESLINT_ENGINE,
} from './static/to-finding.js';
export { describeElement, type ElementInfo, type AttributeValue } from './static/element.js';

// Runtime -> source mapping
export { mapFindingsToSource, normalizeRepoPath } from './source-map/map-findings.js';
export type {
  MapFindingsOptions,
  MappingStrategy,
  SourceHints,
} from './source-map/map-findings.js';
export {
  SOURCE_ATTRIBUTE,
  SOURCE_ATTRIBUTE_PAIRS,
  SOURCE_ATTRIBUTE_NAMES,
  attributesFromHtml,
  parseSourceRef,
  sourceRefFromAttributes,
  sourceAttributesProbe,
  type SourceRef,
} from './source-map/attributes.js';
export {
  reactDebugSourceProbe,
  fileFromReactSource,
  type ReactDebugSource,
} from './source-map/react-fiber.js';
export {
  cluesFromFinding,
  searchClues,
  scoreCandidates,
  UNIQUE_CONFIDENCE,
  type SearchClues,
  type SearchStrategy,
  type SourceCandidate,
} from './source-map/search.js';

// Runtime layer building blocks (S10). Browser work (serving, scanning) lives in @clear-a11y/runner.
export {
  parseStoryIndex,
  storyIframeUrl,
  storyIdFromUrl,
  selectStories,
  storyMatchesFilter,
  storyFileInRepo,
  storyExportLine,
} from './runtime/index-json.js';
export type { StoryIndex, StoryIndexEntry, StorySelection } from './runtime/index-json.js';
export {
  STORY_INDEX_FILES,
  isLocalUrl,
  assertLocalStorybookUrl,
  readStaticStoryIndex,
  fetchStoryIndex,
  storybookProjectDirs,
  resolveStoryFile,
} from './runtime/storybook.js';
export type { StorybookSource, FetchLike } from './runtime/storybook.js';
export {
  DEV_FRAMEWORKS,
  DEV_SCRIPT_CANDIDATES,
  detectFramework,
  pickDevScript,
  portArgs,
  scriptAcceptsPortArgs,
  buildDevCommand,
} from './runtime/frameworks.js';
export type { DevFramework, DevPackageJson, DevCommand } from './runtime/frameworks.js';
export {
  stripAnsi,
  findLocalUrl,
  freePort,
  httpResponds,
  waitForReady,
  signalTree,
  killTree,
  spawnManaged,
  runningProcessCount,
} from './runtime/process.js';
export type { WaitForReadyOptions, KillDeps, ManagedProcess, SpawnFn } from './runtime/process.js';
export { DevServerError, planDevServer, startDevServer } from './runtime/dev-server.js';
export type {
  DevServerPlan,
  RunningDevServer,
  StartDevServerOptions,
} from './runtime/dev-server.js';
export { chooseRuntime } from './runtime/choose.js';
export type { RuntimePlan } from './runtime/choose.js';
