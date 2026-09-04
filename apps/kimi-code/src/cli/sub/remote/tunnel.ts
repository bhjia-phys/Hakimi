/**
 * Shared remote-session primitives: the ephemeral edge credential and the
 * public deep-link URL. Consumed by the standalone `kimi remote` runner
 * (`run.ts`) and by the web server's RemoteShareManager
 * (`cli/sub/web/remote-share.ts`) — kept apart from `run.ts` so neither side
 * pulls the other into a module cycle.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Signal source the foreground remote runners listen on (process-like). */
export interface RemoteSignalSource {
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

/**
 * 32 random bytes → base64url: the ephemeral credential the remote edge
 * accepts. 43 characters; never persisted and never re-issued.
 */
export function createRemoteToken(
  randomBytesFn: (size: number) => Buffer = randomBytes,
): string {
  return randomBytesFn(32).toString('base64url');
}

/** Ephemeral in-memory auth service for one share (structurally `IAuthTokenService`). */
export interface TemporaryAuthTokenService {
  readonly _serviceBrand: undefined;
  getToken(): string;
  isValid(candidate: string): Promise<boolean>;
}

/**
 * In-memory auth service holding the share credential for the lifetime of the
 * process only. `isValid` compares against the expected token with
 * `timingSafeEqual` so the check stays constant-time on the token path.
 */
export function createTemporaryAuthTokenService(token: string): TemporaryAuthTokenService {
  const expected = Buffer.from(token);
  return {
    _serviceBrand: undefined,
    getToken: () => token,
    isValid: async (candidate) => {
      const candidateBytes = Buffer.from(candidate);
      const normalized = Buffer.alloc(expected.length);
      candidateBytes.copy(normalized, 0, 0, expected.length);
      const equal = timingSafeEqual(expected, normalized);
      return candidateBytes.length === expected.length && equal;
    },
  };
}

/**
 * Complete public session deep link: the session path, `remote=1`, and the
 * edge token in the URL fragment (client-side only, like the web listener's
 * `#token=` — never sent to the server or logged).
 */
export function buildRemoteSessionUrl(origin: string, sessionId: string, token: string): string {
  const url = new URL(origin);
  url.pathname = `/sessions/${encodeURIComponent(sessionId)}`;
  url.search = '?remote=1';
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

/**
 * Complete public root link for the persistent all-sessions service: the bare
 * origin with `?remote=1` and the fixed token in the fragment. The Web client
 * opens the most recent session automatically, so the link never depends on a
 * specific session id.
 */
export function buildRemoteRootUrl(origin: string, token: string): string {
  const url = new URL(origin);
  url.pathname = '/';
  url.search = '?remote=1';
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}