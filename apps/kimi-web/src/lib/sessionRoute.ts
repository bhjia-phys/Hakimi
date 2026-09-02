// apps/kimi-web/src/lib/sessionRoute.ts
//
// Tiny URL helper for session deep links — no router. The app recognises
// exactly one path shape:
//
//   /                      no active session
//   /sessions/<sessionId>  the active session
//
// The daemon's static-asset route SPA-falls-back any extension-less path to
// index.html, so these URLs survive a hard refresh in production; vite's
// default 'spa' appType does the same in dev.

export type SessionUrlMode = 'push' | 'replace' | 'none';

const SESSION_PATH_PREFIX = '/sessions/';

/** Parse the session id out of a location. Returns undefined for '/', any
    non-session path, nested paths, or an undecodable id (never throws). */
export function readSessionIdFromLocation(loc: Pick<Location, 'pathname'>): string | undefined {
  const { pathname } = loc;
  if (!pathname.startsWith(SESSION_PATH_PREFIX)) return undefined;
  const rest = pathname.slice(SESSION_PATH_PREFIX.length);
  if (!rest || rest.includes('/')) return undefined;
  try {
    const id = decodeURIComponent(rest);
    return id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Parse the initial session id only for the restricted remote mode.
    `?remote=1` on the root path yields `''` — remote mode with no pinned
    session, where the client opens the most recent session. An unrecognized
    path (nested, undecodable, non-session) stays `undefined`. */
export function readRemoteSessionIdFromLocation(
  loc: Pick<Location, 'pathname' | 'search'>,
): string | undefined {
  if (new URLSearchParams(loc.search).get('remote') !== '1') return undefined;
  if (loc.pathname === '/') return '';
  return readSessionIdFromLocation(loc);
}

/** Build the canonical path for a session ('/' when undefined). Remote mode
    keeps its query marker across in-app session switches and hard refreshes. */
export function sessionUrl(sessionId: string | undefined, remote = false): string {
  const pathname =
    sessionId === undefined || sessionId.length === 0
      ? '/'
      : `${SESSION_PATH_PREFIX}${encodeURIComponent(sessionId)}`;
  return remote ? `${pathname}?remote=1` : pathname;
}
