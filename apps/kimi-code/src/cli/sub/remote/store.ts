/**
 * Persistent state for the standalone `hakimi remote` service.
 *
 * Owned by the CLI, living under `<HAKIMI_HOME>/remote/`:
 *
 *   - `config.json` — schema version, home dir, the absolute cloudflared
 *     executable, and the FIXED 256-bit bearer token. The token is minted once
 *     on the first `remote start` and never rotated: every later start/restart
 *     reuses it, so bookmarked access links keep working across reboots. The
 *     Quick Tunnel origin still changes whenever cloudflared restarts.
 *   - `state.json` — the CURRENT serve process: PID, local port, the random
 *     trycloudflare origin, and the start timestamp. Updated atomically by the
 *     serve process and only ever removed by the PID that wrote it, so a dying
 *     old process can never delete a newer process's state.
 *
 * Both files are private: the directory is `0700` and the files `0600`, written
 * via a same-directory temp file (fsync'd) + atomic rename. Reads validate
 * group/other bits and the zod schema; a file the schema does not yet cover
 * (wrong version, unexpected fields) fails loudly instead of being silently
 * reinterpreted.
 */

import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { z } from 'zod';

import { createRemoteToken } from './tunnel';

export const REMOTE_DIR_NAME = 'remote';
export const REMOTE_CONFIG_FILE_NAME = 'config.json';
export const REMOTE_STATE_FILE_NAME = 'state.json';

/**
 * `config.json` schema. `version` gates future migrations — a file with a
 * different schema version is refused, never re-read with wrong semantics.
 */
export const RemoteConfigSchema = z
  .object({
    version: z.literal(1),
    /** Absolute Hakimi data directory the serve process must use. */
    homeDir: z.string().min(1),
    /** Absolute cloudflared executable resolved at `start` time. */
    cloudflaredPath: z.string().min(1),
    /** Fixed 256-bit bearer token (base64url of 32 random bytes). */
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  })
  .strict();
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

/** `state.json` schema — live serve-process facts for `status`/`start`. */
export const RemoteStateSchema = z
  .object({
    version: z.literal(1),
    pid: z.number().int().positive(),
    port: z.number().int().positive(),
    /** Random Quick Tunnel origin, e.g. `https://abc-123.trycloudflare.com`. */
    origin: z.string().url(),
    /** Epoch milliseconds recorded by the serve process when it became ready. */
    startedAt: z.number().int().positive(),
  })
  .strict();
export type RemoteState = z.infer<typeof RemoteStateSchema>;

export function remoteDir(homeDir: string): string {
  return join(homeDir, REMOTE_DIR_NAME);
}

export function remoteConfigPath(homeDir: string): string {
  return join(remoteDir(homeDir), REMOTE_CONFIG_FILE_NAME);
}

export function remoteStatePath(homeDir: string): string {
  return join(remoteDir(homeDir), REMOTE_STATE_FILE_NAME);
}

/** Create (and normalize to `0700`) the remote state directory. */
export function ensurePrivateRemoteDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
}

function assertPrivateFile(filePath: string): void {
  const stat = statSync(filePath);
  if (!stat.isFile()) throw new Error(`not a regular file: ${filePath}`);
  // Group/other read/write bits make a credential file readable by other local
  // users — refuse to consume it.
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      `refusing to read ${filePath}: permissions ${stat.mode.toString(8)} are too open (expected 0600)`,
    );
  }
}

/**
 * Atomically write a private JSON file: temp file in the same directory,
 * written `0600`, fsync'd, then renamed over the target, then the directory
 * fsync'd so the rename survives a crash.
 */
export function writePrivateJsonFile(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  ensurePrivateRemoteDir(dir);
  const tmpPath = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  let wrote = false;
  try {
    const fd = openSync(tmpPath, 'w', 0o600);
    try {
      writeSync(fd, `${JSON.stringify(data, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // openSync's mode is umask-masked; force 0600 on the final inode regardless.
    chmodSync(tmpPath, 0o600);
    renameSync(tmpPath, filePath);
    wrote = true;
    const dirFd = openSync(dir, 'r');
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } finally {
    if (!wrote) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort temp cleanup.
      }
    }
  }
}

/**
 * Read a private JSON file and validate it. Returns `undefined` when the file
 * does not exist; throws when it exists but has unsafe permissions, is not
 * valid JSON, or fails the schema.
 */
export function readPrivateJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
): T | undefined {
  let raw: string;
  try {
    assertPrivateFile(filePath);
    raw = readFileSync(filePath, 'utf-8');
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
  const parsed = schema.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid remote state file ${filePath}: ${details}`);
  }
  return parsed.data;
}

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT';
}

export interface LoadOrCreateRemoteConfigDeps {
  readonly generateToken?: () => string;
}

/**
 * Load the existing config or create it on first use. The fixed token is
 * NEVER rotated: an existing config keeps its token while `homeDir` /
 * `cloudflaredPath` are refreshed — and any such change is persisted back
 * atomically (same private-write path as creation) so later `serve` runs read
 * the same values the `start` command resolved.
 */
export function loadOrCreateRemoteConfig(
  homeDir: string,
  cloudflaredPath: string,
  deps: LoadOrCreateRemoteConfigDeps = {},
): { config: RemoteConfig; created: boolean } {
  const path = remoteConfigPath(homeDir);
  const existing = readPrivateJsonFile(path, RemoteConfigSchema);
  if (existing !== undefined) {
    const config: RemoteConfig = { ...existing, homeDir, cloudflaredPath };
    if (config.homeDir !== existing.homeDir || config.cloudflaredPath !== existing.cloudflaredPath) {
      writePrivateJsonFile(path, config);
    }
    return { config, created: false };
  }
  const config: RemoteConfig = {
    version: 1,
    homeDir,
    cloudflaredPath,
    token: (deps.generateToken ?? createRemoteToken)(),
  };
  writePrivateJsonFile(path, config);
  return { config, created: true };
}