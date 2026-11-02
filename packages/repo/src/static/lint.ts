import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Linter, type SourceCode } from 'eslint';
import type { RepoConfig } from '../config.js';
import type { RepoDetection } from '../detect/detect-repo.js';
import { listSourceFiles } from '../detect/files.js';
import {
  enclosingComponent,
  fromAngularElement,
  fromJsxOpeningElement,
  fromVueElement,
  type AstNode,
  type ElementInfo,
} from './element.js';
import {
  angularConfig,
  jsxConfig,
  loadAngularPlugin,
  vueConfig,
  type AngularPlugin,
} from './eslint-config.js';

/** One accessibility lint hit, before it becomes a Finding. */
export interface LintMessage {
  /** Repo-relative POSIX path. */
  file: string;
  /** Normalized lint rule id: "jsx-a11y/alt-text", "vuejs-accessibility/alt-text", "angular-template/alt-text". */
  lintRuleId: string;
  line: number;
  /** 1-based column. */
  column: number;
  /** The plugin's own message text. */
  message: string;
  element?: ElementInfo;
  component?: string;
  /** Opening tag source, whitespace collapsed and truncated. */
  snippet?: string;
}

export interface LintFileResult {
  messages: LintMessage[];
  /** Parse error: the file could not be linted. */
  error?: string;
}

export type SourceKind = 'jsx' | 'vue' | 'angular';

export const kindOfFile = (file: string): SourceKind =>
  file.endsWith('.vue') ? 'vue' : file.endsWith('.html') ? 'angular' : 'jsx';

/** "@angular-eslint/template/alt-text" -> "angular-template/alt-text". */
export const normalizeRuleId = (ruleId: string): string =>
  ruleId.replace(/^@angular-eslint\/template\//, 'angular-template/');

const snippetOf = (text: string) => {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > 200 ? `${s.slice(0, 199)}…` : s;
};

const pascal = (s: string) =>
  s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

const contains = (node: AstNode, index: number, start: number, end: number) =>
  !!node && start <= index && index < end;

/** Innermost Vue template element containing `index`. */
function findVueElement(node: AstNode | undefined, index: number): AstNode | undefined {
  if (!node || !Array.isArray(node.range) || !contains(node, index, node.range[0], node.range[1]))
    return undefined;
  for (const child of (node.children ?? []) as AstNode[]) {
    const hit = findVueElement(child, index);
    if (hit) return hit;
  }
  return node.type === 'VElement' ? node : undefined;
}

/** Innermost Angular template element containing `index` (template-parser nodes use sourceSpan). */
function findAngularElement(nodes: readonly AstNode[], index: number): AstNode | undefined {
  for (const node of nodes) {
    const span = node.sourceSpan;
    if (!span || !contains(node, index, span.start.offset, span.end.offset)) continue;
    const inner = findAngularElement((node.children ?? []) as AstNode[], index);
    if (inner) return inner;
    if (typeof node.name === 'string' && Array.isArray(node.attributes)) return node;
  }
  return undefined;
}

interface Located {
  element?: ElementInfo;
  component?: string;
  snippet?: string;
}

function locate(sc: SourceCode, file: string, line: number, column: number): Located {
  let index: number;
  try {
    index = sc.getIndexFromLoc({ line, column: Math.max(0, column - 1) });
  } catch {
    return {};
  }
  const kind = kindOfFile(file);
  const ast = sc.ast as unknown as AstNode;
  if (kind === 'vue' && ast.templateBody) {
    const el = findVueElement(ast.templateBody, index);
    if (el) {
      const [s, e] = el.startTag.range as [number, number];
      return {
        element: fromVueElement(el),
        component: pascal(basename(file, '.vue')),
        snippet: snippetOf(sc.text.slice(s, e)),
      };
    }
  }
  if (kind === 'angular') {
    const el = findAngularElement((ast.templateNodes ?? []) as AstNode[], index);
    const name = pascal(basename(file, '.html'));
    if (!el) return { component: name };
    const span = el.startSourceSpan ?? el.sourceSpan;
    return {
      element: fromAngularElement(el),
      component: name,
      snippet: snippetOf(sc.text.slice(span.start.offset, span.end.offset)),
    };
  }
  let node = sc.getNodeByRangeIndex(index) as AstNode | null;
  if (node?.type === 'JSXElement') node = node.openingElement as AstNode;
  while (node && node.type !== 'JSXOpeningElement') node = node.parent ?? null;
  if (!node) return {};
  return {
    element: fromJsxOpeningElement(node),
    component: enclosingComponent(node),
    snippet: snippetOf(sc.text.slice(...(node.range as [number, number]))),
  };
}

/**
 * Lints one file's source in memory with our fixed config. No file system access, no config
 * lookup, inline `eslint-disable` comments ignored (a repo can't hide barriers from an audit).
 */
export function lintSource(
  linter: Linter,
  configs: Linter.Config[],
  code: string,
  file: string,
  root = '/repo',
): LintFileResult {
  const messages = linter.verify(code, configs, {
    filename: join(root, file),
    allowInlineConfig: false,
    reportUnusedDisableDirectives: false,
  });
  const fatal = messages.find((m) => m.fatal);
  if (fatal) return { messages: [], error: `${fatal.message} (line ${fatal.line})` };
  const sc = linter.getSourceCode();
  return {
    messages: messages
      .filter((m) => m.ruleId)
      .map((m) => ({
        file,
        lintRuleId: normalizeRuleId(m.ruleId as string),
        line: m.line,
        column: m.column,
        message: m.message,
        ...locate(sc, file, m.line, m.column),
      })),
  };
}

export interface LintRepoOptions {
  /** Pre-loaded Angular plugin (tests); otherwise loaded from the repo when trusted. */
  angular?: AngularPlugin;
}

export interface LintRepoResult {
  messages: LintMessage[];
  /** Files that could not be parsed. */
  errors: Array<{ file: string; message: string }>;
  /** Files linted, repo-relative. */
  files: string[];
  /** Coverage gaps worth telling the user about (skipped frameworks, file limits). */
  notices: string[];
}

const EXTENSIONS: Record<SourceKind, string[]> = {
  jsx: ['jsx', 'tsx', 'js'],
  vue: ['vue'],
  angular: ['html'],
};

/** Runs the accessibility lint layer over a repo's source files. Reads files; never runs repo code. */
export async function lintRepo(
  root: string,
  detection: RepoDetection,
  config: RepoConfig,
  options: LintRepoOptions = {},
): Promise<LintRepoResult> {
  const notices: string[] = [];
  const configs: Linter.Config[] = [];
  const kinds: SourceKind[] = [];
  if (detection.linters.includes('jsx')) {
    configs.push(...jsxConfig());
    kinds.push('jsx');
  }
  if (detection.linters.includes('vue')) {
    configs.push(...vueConfig());
    kinds.push('vue');
  }
  if (detection.linters.includes('angular')) {
    let ng = options.angular;
    if (!ng && config.trustRepoPlugins) {
      const loaded = await loadAngularPlugin(root);
      if (loaded.ok) ng = loaded.value;
      else notices.push(`Angular templates were not linted: ${loaded.reason}.`);
    } else if (!ng) {
      notices.push(
        'Angular templates were not linted: the Angular template rules must be loaded from the ' +
          "repo's own node_modules, which runs code from the repo. Set repo.trustRepoPlugins " +
          'to true in your config (or pass --trust-repo-plugins) for repos you trust.',
      );
    }
    if (ng) {
      configs.push(...angularConfig(ng));
      kinds.push('angular');
    }
  }
  for (const f of detection.unsupported)
    notices.push(`${f} components were not linted: the static layer has no ${f} rules yet.`);

  const dirs = config.include ?? detection.sourceDirs;
  const listed = await listSourceFiles(root, dirs, {
    extensions: kinds.flatMap((k) => EXTENSIONS[k]),
    exclude: config.exclude,
    maxFiles: config.maxFiles,
    maxFileBytes: config.maxFileBytes,
  });
  if (listed.truncated)
    notices.push(
      `Only the first ${config.maxFiles} source files were linted (repo.maxFiles); narrow repo.include to scan the rest.`,
    );
  if (listed.tooLarge.length)
    notices.push(
      `${listed.tooLarge.length} file(s) larger than ${config.maxFileBytes} bytes were skipped: ${listed.tooLarge.slice(0, 5).join(', ')}${listed.tooLarge.length > 5 ? ', …' : ''}.`,
    );

  const linter = new Linter({ configType: 'flat', cwd: root });
  const messages: LintMessage[] = [];
  const errors: LintRepoResult['errors'] = [];
  for (const file of listed.files) {
    const code = await readFile(join(root, file), 'utf-8');
    const r = lintSource(linter, configs, code, file, root);
    if (r.error) errors.push({ file, message: r.error });
    messages.push(...r.messages);
  }
  return { messages, errors, files: listed.files, notices };
}
