import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'pathe';

import { parseResearchEvalCaseFromFile } from './parser';
import type {
  FileBackedResearchEvalCase,
  ResearchEvalCaseRoot,
} from './types';

const PROJECT_RESEARCH_EVAL_DIRS = ['.hakimi/evals', '.aitp/evals'] as const;
const USER_RESEARCH_EVAL_DIRS = ['evals', '.aitp/evals'] as const;
const MAX_SCAN_DEPTH = 12;

export interface ResearchEvalCasePathContext {
  readonly userHomeDir: string;
  readonly workDir: string;
}

export interface ResolveResearchEvalCaseRootsOptions {
  readonly paths: ResearchEvalCasePathContext;
  readonly explicitDirs?: readonly string[];
  readonly extraDirs?: readonly string[];
  readonly isDir?: (p: string) => Promise<boolean>;
  readonly realpath?: (p: string) => Promise<string>;
}

export interface DiscoverResearchEvalCasesOptions {
  readonly roots: readonly ResearchEvalCaseRoot[];
  readonly onWarning?: (message: string, cause?: unknown) => void;
  readonly readdir?: (p: string) => Promise<readonly string[]>;
  readonly isFile?: (p: string) => Promise<boolean>;
  readonly isDir?: (p: string) => Promise<boolean>;
  readonly parse?: typeof parseResearchEvalCaseFromFile;
}

export async function resolveResearchEvalCaseRoots(
  options: ResolveResearchEvalCaseRootsOptions,
): Promise<readonly ResearchEvalCaseRoot[]> {
  const isDir = options.isDir ?? defaultIsDir;
  const realpath =
    options.realpath ??
    ((p: string) => fs.realpath(p).then((resolved) => resolved.replaceAll('\\', '/')));
  const roots: ResearchEvalCaseRoot[] = [];
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
    for (const dir of PROJECT_RESEARCH_EVAL_DIRS) {
      await pushExistingRoot(roots, join(projectRoot, dir), 'project', isDir, realpath);
    }
    for (const dir of USER_RESEARCH_EVAL_DIRS) {
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

export async function discoverResearchEvalCases(
  options: DiscoverResearchEvalCasesOptions,
): Promise<readonly FileBackedResearchEvalCase[]> {
  const readdir = options.readdir ?? ((p: string) => fs.readdir(p));
  const isFile = options.isFile ?? defaultIsFile;
  const isDir = options.isDir ?? defaultIsDir;
  const parse = options.parse ?? parseResearchEvalCaseFromFile;
  const warn = options.onWarning ?? (() => {});
  const evalCases: FileBackedResearchEvalCase[] = [];

  async function walk(dir: string, root: ResearchEvalCaseRoot, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) return;
    let entries: readonly string[];
    try {
      entries = [...(await readdir(dir))].toSorted();
    } catch (error) {
      warn(`Failed to read research eval directory ${dir}`, error);
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
        evalCases.push(await parse({ path: fullPath, source: root.source }));
      } catch (error) {
        warn(`Failed to parse research eval case ${fullPath}`, error);
      }
    }
  }

  for (const root of options.roots) {
    await walk(root.path, root, 0);
  }
  return evalCases.toSorted((a, b) => a.evalCase.id.localeCompare(b.evalCase.id));
}

function resolveConfiguredDir(dir: string, projectRoot: string, userHomeDir: string): string {
  if (isAbsolute(dir)) return dir;
  if (dir.startsWith('~/')) return join(userHomeDir, dir.slice(2));
  return join(projectRoot, dir);
}

async function pushExistingRoot(
  roots: ResearchEvalCaseRoot[],
  rootPath: string,
  source: ResearchEvalCaseRoot['source'],
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
