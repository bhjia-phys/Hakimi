/**
 * `/sessions/{id}/research` — the local knowledge / research memory toggle.
 *
 * Resolves only the main agent's lightweight mode service. Legacy execution
 * commands return an explicit retired error; historical wire data is untouched.
 * research_mode.updated carries the same snapshot over the normal WS path.
 */

import {
  IAgentAitpModeService,
  dispatchResearchModeCommand,
  resumeSessionById,
  isError2,
  type Scope,
} from '@moonshot-ai/agent-core-v2';
import { z } from 'zod';
import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import { ensureMainAgent } from '../transport/mainAgent';
import {
  getSessionResearchResponseSchema,
  researchCommandRequestSchema,
  researchCommandResponseSchema,
  type ResearchCommand,
} from '../protocol/research';
import { ErrorCode } from '../protocol/error-codes';

const sessionIdParamSchema = z.object({ session_id: z.string().min(1) });
const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

interface SessionRouteHost {
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body: unknown; params: unknown; headers: Record<string, unknown> },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> } | undefined,
    handler: (
      req: { id: string; query: unknown; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

export function registerResearchRoutes(app: SessionRouteHost, core: Scope): void {
  async function modeFor(sessionId: string) {
    const session = await resumeSessionById(core.accessor, sessionId);
    if (session === undefined) return undefined;
    return (await ensureMainAgent(session)).accessor.get(IAgentAitpModeService);
  }
  const getRoute = defineRoute({
    method: 'GET',
    path: '/sessions/{session_id}/research',
    params: sessionIdParamSchema,
    success: { data: getSessionResearchResponseSchema },
    errors: { [ErrorCode.VALIDATION_FAILED]: { detailsSchema }, [ErrorCode.SESSION_NOT_FOUND]: {} },
    description: 'Get Research memory-mode visibility (not CLI health)',
    tags: ['research'],
  }, async (req, reply) => {
    try {
      const { session_id } = req.params as { session_id: string };
      const mode = await modeFor(session_id);
      reply.send(mode === undefined
        ? errEnvelope(ErrorCode.SESSION_NOT_FOUND, `session ${session_id} does not exist`, req.id)
        : okEnvelope(await mode.getSnapshot(), req.id));
    } catch (error) {
      sendResearchError(reply, req.id, error);
    }
  });
  app.get(getRoute.path, getRoute.options, getRoute.handler as Parameters<SessionRouteHost['get']>[2]);

  const commandRoute = defineRoute({
    method: 'POST',
    path: '/sessions/{session_id}/research/command',
    params: sessionIdParamSchema,
    body: researchCommandRequestSchema,
    success: { data: researchCommandResponseSchema },
    errors: { [ErrorCode.VALIDATION_FAILED]: { detailsSchema }, [ErrorCode.SESSION_NOT_FOUND]: {} },
    description: 'Enable or disable Research memory mode; legacy execution commands are retired',
    tags: ['research'],
  }, async (req, reply) => {
    try {
      const { session_id } = req.params as { session_id: string };
      const mode = await modeFor(session_id);
      if (mode === undefined) {
        reply.send(errEnvelope(ErrorCode.SESSION_NOT_FOUND, `session ${session_id} does not exist`, req.id));
        return;
      }
      const { command } = req.body as { command: ResearchCommand };
      const snapshot = await dispatchResearchModeCommand(mode, command);
      reply.send(okEnvelope({ snapshot }, req.id));
    } catch (error) {
      sendResearchError(reply, req.id, error);
    }
  });
  app.post(commandRoute.path, commandRoute.options, commandRoute.handler as Parameters<SessionRouteHost['post']>[2]);
}

function sendResearchError(reply: { send(payload: unknown): unknown }, requestId: string, error: unknown): void {
  if (isError2(error)) {
    const code = error.code === 'session.not_found' || error.code === 'agent.not_found'
      ? ErrorCode.SESSION_NOT_FOUND
      : error.code === 'research.retired' || error.code === 'aitp.mode_not_main_agent'
        ? ErrorCode.VALIDATION_FAILED
        : ErrorCode.INTERNAL_ERROR;
    reply.send(errEnvelope(code, `${error.code}: ${error.message}`, requestId));
    return;
  }
  reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, error instanceof Error ? error.message : String(error), requestId));
}
