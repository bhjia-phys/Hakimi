import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawnSync } from 'node:child_process';

import { isWSL, type ReadTextFile } from '#/utils/platform';

const WSLINFO_TIMEOUT_MS = 1_000;

export interface WslNetworkDeps {
  env?: NodeJS.ProcessEnv;
  readFile?: ReadTextFile;
  readNetworkingMode?: () => string | undefined;
  interfaces?: ReturnType<typeof networkInterfaces>;
}

const readTextFile: ReadTextFile = (path) => readFileSync(path, 'utf8');

export function readWslNetworkingMode(): string | undefined {
  const result = spawnSync('wslinfo', ['--networking-mode'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: WSLINFO_TIMEOUT_MS,
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  const mode = result.stdout.trim().toLowerCase();
  return mode === '' ? undefined : mode;
}

export function parseDefaultRouteInterface(routeTable: string): string | undefined {
  for (const line of routeTable.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 4 || columns[1] !== '00000000') continue;
    const flags = Number.parseInt(columns[3] ?? '', 16);
    if (Number.isFinite(flags) && (flags & 0x1) !== 0) return columns[0];
  }
  return undefined;
}

/**
 * Resolve the WSL VM address that a Windows browser can reach directly.
 *
 * Only a definitive `wslinfo --networking-mode=nat` result is eligible.
 * Mirrored/bridged/WSL1 networking and older WSL releases without `wslinfo`
 * keep the loopback default rather than risk exposing a mirrored LAN address.
 */
export function resolveWslNatHost(deps: WslNetworkDeps = {}): string | undefined {
  const env = deps.env ?? process.env;
  const readFile = deps.readFile ?? readTextFile;
  if (!isWSL(env, readFile)) return undefined;

  const mode = (deps.readNetworkingMode ?? readWslNetworkingMode)();
  if (mode?.trim().toLowerCase() !== 'nat') return undefined;

  let defaultInterface: string | undefined;
  try {
    defaultInterface = parseDefaultRouteInterface(readFile('/proc/net/route'));
  } catch {
    return undefined;
  }
  if (defaultInterface === undefined) return undefined;

  const interfaces = deps.interfaces ?? networkInterfaces();
  return interfaces[defaultInterface]?.find(
    (info) => info.family === 'IPv4' && !info.internal,
  )?.address;
}
