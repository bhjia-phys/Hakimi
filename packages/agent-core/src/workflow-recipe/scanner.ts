import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'pathe';

import { parseWorkflowRecipeFromFile } from './parser';
import type { WorkflowRecipe, WorkflowRecipeRoot } from './types';

const PROJECT_WORKFLOW_RECIPE_DIRS = ['.aitp/workflow-recipes'] as const;
const USER_WORKFLOW_RECIPE_DIRS = ['.aitp/workflow-recipes'] as const;
const MAX_SCAN_DEPTH = 12;

export interface WorkflowRecipePathContext {
  readonly userHomeDir: string;
  readonly workDir: string;
}

export interface ResolveWorkflowRecipeRootsOptions {
  readonly paths: WorkflowRecipePathContext;
  readonly explicitDirs?: readonly string[];
  readonly extraDirs?: readonly string[];
  readonly isDir?: (p: string) => Promise<boolean>;
  readonly realpath?: (p: string) => Promise<string>;
}

export interface DiscoverWorkflowRecipesOptions {
  readonly roots: readonly WorkflowRecipeRoot[];
  readonly onWarning?: (message: string, cause?: unknown) => void;
  readonly readdir?: (p: string) => Promise<readonly string[]>;
  readonly isFile?: (p: string) => Promise<boolean>;
  readonly isDir?: (p: string) => Promise<boolean>;
  readonly parse?: typeof parseWorkflowRecipeFromFile;
}

export async function resolveWorkflowRecipeRoots(
  options: ResolveWorkflowRecipeRootsOptions,
): Promise<readonly WorkflowRecipeRoot[]> {
  const isDir = options.isDir ?? defaultIsDir;
  const realpath =
    options.realpath ??
    ((p: string) => fs.realpath(p).then((resolved) => resolved.replaceAll('\\', '/')));
  const roots: WorkflowRecipeRoot[] = [];
  const projectRoot = await findProjectRoot(options.paths.workDir);

  if (options.explicitDirs !== undefined && options.explicitDirs.length > 0) {
    for (const dir of options.explicitDirs) {
      await pushExistingRoot(
        roots,
        resolveConfiguredDir(dir, projectRoot, options.paths.userHomeDir),
        'user',
        isDir,
        realpath,
      );
    }
  } else {
    for (const dir of PROJECT_WORKFLOW_RECIPE_DIRS) {
      await pushExistingRoot(roots, join(projectRoot, dir), 'project', isDir, realpath);
    }
    for (const dir of USER_WORKFLOW_RECIPE_DIRS) {
      await pushExistingRoot(roots, join(options.paths.userHomeDir, dir), 'user', isDir, realpath);
    }
  }

  for (const dir of options.extraDirs ?? []) {
    await pushExistingRoot(
      roots,
      resolveConfiguredDir(dir, projectRoot, options.paths.userHomeDir),
      'extra',
      isDir,
      realpath,
    );
  }
  return roots;
}

export async function discoverWorkflowRecipes(
  options: DiscoverWorkflowRecipesOptions,
): Promise<readonly WorkflowRecipe[]> {
  const readdir = options.readdir ?? ((p: string) => fs.readdir(p));
  const isFile = options.isFile ?? defaultIsFile;
  const isDir = options.isDir ?? defaultIsDir;
  const parse = options.parse ?? parseWorkflowRecipeFromFile;
  const warn = options.onWarning ?? (() => {});
  const recipes: WorkflowRecipe[] = [];

  async function walk(dir: string, root: WorkflowRecipeRoot, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) return;
    let entries: readonly string[];
    try {
      entries = [...(await readdir(dir))].toSorted();
    } catch (error) {
      warn(`Failed to read workflow recipe directory ${dir}`, error);
      return;
    }

    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const fullPath = join(dir, entry);
      if (await isDir(fullPath)) {
        await walk(fullPath, root, depth + 1);
        continue;
      }
      if (!entry.endsWith('.md') || !(await isFile(fullPath))) continue;
      try {
        recipes.push(await parse({ path: fullPath, source: root.source }));
      } catch (error) {
        warn(`Failed to parse workflow recipe ${fullPath}`, error);
      }
    }
  }

  for (const root of options.roots) {
    await walk(root.path, root, 0);
  }
  return recipes.toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
}

function resolveConfiguredDir(dir: string, projectRoot: string, userHomeDir: string): string {
  if (isAbsolute(dir)) return dir;
  if (dir.startsWith('~/')) return join(userHomeDir, dir.slice(2));
  return join(projectRoot, dir);
}

async function pushExistingRoot(
  roots: WorkflowRecipeRoot[],
  rootPath: string,
  source: WorkflowRecipeRoot['source'],
  isDir: (p: string) => Promise<boolean>,
  realpath: (p: string) => Promise<string>,
): Promise<void> {
  if (!(await isDir(rootPath))) return;
  const resolved = await realpath(rootPath);
  if (roots.some((root) => root.path === resolved)) return;
  roots.push({ path: resolved, source });
}

async function findProjectRoot(workDir: string): Promise<string> {
  let current = resolve(workDir);
  for (;;) {
    if (await defaultIsDir(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(workDir);
    current = parent;
  }
}

async function defaultIsFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

async function defaultIsDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
