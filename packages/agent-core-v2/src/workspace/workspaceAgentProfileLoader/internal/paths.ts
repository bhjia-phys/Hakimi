/**
 * `workspaceAgentProfileLoader` domain — shared path primitives for agent-file
 * discovery.
 *
 * `~` expansion, base-relative resolution, and `hostFs` type probes. Callers
 * pick the resolution base: discovery roots resolve against the
 * project root, explicit files against the session workDir. Pure helpers; no
 * scoped state.
 */

import { isAbsolute, join, resolve } from 'pathe';

import type { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { HostFsError, OsFsErrors } from '#/os/interface/hostFsErrors';

export function resolveAgentPath(path: string, baseDir: string, osHomeDir: string): string {
  if (path === '~') return osHomeDir;
  if (path.startsWith('~/')) return join(osHomeDir, path.slice(2));
  if (isAbsolute(path)) return path;
  return resolve(baseDir, path);
}

/**
 * Session-dir directory holding the per-session explicit agent files: the
 * session lifecycle copies the caller's `--agent-file` contents here at
 * create time, and the explicit-file source loads them from this copy (never
 * from the original paths) so a resumed session keeps the files it was
 * created with — the same snapshot semantics v1 gets from its persisted
 * catalog snapshot.
 */
export const SESSION_EXPLICIT_AGENT_FILES_DIR = 'agent-files';

export async function isDirectoryPath(fs: IHostFileSystem, p: string): Promise<boolean> {
  try {
    const resolved = await fs.realpath(p);
    return (await fs.stat(resolved)).isDirectory;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

export async function isFilePath(fs: IHostFileSystem, p: string): Promise<boolean> {
  try {
    const resolved = await fs.realpath(p);
    return (await fs.stat(resolved)).isFile;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

export async function pathExists(fs: IHostFileSystem, p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

export function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof HostFsError &&
    (error.code === OsFsErrors.codes.OS_FS_NOT_FOUND ||
      error.code === OsFsErrors.codes.OS_FS_NOT_DIRECTORY)
  );
}
