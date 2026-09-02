/**
 * Web RemoteShareManager — the `kimi web` host's `IRemoteShareController`.
 *
 * The kap-server basic controller cannot be used directly: the CLI must also
 * own the Cloudflare Quick Tunnel that carries the edge listener to the
 * public. The requested session is the initial Web landing point; the edge
 * serves the full standard data plane to every authenticated Web client (no
 * remote projection). This manager implements the controller interface itself
 * and:
 *
 *   - defaults the share TTL to 8h and auto-stops at expiry;
 *   - resolves the cloudflared executable safely (explicit/env absolute paths
 *     or a PATH hit outside the cwd), never by bare command name;
 *   - mints a fresh 32-byte ephemeral edge credential per share and hands the
 *     edge an in-memory auth service that accepts only that credential;
 *   - creates the loopback edge via the producer-supplied edge factory, spawns
 *     cloudflared against the edge's actual port, waits for the trycloudflare
 *     URL, and keeps the complete `#token=` deep link in `status()`;
 *   - single-flights start (starting OR running rejects a second start with
 *     {@link REMOTE_SHARE_ALREADY_ACTIVE_CODE}) and stops idempotently from any
 *     state, including mid-start (the in-flight start owns its cleanup);
 *   - runs one cleanup path — cloudflared first, edge second — for every
 *     terminal event: start failure, stop, TTL expiry, tunnel early exit, and
 *     the main server's `close()`;
 *   - surfaces expected failures as a stable `RemoteShareError` and never logs
 *     the tunnel URL or the edge token.
 */

import type { ChildProcess } from 'node:child_process';

import {
  REMOTE_SHARE_ALREADY_ACTIVE_CODE,
  RemoteShareError,
  type IRemoteShareController,
  type RemoteAccessEdge,
  type RemoteShareStartResult,
  type RemoteShareStatus,
} from '@moonshot-ai/kap-server';

import {
  spawnCloudflared,
  terminateCloudflared,
  waitForTryCloudflareUrl,
} from '#/cli/sub/remote/cloudflared';
import {
  DEFAULT_REMOTE_TTL_MS,
  resolveCloudflaredPath,
} from '#/cli/sub/remote/options';
import {
  buildRemoteSessionUrl,
  createRemoteToken,
  createTemporaryAuthTokenService,
  type TemporaryAuthTokenService,
} from '#/cli/sub/remote/tunnel';

/** Effective default share lifetime (8h, matching `kimi remote`). */
const DEFAULT_REMOTE_TTL_SECONDS = DEFAULT_REMOTE_TTL_MS / 1_000;

/**
 * Stable wire code for expected start failures (cloudflared missing/unsafe,
 * spawn failure, URL timeout, early tunnel exit) — kept local like the other
 * daemon codes.
 */
export const REMOTE_SHARE_START_FAILED_CODE = 50027;

/** Minimal logger surface the manager needs; the runner passes the server logger. */
export interface RemoteShareLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface RemoteShareManagerDeps {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly logger?: RemoteShareLogger;
  readonly generateToken?: () => string;
  readonly resolveCloudflaredPath?: (explicitPath: string | undefined) => string;
  readonly spawnCloudflared?: (executable: string, actualPort: number) => ChildProcess;
  readonly waitForTunnelUrl?: (
    child: ChildProcess,
    options: { readonly signal: AbortSignal },
  ) => Promise<string>;
  readonly terminateCloudflared?: (child: ChildProcess) => Promise<void>;
}

type RemoteSharePhase = 'idle' | 'starting' | 'running';

const INACTIVE_STATUS: RemoteShareStatus = {
  active: false,
  session_id: null,
  host: null,
  port: null,
  url: null,
  ttl_seconds: null,
  started_at: null,
  expires_at: null,
};

interface ActiveShare {
  readonly sessionId: string;
  /** Effective TTL in seconds (defaults to 8h when the input omits it). */
  readonly ttlSeconds: number;
  readonly token: string;
  readonly authTokenService: TemporaryAuthTokenService;
  readonly startedAt: number;
  readonly expiresAt: number;
  /** Filled in as the start progresses; undefined until the factory resolves. */
  edge: RemoteAccessEdge | undefined;
  tunnel: ChildProcess | undefined;
  url: string | null;
  ttlTimer: ReturnType<typeof setTimeout> | undefined;
  teardownPromise: Promise<void> | undefined;
}

/**
 * Create the web RemoteShareManager. Always returns a controller; the runner
 * decides whether to pass it to `startServer` (see {@link webRemoteShareController}).
 */
export function createRemoteShareManager(deps: RemoteShareManagerDeps = {}): IRemoteShareController {
  const env = deps.env ?? process.env;
  const logger = deps.logger;
  const generateToken = deps.generateToken ?? createRemoteToken;
  const resolvePath =
    deps.resolveCloudflaredPath ??
    ((explicitPath: string | undefined) => resolveCloudflaredPath(explicitPath, { env }));
  const spawnTunnel = deps.spawnCloudflared ?? spawnCloudflared;
  const waitForTunnel = deps.waitForTunnelUrl ?? waitForTryCloudflareUrl;
  const terminateTunnel = deps.terminateCloudflared ?? terminateCloudflared;

  let phase: RemoteSharePhase = 'idle';
  let current: ActiveShare | undefined;
  /** The in-flight `start()`; `stop()` awaits it so a mid-start stop settles cleanup first. */
  let startPromise: Promise<RemoteShareStartResult> | undefined;
  /** Set by `stop()` while starting; the in-flight start checks it after every await. */
  let stopRequested = false;
  /** Abort handle for the in-flight start's tunnel URL wait. */
  let tunnelWaitAbort: AbortController | undefined;

  function statusOf(share: ActiveShare): RemoteShareStatus {
    return {
      active: true,
      session_id: share.sessionId,
      host: share.edge?.host ?? null,
      port: share.edge?.port ?? null,
      url: share.url,
      ttl_seconds: share.ttlSeconds,
      started_at: new Date(share.startedAt).toISOString(),
      expires_at: new Date(share.expiresAt).toISOString(),
    };
  }

  /**
   * The single cleanup path: cloudflared FIRST (stop carrying traffic), then
   * the edge listener. Idempotent per share; tunnel cleanup is best-effort and
   * only logged, edge close errors propagate.
   */
  function teardown(share: ActiveShare, reason: string): Promise<void> {
    if (share.teardownPromise !== undefined) return share.teardownPromise;
    share.teardownPromise = (async () => {
      if (share.ttlTimer !== undefined) {
        clearTimeout(share.ttlTimer);
        share.ttlTimer = undefined;
      }
      let tunnelError: unknown;
      try {
        if (share.tunnel !== undefined) {
          try {
            await terminateTunnel(share.tunnel);
          } catch (error) {
            tunnelError = error;
          }
        }
      } finally {
        await share.edge?.close();
      }
      if (current === share) {
        current = undefined;
        phase = 'idle';
      }
      logger?.info({ session_id: share.sessionId, reason }, 'remote share stopped');
      if (tunnelError !== undefined) {
        logger?.warn(
          { err: messageOf(tunnelError) },
          'remote share tunnel cleanup failed',
        );
      }
    })();
    return share.teardownPromise;
  }

  const start: IRemoteShareController['start'] = async (input, factory) => {
    if (phase !== 'idle') {
      throw new RemoteShareError(
        REMOTE_SHARE_ALREADY_ACTIVE_CODE,
        current !== undefined
          ? `remote share already active for session ${current.sessionId}`
          : 'remote share is already starting',
      );
    }

    phase = 'starting';
    stopRequested = false;
    tunnelWaitAbort = new AbortController();
    const sessionId = input.sessionId;
    const ttlSeconds = input.ttlSeconds ?? DEFAULT_REMOTE_TTL_SECONDS;
    const token = generateToken();
    const authTokenService = createTemporaryAuthTokenService(token);
    const startedAt = Date.now();
    const share: ActiveShare = {
      sessionId,
      ttlSeconds,
      token,
      authTokenService,
      startedAt,
      expiresAt: startedAt + ttlSeconds * 1_000,
      edge: undefined,
      tunnel: undefined,
      url: null,
      ttlTimer: undefined,
      teardownPromise: undefined,
    };
    current = share;

    const performStart = async (): Promise<RemoteShareStartResult> => {
      try {
        const edge = await factory({ sessionId, authTokenService });
        share.edge = edge;
        if (phase !== 'starting' || stopRequested) {
          await teardown(share, 'stopped during start');
          return { ...INACTIVE_STATUS, token };
        }

        const cloudflaredPath = resolvePath(undefined);
        const tunnel = spawnTunnel(cloudflaredPath, edge.port);
        share.tunnel = tunnel;

        let tunnelUrl: string;
        try {
          tunnelUrl = await waitForTunnel(tunnel, { signal: tunnelWaitAbort!.signal });
        } catch (error) {
          if (stopRequested) {
            await teardown(share, 'stopped during start');
            return { ...INACTIVE_STATUS, token };
          }
          throw error;
        }
        if (phase !== 'starting' || stopRequested) {
          await teardown(share, 'stopped during start');
          return { ...INACTIVE_STATUS, token };
        }

        const url = buildRemoteSessionUrl(tunnelUrl, sessionId, token);
        share.url = url;
        phase = 'running';

        // A live share dies with its tunnel: exit while running runs the same
        // cleanup and reports inactive (the next start may begin from idle).
        let onTunnelClose: (() => void) | undefined;
        onTunnelClose = (): void => {
          if (current !== share) return;
          void teardown(share, 'tunnel exited').catch((error) => {
            logger?.warn({ err: messageOf(error) }, 'remote share tunnel cleanup failed');
          });
        };
        tunnel.once('close', onTunnelClose);
        if (tunnel.exitCode !== null || tunnel.signalCode !== null) {
          // The tunnel died between URL publish and listener attach.
          onTunnelClose();
          throw new Error(
            `cloudflared tunnel exited before the share started (${formatTunnelExit(tunnel.exitCode, tunnel.signalCode)})`,
          );
        }

        share.ttlTimer = setTimeout(() => {
          share.ttlTimer = undefined;
          void teardown(share, 'ttl expired').catch((error) => {
            logger?.warn({ err: messageOf(error) }, 'remote share TTL cleanup failed');
          });
        }, Math.max(0, share.expiresAt - Date.now()));
        share.ttlTimer.unref?.();

        logger?.info(
          { session_id: sessionId, host: edge.host, port: edge.port },
          'remote share started',
        );
        return { ...statusOf(share), token };
      } catch (error) {
        await teardown(share, 'start failed');
        throw toStartError(error);
      }
    };

    startPromise = performStart();
    try {
      return await startPromise;
    } finally {
      startPromise = undefined;
      tunnelWaitAbort = undefined;
    }
  };

  const stop: IRemoteShareController['stop'] = async () => {
    if (phase === 'starting') {
      // Abort the in-flight start and let it run its own cleanup; the start
      // resolves inactive. `phase` is mutated by the start/teardown closures
      // while we await, so it is re-read below, never narrowed.
      stopRequested = true;
      tunnelWaitAbort?.abort();
      try {
        await startPromise;
      } catch {
        // The start failed and already cleaned up; stopping stays idempotent.
      }
    }
    if (phase === 'running' && current !== undefined) {
      await teardown(current, 'stop');
    }
    return { ...INACTIVE_STATUS };
  };

  const close: IRemoteShareController['close'] = async () => {
    // The main server calls this before any shared teardown; same cleanup path.
    await stop();
  };

  return {
    status: (): RemoteShareStatus =>
      current === undefined ? { ...INACTIVE_STATUS } : statusOf(current),
    start,
    stop,
    close,
  };
}

export interface WebRemoteShareControllerOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly logger?: RemoteShareLogger;
}

/**
 * Remote-share controller for the web runner. It is inert until the user starts
 * a share, so ordinary Web boots do not resolve or spawn `cloudflared`.
 */
export function webRemoteShareController(
  opts: WebRemoteShareControllerOptions = {},
): IRemoteShareController {
  return createRemoteShareManager(opts);
}

function toStartError(error: unknown): RemoteShareError {
  if (error instanceof RemoteShareError) return error;
  return new RemoteShareError(REMOTE_SHARE_START_FAILED_CODE, messageOf(error));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatTunnelExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal !== null) return `signal ${signal}`;
  if (code !== null) return `exit code ${code}`;
  return 'unknown status';
}