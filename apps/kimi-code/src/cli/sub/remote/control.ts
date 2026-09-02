/**
 * `hakimi remote start|status|stop` — the user-facing control surface for the
 * persistent all-sessions tunnel.
 *
 *   - `start` resolves cloudflared, creates/reuses the fixed-token config,
 *     renders and writes the systemd user unit, `daemon-reload`s and
 *     `enable --now`s it, then waits for the serve process to publish
 *     `state.json` and prints the URL + QR.
 *   - `status` reads the unit's active state and `state.json`, checks PID /
 *     local health, and prints the current URL, the fixed-token link, the QR,
 *     the port, and actionable failure hints.
 *   - `stop` disables the unit without touching config/token — the next start
 *     reuses the same token but gets a new Quick Tunnel address.
 *
 * Everything that talks to the outside world (systemctl, files) is injectable
 * so the focused tests never run a real systemd bus or a public tunnel.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { KIMI_BUILD_INFO } from '#/cli/build-info';
import { getDataDir } from '#/utils/paths';

import { getHostPackageRoot } from '../../version';
import { renderTerminalQr } from './qr';
import { resolveCloudflaredPath } from './options';
import {
  loadOrCreateRemoteConfig,
  readPrivateJsonFile,
  remoteConfigPath,
  remoteStatePath,
  RemoteConfigSchema,
  RemoteStateSchema,
  type RemoteConfig,
  type RemoteState,
} from './store';
import {
  createSystemctlRunner,
  isRemoteUnitRunning,
  isSystemdUserAvailable,
  readRemoteUnitStatus,
  remoteUnitPath,
  renderRemoteUnit,
  systemctlDaemonReload,
  systemctlDisableNow,
  systemctlEnableNow,
  writeRemoteUnit,
  type RemoteUnitStatus,
  type SystemctlRunner,
} from './systemd';
import { buildRemoteRootUrl } from './tunnel';

export const REMOTE_START_STATE_TIMEOUT_MS = 30_000;
export const REMOTE_STATE_POLL_MS = 200;
export const REMOTE_HEALTH_PROBE_TIMEOUT_MS = 1_500;

export interface RemoteControlDeps {
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly runner?: SystemctlRunner;
  readonly resolveLaunchVector?: () => readonly string[];
  readonly resolveCloudflaredPath?: (explicitPath: string | undefined) => string;
  readonly unitPath?: string;
  readonly writeUnit?: (unitPath: string, content: string) => void;
  readonly waitForState?: (
    statePath: string,
    timeoutMs: number,
  ) => Promise<RemoteState>;
  /** Bounded wait (ms) for the serve state after `enable --now` (default 30s). */
  readonly stateTimeoutMs?: number;
  /** Poll interval (ms) while waiting for the serve state (default 200ms). */
  readonly statePollMs?: number;
  readonly readStateFile?: (path: string) => RemoteState | undefined;
  readonly readConfigFile?: (path: string) => RemoteConfig | undefined;
  readonly probeHealth?: (port: number, token: string) => Promise<boolean>;
  readonly generateQrCode?: (url: string) => Promise<string>;
  readonly generateToken?: () => string;
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
  readonly stderr?: Pick<NodeJS.WriteStream, 'write'>;
}

export interface RemoteStartCliOptions {
  readonly cloudflared?: string;
}

function platformLabel(platform: NodeJS.Platform): string {
  return platform;
}

function assertSupportedPlatform(platform: NodeJS.Platform, command: string): void {
  if (platform !== 'linux') {
    throw new Error(
      `hakimi remote ${command} is only supported on Linux with a systemd user session (this host: ${platformLabel(platform)})`,
    );
  }
}

function systemdUnavailableMessage(command: string): string {
  return [
    `hakimi remote ${command} needs a systemd user session (systemctl --user), which is not available here.`,
    'Start your Linux session with systemd (e.g. a normal graphical or SSH login) or run',
    '`hakimi remote start` from such a session; the persistent service cannot be faked.',
  ].join('\n');
}

/**
 * Absolute launch vector that restarts the CURRENT Hakimi exactly: the native
 * SEA binary alone, `node <packageRoot>/dist/main.mjs` for the Node bundle, or
 * the running script in a source checkout. Falls back to the process entry so
 * an unknown layout still points at the real CLI.
 */
export function resolveHakimiLaunchVector(): readonly string[] {
  if (KIMI_BUILD_INFO.buildTarget !== undefined) {
    // Native SEA / packaged binary: the executable is the CLI.
    return [process.execPath];
  }
  let packageRoot: string | undefined;
  try {
    packageRoot = getHostPackageRoot();
  } catch {
    packageRoot = undefined;
  }
  if (packageRoot !== undefined) {
    const bundleEntry = join(packageRoot, 'dist', 'main.mjs');
    if (existsSync(bundleEntry)) return [process.execPath, bundleEntry];
  }
  const runningEntry =
    process.argv[1] ??
    (typeof import.meta.filename === 'string' ? import.meta.filename : undefined);
  if (runningEntry !== undefined && runningEntry.length > 0 && runningEntry.startsWith('/')) {
    return [process.execPath, runningEntry];
  }
  return [process.execPath];
}

/**
 * True when a state file belongs to the current serve process: either it is
 * the exact pid systemd reported as the unit's MainPID, or its `startedAt` is
 * no older than the `start` invocation. The freshness clause exists because a
 * post-enable crash/restart (`Restart=on-failure`) can replace the originally
 * captured MainPID with a NEW pid that is still part of this same `start`
 * window — that state must be accepted too. Anything predating the start
 * epoch is a leftover from a previous run and is rejected.
 */
export function isFreshRemoteState(
  state: RemoteState,
  mainPid: number | null,
  startedNotBefore: number,
): boolean {
  return (
    (mainPid !== null && mainPid > 0 && state.pid === mainPid) ||
    state.startedAt >= startedNotBefore
  );
}

/** Poll a state file until an acceptable (fresh) state appears. */
export async function pollForStateFile(
  statePath: string,
  timeoutMs: number,
  readState: (path: string) => RemoteState | undefined,
  pollMs = REMOTE_STATE_POLL_MS,
  isAcceptable: (state: RemoteState) => boolean = () => true,
): Promise<RemoteState> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = readState(statePath);
    if (state !== undefined && isAcceptable(state)) return state;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out waiting for the remote service to publish its tunnel URL (${timeoutMs}ms). ` +
          "Check 'journalctl --user -u hakimi-remote.service' and that cloudflared is functional.",
      );
    }
    await sleep(pollMs);
  }
}

/** Result of a programmatic `startRemoteService` — no stdout, no QR. */
export interface StartRemoteServiceResult {
  readonly config: RemoteConfig;
  /** The serve state accepted by this start (fresh under the current window). */
  readonly state: RemoteState;
  /** Unit state read right after `enable --now` (MainPID freshness anchor). */
  readonly unit: RemoteUnitStatus;
  /** Whether the fixed token was minted by this start. */
  readonly created: boolean;
  /** Complete root control URL (origin + fixed token fragment). */
  readonly url: string;
}

/**
 * Programmatic `remote start` — installs (or reuses) the config and systemd
 * user unit, `enable --now`s it, and waits for the serve process to publish a
 * fresh `state.json`. Writes NO stdout and renders NO QR; the CLI wrapper
 * (`runRemoteStart`) owns the banner. Every outside-world touch (systemctl,
 * files) is injectable for tests.
 */
export async function startRemoteService(
  opts: RemoteStartCliOptions = {},
  deps: RemoteControlDeps = {},
): Promise<StartRemoteServiceResult> {
  const platform = deps.platform ?? process.platform;
  assertSupportedPlatform(platform, 'start');
  const runner = deps.runner ?? createSystemctlRunner();
  if (!(await isSystemdUserAvailable(runner))) {
    throw new Error(systemdUnavailableMessage('start'));
  }

  const homeDir = deps.homeDir ?? getDataDir();
  const configPath = remoteConfigPath(homeDir);
  const readConfig =
    deps.readConfigFile ?? ((path: string) => readPrivateJsonFile(path, RemoteConfigSchema));
  const existingConfig = readConfig(configPath);
  // Once setup has resolved an absolute executable, subsequent CLI and Web
  // starts must reuse it even when cloudflared is not on PATH. An explicit
  // --cloudflared still wins and refreshes the persisted path.
  const requestedCloudflaredPath = opts.cloudflared ?? existingConfig?.cloudflaredPath;
  const cloudflaredPath = (deps.resolveCloudflaredPath ?? resolveCloudflaredPath)(
    requestedCloudflaredPath,
  );
  const { created } = loadOrCreateRemoteConfig(homeDir, cloudflaredPath, {
    generateToken: deps.generateToken,
  });

  const launchVector = (deps.resolveLaunchVector ?? resolveHakimiLaunchVector)();
  const unitContent = renderRemoteUnit([...launchVector, 'remote', 'serve', '--config', configPath]);
  const unitPath = deps.unitPath ?? remoteUnitPath();
  (deps.writeUnit ?? writeRemoteUnit)(unitPath, unitContent);

  await systemctlDaemonReload(runner);
  // Record the epoch BEFORE the service starts so the freshness check below
  // can distinguish this run's state from a leftover of a previous one.
  const startEpoch = Date.now();
  await systemctlEnableNow(runner);
  // Prefer the exact MainPID systemd assigned (falls back to the freshness
  // check when the process has not spawned yet and MainPID is still 0).
  const unit = await readRemoteUnitStatus(runner);
  const isAcceptable = (state: RemoteState): boolean =>
    isFreshRemoteState(state, unit.mainPid, startEpoch);

  const stateTimeoutMs = deps.stateTimeoutMs ?? REMOTE_START_STATE_TIMEOUT_MS;
  const statePollMs = deps.statePollMs ?? REMOTE_STATE_POLL_MS;
  const waitForState =
    deps.waitForState ??
    ((statePath: string, timeoutMs: number) =>
      pollForStateFile(
        statePath,
        timeoutMs,
        (path) => readPrivateJsonFile(path, RemoteStateSchema),
        statePollMs,
        isAcceptable,
      ));
  const state = await waitForState(remoteStatePath(homeDir), stateTimeoutMs);

  // First-time starts can race: two callers may both observe no config, mint
  // different tokens, and atomically replace the same file. The access URL
  // must use the winner that is actually persisted, never this invocation's
  // stale in-memory candidate.
  const config = readConfig(configPath);
  if (config === undefined) {
    throw new Error(`remote config disappeared during start: ${configPath}`);
  }
  const url = buildRemoteRootUrl(state.origin, config.token);
  return { config, state, unit, created, url };
}

export async function runRemoteStart(
  opts: RemoteStartCliOptions = {},
  deps: RemoteControlDeps = {},
): Promise<void> {
  const result = await startRemoteService(opts, deps);
  const qr = await (deps.generateQrCode ?? renderTerminalQr)(result.url);
  (deps.stdout ?? process.stdout).write(
    formatStartBanner(
      result.url,
      result.state.port,
      result.state.pid,
      result.config.token,
      qr,
      result.created,
    ),
  );
}

/**
 * Programmatic `remote stop` — disables the systemd user unit without touching
 * config/token (the next start reuses the same token with a new Quick Tunnel
 * address). Writes NO stdout; the CLI wrapper (`runRemoteStop`) owns the
 * banner. Every outside-world touch is injectable for tests.
 */
export async function stopRemoteService(deps: RemoteControlDeps = {}): Promise<void> {
  const platform = deps.platform ?? process.platform;
  assertSupportedPlatform(platform, 'stop');
  const runner = deps.runner ?? createSystemctlRunner();
  if (!(await isSystemdUserAvailable(runner))) {
    throw new Error(systemdUnavailableMessage('stop'));
  }
  await systemctlDisableNow(runner);
}

export async function runRemoteStop(deps: RemoteControlDeps = {}): Promise<void> {
  await stopRemoteService(deps);
  (deps.stdout ?? process.stdout).write(formatStopBanner(remoteConfigPath(deps.homeDir ?? getDataDir())));
}

export type RemoteHealth = 'ok' | 'down' | 'stale' | 'unknown';

export interface RemoteStatusSnapshot {
  readonly unit: RemoteUnitStatus | null;
  readonly systemdAvailable: boolean;
  readonly config?: RemoteConfig;
  readonly state?: RemoteState;
  readonly health: RemoteHealth;
}

export async function collectRemoteStatus(
  deps: RemoteControlDeps = {},
  knownSystemdAvailable?: boolean,
): Promise<RemoteStatusSnapshot> {
  const platform = deps.platform ?? process.platform;
  const homeDir = deps.homeDir ?? getDataDir();
  const readConfig =
    deps.readConfigFile ?? ((path: string) => readPrivateJsonFile(path, RemoteConfigSchema));
  const readState =
    deps.readStateFile ?? ((path: string) => readPrivateJsonFile(path, RemoteStateSchema));
  const config = readConfig(remoteConfigPath(homeDir));
  const state = readState(remoteStatePath(homeDir));

  let unit: RemoteUnitStatus | null = null;
  let systemdAvailable = false;
  if (platform === 'linux') {
    const runner = deps.runner ?? createSystemctlRunner();
    systemdAvailable = knownSystemdAvailable ?? (await isSystemdUserAvailable(runner));
    if (systemdAvailable) {
      unit = await readRemoteUnitStatus(runner);
    }
  }

  let health: RemoteHealth = 'unknown';
  if (state !== undefined && config !== undefined) {
    if (unit === null || !isRemoteUnitRunning(unit)) {
      health = 'down';
    } else if (unit.mainPid !== null && unit.mainPid !== state.pid) {
      // systemd restarted the service; the new process has not (yet) written
      // its own state — the shown origin is the OLD one.
      health = 'stale';
    } else {
      const probe = deps.probeHealth ?? probeLocalHealth;
      health = (await probe(state.port, config.token)) ? 'ok' : 'down';
    }
  }
  return { unit, systemdAvailable, config, state, health };
}

export async function runRemoteStatus(deps: RemoteControlDeps = {}): Promise<void> {
  const snapshot = await collectRemoteStatus(deps);
  const { unit, systemdAvailable, config, state, health } = snapshot;
  const stdout = deps.stdout ?? process.stdout;

  const url =
    config !== undefined && state !== undefined
      ? buildRemoteRootUrl(state.origin, config.token)
      : undefined;
  const qr = url !== undefined ? (deps.generateQrCode ?? renderTerminalQr)(url) : Promise.resolve('');

  const lines: string[] = ['Hakimi remote control'];
  if (unit !== null) {
    lines.push(
      `  Service:  ${unit.activeState}/${unit.subState}` +
        (unit.mainPid !== null && unit.mainPid > 0 ? ` (pid ${unit.mainPid})` : ''),
    );
  } else {
    lines.push(
      systemdAvailable
        ? '  Service:  inactive'
        : '  Service:  unsupported — systemd user session not available on this system',
    );
  }
  if (state !== undefined) {
    lines.push(`  Tunnel:   ${state.origin}`);
  } else {
    lines.push('  Tunnel:   —');
  }
  if (url !== undefined) {
    lines.push(`  URL:      ${url}`);
    lines.push('');
    lines.push((await qr).trimEnd());
    lines.push('');
  }
  if (state !== undefined) {
    lines.push(`  Port:     127.0.0.1:${state.port}`);
    lines.push(`  Started:  ${new Date(state.startedAt).toISOString()}`);
    lines.push(`  Health:   ${healthLabel(health)}`);
  }

  const hints = statusHints(snapshot);
  if (hints.length > 0) {
    lines.push('');
    for (const hint of hints) lines.push(`  Note:     ${hint}`);
  }
  lines.push('');
  stdout.write(lines.join('\n'));
}

function healthLabel(health: RemoteHealth): string {
  switch (health) {
    case 'ok':
      return 'ok';
    case 'stale':
      return 'restarting (old tunnel shown)';
    case 'down':
      return 'unreachable';
    default:
      return 'unknown';
  }
}

function statusHints(snapshot: RemoteStatusSnapshot): string[] {
  const hints: string[] = [];
  const { unit, config, state, health, systemdAvailable } = snapshot;
  if (config === undefined) {
    hints.push("not started yet — run 'hakimi remote start'");
    return hints;
  }
  if (unit === null) {
    if (!systemdAvailable) {
      hints.push('start/stop are unavailable without a systemd user session');
    }
    return hints;
  }
  if (unit.loadState === 'not-found') {
    hints.push("service unit not installed — run 'hakimi remote start'");
    return hints;
  }
  if (!isRemoteUnitRunning(unit)) {
    if (unit.activeState === 'failed') {
      hints.push(
        "the service failed — inspect 'journalctl --user -u hakimi-remote.service' and run 'hakimi remote start' again",
      );
    } else {
      hints.push('the service is not running — run `hakimi remote start`');
    }
    return hints;
  }
  if (state === undefined) {
    hints.push('the service is starting — the tunnel URL appears once cloudflared publishes an origin');
  } else if (health === 'stale') {
    hints.push('the service restarted; a new random tunnel origin will replace this one shortly');
  } else if (health === 'down') {
    hints.push('the local server is not answering — check `journalctl --user -u hakimi-remote.service`');
  }
  return hints;
}

export function formatStartBanner(
  remoteUrl: string,
  port: number,
  pid: number,
  token: string,
  qr: string,
  created: boolean,
): string {
  return [
    '',
    '  Hakimi remote control started',
    '',
    qr.trimEnd(),
    '',
    '  Copy URL:',
    `  ${remoteUrl}`,
    '',
    `  Port:     127.0.0.1:${port}`,
    `  PID:      ${pid}`,
    `  Token:    ${token}${created ? ' (newly created — kept for future starts)' : ' (fixed — reused from the previous start)'}`,
    '  Risk:     Anyone with this URL gets full access to every Hakimi session — plus files, settings, and tools. Keep it private.',
    '  Stop:     hakimi remote stop',
    '  Note:     the Quick Tunnel address changes whenever the service restarts.',
    '',
  ].join('\n');
}

export function formatStopBanner(configPath: string): string {
  return [
    '',
    '  Hakimi remote control stopped.',
    `  The fixed access token is kept in ${configPath}; the next`,
    "  'hakimi remote start' reuses it with a new Quick Tunnel address.",
    '',
  ].join('\n');
}

async function probeLocalHealth(port: number, token: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/healthz`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REMOTE_HEALTH_PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}