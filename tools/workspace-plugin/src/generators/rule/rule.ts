import { formatFiles, generateFiles, type Tree } from '@nx/devkit';
import * as path from 'path';
import { engineRoot } from '../engine/engine';
import { writeFixture } from '../fixture/fixture';
import { nameVariants, parseWcag } from '../../utils/names';
import type { RuleGeneratorSchema } from './schema';

const RULES_ARRAY = 'export const rules: RuleMeta[] = [';

/** Registers the rule in src/rules/index.ts so the engine and docs generator can find it. */
export function registerRule(source: string, propertyName: string, fileName: string): string {
  if (!source.includes(RULES_ARRAY)) {
    throw new Error(`Could not find "${RULES_ARRAY}" in src/rules/index.ts`);
  }
  const importLine = `import { ${propertyName}Rule } from './${fileName}.js';\n`;
  const withImport = source.replace(
    /(import type \{ RuleMeta \} from '@clear-a11y\/core';\n)/,
    `$1${importLine}`,
  );
  return withImport.replace(RULES_ARRAY, `${RULES_ARRAY}\n  ${propertyName}Rule,`);
}

export async function ruleGenerator(tree: Tree, options: RuleGeneratorSchema) {
  const engine = nameVariants(options.engine).fileName;
  const { fileName, className, propertyName } = nameVariants(options.name);
  const root = engineRoot(engine);
  if (!tree.exists(`${root}/package.json`)) {
    throw new Error(
      `Engine "${engine}" not found at ${root}. Create it with the engine generator first.`,
    );
  }
  const rulesDir = `${root}/src/rules`;
  if (tree.exists(`${rulesDir}/${fileName}.ts`)) {
    throw new Error(`Rule ${engine}/${fileName} already exists.`);
  }

  const wcag = parseWcag(options.wcag);
  if (wcag.length === 0) throw new Error('A rule needs at least one WCAG success criterion.');
  const ruleId = `${engine}/${fileName}`;
  const tier = options.tier ?? 'violation';
  const title = options.title ?? className.replace(/([a-z])([A-Z])/g, '$1 $2');
  const vars = { engine, fileName, className, propertyName, ruleId, wcag, tier, title };

  generateFiles(tree, path.join(__dirname, 'files', 'rule'), rulesDir, vars);
  generateFiles(tree, path.join(__dirname, 'files', 'doc'), `docs/rules/${engine}`, vars);

  const indexFile = `${rulesDir}/index.ts`;
  tree.write(indexFile, registerRule(tree.read(indexFile, 'utf-8') ?? '', propertyName, fileName));

  writeFixture(tree, {
    path: `${engine}/${fileName}`,
    title: `${title}: barrier`,
    wcag: wcag.join(','),
    layer: engine,
    ruleId,
  });
  writeFixture(tree, {
    path: `${engine}/${fileName}-ok`,
    title: `${title}: correct pattern`,
    correctPattern: true,
  });

  await formatFiles(tree);
}

export default ruleGenerator;
