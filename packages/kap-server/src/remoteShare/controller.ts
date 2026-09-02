/**
 * Remote-share controller — the server-side owner of one active share.
 *
 * Mints the ephemeral per-share credential, delegates edge construction to the
 * producer-supplied {@link RemoteAccessEdgeFactory}, and owns the edge's
 * lifecycle (stop, TTL expiry, and the main server's close). Never starts a
 * second Core: the edge factory inside `startServer` reuses the running one.
 *
 * Importing this module registers the `remote_control` feature flag at
 * module-evaluation time via `registerFlagDefinition`, so it MUST be statically
 * imported before any `bootstrap()` call for `IFlagService` to see it (the
 * `/api/v1/meta` `experimental_flags` map is `IFlagService.snapshot()` over the
 * registry).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { registerFlagDefinition } from '@moonshot-ai/agent-core-v2';

import type { IAuthTokenService } from '../services/auth/authTokenService';
import {
  REMOTE_SHARE_FLAG_ID,
  type IRemoteShareController,
  type RemoteAccessEdge,
  type RemoteShareStartInput,
  type RemoteShareStartResult,
  type RemoteShareStatus,
} from './contract';

/**
 * Daemon-reserved business code for "a remote share is already active"
 * (kept local like the other daemon codes — `40301`/`40302`/`42901` — and not
 * added to `protocol/error-codes.ts`).
 */
export const REMOTE_SHARE_ALREADY_ACTIVE_CODE = 40927;

/** Active share's TTL cap in seconds enforced by the control route schema. */
export const REMOTE_SHARE_MAX_TTL_SECONDS = 86_400;

export class RemoteShareError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'RemoteShareError';
  }
}

registerFlagDefinition({
  id: REMOTE_SHARE_FLAG_ID,
  title: 'remote share control',
  description:
    'Expose remote-share control routes on the main listener so the host can open a token-authenticated loopback edge for full Web control.',
  env: 'KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL',
  default: true,
  surface: 'tui',
});

/** Trimmed logger surface used by the controller. */
interface ControllerLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface RemoteShareControllerOptions {
  readonly logger?: ControllerLogger;
}

interface ActiveShare {
  readonly edge: RemoteAccessEdge;
  readonly input: RemoteShareStartInput;
  readonly authTokenService: IAuthTokenService;
  readonly token: string;
  readonly startedAt: number;
  readonly expiresAt: number | undefined;
}

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

function statusOf(share: ActiveShare): RemoteShareStatus {
  return {
    active: true,
    session_id: share.input.sessionId,
    host: share.edge.host,
    port: share.edge.port,
    url: null,
    ttl_seconds: share.input.ttlSeconds ?? null,
    started_at: new Date(share.startedAt).toISOString(),
    expires_at:
      share.expiresAt === undefined ? null : new Date(share.expiresAt).toISOString(),
  };
}

export function createRemoteShareController(
  opts?: RemoteShareControllerOptions,
): IRemoteShareController {
  const logger = opts?.logger;
  let share: ActiveShare | undefined;
  let ttlTimer: ReturnType<typeof setTimeout> | undefined;
  let startPromise: Promise<RemoteShareStartResult> | undefined;
  let stopRequested = false;

  function clearTtlTimer(): void {
    if (ttlTimer !== undefined) {
      clearTimeout(ttlTimer);
      ttlTimer = undefined;
    }
  }

  return {
    status: () => (share === undefined ? INACTIVE_STATUS : statusOf(share)),

    start: async (input, factory) => {
      if (share !== undefined || startPromise !== undefined) {
        throw new RemoteShareError(
          REMOTE_SHARE_ALREADY_ACTIVE_CODE,
          share === undefined
            ? 'remote share is already starting'
            : `remote share already active for session ${share.input.sessionId}`,
        );
      }

      stopRequested = false;
      const token = randomBytes(24).toString('base64url');
      const authTokenService = createEphemeralAuthTokenService(token);
      const operation = (async (): Promise<RemoteShareStartResult> => {
        const edge = await factory({
          sessionId: input.sessionId,
          authTokenService,
        });
        if (stopRequested) {
          await edge.close();
          return { ...INACTIVE_STATUS, token };
        }

        const startedAt = Date.now();
        const expiresAt =
          input.ttlSeconds === undefined ? undefined : startedAt + input.ttlSeconds * 1_000;
        share = { edge, input, authTokenService, token, startedAt, expiresAt };
        if (expiresAt !== undefined) {
          ttlTimer = setTimeout(() => {
            ttlTimer = undefined;
            void stopShare('ttl expired').catch((error) => {
              logger?.warn(
                { err: error instanceof Error ? error.message : String(error) },
                'remote share TTL stop failed',
              );
            });
          }, Math.max(0, expiresAt - Date.now()));
          ttlTimer.unref?.();
        }
        logger?.info(
          { session_id: input.sessionId, host: edge.host, port: edge.port },
          'remote share started',
        );
        return { ...statusOf(share), token };
      })();
      startPromise = operation;
      try {
        return await operation;
      } finally {
        if (startPromise === operation) startPromise = undefined;
      }
    },

    stop: () => stopShare('stop'),

    close: async () => {
      await stopShare('close');
    },
  };

  async function stopShare(reason: string): Promise<RemoteShareStatus> {
    if (startPromise !== undefined) {
      stopRequested = true;
      try {
        await startPromise;
      } catch {
        // A failed start leaves no active edge; stop remains idempotent.
      }
    }
    const current = share;
    share = undefined;
    clearTtlTimer();
    if (current === undefined) return INACTIVE_STATUS;
    try {
      await current.edge.close();
    } finally {
      logger?.info(
        {
          session_id: current.input.sessionId,
          port: current.edge.port,
          reason,
        },
        'remote share stopped',
      );
    }
    return INACTIVE_STATUS;
  }
}

/**
 * In-memory `IAuthTokenService` for one share: the credential exists only in
 * this process for the lifetime of the share and is never persisted. `isValid`
 * compares sha-256 digests with `timingSafeEqual` so the token path stays
 * constant-time (password verification does not apply to edge shares).
 */
export function createEphemeralAuthTokenService(token: string): IAuthTokenService {
  const expected = createHash('sha256').update(token).digest();
  return {
    _serviceBrand: undefined,
    getToken: () => token,
    isValid: async (candidate) => {
      const actual = createHash('sha256').update(candidate).digest();
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
}