/**
 * Remote-share control routes — the main-listener REST surface driving the
 * {@link IRemoteShareController}. Registered ONLY on the main listener and
 * only when the host supplied a controller (and the `remote_control` flag is
 * on); the remote edge never mounts these paths, so they are not found there.
 *
 * Wire actions follow the `:action` URL convention (`/api/v1/remote-share:start` /
 * `/api/v1/remote-share:stop`). The Fastify path is a single same-segment param
 * `:action` (via OpenAPI `{action}` — `defineRoute` rewrites it to `:action`,
 * which find-my-way matches as literal `remote-share` + param, capturing the
 * `:start` / `:stop` suffix) because find-my-way cannot declare two
 * structurally-identical literal+param paths for the two actions.
 */

import { z } from 'zod';

import { okEnvelope, errEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import { validationEnvelope } from '../transport/errors';
import { ErrorCode } from '../protocol/error-codes';
import {
  REMOTE_SHARE_ALREADY_ACTIVE_CODE,
  REMOTE_SHARE_MAX_TTL_SECONDS,
  RemoteShareError,
} from './controller';
import {
  projectRemoteShareStatus,
  type IRemoteShareController,
  type RemoteAccessEdgeFactory,
  type RemoteShareStatus,
} from './contract';

interface RemoteShareControlRouteHost {
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

export interface RemoteShareControlRoutesOptions {
  readonly controller: IRemoteShareController;
  readonly edgeFactory: RemoteAccessEdgeFactory;
}

const remoteShareStatusDataSchema = z.object({
  active: z.boolean(),
  session_id: z.string().nullable(),
  host: z.string().nullable(),
  port: z.number().nullable(),
  url: z.string().nullable(),
  ttl_seconds: z.number().nullable(),
  started_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});

const remoteShareStartBodySchema = z.object({
  session_id: z.string().min(1),
  ttl: z
    .number()
    .int()
    .positive()
    .max(REMOTE_SHARE_MAX_TTL_SECONDS)
    .optional(),
});
const remoteShareStopBodySchema = z.object({}).strict();
// The dispatcher has one Fastify route for both actions. Its pre-handler must
// admit the empty object sent by ordinary JSON clients for `:stop`; each action
// is then validated against its exact body below.
const remoteShareActionBodySchema = remoteShareStartBodySchema.partial().strict().optional();

function validationOf(error: z.ZodError, requestId: string): ReturnType<typeof validationEnvelope> {
  return validationEnvelope(
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    requestId,
  );
}

export function registerRemoteShareControlRoutes(
  app: RemoteShareControlRouteHost,
  opts: RemoteShareControlRoutesOptions,
): void {
  const statusRoute = defineRoute(
    {
      method: 'GET',
      path: '/remote-share',
      success: { data: remoteShareStatusDataSchema },
      description: 'Current remote-share state (credential appears only in the URL fragment)',
      tags: ['remote-share'],
    },
    (req, reply) => {
      reply.send(okEnvelope(projectRemoteShareStatus(opts.controller.status()), req.id));
    },
  );
  app.get(
    statusRoute.path,
    statusRoute.options,
    statusRoute.handler as Parameters<RemoteShareControlRouteHost['get']>[2],
  );

  const actionRoute = defineRoute(
    {
      method: 'POST',
      path: '/remote-share{action}',
      body: remoteShareActionBodySchema,
      params: z.object({ action: z.string() }),
      success: { data: remoteShareStatusDataSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
        [REMOTE_SHARE_ALREADY_ACTIVE_CODE]: {},
      },
      description:
        'Start (`:start`, body `{ session_id, ttl? }`) or stop (`:stop`) the remote share; returns browser-facing state without a separate token field',
      tags: ['remote-share'],
    },
    async (req, reply) => {
      const action = req.params.action;
      if (action === ':start') {
        const parsed = remoteShareStartBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          reply.send(validationOf(parsed.error, req.id));
          return;
        }
        try {
          const result = await opts.controller.start(
            { sessionId: parsed.data.session_id, ttlSeconds: parsed.data.ttl },
            opts.edgeFactory,
          );
          reply.send(okEnvelope(projectRemoteShareStatus(result), req.id));
          return;
        } catch (error) {
          if (error instanceof RemoteShareError) {
            reply.send(errEnvelope(error.code, error.message, req.id));
            return;
          }
          throw error;
        }
      }
      if (action === ':stop') {
        const parsed = remoteShareStopBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          reply.send(validationOf(parsed.error, req.id));
          return;
        }
        const status: RemoteShareStatus = await opts.controller.stop();
        reply.send(okEnvelope(projectRemoteShareStatus(status), req.id));
        return;
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
    actionRoute.handler as Parameters<RemoteShareControlRouteHost['post']>[2],
  );
}