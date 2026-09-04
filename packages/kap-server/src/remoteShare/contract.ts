/**
 * Remote-share control contract — the public surface the host product (the
 * CLI's `RemoteShareManager`) drives to open and close a second loopback
 * listener ("edge") that reuses this process's Core without a second
 * bootstrap. The edge registers the standard `/api/v1` + `/api/v2` surfaces
 * and the full WS protocol, so the authenticated Web client gets the complete
 * data plane — the initial `sessionId` is only the Web landing point and the
 * status/deep-link input. (`remoteAccess`-style restricted serving is a
 * separate, opt-in mode; this listener is not it.)
 *
 * Ownership split:
 *   - the {@link IRemoteShareController} owns share state (one active share at
 *     a time), the ephemeral per-share credential, and the lifecycle of the
 *     edge it started;
 *   - the {@link RemoteAccessEdgeFactory} (built inside `startServer`'s
 *     closure) turns a `{ sessionId, authTokenService, webAssetsDir }` request
 *     into a bound `127.0.0.1:0` listener that shares the Core, transcript
 *     service, broadcaster, and fs bridge — never a second Core.
 */

import type { IAuthTokenService } from '../services/auth/authTokenService';

/** Experimental flag id gating the remote-share control surface. */
export const REMOTE_SHARE_FLAG_ID = 'remote_control';

/** Browser-facing share state — what `GET /api/v1/remote-share` reports. */
export interface RemoteShareStatus {
  /** Whether an edge listener is currently live. */
  readonly active: boolean;
  /** Initial Web landing session (null when inactive); not the edge access scope. */
  readonly session_id: string | null;
  /** Bind host of the edge listener (always loopback; null when inactive). */
  readonly host: string | null;
  /** Bound port of the edge listener (null when inactive). */
  readonly port: number | null;
  /**
   * Complete tunnel URL, including any fragment credential needed by the Web
   * UI (null when inactive or when the controller has no tunnel).
   */
  readonly url: string | null;
  /** Requested TTL in seconds (null when the share has no expiry). */
  readonly ttl_seconds: number | null;
  /** ISO timestamp of the last start (null when inactive). */
  readonly started_at: string | null;
  /** ISO expiry timestamp (null when the share has no expiry). */
  readonly expires_at: string | null;
}

/**
 * Copy exactly the serialized status fields. Accepting a
 * `RemoteShareStartResult` is intentional: the control route uses this helper
 * to project the internal start result without object spread, so a future
 * internal credential field cannot accidentally cross the REST boundary as a
 * separate property. The existing `url` field may carry the credential in its
 * fragment by design.
 */
export function projectRemoteShareStatus(status: RemoteShareStatus): RemoteShareStatus {
  return {
    active: status.active,
    session_id: status.session_id,
    host: status.host,
    port: status.port,
    url: status.url,
    ttl_seconds: status.ttl_seconds,
    started_at: status.started_at,
    expires_at: status.expires_at,
  };
}

/**
 * Successful internal `start` result: the browser-facing status plus the
 * one-time ephemeral edge credential. The host controller may use the token to
 * build `url` (typically as a fragment credential), but the REST control route
 * never sends `token` as a separate browser-visible field.
 */
export interface RemoteShareStartResult extends RemoteShareStatus {
  readonly token: string;
}

/** Controller input — mirrors the `POST /api/v1/remote-share:start` body. */
export interface RemoteShareStartInput {
  /** Initial Web landing session; the edge serves the full data plane (all sessions). */
  readonly sessionId: string;
  /** Optional lifetime in seconds; the controller auto-stops at expiry. */
  readonly ttlSeconds?: number;
}

/** A running remote edge listener, owned exclusively by the controller. */
export interface RemoteAccessEdge {
  /** Initial Web landing session retained for status and deep-link generation. */
  readonly sessionId: string;
  readonly host: string;
  readonly port: number;
  /**
   * Close ONLY the edge's own listener, connections, and auth limiter — never
   * the shared Core, broadcaster, fs bridge, or instance registry.
   */
  close(): Promise<void>;
}

export interface RemoteAccessEdgeFactoryArgs {
  readonly sessionId: string;
  /** Ephemeral per-share credential the edge accepts — never the main listener's token. */
  readonly authTokenService: IAuthTokenService;
  /** Web UI assets for the edge; defaults to the main listener's `webAssetsDir` when omitted. */
  readonly webAssetsDir?: string;
}

export type RemoteAccessEdgeFactory = (
  args: RemoteAccessEdgeFactoryArgs,
) => Promise<RemoteAccessEdge>;

export interface IRemoteShareController {
  /** Current browser-facing state (never includes a separate token property). */
  status(): RemoteShareStatus;
  /**
   * Start an edge listener for `input.sessionId`. Throws a
   * {@link RemoteShareError} (code {@link REMOTE_SHARE_ALREADY_ACTIVE_CODE})
   * when a share is already active. The edge is created via `factory`, which
   * the producer provides at call time.
   */
  start(input: RemoteShareStartInput, factory: RemoteAccessEdgeFactory): Promise<RemoteShareStartResult>;
  /** Stop the active share (idempotent; a stopped controller reports inactive). */
  stop(): Promise<RemoteShareStatus>;
  /**
   * Stop the active share and release controller state. Called by the main
   * server's `close()` before any app/core teardown so the host tunnel and
   * edge listener are reclaimed first.
   */
  close(): Promise<void>;
}