/**
 * Shared `/api/v1/ws` HTTP-upgrade gate used by the main listener and by the
 * remote-share edge listener.
 *
 * The raw `upgrade` event bypasses Fastify's `onRequest` hooks, so host /
 * origin checks must be enforced explicitly here — BEFORE token validation.
 * Origin is present-only: a missing Origin is treated as a non-browser client
 * and allowed. A token-less (or invalid) upgrade is rejected with `401` for
 * `/api/v1/ws`.
 */

import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import { WebSocketServer } from 'ws';

import type { ServerLogger } from '../../services/pinoLoggerService';
import type { CredentialValidator } from '../../services/auth/credentials';
import { extractWsBearerToken } from './bearerProtocol';
import { WS_PATH } from './v1/registerWsV1';

export interface WsUpgradeHandlerOptions {
  /** The v1 WebSocket server the upgrade is handed to on success. */
  readonly wss: WebSocketServer;
  readonly logger: ServerLogger;
  /** Host-header allowlist predicate (mirrors the HTTP `onRequest` host hook). */
  readonly hostAllowed: (host: string | undefined) => boolean;
  /** Present-only origin predicate (mirrors the HTTP `onRequest` origin hook). */
  readonly originAllowed: (origin: string | undefined, host: string | undefined) => boolean;
  /** Unified credential validator shared with the HTTP auth hook and handshakes. */
  readonly validateCredential?: CredentialValidator;
  /** False only when the operator explicitly bypassed auth (`--dangerous-bypass-auth`). */
  readonly requireAuth: boolean;
}

export function createWsUpgradeHandler(
  opts: WsUpgradeHandlerOptions,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void> {
  const { wss, logger } = opts;

  return async (req, socket, head): Promise<void> => {
    const url = req.url ?? '';
    const isV1 = url === WS_PATH || url.startsWith(`${WS_PATH}?`);
    if (!isV1) {
      socket.destroy();
      return;
    }

    if (!opts.hostAllowed(req.headers.host)) {
      logger.warn(
        { remoteAddress: req.socket.remoteAddress, path: url, reason: 'host_not_allowed' },
        'ws upgrade rejected',
      );
      (socket as Socket).write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      (socket as Socket).destroy();
      return;
    }
    if (!opts.originAllowed(req.headers.origin, req.headers.host)) {
      logger.warn(
        { remoteAddress: req.socket.remoteAddress, path: url, reason: 'origin_not_allowed' },
        'ws upgrade rejected',
      );
      (socket as Socket).write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      (socket as Socket).destroy();
      return;
    }

    if (opts.requireAuth) {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
      const protocolToken = extractWsBearerToken(req.headers['sec-websocket-protocol']);
      const candidate = bearerToken !== null && bearerToken.length > 0 ? bearerToken : protocolToken;
      let ok = false;
      if (candidate !== null) {
        try {
          ok = await opts.validateCredential?.(candidate) ?? false;
        } catch (error) {
          logger.warn(
            {
              err: error,
              remoteAddress: req.socket.remoteAddress,
              path: url,
              reason: 'credential_validation_error',
            },
            'ws upgrade rejected',
          );
          ok = false;
        }
      }
      if (!ok) {
        logger.warn(
          {
            remoteAddress: req.socket.remoteAddress,
            path: url,
            reason: candidate === null ? 'missing_credential' : 'invalid_credential',
          },
          'ws upgrade rejected',
        );
        (socket as Socket).write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        (socket as Socket).destroy();
        return;
      }
    }

    (socket as Socket).setNoDelay(true);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
}