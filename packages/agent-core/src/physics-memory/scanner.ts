import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'pathe';

import { parsePhysicsCapsuleFromFile } from './parser';
import type { PhysicsCapsule, PhysicsMemoryRoot } from './types';

const PROJECT_MEMORY_DIRS = ['.hakimi/physics-memory', '.aitp/physics-memory'] as const;
const USER_MEMORY_DIRS = ['physics-memory', '.aitp/physics-memory'] as const;
const MAX_SCAN_DEPTH = 12;

export interface PhysicsMemoryPathContext {
  readonly userHomeDir: string;
  readonly workDir: string;
}

export interface ResolvePhysicsMemoryRootsOptions {
  readonly paths: PhysicsMemoryPathContext;
  readonly explicitDirs?: readonly string[];
  readonly extraDirs?: readonly string[];
  readonly isDir?: (p: string) => Promise<boolean>;
  readonly realpath?: (p: string) => Promise<string>;
}

export interface DiscoverPhysicsCapsulesOptions {
  readonly roots: readonly PhysicsMemoryRoot[];
  readonly onWarning?: (message: string, cause?: unknown) => void;
  readonly readdir?: (p: string) => Promise<readonly string[]>;
  readonly isFile?: (p: string) => Promise<boolean>;
  readonly isDir?: (p: string) => Promise<boolean>;
  readonly parse?: typeof parsePhysicsCapsuleFromFile;
}

export async function resolvePhysicsMemoryRoots(
  options: ResolvePhysicsMemoryRootsOptions,
): Promise<readonly PhysicsMemoryRoot[]> {
  const isDir = options.isDir ?? defaultIsDir;
  const realpath =
    options.realpath ??
    ((p: string) => fs.realpath(p).then((resolved) => resolved.replaceAll('\\', '/')));
  const roots: PhysicsMemoryRoot[] = [];
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
    for (const dir of PROJECT_MEMORY_DIRS) {
      await pushExistingRoot(roots, join(projectRoot, dir), 'project', isDir, realpath);
    }
    for (const dir of USER_MEMORY_DIRS) {
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

export async function discoverPhysicsCapsules(
  options: DiscoverPhysicsCapsulesOptions,
): Promise<readonly PhysicsCapsule[]> {
  const readdir = options.readdir ?? ((p: string) => fs.readdir(p));
  const isFile = options.isFile ?? defaultIsFile;
  const isDir = options.isDir ?? defaultIsDir;
  const parse = options.parse ?? parsePhysicsCapsuleFromFile;
  const warn = options.onWarning ?? (() => {});
  const capsules: PhysicsCapsule[] = [];

  async function walk(dir: string, root: PhysicsMemoryRoot, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) return;
    let entries: readonly string[];
    try {
      entries = [...(await readdir(dir))].toSorted();
    } catch (error) {
      warn(`Failed to read physics memory directory ${dir}`, error);
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
        capsules.push(await parse({ path: fullPath, source: root.source }));
      } catch (error) {
        warn(`Failed to parse physics capsule ${fullPath}`, error);
      }
    }
  }

  for (const root of options.roots) {
    await walk(root.path, root, 0);
  }
  return capsules.toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
}

function resolveConfiguredDir(dir: string, projectRoot: string, userHomeDir: string): string {
  if (isAbsolute(dir)) return dir;
  if (dir.startsWith('~/')) return join(userHomeDir, dir.slice(2));
  return join(projectRoot, dir);
}

async function pushExistingRoot(
  roots: PhysicsMemoryRoot[],
  rootPath: string,
  source: PhysicsMemoryRoot['source'],
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
