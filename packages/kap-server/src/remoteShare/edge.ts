/**
 * Remote-share edge listener — a second, FULL loopback listener that reuses
 * the main server's Core, transcript service, broadcaster, fs bridge, and gui
 * store without a second `bootstrap()`.
 *
 * The factory lives in the `startServer` closure; the controller calls it with
 * `{ sessionId, authTokenService, webAssetsDir? }` and it returns
 * `{ host, port, close }`. The edge registers the STANDARD `/api/v1` +
 * `/api/v2` surfaces and the full WS protocol, so a Web client authenticated
 * through the ephemeral per-share credential gets the same data plane as the
 * main listener — no `remoteAccess` allowlist, no per-route `remoteSessionId`
 * narrowing, no remote response projection. The initial `sessionId` is only
 * the Web landing point and status/deep-link input.
 *
 * What the edge keeps from the restricted profile:
 *
 *   - a `127.0.0.1:0` bind reached through a public tunnel, hardened like a
 *     public bind (`.trycloudflare.com` Host suffix, security headers,
 *     auth-failure limiter) with Host/Origin validation hard-wired on;
 *   - its OWN connection registry / WebSocket server / limiter — never the
 *     main listener's registry — while sharing the broadcaster, transcript
 *     service, gui store, and fs bridge (connections unregister from them on
 *     close);
 *   - no debug RPC, PTY terminals, shutdown route, or nested
 *     remote-share / remote-persistent control routes (`enableShutdown` /
 *     `enableTerminals` come from `start.ts`, which keeps the standalone
 *     `kimi remote` policy: disabled on a tunnel-exposed surface; the Web
 *     client hides the secondary tunnel management).
 *
 * `close()` tears down ONLY those edge-owned pieces: never the shared Core,
 * broadcaster, or bridges, and nothing is written to the instance registry.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type { Scope } from '@moonshot-ai/agent-core-v2';
import type { KimiHostIdentity } from '@moonshot-ai/kimi-code-oauth';

import { installErrorHandler } from '../error-handler';
import { createAuthHook } from '../middleware/auth';
import { createHostCheck } from '../middleware/hostnames';
import { createOriginHook, isOriginAllowed } from '../middleware/origin';
import { createAuthFailureLimiter } from '../middleware/rateLimit';
import { createSecurityHeadersHook } from '../middleware/securityHeaders';
import { resolveRequestId } from '../request-id';
import { registerRequestLogging } from '../requestLogging';
import { registerApiV1Routes } from '../routes/registerApiV1Routes';
import { registerApiV2Routes } from '../routes/registerApiV2Routes';
import { registerWebAssetRoutes } from '../routes/webAssets';
import { createCredentialValidator } from '../services/auth/credentials';
import type { IGuiStoreService } from '../services/guiStore/guiStore';
import type { ServerLogger } from '../services/pinoLoggerService';
import type { TranscriptService } from '../services/transcript/transcriptService';
import { ConnectionRegistry } from '../transport/ws/connectionRegistry';
import { createWsUpgradeHandler } from '../transport/ws/upgrade';
import { registerWsV1 } from '../transport/ws/v1/registerWsV1';
import type { SessionEventBroadcaster } from '../transport/ws/v1/sessionEventBroadcaster';
import type { FsWatchBridge } from '../transport/ws/v1/fsWatchBridge';
import type {
  RemoteAccessEdge,
  RemoteAccessEdgeFactory,
} from './contract';

/** Edge listeners always bind loopback; a tunnel carries them to the public. */
const EDGE_HOST = '127.0.0.1';

/** Host suffix admitted on the edge — matches the main listener's remote mode. */
const EDGE_TUNNEL_HOSTS = ['.trycloudflare.com'];

/** Shared, process-wide resources the edge reuses (never disposes). */
export interface RemoteShareEdgeDeps {
  readonly core: Scope;
  readonly serverVersion: string;
  /**
   * Host product identity — required by the standard v1 registration (the
   * session export route stamps its manifest from `hostIdentity.version`).
   */
  readonly hostIdentity: KimiHostIdentity;
  readonly transcriptService: TranscriptService;
  readonly broadcaster: SessionEventBroadcaster;
  readonly fsWatchBridge: FsWatchBridge;
  readonly guiStore: IGuiStoreService;
  readonly logger: ServerLogger;
  /** Main listener's web assets; the per-call `webAssetsDir` arg overrides it. */
  readonly webAssetsDir?: string;
  /** Plugin marketplace catalog URL — resolved exactly like the main listener. */
  readonly pluginMarketplaceUrl: string;
  /** True when the catalog URL is the built-in default (no option/env set). */
  readonly pluginMarketplaceIsDefault: boolean;
  /**
   * Surface policy for the standard v1 registration. The edge is reached
   * through a public tunnel, so `start.ts` keeps the standalone `kimi remote`
   * policy: PTY terminals and the shutdown route stay disabled (and the edge
   * never registers the debug RPC surface, which is not even plumbed here).
   */
  readonly enableShutdown: boolean;
  readonly enableTerminals: boolean;
  /**
   * Required by the standard v1 registration. Unreachable while
   * `enableShutdown` is false (the shutdown route is not registered); kept
   * for the shared contract.
   */
  readonly onShutdown: () => void;
}

export function createRemoteShareEdgeFactory(deps: RemoteShareEdgeDeps): RemoteAccessEdgeFactory {
  return (args) => buildEdge(deps, args);
}

async function buildEdge(deps: RemoteShareEdgeDeps, args: {
  sessionId: string;
  authTokenService: import('../services/auth/authTokenService').IAuthTokenService;
  webAssetsDir?: string;
}): Promise<RemoteAccessEdge> {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Fastify's default access log records `res.statusCode`, but every
    // kap-server response is HTTP 200 by design — mirror the main listener.
    disableRequestLogging: true,
    genReqId: (req) => resolveRequestId(req.headers),
  }) as unknown as FastifyInstance;
  const connectionRegistry = new ConnectionRegistry();
  const authLimiter = createAuthFailureLimiter({ logger: deps.logger });
  const validateCredential = createCredentialValidator(args.authTokenService);

  try {
    registerRequestLogging(app, {
      // Remote URLs can carry foreign ids or prompt/task lookup keys — never
      // persist a remote URL (matching the main listener's remote mode).
      redactUrl: () => true,
    });
    // Validation is performed by the route-level Zod preHandlers (defineRoute),
    // not by Fastify's AJV layer — keep both compilers as pass-throughs.
    app.setValidatorCompiler(() => () => true);
    app.setSerializerCompiler(() => (data) => JSON.stringify(data));
    installErrorHandler(app);

    // Host / Origin: the edge is never reached directly as a public surface —
    // only via the loopback bind or a `.trycloudflare.com` tunnel, so the host
    // check is hard-wired on (never disabled) and the origin allowlist is
    // empty (the tunnel origin is same-origin to the tunnel Host).
    const hostCheck = createHostCheck({
      boundHost: EDGE_HOST,
      extra: EDGE_TUNNEL_HOSTS,
      disable: false,
    });
    app.addHook('onRequest', hostCheck.onRequest);
    app.addHook('onRequest', createOriginHook({ allowedOrigins: [] }));
    // The edge accepts ONLY its ephemeral per-share credential; the main
    // listener's token must not authenticate here.
    app.addHook(
      'onRequest',
      createAuthHook(args.authTokenService, { limiter: authLimiter, validateCredential }),
    );
    // No post-auth remote boundary: the authenticated Web client gets the
    // full standard surface, so no `createRemoteAccessHook`, no remote error /
    // response projection, and no per-route `remoteSessionId` narrowing.
    // A loopback listener reached through a public tunnel still needs the
    // public hardening profile (security headers) even though the bind is
    // local-only.
    app.addHook('onSend', createSecurityHeadersHook({ tls: false }));

    // Standard v1 surface, minus the surfaces that must not cross a public
    // tunnel: debug RPC (`debugEndpoints` hard-false), PTY terminals and
    // shutdown (`enableShutdown` / `enableTerminals` from `start.ts`), and the
    // nested remote-share / remote-persistent control routes (never mounted on
    // the edge — the Web client hides the secondary tunnel management).
    await registerApiV1Routes(app, deps.core, {
      serverVersion: deps.serverVersion,
      hostIdentity: deps.hostIdentity,
      debugEndpoints: false,
      enableShutdown: deps.enableShutdown,
      enableTerminals: deps.enableTerminals,
      guiStore: deps.guiStore,
      pluginMarketplaceUrl: deps.pluginMarketplaceUrl,
      pluginMarketplaceIsDefault: deps.pluginMarketplaceIsDefault,
      onShutdown: deps.onShutdown,
      connectionRegistry,
      broadcaster: deps.broadcaster,
      transcriptService: deps.transcriptService,
      dangerousBypassAuth: false,
    });
    await registerApiV2Routes(app, deps.core);

    // The edge owns its WebSocket server + connection registry; the
    // broadcaster and fs bridge stay shared (connections unregister from them
    // on close). Full WS protocol: no `remoteAccess` narrowing.
    const wssV1 = registerWsV1(deps.core, {
      validateCredential,
      registry: connectionRegistry,
      broadcaster: deps.broadcaster,
      fsWatchBridge: deps.fsWatchBridge,
      logger: deps.logger,
    });
    const handleUpgrade = createWsUpgradeHandler({
      wss: wssV1,
      logger: deps.logger,
      hostAllowed: (host) => hostCheck.isAllowed(host),
      originAllowed: (origin, host) => isOriginAllowed(origin, host, []),
      validateCredential,
      requireAuth: true,
    });
    app.server.on('upgrade', (req, socket, head) => {
      void handleUpgrade(req, socket, head).catch((error: unknown) => {
        deps.logger.error({ err: error }, 'ws upgrade handler failed');
      });
    });
    app.addHook('onClose', async () => {
      connectionRegistry.closeAll('remote share closed');
      wssV1.close();
    });

    // Web UI static assets, registered LAST so the `/*` SPA fallback only
    // catches paths not already handled by `/api/*` (mirrors the main
    // listener). The edge's auth hook bypasses non-`/api` paths, so the page
    // loads without a token; API calls carry the edge token.
    const assetsDir = args.webAssetsDir ?? deps.webAssetsDir;
    if (assetsDir !== undefined) {
      await registerWebAssetRoutes(app, assetsDir);
    }

    await app.listen({ host: EDGE_HOST, port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    let closed = false;
    return {
      sessionId: args.sessionId,
      host: EDGE_HOST,
      port,
      close: async (): Promise<void> => {
        if (closed) return;
        closed = true;
        await app.close();
        authLimiter.dispose();
      },
    };
  } catch (error) {
    // Edge bootstrap failed: reclaim only edge-owned resources (listener,
    // connections, limiter) — never the shared Core/broadcaster/bridges.
    authLimiter.dispose();
    await app.close().catch(() => {});
    throw error;
  }
}