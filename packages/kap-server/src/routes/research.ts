/**
 * `/sessions/{id}/research` route handlers — AITP Research Mode REST surface.
 *
 * Both routes resolve the session's main agent (materializing it on demand via
 * `ensureMainAgent`) and read/dispatch through the Agent-scope
 * `IAgentResearchService` and `IAgentAitpModeService`. Loop commands use the
 * dedicated mode service; focus, line, and question commands use their typed
 * Research methods, whose expected-revision guards remain engine-owned.
 * The `expectedRevision` optimistic-concurrency guard is enforced by the
 * engine; mode lifecycle (`enter_mode` / `exit_mode`) goes through
 * `IAgentAitpModeService`.
 * `research.updated` / `aitp_mode.updated` WS events are forwarded by the
 * session event broadcaster's generic `onAgentEvent` path — no extra wiring
 * is needed here.
 */

import {
  IAgentResearchService,
  IAgentAitpModeService,
  resumeSessionById,
  isError2,
  type Scope,
} from '@moonshot-ai/agent-core-v2';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { requestLog } from '../lib/requestLog';
import { defineRoute } from '../middleware/defineRoute';
import { ensureMainAgent } from '../transport/mainAgent';
import {
  getSessionResearchResponseSchema,
  researchCommandRequestSchema,
  researchCommandResponseSchema,
  type ResearchCommand,
} from '../protocol/research';
import { ErrorCode } from '../protocol/error-codes';

const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

const sessionIdParamSchema = z.object({
  session_id: z.string().min(1),
});

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
  const getResearchRoute = defineRoute(
    {
      method: 'GET',
      path: '/sessions/{session_id}/research',
      params: sessionIdParamSchema,
      success: { data: getSessionResearchResponseSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'Get the current AITP research-mode snapshot',
      tags: ['research'],
    },
    async (req, reply) => {
      try {
        const { session_id } = req.params as { session_id: string };
        const session = await resumeSessionById(core.accessor, session_id);
        if (session === undefined) {
          reply.send(
            errEnvelope(
              ErrorCode.SESSION_NOT_FOUND,
              `session ${session_id} does not exist`,
              req.id,
            ),
          );
          return;
        }
        const agent = await ensureMainAgent(session);
        const snapshot = agent.accessor.get(IAgentResearchService).getSnapshot();
        reply.send(okEnvelope(snapshot, req.id));
      } catch (error) {
        sendResearchError(reply, req.id, error);
      }
    },
  );
  app.get(
    getResearchRoute.path,
    getResearchRoute.options,
    getResearchRoute.handler as Parameters<SessionRouteHost['get']>[2],
  );

  const commandResearchRoute = defineRoute(
    {
      method: 'POST',
      path: '/sessions/{session_id}/research/command',
      params: sessionIdParamSchema,
      body: researchCommandRequestSchema,
      success: { data: researchCommandResponseSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'Submit a research steering command',
      tags: ['research'],
    },
    async (req, reply) => {
      try {
        const { session_id } = req.params as { session_id: string };
        const session = await resumeSessionById(core.accessor, session_id);
        if (session === undefined) {
          reply.send(
            errEnvelope(
              ErrorCode.SESSION_NOT_FOUND,
              `session ${session_id} does not exist`,
              req.id,
            ),
          );
          return;
        }
        const agent = await ensureMainAgent(session);
        const research = agent.accessor.get(IAgentResearchService);
        const mode = agent.accessor.get(IAgentAitpModeService);
        const command = (req.body as { command: ResearchCommand }).command;
        await dispatchResearchCommand(research, mode, command);
        const snapshot = research.getSnapshot();
        requestLog(req)?.info(
          { session_id, command_kind: command.kind },
          'research command completed',
        );
        reply.send(okEnvelope({ snapshot }, req.id));
      } catch (error) {
        sendResearchError(reply, req.id, error);
      }
    },
  );
  app.post(
    commandResearchRoute.path,
    commandResearchRoute.options,
    commandResearchRoute.handler as Parameters<SessionRouteHost['post']>[2],
  );
}

async function dispatchResearchCommand(
  research: IAgentResearchService,
  mode: IAgentAitpModeService,
  cmd: ResearchCommand,
): Promise<void> {
  switch (cmd.kind) {
    case 'enter_mode':
      await mode.enter({ actor: cmd.actor, lineSlug: cmd.lineSlug });
      break;
    case 'exit_mode':
      await mode.exit();
      break;
    case 'pause_loop':
      mode.pauseLoop(cmd.expectedRevision);
      break;
    case 'resume_loop':
      mode.resumeLoop(cmd.expectedRevision);
      break;
    case 'create_question':
      research.createQuestion({
        lineSlug: cmd.lineSlug,
        wording: cmd.wording,
        assessment: cmd.assessment,
        priority: cmd.priority,
        neededEvidence: cmd.neededEvidence,
      });
      break;
    case 'create_line':
      research.createLine({
        slug: cmd.slug,
        title: cmd.title,
        objective: cmd.objective,
        assessment: cmd.assessment,
      });
      break;
    case 'update_line':
      research.updateLine({
        slug: cmd.lineSlug,
        expectedRevision: cmd.expectedRevision,
        title: cmd.title,
        objective: cmd.objective,
        status: cmd.status,
        assessment: cmd.assessment,
        reason: cmd.reason,
      });
      break;
    case 'update_question':
      research.updateQuestion({
        questionId: cmd.questionId,
        expectedRevision: cmd.expectedRevision,
        wording: cmd.wording,
        assessment: cmd.assessment,
        priority: cmd.priority,
        workflow: cmd.workflow,
        epistemic: cmd.epistemic,
        neededEvidence: cmd.neededEvidence,
        nextBoundedAction: cmd.nextBoundedAction,
        reason: cmd.reason,
      });
      break;
    case 'set_focus':
      research.setFocus(cmd.questionId, cmd.boundedAction, cmd.expectedRevision);
      break;
    case 'switch_line':
      research.switchLine(cmd.lineSlug, cmd.expectedRevision);
      break;
    case 'reopen_question':
      research.reopenQuestion(cmd.questionId, cmd.reason, cmd.expectedRevision);
      break;
    case 'defer_question':
      research.steer({
        kind: 'defer_question',
        questionId: cmd.questionId,
        expectedRevision: cmd.expectedRevision,
        reason: cmd.reason,
      });
      break;
    case 'block_question':
      research.steer({
        kind: 'block_question',
        questionId: cmd.questionId,
        expectedRevision: cmd.expectedRevision,
        reason: cmd.reason,
      });
      break;
    case 'close_question':
      research.steer({
        kind: 'close_question',
        questionId: cmd.questionId,
        expectedRevision: cmd.expectedRevision,
        reason: cmd.reason,
      });
      break;
    case 'propose_checkpoint':
      research.proposeCheckpoint({
        questionId: cmd.questionId,
        lineSlug: cmd.lineSlug,
        assessment: cmd.assessment,
        nextAction: cmd.nextAction,
      });
      break;
    case 'commit_checkpoint':
      await research.commitCheckpoint({
        checkpointId: cmd.checkpointId,
        entryId: cmd.entryId,
      });
      break;
  }
}

/** Engine error codes that are client-actionable (flag disabled, revision
 * stale, not found, plan conflict, ...). Mapped onto VALIDATION_FAILED — the
 * same 4xx envelope used for `validation.failed` / `request.invalid`. */
const RESEARCH_CLIENT_ERRORS: ReadonlySet<string> = new Set([
  'aitp.mode_flag_disabled',
  'aitp.mode_already_active',
  'aitp.mode_inactive',
  'aitp.mode_not_main_agent',
  'aitp.mode_plan_conflict',
  'aitp.checkpoint_pending',
  'aitp.checkpoint_degraded',
  'research.revision_stale',
  'research.question_not_found',
  'research.line_not_found',
  'research.loop_paused',
]);

function sendResearchError(
  reply: { send(payload: unknown): unknown },
  requestId: string,
  err: unknown,
): void {
  if (isError2(err)) {
    const code = String(err.code);
    if (code === 'session.not_found' || code === 'agent.not_found') {
      reply.send(
        errEnvelope(ErrorCode.SESSION_NOT_FOUND, err.message, requestId, err.stack),
      );
      return;
    }
    if (RESEARCH_CLIENT_ERRORS.has(code)) {
      reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, err.message, requestId, err.stack));
      return;
    }
  }
  reply.send(
    errEnvelope(
      ErrorCode.INTERNAL_ERROR,
      err instanceof Error ? err.message : String(err),
      requestId,
      err instanceof Error ? err.stack : undefined,
    ),
  );
}
