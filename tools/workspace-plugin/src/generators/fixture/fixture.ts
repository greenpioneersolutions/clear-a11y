import { formatFiles, generateFiles, names, writeJson, type Tree } from '@nx/devkit';
import * as path from 'path';
import { parseWcag } from '../../utils/names';
import type { FixtureGeneratorSchema } from './schema';

export const SITE_DIR = 'fixtures/site';
export const EXPECTED_DIR = 'fixtures/expected';

export interface ExpectedIssue {
  id: string;
  wcag: string[];
  selector: string;
  layer: string;
  description: string;
  ruleId?: string;
}

export interface ExpectedPage {
  page: string;
  title: string;
  correctPattern: boolean;
  issues: ExpectedIssue[];
}

/** Writes the page and its expected-findings file without formatting (used by the rule generator). */
export function writeFixture(tree: Tree, options: FixtureGeneratorSchema): ExpectedPage {
  const pagePath = options.path.replace(/\.html$/, '');
  const htmlFile = `${SITE_DIR}/${pagePath}.html`;
  if (tree.exists(htmlFile)) {
    throw new Error(`Fixture ${htmlFile} already exists.`);
  }
  const correctPattern = options.correctPattern ?? false;
  const wcag = parseWcag(options.wcag);
  const title =
    options.title ?? names(path.basename(pagePath)).className.replace(/([a-z])([A-Z])/g, '$1 $2');
  const description = options.description ?? 'TODO: describe what a human auditor would log.';

  generateFiles(tree, path.join(__dirname, 'files'), path.dirname(htmlFile), {
    page: path.basename(pagePath),
    title,
    correctPattern,
    description,
    wcag,
    pagePath,
  });
  tree.rename(`${path.dirname(htmlFile)}/page.html`, htmlFile);

  const expected: ExpectedPage = {
    page: `${pagePath}.html`,
    title,
    correctPattern,
    issues: correctPattern
      ? []
      : [
          {
            id: `${pagePath}#1`,
            wcag,
            selector: 'TODO',
            layer: options.layer ?? 'TODO',
            description,
            ...(options.ruleId ? { ruleId: options.ruleId } : {}),
          },
        ],
  };
  writeJson(tree, `${EXPECTED_DIR}/${pagePath}.json`, expected);
  return expected;
}

export async function fixtureGenerator(tree: Tree, options: FixtureGeneratorSchema) {
  writeFixture(tree, options);
  await formatFiles(tree);
}

export default fixtureGenerator;
