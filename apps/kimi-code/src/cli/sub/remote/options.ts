import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import type { ServerLogLevel } from '@moonshot-ai/kap-server';

import { DEFAULT_SERVER_PORT, parseLogLevel, parsePort } from '#/cli/sub/web/shared';
import { resolveCommandPath } from '#/utils/process/resolve-command';

export const CLOUDFLARED_PATH_ENV = 'KIMI_CODE_CLOUDFLARED_PATH';
export const DEFAULT_REMOTE_TTL = '8h';
export const DEFAULT_REMOTE_TTL_MS = 8 * 60 * 60 * 1_000;

const TTL_PATTERN = /^([1-9]\d*)(s|m|h|d)$/;
const TTL_UNIT_MS = {
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
} as const;
const MAX_REMOTE_TTL_MS = 24 * 60 * 60 * 1_000;

export interface RemoteCliOptions {
  readonly session?: string;
  readonly port?: string;
  readonly ttl?: string;
  readonly cloudflared?: string;
  readonly logLevel?: string;
}

export interface ParsedRemoteOptions {
  readonly sessionId: string;
  readonly port: number;
  readonly ttlMs: number;
  readonly cloudflaredPath?: string;
  readonly logLevel: ServerLogLevel;
}

export function parseRemoteOptions(opts: RemoteCliOptions): ParsedRemoteOptions {
  const sessionId = opts.session?.trim();
  if (sessionId === undefined || sessionId.length === 0) {
    throw new Error('error: --session <id> is required');
  }

  return {
    sessionId,
    port: parsePort(opts.port, '--port', DEFAULT_SERVER_PORT),
    ttlMs: parseRemoteTtl(opts.ttl),
    cloudflaredPath: parseCloudflaredOption(opts.cloudflared),
    logLevel: parseLogLevel(opts.logLevel ?? 'silent'),
  };
}

export function parseRemoteTtl(raw: string | undefined): number {
  const value = raw ?? DEFAULT_REMOTE_TTL;
  const match = TTL_PATTERN.exec(value);
  if (match === null) {
    throw new Error(
      `error: invalid --ttl value: ${value} (expected a positive duration such as 30m, 1h, or 1d)`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof TTL_UNIT_MS;
  const ttlMs = amount * TTL_UNIT_MS[unit];
  if (!Number.isSafeInteger(ttlMs) || ttlMs > MAX_REMOTE_TTL_MS) {
    throw new Error(`error: invalid --ttl value: ${value} (maximum supported duration is 24h)`);
  }
  return ttlMs;
}

export function parseCloudflaredOption(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw.length === 0 || !isAbsolute(raw)) {
    throw new Error('error: --cloudflared must be an absolute executable path');
  }
  return raw;
}

export interface CloudflaredResolutionDeps {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly resolveFromPath?: (command: string, cwd: string) => string | undefined;
  readonly isExecutable?: (path: string) => boolean;
}

export function resolveCloudflaredPath(
  explicitPath: string | undefined,
  deps: CloudflaredResolutionDeps = {},
): string {
  const env = deps.env ?? process.env;
  const cwd = deps.cwd ?? process.cwd();
  const resolveFromPath = deps.resolveFromPath ?? resolveCommandPath;
  const isExecutable = deps.isExecutable ?? isExecutableFile;

  if (explicitPath !== undefined) {
    return requireAbsoluteExecutable(explicitPath, '--cloudflared', isExecutable);
  }

  const envPath = env[CLOUDFLARED_PATH_ENV];
  if (envPath !== undefined && envPath.length > 0) {
    return requireAbsoluteExecutable(envPath, CLOUDFLARED_PATH_ENV, isExecutable);
  }

  const pathHit = resolveFromPath('cloudflared', cwd);
  if (pathHit !== undefined) return pathHit;

  throw new Error(cloudflaredInstallMessage());
}

export function cloudflaredInstallMessage(): string {
  return [
    'cloudflared was not found; Hakimi will not download it automatically.',
    'Install the official Cloudflare binary:',
    'https://developers.cloudflare.com/tunnel/downloads/',
    'Cloudflare Quick Tunnels are subject to Cloudflare terms:',
    'https://www.cloudflare.com/website-terms/',
  ].join('\n');
}

function requireAbsoluteExecutable(
  path: string,
  source: string,
  isExecutable: (path: string) => boolean,
): string {
  if (!isAbsolute(path)) {
    throw new Error(`${source} must contain an absolute executable path`);
  }
  if (!isExecutable(path)) {
    throw new Error(`cloudflared is not an executable file: ${path}`);
  }
  return path;
}


function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== 'win32') accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
