/**
 * Web long-lived remote controller — the `kimi web` host's
 * `IRemotePersistentController` over the CLI's systemd control layer.
 *
 * The kap-server basic controller cannot be used here: the persistent service
 * is an independent Linux `systemd --user` background service owned by the CLI
 * (`hakimi remote start|status|stop`), so this controller reuses the pure
 * programmatic functions from `cli/sub/remote/control.ts` and maps their
 * snapshot onto the browser-facing `RemotePersistentStatus` wire shape.
 *
 *   - `status()` never throws: an unsupported host (non-Linux / no systemd
 *     user session) reports `systemd_available: false` + a readable message;
 *   - `start()`/`stop()` install/disable the systemd unit through
 *     `startRemoteService`/`stopRemoteService` (no stdout, no QR) and throw a
 *     stable `RemotePersistentError` (codes 50030/50031/50032) that the
 *     kap-server control routes project onto the envelope;
 *   - construction is inert: nothing is resolved, spawned, or written at boot,
 *     so ordinary Web boots are unaffected and `kimi web` still starts on
 *     non-Linux machines (the management surface just reports unsupported);
 *   Every outside-world touch (systemctl, files) is injectable for tests, so
 *   the focused tests never run a real systemd bus or touch `~/.hakimi`.
 */

import {
  REMOTE_PERSISTENT_START_FAILED_CODE,
  REMOTE_PERSISTENT_STOP_FAILED_CODE,
  REMOTE_PERSISTENT_UNSUPPORTED_CODE,
  RemotePersistentError,
  type IRemotePersistentController,
  type RemotePersistentStatus,
} from '@moonshot-ai/kap-server';

import { getDataDir } from '#/utils/paths';

import {
  collectRemoteStatus,
  startRemoteService,
  stopRemoteService,
  type RemoteControlDeps,
  type RemoteStatusSnapshot,
} from '../remote/control';
import {
  createSystemctlRunner,
  isRemoteUnitRunning,
  isSystemdUserAvailable,
  type SystemctlRunner,
} from '../remote/systemd';
import { buildRemoteRootUrl } from '../remote/tunnel';

/** Minimal logger surface the controller needs; the runner passes the server logger. */
export interface RemotePersistentLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface WebRemotePersistentControllerOptions {
  readonly logger?: RemotePersistentLogger;
  /**
   * Programmatic-control deps for tests (fake systemctl runner, temporary home
   * dir / unit path). In production every field defaults to the real host.
   */
  readonly deps?: RemoteControlDeps;
}

/** Web-facing "the persistent control surface is unsupported" message. */
export function persistentUnsupportedMessage(action: 'start' | 'stop'): string {
  return [
    `Hakimi remote ${action} needs a systemd user session (systemctl --user), which is not available on this host.`,
    'Long-running remote control (no TTL, no session expiry) cannot be managed from the Web UI here;',
    'run `hakimi remote ' + action + '` from a Linux session with systemd, or use a temporary share instead.',
  ].join('\n');
}

/**
 * Create the web long-lived remote controller. Always returns a controller;
 * the runner decides whether to pass it to `startServer`.
 */
export function webRemotePersistentController(
  opts: WebRemotePersistentControllerOptions = {},
): IRemotePersistentController {
  const deps = opts.deps ?? {};
  const homeDir = deps.homeDir ?? getDataDir();
  const platform = deps.platform ?? process.platform;

  async function readStatus(): Promise<RemotePersistentStatus> {
    const runner: SystemctlRunner = deps.runner ?? createSystemctlRunner();
    let systemdAvailable = false;
    try {
      systemdAvailable =
        platform === 'linux' && (await isSystemdUserAvailable(runner));
    } catch (error) {
      return unreadableStatus(
        false,
        `Unable to determine systemd user-session availability: ${errorMessage(error)}`,
      );
    }
    if (!systemdAvailable) {
      return statusFromSnapshot({
        unit: null,
        systemdAvailable: false,
        health: 'unknown',
      });
    }
    try {
      const snapshot = await collectRemoteStatus(
        { ...deps, homeDir, platform, runner },
        systemdAvailable,
      );
      return statusFromSnapshot(snapshot);
    } catch (error) {
      // Capability and status-read health are independent. A malformed or
      // unreadable config/state file must not make a usable systemd user
      // session appear unsupported in the Web UI.
      return unreadableStatus(
        systemdAvailable,
        `Unable to read the persistent remote state: ${errorMessage(error)}`,
      );
    }
  }

  async function assertManageable(action: 'start' | 'stop'): Promise<void> {
    if (platform !== 'linux') {
      throw new RemotePersistentError(
        REMOTE_PERSISTENT_UNSUPPORTED_CODE,
        persistentUnsupportedMessage(action),
      );
    }
    const runner: SystemctlRunner = deps.runner ?? createSystemctlRunner();
    if (!(await isSystemdUserAvailable(runner))) {
      throw new RemotePersistentError(
        REMOTE_PERSISTENT_UNSUPPORTED_CODE,
        persistentUnsupportedMessage(action),
      );
    }
  }

  return {
    status: readStatus,
    start: async () => {
      await assertManageable('start');
      try {
        await startRemoteService({}, { ...deps, homeDir, platform });
      } catch (error) {
        throw new RemotePersistentError(
          REMOTE_PERSISTENT_START_FAILED_CODE,
          `The persistent remote service could not be started: ${errorMessage(error)}`,
        );
      }
      loggerInfo(opts.logger, 'persistent remote service started from the web UI');
      return readStatus();
    },
    stop: async () => {
      await assertManageable('stop');
      try {
        await stopRemoteService({ ...deps, homeDir, platform });
      } catch (error) {
        throw new RemotePersistentError(
          REMOTE_PERSISTENT_STOP_FAILED_CODE,
          `The persistent remote service could not be stopped: ${errorMessage(error)}`,
        );
      }
      loggerInfo(opts.logger, 'persistent remote service stopped from the web UI');
      return readStatus();
    },
  };
}

/** Map a `collectRemoteStatus` snapshot onto the browser-facing status. */
export function statusFromSnapshot(snapshot: RemoteStatusSnapshot): RemotePersistentStatus {
  const { unit, systemdAvailable, config, state, health } = snapshot;
  // `collectRemoteStatus` only queries systemd on Linux; `systemdAvailable`
  // then reports whether a usable user session actually exists.
  const stateName = systemdAvailable ? unit?.activeState ?? 'inactive' : 'unsupported';
  const active =
    systemdAvailable && unit !== null && isRemoteUnitRunning(unit) && state !== undefined;
  const url =
    config !== undefined && state !== undefined
      ? buildRemoteRootUrl(state.origin, config.token)
      : null;
  return {
    active,
    state: stateName,
    health: systemdAvailable ? health : 'unknown',
    origin: state?.origin ?? null,
    url,
    port: state?.port ?? null,
    started_at: state === undefined ? null : new Date(state.startedAt).toISOString(),
    systemd_available: systemdAvailable,
    message: persistentMessage(snapshot),
  };
}

function unreadableStatus(
  systemdAvailable: boolean,
  message: string,
): RemotePersistentStatus {
  return {
    active: false,
    state: systemdAvailable ? 'unknown' : 'unsupported',
    health: 'unknown',
    origin: null,
    url: null,
    port: null,
    started_at: null,
    systemd_available: systemdAvailable,
    message,
  };
}

/**
 * Concise actionable hint for the Web dialog; null when everything is fine.
 * Kept in server message space (like `remote_access.forbidden`) — the Web UI
 * localizes the known states itself and shows this for the rest.
 */
export function persistentMessage(snapshot: RemoteStatusSnapshot): string | null {
  const { unit, config, state, health, systemdAvailable } = snapshot;
  if (!systemdAvailable) {
    return 'Long-running remote control needs a Linux systemd user session; start/stop are unavailable here.';
  }
  if (config === undefined || unit?.loadState === 'not-found') {
    return 'The persistent service is not installed yet — start it to create the systemd unit and tunnel.';
  }
  if (unit === null || !isRemoteUnitRunning(unit)) {
    return unit?.activeState === 'failed'
      ? 'The persistent service failed — check `journalctl --user -u hakimi-remote.service`.'
      : 'The persistent service is stopped.';
  }
  if (state === undefined) {
    return 'The persistent service is starting — the tunnel address appears shortly.';
  }
  if (health === 'stale') {
    return 'The persistent service restarted; a new tunnel address will replace this one shortly.';
  }
  if (health === 'down') {
    return 'The local server is not answering — check `journalctl --user -u hakimi-remote.service`.';
  }
  return null;
}

function loggerInfo(
  logger: RemotePersistentLogger | undefined,
  message: string,
): void {
  logger?.info({}, message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}