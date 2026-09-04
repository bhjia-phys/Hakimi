/**
 * Linux user-level background service management for `hakimi remote`.
 *
 * A single systemd *user* unit (`~/.config/systemd/user/hakimi-remote.service`)
 * runs the hidden `remote serve --config <path>` entry: log-in auto-start via
 * `WantedBy=default.target`, `Restart=on-failure` with a bounded `RestartSec`
 * so a cloudflared hiccup or a crash brings the whole combo (server + tunnel)
 * back with a fresh random Quick Tunnel origin, and `network-online.target`
 * ordering so the tunnel only starts once networking is up.
 *
 * ExecStart is rendered from the current Hakimi launch vector (Node bundle:
 * `node <packageRoot>/dist/main.mjs`; native SEA: the running binary) so the
 * unit always restarts the exact same CLI. Arguments go through systemd's
 * ExecStart quoting rules (spaces/specials double-quoted, `%` doubled at the
 * unit-file level).
 */

import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const REMOTE_SERVICE_NAME = 'hakimi-remote.service';
export const REMOTE_SERVICE_DESCRIPTION = 'Hakimi persistent remote control (Quick Tunnel)';
export const DEFAULT_RESTART_SECONDS = '2s';

export interface SystemdDeps {
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly xdgConfigHome?: string;
}

export function userSystemdDir(deps: SystemdDeps = {}): string {
  const base =
    deps.xdgConfigHome ??
    process.env['XDG_CONFIG_HOME'] ??
    join(deps.homeDir ?? homedir(), '.config');
  return join(base, 'systemd', 'user');
}

export function remoteUnitPath(deps: SystemdDeps = {}): string {
  return join(userSystemdDir(deps), REMOTE_SERVICE_NAME);
}

/**
 * Escape one ExecStart argument per systemd.syntax(5). Plain safe characters
 * pass through; anything else is double-quoted with `\`-escaped `"`, `\`, `$`
 * and backtick. `%` is NOT escaped here — it is a *command-line* character and
 * only needs doubling at the unit-file value level (see `renderRemoteUnit`).
 */
export function quoteSystemdArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (/^[A-Za-z0-9_./:=@%+-]+$/u.test(arg)) return arg;
  return `"${arg.replaceAll(/(["\\$`])/gu, '\\$1')}"`;
}

/** Render the systemd user unit for the remote serve entry. */
export function renderRemoteUnit(execStartArgs: readonly string[], restartSec = DEFAULT_RESTART_SECONDS): string {
  const quoted = execStartArgs.map(quoteSystemdArg).join(' ');
  // At the unit-file level a literal `%` must be written `%%` (specifier
  // escape); systemd re-expands the `%%` back to `%` before ExecStart parsing.
  const escaped = quoted.replaceAll('%', '%%');
  return [
    '[Unit]',
    `Description=${REMOTE_SERVICE_DESCRIPTION}`,
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    `ExecStart=${escaped}`,
    'Restart=on-failure',
    `RestartSec=${restartSec}`,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

/** Write the unit file (directory `0700`, file `0600`). */
export function writeRemoteUnit(unitPath: string, content: string): void {
  mkdirSync(dirname(unitPath), { recursive: true, mode: 0o700 });
  writeFileSync(unitPath, content, { mode: 0o600 });
  chmodSync(unitPath, 0o600);
}

/** Structured result of one `systemctl --user …` invocation. */
export interface SystemctlResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SystemctlRunnerDeps {
  readonly systemctlPath?: string;
  readonly execFileFn?: typeof execFile;
  readonly timeoutMs?: number;
}

const DEFAULT_SYSTEMCTL_TIMEOUT_MS = 30_000;

/**
 * Run `systemctl --user <args>` and never throw: spawn errors (missing
 * systemctl, no bus) and non-zero exits all come back as a structured result
 * so callers can tell "unsupported" from "command failed".
 */
export function createSystemctlRunner(deps: SystemctlRunnerDeps = {}): (args: readonly string[]) => Promise<SystemctlResult> {
  const exec = deps.execFileFn ?? execFile;
  const systemctlPath = deps.systemctlPath ?? 'systemctl';
  const defaultTimeout = deps.timeoutMs ?? DEFAULT_SYSTEMCTL_TIMEOUT_MS;
  return (args: readonly string[]) =>
    new Promise<SystemctlResult>((resolve) => {
      exec(
        systemctlPath,
        ['--user', ...args],
        {
          encoding: 'utf-8',
          timeout: defaultTimeout,
          env: { ...process.env, SYSTEMD_COLORS: '0' },
        },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) });
            return;
          }
          const err = error as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
            killed?: boolean;
          };
          const code = typeof err.code === 'number' ? err.code : 1;
          resolve({
            code,
            stdout: String(err.stdout ?? (stdout as string) ?? ''),
            stderr: String(err.stderr ?? stderr ?? err.message),
          });
        },
      );
    });
}

export type SystemctlRunner = ReturnType<typeof createSystemctlRunner>;

/**
 * True when a usable systemd *user* instance exists. `is-system-running`
 * answers `running`/`starting`/`degraded` (exit 0, or exit 1 with
 * `degraded` — a user instance with failing units is still fully usable for
 * our unit); any other outcome (ENOENT for systemctl, no bus on non-systemd
 * machines, containers, `offline`/`unknown`) means the background feature is
 * unsupported here.
 */
export async function isSystemdUserAvailable(runner: SystemctlRunner): Promise<boolean> {
  const result = await runner(['is-system-running']);
  return result.code === 0 || result.stdout.trim() === 'degraded';
}

/** `systemctl --user daemon-reload` — re-reads the unit after a rewrite. */
export async function systemctlDaemonReload(runner: SystemctlRunner): Promise<void> {
  const result = await runner(['daemon-reload']);
  if (result.code !== 0) {
    throw new Error(`systemctl daemon-reload failed: ${trimmed(result.stderr) || `exit ${result.code}`}`);
  }
}

/** `systemctl --user enable --now hakimi-remote.service`. */
export async function systemctlEnableNow(runner: SystemctlRunner): Promise<void> {
  const result = await runner(['enable', '--now', REMOTE_SERVICE_NAME]);
  if (result.code !== 0) {
    throw new Error(`systemctl enable --now ${REMOTE_SERVICE_NAME} failed: ${trimmed(result.stderr) || `exit ${result.code}`}`);
  }
}

/**
 * `systemctl --user disable --now hakimi-remote.service`. Idempotent for the
 * never-installed case: `disable` of a unit that does not exist exits non-zero
 * with a "not found"/"does not exist" message, which stopping an already
 * stopped machine must treat as success.
 */
export async function systemctlDisableNow(runner: SystemctlRunner): Promise<void> {
  const result = await runner(['disable', '--now', REMOTE_SERVICE_NAME]);
  if (result.code !== 0 && !isUnitMissingError(result)) {
    throw new Error(`systemctl disable --now ${REMOTE_SERVICE_NAME} failed: ${trimmed(result.stderr) || `exit ${result.code}`}`);
  }
}

function isUnitMissingError(result: SystemctlResult): boolean {
  const message = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return (
    message.includes(REMOTE_SERVICE_NAME.toLowerCase()) &&
    (message.includes('not found') || message.includes('does not exist'))
  );
}

export interface RemoteUnitStatus {
  readonly loadState: string;
  readonly activeState: string;
  readonly subState: string;
  readonly mainPid: number | null;
}

/** Parse `systemctl show` `KEY=VALUE` output for the remote unit. */
export function parseShowOutput(stdout: string): RemoteUnitStatus {
  const fields: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  const mainPidRaw = fields['MainPID'] ?? '';
  const mainPid = /^\d+$/u.test(mainPidRaw) ? Number(mainPidRaw) : null;
  return {
    loadState: fields['LoadState'] ?? 'unknown',
    activeState: fields['ActiveState'] ?? 'unknown',
    subState: fields['SubState'] ?? 'unknown',
    mainPid,
  };
}

/**
 * Query the current unit state. A missing unit (`LoadState=not-found`) or a
 * systemctl failure both answer `loadState: 'not-found'`-ish — callers turn
 * that into a "not started yet" hint.
 */
export async function readRemoteUnitStatus(runner: SystemctlRunner): Promise<RemoteUnitStatus> {
  const result = await runner([
    'show',
    REMOTE_SERVICE_NAME,
    '--property=LoadState,ActiveState,SubState,MainPID',
  ]);
  if (result.code !== 0) {
    return { loadState: 'not-found', activeState: 'inactive', subState: 'dead', mainPid: null };
  }
  return parseShowOutput(result.stdout);
}

export function isRemoteUnitRunning(status: RemoteUnitStatus): boolean {
  return status.loadState === 'loaded' && status.activeState === 'active' && status.subState === 'running';
}

function trimmed(text: string): string {
  return text.trim();
}