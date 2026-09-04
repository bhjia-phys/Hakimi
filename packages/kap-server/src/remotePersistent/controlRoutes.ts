/**
 * Long-lived remote-control routes — the main-listener REST surface driving
 * the host-provided {@link IRemotePersistentController}. Registered ONLY on
 * the main listener via `startServer({ remotePersistentController })` and only
 * when the `remote_control` flag is on; the standalone `remote serve` process
 * never passes a controller, so these routes are not registered on the public
 * remote listener.
 *
 * Wire actions follow the `:action` URL convention (`/api/v1/remote-persistent:start` /
 * `/api/v1/remote-persistent:stop`). The Fastify path is a single same-segment
 * param `:action` (via OpenAPI `{action}` — `defineRoute` rewrites it to
 * `:action`, which find-my-way matches as literal `remote-persistent` + param,
 * capturing the `:start` / `:stop` suffix), mirroring the remote-share routes.
 */

import { z } from 'zod';

import { okEnvelope, errEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import { ErrorCode } from '../protocol/error-codes';
import { validationEnvelope } from '../transport/errors';
import {
  projectRemotePersistentStatus,
  REMOTE_PERSISTENT_START_FAILED_CODE,
  REMOTE_PERSISTENT_STOP_FAILED_CODE,
  REMOTE_PERSISTENT_UNSUPPORTED_CODE,
  RemotePersistentError,
  type IRemotePersistentController,
  type RemotePersistentStatus,
} from './contract';

interface RemotePersistentControlRouteHost {
  get(
    path: string,
    options: { schema?: Record<string, unknown> },
    handler: (req: { id: string }, reply: { send(payload: unknown): unknown }) => unknown,
  ): unknown;
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; params: { action: string }; body?: unknown },
      reply: { send(payload: unknown): unknown },
    ) => unknown,
  ): unknown;
}

export interface RemotePersistentControlRoutesOptions {
  readonly controller: IRemotePersistentController;
}

const remotePersistentStatusDataSchema = z.object({
  active: z.boolean(),
  state: z.string(),
  health: z.enum(['ok', 'down', 'stale', 'unknown']),
  origin: z.string().nullable(),
  url: z.string().nullable(),
  port: z.number().nullable(),
  started_at: z.string().nullable(),
  systemd_available: z.boolean(),
  message: z.string().nullable(),
});

const remotePersistentActionBodySchema = z.object({}).strict().partial().optional();

function validationOf(error: z.ZodError, requestId: string): ReturnType<typeof validationEnvelope> {
  return validationEnvelope(
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    requestId,
  );
}

export function registerRemotePersistentControlRoutes(
  app: RemotePersistentControlRouteHost,
  opts: RemotePersistentControlRoutesOptions,
): void {
  const statusRoute = defineRoute(
    {
      method: 'GET',
      path: '/remote-persistent',
      success: { data: remotePersistentStatusDataSchema },
      description: 'Current persistent remote-control state (credential appears only in the URL fragment)',
      tags: ['remote-persistent'],
    },
    async (req, reply) => {
      const status = await opts.controller.status();
      reply.send(okEnvelope(projectRemotePersistentStatus(status), req.id));
    },
  );
  app.get(
    statusRoute.path,
    statusRoute.options,
    statusRoute.handler as Parameters<RemotePersistentControlRouteHost['get']>[2],
  );

  const actionRoute = defineRoute(
    {
      method: 'POST',
      path: '/remote-persistent{action}',
      body: remotePersistentActionBodySchema,
      params: z.object({ action: z.string() }),
      success: { data: remotePersistentStatusDataSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
        [REMOTE_PERSISTENT_START_FAILED_CODE]: {},
        [REMOTE_PERSISTENT_STOP_FAILED_CODE]: {},
        [REMOTE_PERSISTENT_UNSUPPORTED_CODE]: {},
      },
      description:
        'Start (`:start`) or stop (`:stop`) the persistent remote service; returns browser-facing state without a separate token field',
      tags: ['remote-persistent'],
    },
    async (req, reply) => {
      const action = req.params.action;
      if (action === ':start' || action === ':stop') {
        const parsed = remotePersistentActionBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          reply.send(validationOf(parsed.error, req.id));
          return;
        }
        try {
          const status: RemotePersistentStatus =
            action === ':start' ? await opts.controller.start() : await opts.controller.stop();
          reply.send(okEnvelope(projectRemotePersistentStatus(status), req.id));
          return;
        } catch (error) {
          if (error instanceof RemotePersistentError) {
            reply.send(errEnvelope(error.code, error.message, req.id));
            return;
          }
          throw error;
        }
      }
      reply.send(
        validationEnvelope(
          [{ path: 'action', message: `unsupported action: ${action}` }],
          req.id,
        ),
      );
    },
  );
  app.post(
    actionRoute.path,
    actionRoute.options,
    actionRoute.handler as Parameters<RemotePersistentControlRouteHost['post']>[2],
  );
}