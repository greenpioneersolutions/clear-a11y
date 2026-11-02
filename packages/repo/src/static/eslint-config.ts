import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ESLint, Linter } from 'eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import vueA11y from 'eslint-plugin-vuejs-accessibility';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { enabledRules, type LintPlugin } from './rule-map.js';

/**
 * Our own, fixed lint configuration. It is built from flat-config objects in code: the scanned
 * repo's eslint.config.*, .eslintrc*, package.json "eslintConfig" and inline comments are never
 * read, so a repo cannot add plugins, parsers or rules (which would run its code).
 */

/**
 * Options that differ from the plugin's recommended ones, to avoid flagging correct patterns.
 * vuejs-accessibility/label-has-for defaults to requiring BOTH nesting and for/id; either one
 * associates the label (WCAG 1.3.1 Technique H44), so we accept either.
 */
export const RULE_OPTION_OVERRIDES: Readonly<Record<string, unknown[]>> = {
  'vuejs-accessibility/label-has-for': [{ required: { some: ['nesting', 'id'] } }],
};

/** Recommended settings (options included) for the rules we enable from a plugin. */
function ruleSettings(
  plugin: LintPlugin,
  recommended: Partial<Linter.RulesRecord>,
  prefix: string = plugin,
): Linter.RulesRecord {
  return Object.fromEntries(
    enabledRules(plugin).map((id) => {
      const name = `${prefix}/${id.slice(plugin.length + 1)}`;
      const setting = recommended[name];
      const override = RULE_OPTION_OVERRIDES[id];
      // Keep the plugin's recommended options, but always as an error so every hit is reported.
      if (override) return [name, ['error', ...override]];
      return [name, Array.isArray(setting) ? ['error', ...setting.slice(1)] : 'error'];
    }),
  );
}

const jsxLanguageOptions: Linter.LanguageOptions = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  // typescript-eslint's parser without `project`: no type information is needed for a11y rules,
  // and the repo's tsconfig is never loaded.
  parser: tseslint.parser as Linter.Parser,
  parserOptions: { ecmaFeatures: { jsx: true } },
};

/** JSX/TSX (React, Preact, Next, CRA). */
export function jsxConfig(): Linter.Config[] {
  return [
    {
      name: 'clear-a11y/jsx-a11y',
      files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
      plugins: { 'jsx-a11y': jsxA11y },
      languageOptions: jsxLanguageOptions,
      rules: ruleSettings('jsx-a11y', jsxA11y.flatConfigs.recommended.rules ?? {}),
    },
  ];
}

const vueRecommended = (vueA11y.configs['flat/recommended'] as Linter.Config[]).reduce<
  Partial<Linter.RulesRecord>
>((acc, c) => ({ ...acc, ...c.rules }), {});

/** Vue single-file components. */
export function vueConfig(): Linter.Config[] {
  return [
    {
      name: 'clear-a11y/vuejs-accessibility',
      files: ['**/*.vue'],
      plugins: { 'vuejs-accessibility': vueA11y as unknown as ESLint.Plugin },
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parser: vueParser as unknown as Linter.Parser,
        parserOptions: { parser: tseslint.parser, ecmaFeatures: { jsx: true } },
      },
      rules: ruleSettings('vuejs-accessibility', vueRecommended),
    },
  ];
}

/** Angular template plugin loaded from the scanned repo (see `loadAngularPlugin`). */
export interface AngularPlugin {
  plugin: ESLint.Plugin;
  parser: Linter.Parser;
  /** Where they were loaded from (for the scan log). */
  from: string;
}

/** Angular component templates (*.html). */
export function angularConfig(ng: AngularPlugin): Linter.Config[] {
  const available = Object.keys(ng.plugin.rules ?? {});
  const rules = Object.fromEntries(
    Object.entries(ruleSettings('angular-template', {}, '@angular-eslint/template')).filter(
      ([name]) => available.includes(name.slice('@angular-eslint/template/'.length)),
    ),
  );
  return [
    {
      name: 'clear-a11y/angular-template',
      files: ['**/*.html'],
      plugins: { '@angular-eslint/template': ng.plugin },
      languageOptions: { parser: ng.parser },
      rules,
    },
  ];
}

export type AngularLoadResult = { ok: true; value: AngularPlugin } | { ok: false; reason: string };

const unwrap = <T>(mod: unknown): T =>
  ((mod as { default?: unknown }).default ?? mod) as unknown as T;

/**
 * Loads @angular-eslint/eslint-plugin-template and @angular-eslint/template-parser from the
 * scanned repo's node_modules. This executes code installed in that repo, so callers only do it
 * when the user opted in (`repo.trustRepoPlugins`). Never throws: returns a reason instead.
 */
export async function loadAngularPlugin(root: string): Promise<AngularLoadResult> {
  const req = createRequire(join(root, 'package.json'));
  let pluginPath: string;
  let parserPath: string;
  try {
    pluginPath = req.resolve('@angular-eslint/eslint-plugin-template');
    parserPath = req.resolve('@angular-eslint/template-parser');
  } catch {
    return {
      ok: false,
      reason:
        "@angular-eslint/eslint-plugin-template and @angular-eslint/template-parser are not installed in the repo's node_modules",
    };
  }
  try {
    const plugin = unwrap<ESLint.Plugin>(await import(pathToFileURL(pluginPath).href));
    const parser = unwrap<Linter.Parser>(await import(pathToFileURL(parserPath).href));
    if (!plugin?.rules) return { ok: false, reason: `${pluginPath} does not export ESLint rules` };
    return { ok: true, value: { plugin, parser, from: pluginPath } };
  } catch (err) {
    return {
      ok: false,
      reason: `could not load the Angular template plugin: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
