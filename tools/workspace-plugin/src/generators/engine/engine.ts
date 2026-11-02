import {
  formatFiles,
  generateFiles,
  installPackagesTask,
  offsetFromRoot,
  updateJson,
  type GeneratorCallback,
  type Tree,
} from '@nx/devkit';
import * as path from 'path';
import { nameVariants } from '../../utils/names';
import type { EngineGeneratorSchema } from './schema';

export function engineRoot(name: string) {
  return `packages/engines/${nameVariants(name).fileName}`;
}

export async function engineGenerator(
  tree: Tree,
  options: EngineGeneratorSchema,
): Promise<GeneratorCallback | void> {
  const { fileName, className } = nameVariants(options.name);
  const projectRoot = engineRoot(fileName);
  if (tree.exists(`${projectRoot}/package.json`)) {
    throw new Error(`Engine "${fileName}" already exists at ${projectRoot}.`);
  }

  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, {
    name: fileName,
    className,
    description: options.description ?? `Clear A11Y ${fileName} engine.`,
    offset: offsetFromRoot(projectRoot),
  });

  if (tree.exists('tsconfig.json')) {
    updateJson(tree, 'tsconfig.json', (json) => {
      json.references ??= [];
      const ref = `./${projectRoot}`;
      if (!json.references.some((r: { path: string }) => r.path === ref)) {
        json.references.push({ path: ref });
      }
      return json;
    });
  }

  await formatFiles(tree);
  if (!options.skipInstall) {
    return () => installPackagesTask(tree);
  }
}

export default engineGenerator;
