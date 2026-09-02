/**
 * Long-lived remote-control contract — the public surface the host product
 * (the CLI's `hakimi remote` systemd user service) drives over REST on the
 * MAIN listener.
 *
 * Unlike the temporary remote share (an in-process loopback edge + tunnel),
 * the persistent service is an independent Linux `systemd --user` background
 * service owned by the host CLI: no TTL, a FIXED 256-bit token, and a random
 * public Quick Tunnel origin that changes whenever the service restarts. The
 * server never starts or stops systemd itself and never reads the fixed token
 * from disk — the host controller ({@link IRemotePersistentController}) owns
 * every outside-world side effect, and the routes only project its state
 * through the explicit field projector.
 *
 * Layering (registration + access double isolation):
 *   - only the main LOCAL listener receives a controller, so the control
 *     routes exist only there;
 *   - the standalone `remote serve` process never passes a controller, so
 *     `/api/v1/remote-persistent*` is not registered and a public remote viewer
 *     cannot reach the management surface.
 */

import { REMOTE_SHARE_FLAG_ID } from '../remoteShare/contract';

/** The `remote_control` experimental flag gates both control surfaces. */
export const REMOTE_PERSISTENT_FLAG_ID = REMOTE_SHARE_FLAG_ID;

/** Browser-facing persistent-remote state — what `GET /api/v1/remote-persistent` reports. */
export interface RemotePersistentStatus {
  /**
   * The systemd user unit is loaded + active + running AND a live `state.json`
   * exists. Health (reachability of the local server) is reported separately.
   */
  readonly active: boolean;
  /**
   * Projected systemd unit `ActiveState` (`active` / `inactive` / `failed` /
   * `activating` / ...), `unsupported` when no systemd user session exists, or
   * `unknown` when the unit could not be queried.
   */
  readonly state: string;
  /** Local health of the serve process: `ok` / `down` / `stale` / `unknown`. */
  readonly health: 'ok' | 'down' | 'stale' | 'unknown';
  /** Current Quick Tunnel origin from `state.json` (null when not published). */
  readonly origin: string | null;
  /**
   * Complete root control URL including the fragment credential (the fixed
   * token), built by the host controller (null when config/state are absent).
   * Never a separate raw token field.
   */
  readonly url: string | null;
  /** Local port from `state.json` (null when not published). */
  readonly port: number | null;
  /** ISO timestamp from `state.json` (null when not published). */
  readonly started_at: string | null;
  /** Whether a usable systemd user session exists on this host. */
  readonly systemd_available: boolean;
  /** Human-readable hint for the Web dialog; null when everything is fine. */
  readonly message: string | null;
}

/**
 * Copy exactly the serialized status fields. Control routes MUST pass
 * status/start/stop through this projector — never object-spread an internal
 * or host-derived state onto the wire, so a future credential field cannot
 * accidentally cross the REST boundary as a separate property.
 */
export function projectRemotePersistentStatus(
  status: RemotePersistentStatus,
): RemotePersistentStatus {
  return {
    active: status.active,
    state: status.state,
    health: status.health,
    origin: status.origin,
    url: status.url,
    port: status.port,
    started_at: status.started_at,
    systemd_available: status.systemd_available,
    message: status.message,
  };
}

/**
 * Expected start/stop failures (non-Linux host, no systemd user session,
 * systemctl failure). Thrown by the host controller and projected onto the
 * wire by the control routes — never a 500 stack.
 */
export class RemotePersistentError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'RemotePersistentError';
  }
}

/** Daemon-reserved code: the persistent service could not start (host side). */
export const REMOTE_PERSISTENT_START_FAILED_CODE = 50030;
/** Daemon-reserved code: the persistent service could not stop (host side). */
export const REMOTE_PERSISTENT_STOP_FAILED_CODE = 50031;
/**
 * Daemon-reserved code: the persistent control surface is unsupported here
 * (non-Linux host or no available systemd user session). `start`/`stop` are
 * unavailable; `status` reports `systemd_available: false` instead.
 */
export const REMOTE_PERSISTENT_UNSUPPORTED_CODE = 50032;

/** Controller interface the host product implements (the CLI's systemd wrapper). */
export interface IRemotePersistentController {
  /**
   * Current browser-facing state. Never throws — unsupported hosts report
   * `systemd_available: false` / `state: 'unsupported'`.
   */
  status(): Promise<RemotePersistentStatus>;
  /**
   * Start the persistent systemd user service (install the unit if needed).
   * Throws {@link RemotePersistentError} on unsupported hosts or systemctl
   * failure. Returns the fresh status.
   */
  start(): Promise<RemotePersistentStatus>;
  /**
   * Stop the persistent systemd user service (idempotent; the fixed token is
   * kept for the next start). Throws {@link RemotePersistentError} on
   * unsupported hosts or systemctl failure. Returns the fresh status.
   */
  stop(): Promise<RemotePersistentStatus>;
}