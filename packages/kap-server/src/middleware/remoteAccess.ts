import type { FastifyReply, FastifyRequest } from 'fastify';

import { errEnvelope } from '../envelope';

/** Dedicated edge code for requests outside a remote session share. */
export const REMOTE_ACCESS_FORBIDDEN_CODE = 40302;
export const REMOTE_ACCESS_FORBIDDEN_MESSAGE = 'remote_access.forbidden';

export interface RemoteAccessOptions {
  /** One session for a restricted embedding; null permits all sessions. */
  readonly sessionId: string | null;
}

/**
 * Remote-session authorization hook. This is deliberately independent of the
 * bearer-token gate: authentication still runs first, then this hook narrows a
 * valid credential to the allowed session scope and the read-only Web bootstrap.
 */
export function createRemoteAccessHook(
  options: RemoteAccessOptions,
): (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void> {
  return async (req, reply) => {
    if (isRemoteAccessAllowed(req.method, req.url, options.sessionId)) return;
    return reply
      .code(403)
      .send(errEnvelope(REMOTE_ACCESS_FORBIDDEN_CODE, REMOTE_ACCESS_FORBIDDEN_MESSAGE, req.id));
  };
}

/**
 * Pure route authorization predicate used by the hook and focused tests.
 * Matching is performed on decoded path segments without URL normalization, so
 * encoded separators and dot segments fail closed instead of changing meaning
 * between this edge and Fastify's router.
 */
export function isRemoteAccessAllowed(
  method: string,
  rawUrl: string,
  sessionId: string | null,
): boolean {
  const segments = decodePathSegments(rawUrl);
  if (segments === undefined) return false;

  if (method === 'GET' && isWebAssetRead(segments)) return true;
  if (segments[0] !== 'api' || segments[1] !== 'v1') return false;

  if (method === 'GET' && isWebBootstrapApiRead(segments)) return true;
  if (segments[2] !== 'sessions') return false;

  if (method === 'GET') return isSessionRead(segments, sessionId);
  if (method === 'POST') return isSessionWrite(segments, sessionId);
  return false;
}

function decodePathSegments(rawUrl: string): string[] | undefined {
  const query = rawUrl.indexOf('?');
  const pathname = query === -1 ? rawUrl : rawUrl.slice(0, query);
  if (!pathname.startsWith('/')) return undefined;
  if (pathname === '/') return [''];

  const rawSegments = pathname.slice(1).split('/');
  const segments: string[] = [];
  for (const raw of rawSegments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return undefined;
    }
    if (
      decoded.length === 0 ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\')
    ) {
      return undefined;
    }
    segments.push(decoded);
  }
  return segments;
}

function isWebAssetRead(segments: readonly string[]): boolean {
  if (segments.length === 1 && segments[0] === '') return true;
  const first = segments[0];
  if (first === undefined || first === 'api') return false;
  // API metadata documents are intentionally unavailable through a remote
  // share, even though the SPA fallback serves every other non-API GET.
  if (first === 'openapi.json' || first === 'asyncapi.json' || first === 'documentation') {
    return false;
  }
  return true;
}

/** Read-only endpoints used while the bundled Web client establishes itself. */
function isWebBootstrapApiRead(segments: readonly string[]): boolean {
  return (
    segments.length === 3 &&
    new Set(['healthz', 'auth', 'meta']).has(segments[2] as string)
  );
}

function isSessionRead(segments: readonly string[], sessionId: string | null): boolean {
  if (segments.length === 3) return true; // projected by the sessions route itself
  if (!isSessionAllowed(segments[3], sessionId)) return false;
  if (segments.length === 4) return true;

  const resource = segments[4];
  if (segments.length === 5) {
    return new Set([
      'snapshot',
      'messages',
      'status',
      'tasks',
      'approvals',
      'questions',
    ]).has(resource as string);
  }
  return segments.length === 6 && resource === 'messages';
}

function isSessionWrite(segments: readonly string[], sessionId: string | null): boolean {
  if (segments.length === 4) {
    const target = actionTarget(segments[3] as string, ['abort']);
    return target !== undefined && isSessionAllowed(target, sessionId);
  }
  if (!isSessionAllowed(segments[3], sessionId)) return false;

  if (segments.length === 5) {
    return segments[4] === 'prompts' || segments[4] === 'prompts:steer';
  }
  if (segments.length !== 6) return false;

  const resource = segments[4];
  const tail = segments[5] as string;
  if (resource === 'approvals' || resource === 'questions') return tail.length > 0;
  if (resource === 'prompts') return hasAction(tail, ['abort', 'steer']);
  if (resource === 'tasks') return hasAction(tail, ['cancel']);
  return false;
}

function isSessionAllowed(candidate: string | undefined, sessionId: string | null): boolean {
  return candidate !== undefined && candidate !== '__global__' && (sessionId === null || candidate === sessionId);
}

function actionTarget(tail: string, allowed: readonly string[]): string | undefined {
  const colon = tail.lastIndexOf(':');
  if (colon <= 0 || colon === tail.length - 1) return undefined;
  return allowed.includes(tail.slice(colon + 1)) ? tail.slice(0, colon) : undefined;
}

function hasAction(tail: string, allowed: readonly string[]): boolean {
  return actionTarget(tail, allowed) !== undefined;
}
