/**
 * `aitpResearch` domain — `IAgentResearchService` implementation.
 *
 * Manages the Research state through wire dispatches on the checkpointed
 * `ResearchModel` (questions, lines, focus, pending checkpoint, alerts) and
 * the non-checkpointed `ResearchCursorModel` (committed cursor). Line and
 * question mutations carry optimistic-concurrency revisions. Human
 * steering commands carry `expectedRevision` for optimistic concurrency: a
 * command with a stale revision is rejected. The AITP commit barrier
 * (`commitCheckpoint`) requires a non-empty `entryId` and calls the
 * Session-scope adapter's `show` + `check` before advancing the committed
 * cursor and acknowledging the checkpointed working state. Reads reconcile a
 * committed cursor with an undone pending checkpoint idempotently. Publishes a
 * `research.updated` event carrying the full
 * `ResearchStatusSnapshot` after every direct mutation. Additionally
 * subscribes to `aitp_mode.updated` (fired by each mode op's `toEvent` and
 * by undo / cold restore) so mode, loop, undo, and degraded transitions all
 * produce a complete `research.updated` snapshot push. The subscription
 * cannot cause a cycle: `research.updated` is not subscribed by any mode
 * path. Registers an `onBeforeExecuteTool` veto that blocks
 * `UpdateGoal(complete)` while a pending/uncommitted checkpoint barrier
 * exists, and vetoes AITP mutation tools on subagents. Does not own
 * continuation — Goal is the sole continuation owner. Bound at Agent scope.
 */

import { randomUUID } from 'node:crypto';

import { Service } from '#/_base/di/service';
import { IWireService } from '#/wire/wire';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IEventBus } from '#/app/event/eventBus';
import { IAgentToolExecutorService } from '#/agent/toolExecutor/toolExecutor';
import { denyToolExecution } from '#/agent/toolExecutor/beforeToolExecuteEvent';
import type { BeforeToolExecuteEvent } from '#/agent/toolExecutor/toolHooks';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';
import type {
  HumanSteeringCommand,
  ResearchCheckpoint,
  ResearchCommittedCursor,
  ResearchLine,
  ResearchLineCreationInput,
  ResearchQuestion,
  ResearchStatusSnapshot,
} from '#/features/aitpResearch/types';
import {
  AitpModeModel,
  ResearchModel,
  ResearchCursorModel,
  aitpModeSetLine,
  researchCreateLine,
  researchUpdateLine,
  researchCreateQuestion,
  researchUpdateQuestion,
  researchSetFocus,
  researchSwitchLine,
  researchSteer,
  researchProposeCheckpoint,
  researchCommitCheckpoint,
  researchAcknowledgeCheckpoint,
  researchReopenQuestion,
  type ResearchQuestionRecord,
  type ResearchLineRecord,
  type ResearchCheckpointRecord,
} from '#/features/aitpResearch/aitpResearchOps';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

import {
  type CommitCheckpointInput,
  type CreateQuestionInput,
  IAgentResearchService,
  type ProposeCheckpointInput,
  type UpdateLineInput,
  type UpdateQuestionInput,
} from './agentResearch';

const AITP_MUTATION_TOOLS = new Set([
  'CreateResearchLine',
  'UpdateResearchLine',
  'CreateResearchQuestion',
  'UpdateResearchQuestion',
  'SetResearchFocus',
  'ProposeResearchCheckpoint',
  'CommitResearchCheckpoint',
  'aitp_record_prepare',
  'aitp_record_save',
  'aitp_note_prepare',
  'aitp_note_save',
]);

export class AgentResearchService extends Service implements IAgentResearchService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IWireService private readonly wire: IWireService,
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
    @IEventBus private readonly eventBus: IEventBus,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentToolExecutorService toolExecutor: IAgentToolExecutorService,
  ) {
    super();
    this._register(
      toolExecutor.onBeforeExecuteTool((event) => this.guardToolExecution(event)),
    );
    this._register(
      this.eventBus.subscribe('aitp_mode.updated', () => {
        this.publishResearchUpdated();
      }),
    );
  }

  getSnapshot(): ResearchStatusSnapshot {
    this.reconcileCommittedCheckpoint();
    const state = this.wire.getModel(ResearchModel).current;
    const cursor = this.wire.getModel(ResearchCursorModel);
    const questions = Object.values(state.questions).map(toQuestion);
    const lines = Object.values(state.lines).map(toLine);
    const currentQuestion = state.focus
      ? questions.find((q) => q.id === state.focus!.questionId)
      : undefined;

    return {
      mode: this.mode.phase,
      loopStatus: this.mode.loopStatus,
      currentLineSlug: this.mode.isActive
        ? this.wire.getModel(AitpModeModel).current.currentLineSlug
        : undefined,
      currentFocus: state.focus
        ? {
            questionId: state.focus.questionId,
            boundedAction: state.focus.boundedAction,
            revision: state.focus.revision,
          }
        : undefined,
      currentQuestion,
      questions,
      lines,
      openQuestionCount: questions.filter((q) => q.workflow === 'open').length,
      activeQuestionCount: questions.filter((q) => q.workflow === 'active').length,
      blockedQuestionCount: questions.filter((q) => q.workflow === 'blocked').length,
      alerts: [...state.alerts],
      aitpHealth: this.mode.health ?? { phase: 'inactive' },
      pendingCheckpoint: state.pendingCheckpoint === null
        ? undefined
        : toCheckpoint(state.pendingCheckpoint),
      latestCommittedCheckpoint: cursor.cursor ?? undefined,
      revision: state.revision,
    };
  }

  getQuestions(): readonly ResearchQuestion[] {
    return Object.values(this.wire.getModel(ResearchModel).current.questions).map(toQuestion);
  }

  getLines(): readonly ResearchLine[] {
    return Object.values(this.wire.getModel(ResearchModel).current.lines).map(toLine);
  }

  getPendingCheckpoint(): ResearchCheckpoint | null {
    if (this.reconcileCommittedCheckpoint()) {
      this.publishResearchUpdated();
    }
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    return pending === null ? null : toCheckpoint(pending);
  }

  getCommittedCursor(): ResearchCommittedCursor | null {
    return this.wire.getModel(ResearchCursorModel).cursor;
  }

  createQuestion(input: CreateQuestionInput): ResearchQuestion {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (state.lines[input.lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${input.lineSlug} not found`,
      );
    }
    const id = input.id ?? randomUUID();
    this.wire.dispatch(
      researchCreateQuestion({
        id,
        lineSlug: input.lineSlug,
        wording: input.wording,
        assessment: input.assessment,
        priority: input.priority ?? 0,
        neededEvidence: input.neededEvidence !== undefined ? [...input.neededEvidence] : [],
      }),
    );
    this.publishResearchUpdated();
    const record = this.wire.getModel(ResearchModel).current.questions[id];
    if (record === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Failed to create question ${id}`,
      );
    }
    return toQuestion(record);
  }

  createLine(input: ResearchLineCreationInput): ResearchLine {
    this.assertMutationAllowed();
    const createdAt = Date.now();
    this.wire.dispatch(
      researchCreateLine({
        slug: input.slug,
        title: input.title,
        objective: input.objective,
        assessment: input.assessment,
        createdAt,
      }),
    );
    this.publishResearchUpdated();
    const record = this.wire.getModel(ResearchModel).current.lines[input.slug];
    if (record === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Failed to create line ${input.slug}`,
      );
    }
    return toLine(record);
  }

  updateLine(input: UpdateLineInput): ResearchLine {
    this.assertMutationAllowed();
    const existing = this.wire.getModel(ResearchModel).current.lines[input.slug];
    if (existing === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${input.slug} not found`,
      );
    }
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== 0 &&
      input.expectedRevision !== existing.revision
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research line revision is stale. Expected ${input.expectedRevision}, got ${existing.revision}.`,
      );
    }
    this.wire.dispatch(
      researchUpdateLine({
        slug: input.slug,
        expectedRevision: input.expectedRevision ?? 0,
        title: input.title,
        objective: input.objective,
        status: input.status,
        assessment: input.assessment,
        reason: input.reason,
      }),
    );
    this.publishResearchUpdated();
    return toLine(this.wire.getModel(ResearchModel).current.lines[input.slug]!);
  }

  updateQuestion(input: UpdateQuestionInput): ResearchQuestion {
    this.assertMutationAllowed();
    const existing = this.wire.getModel(ResearchModel).current.questions[input.questionId];
    if (existing === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${input.questionId} not found`,
      );
    }
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== 0 &&
      input.expectedRevision !== existing.revision
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research question revision is stale. Expected ${input.expectedRevision}, got ${existing.revision}.`,
      );
    }
    this.wire.dispatch(
      researchUpdateQuestion({
        questionId: input.questionId,
        expectedRevision: input.expectedRevision ?? 0,
        wording: input.wording,
        assessment: input.assessment,
        priority: input.priority,
        workflow: input.workflow,
        epistemic: input.epistemic,
        neededEvidence: input.neededEvidence !== undefined ? [...input.neededEvidence] : undefined,
        nextBoundedAction: input.nextBoundedAction,
        evidenceRefs: input.evidenceRefs !== undefined ? [...input.evidenceRefs] : undefined,
        falsifierRefs: input.falsifierRefs !== undefined ? [...input.falsifierRefs] : undefined,
        reason: input.reason,
        actor: 'model',
      }),
    );
    this.publishResearchUpdated();
    const record = this.wire.getModel(ResearchModel).current.questions[input.questionId];
    if (record === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${input.questionId} not found`,
      );
    }
    return toQuestion(record);
  }

  setFocus(questionId: string, boundedAction?: string | number, expectedRevision?: number): void {
    this.assertMutationAllowed();
    const focusBoundedAction = typeof boundedAction === 'string' ? boundedAction : undefined;
    const focusExpectedRevision = typeof boundedAction === 'number' ? boundedAction : expectedRevision;
    const state = this.wire.getModel(ResearchModel).current;
    const revision = focusExpectedRevision ?? state.revision;
    if (revision !== 0 && revision !== state.revision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${revision}, got ${state.revision}.`,
      );
    }
    const question = state.questions[questionId];
    if (question === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${questionId} not found`,
      );
    }
    if (state.lines[question.lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${question.lineSlug} not found`,
      );
    }
    const currentLineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    const lineChanged = currentLineSlug !== question.lineSlug;
    this.wire.dispatch(
      researchSetFocus({
        questionId,
        boundedAction: focusBoundedAction,
        expectedRevision: state.revision,
      }),
    );
    if (lineChanged) {
      this.wire.dispatch(aitpModeSetLine({ lineSlug: question.lineSlug }));
      return;
    }
    this.publishResearchUpdated();
  }

  switchLine(lineSlug: string, expectedRevision?: number): void {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (state.lines[lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${lineSlug} not found`,
      );
    }
    const revision = expectedRevision ?? state.revision;
    if (revision !== 0 && revision !== state.revision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${revision}, got ${state.revision}.`,
      );
    }
    const currentLineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    const lineChanged = currentLineSlug !== lineSlug;
    const focusQuestion = state.focus === null
      ? undefined
      : state.questions[state.focus.questionId];
    const focusBelongsElsewhere = focusQuestion !== undefined && focusQuestion.lineSlug !== lineSlug;
    if (!lineChanged && !focusBelongsElsewhere) return;
    this.wire.dispatch(
      researchSwitchLine({
        lineSlug,
        expectedRevision: state.revision,
      }),
    );
    if (lineChanged) {
      this.wire.dispatch(aitpModeSetLine({ lineSlug }));
      return;
    }
    this.publishResearchUpdated();
  }

  steer(command: HumanSteeringCommand): void {
    if (command.kind === 'pause_loop') {
      this.assertMainAgent();
      this.mode.pauseLoop(command.expectedRevision);
      return;
    }
    if (command.kind === 'resume_loop') {
      this.assertMainAgent();
      this.mode.resumeLoop(command.expectedRevision);
      return;
    }
    if (command.kind === 'reopen_question') {
      this.reopenQuestion(command.questionId, command.reason, command.expectedRevision);
      return;
    }

    const allowsPausedLoop = command.kind === 'defer_question' ||
      command.kind === 'block_question' ||
      command.kind === 'close_question';
    if (allowsPausedLoop) this.assertStateMutationAllowed();
    else this.assertMutationAllowed();

    const state = this.wire.getModel(ResearchModel).current;
    if (command.expectedRevision !== 0 && command.expectedRevision !== state.revision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${command.expectedRevision}, got ${state.revision}.`,
      );
    }
    if (command.kind === 'switch_line') {
      this.switchLine(command.lineSlug, command.expectedRevision);
      return;
    }
    if (command.kind === 'set_focus') {
      this.setFocus(command.questionId, command.boundedAction, command.expectedRevision);
      return;
    }
    if ('questionId' in command && state.questions[command.questionId] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${command.questionId} not found`,
      );
    }
    this.wire.dispatch(
      researchSteer({
        kind: command.kind,
        questionId: 'questionId' in command ? command.questionId : undefined,
        lineSlug: undefined,
        expectedRevision: command.expectedRevision,
        wording: 'wording' in command ? command.wording : undefined,
        assessment: 'assessment' in command ? command.assessment : undefined,
        priority: 'priority' in command ? command.priority : undefined,
        workflow: 'workflow' in command ? command.workflow : undefined,
        epistemic: 'epistemic' in command ? command.epistemic : undefined,
        neededEvidence: 'neededEvidence' in command
          ? command.neededEvidence !== undefined
            ? [...command.neededEvidence]
            : undefined
          : undefined,
        nextBoundedAction: 'nextBoundedAction' in command ? command.nextBoundedAction : undefined,
        reason: command.reason,
        actor: 'human',
      }),
    );
    this.publishResearchUpdated();
  }

  reopenQuestion(questionId: string, reason?: string | number, expectedRevision?: number): void {
    this.assertStateMutationAllowed();
    const reopenReason = typeof reason === 'string' ? reason : undefined;
    const reopenExpectedRevision = typeof reason === 'number' ? reason : expectedRevision;
    const state = this.wire.getModel(ResearchModel).current;
    const existing = state.questions[questionId];
    if (existing === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${questionId} not found`,
      );
    }
    const revision = reopenExpectedRevision ?? state.revision;
    if (revision !== 0 && revision !== state.revision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${revision}, got ${state.revision}.`,
      );
    }
    this.wire.dispatch(
      researchReopenQuestion({
        questionId,
        expectedRevision: existing.revision,
        reason: reopenReason,
      }),
    );
    this.publishResearchUpdated();
  }

  proposeCheckpoint(input: ProposeCheckpointInput): ResearchCheckpoint {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (state.pendingCheckpoint !== null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${state.pendingCheckpoint.checkpointId} is already pending commit`,
      );
    }
    const question = input.questionId === undefined ? undefined : state.questions[input.questionId];
    if (input.questionId !== undefined && question === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${input.questionId} not found`,
      );
    }
    const line = input.lineSlug === undefined ? undefined : state.lines[input.lineSlug];
    if (input.lineSlug !== undefined && line === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${input.lineSlug} not found`,
      );
    }
    if (question !== undefined && input.lineSlug !== undefined && question.lineSlug !== input.lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${input.lineSlug} does not own question ${question.id}`,
      );
    }
    const checkpointId = randomUUID();
    const idempotencyKey = randomUUID();
    const createdAt = Date.now();
    this.wire.dispatch(
      researchProposeCheckpoint({
        checkpointId,
        questionId: input.questionId,
        lineSlug: input.lineSlug,
        assessment: input.assessment,
        nextAction: input.nextAction,
        idempotencyKey,
        createdAt,
      }),
    );
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (pending === null || pending.checkpointId !== checkpointId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${checkpointId} could not become pending`,
      );
    }
    this.publishResearchUpdated();
    return toCheckpoint(pending);
  }

  async commitCheckpoint(input: CommitCheckpointInput): Promise<void> {
    this.assertMutationAllowed();
    const current = this.wire.getModel(ResearchModel).current;
    const currentCursor = this.wire.getModel(ResearchCursorModel).cursor;
    const cursorMatches = currentCursor?.checkpointId === input.checkpointId &&
      currentCursor.entryId === input.entryId;
    if (cursorMatches) {
      if (current.pendingCheckpoint?.checkpointId === input.checkpointId) {
        this.wire.dispatch(
          researchAcknowledgeCheckpoint({
            checkpointId: input.checkpointId,
            entryId: input.entryId,
          }),
        );
        this.publishResearchUpdated();
      }
      return;
    }
    if (currentCursor !== null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `A checkpoint is already committed as ${currentCursor.checkpointId}/${currentCursor.entryId}`,
      );
    }
    const pending = current.pendingCheckpoint;
    if (pending === null || pending.checkpointId !== input.checkpointId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `No pending checkpoint with id ${input.checkpointId}`,
      );
    }

    let shown: Awaited<ReturnType<ISessionAitpAdapter['show']>>;
    try {
      shown = await this.adapter.show({ id: input.entryId });
      if (shown.id !== input.entryId || shown.status !== 'active') {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `AITP entry ${input.entryId} was not returned as an active matching entry`,
        );
      }
    } catch (error) {
      this.mode.setPhase('degraded');
      if (error instanceof AitpResearchError) throw error;
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `AITP commit barrier failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const afterShow = this.wire.getModel(ResearchModel).current;
    const afterShowCursor = this.wire.getModel(ResearchCursorModel).cursor;
    const afterShowPending = afterShow.pendingCheckpoint;
    const showAlreadyCommitted = afterShowCursor?.checkpointId === input.checkpointId &&
      afterShowCursor.entryId === input.entryId;
    if (!showAlreadyCommitted) {
      if (
        afterShowCursor !== null ||
        afterShowPending === null ||
        afterShowPending.checkpointId !== input.checkpointId ||
        afterShowPending.idempotencyKey !== pending.idempotencyKey
      ) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
          `Checkpoint ${input.checkpointId} changed while the AITP show barrier was running`,
        );
      }
      let report: Awaited<ReturnType<ISessionAitpAdapter['check']>>;
      try {
        report = await this.adapter.check();
      } catch (error) {
        this.mode.setPhase('degraded');
        if (error instanceof AitpResearchError) throw error;
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `AITP commit barrier failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (report.counts.errors > 0) {
        this.mode.setPhase('degraded');
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `AITP check reports ${report.counts.errors} error finding(s) after commit. Checkpoint remains pending.`,
        );
      }
    }

    const after = this.wire.getModel(ResearchModel).current;
    const afterCursor = this.wire.getModel(ResearchCursorModel).cursor;
    const afterPending = after.pendingCheckpoint;
    if (afterCursor?.checkpointId === input.checkpointId && afterCursor.entryId === input.entryId) {
      if (afterPending?.checkpointId === input.checkpointId) {
        this.wire.dispatch(
          researchAcknowledgeCheckpoint({
            checkpointId: input.checkpointId,
            entryId: input.entryId,
          }),
        );
        this.publishResearchUpdated();
      }
      return;
    }
    if (
      afterCursor !== null ||
      afterPending === null ||
      afterPending.checkpointId !== input.checkpointId ||
      afterPending.idempotencyKey !== pending.idempotencyKey
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} changed while the AITP commit barrier was running`,
      );
    }

    const committedAt = Date.now();
    this.wire.dispatch(
      researchCommitCheckpoint({
        checkpointId: input.checkpointId,
        entryId: input.entryId,
        committedAt,
      }),
      researchAcknowledgeCheckpoint({
        checkpointId: input.checkpointId,
        entryId: input.entryId,
      }),
    );
    const committedCursor = this.wire.getModel(ResearchCursorModel).cursor;
    const remainingPending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (
      committedCursor?.checkpointId !== input.checkpointId ||
      committedCursor.entryId !== input.entryId ||
      remainingPending !== null
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} could not be committed without overwriting state`,
      );
    }
    this.publishResearchUpdated();
  }

  private reconcileCommittedCheckpoint(): boolean {
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    const cursor = this.wire.getModel(ResearchCursorModel).cursor;
    if (pending === null || cursor === null || pending.checkpointId !== cursor.checkpointId) {
      return false;
    }
    this.wire.dispatch(
      researchAcknowledgeCheckpoint({
        checkpointId: pending.checkpointId,
        entryId: cursor.entryId,
      }),
    );
    return this.wire.getModel(ResearchModel).current.pendingCheckpoint === null;
  }

  private assertMainAgent(): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_MODE_NOT_MAIN_AGENT,
        'AITP Research Mode is only available on the main agent.',
      );
    }
  }

  private assertMutationAllowed(): void {
    this.assertMainAgent();
    this.mode.assertResearchMutationAllowed();
  }

  private assertStateMutationAllowed(): void {
    this.assertMainAgent();
    this.mode.assertResearchMutationAllowed({ allowPaused: true });
  }

  private publishResearchUpdated(): void {
    this.eventBus.publish({ type: 'research.updated', snapshot: this.getSnapshot() });
  }

  private async guardToolExecution(event: BeforeToolExecuteEvent): Promise<void> {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID && AITP_MUTATION_TOOLS.has(event.toolCall.name)) {
      event.veto(
        denyToolExecution(
          'AITP/Research mutation tools are only available on the main agent. Use typed packets to return results.',
        ),
      );
      return;
    }

    if (event.toolCall.name === 'UpdateGoal') {
      const args = event.args;
      if (isPlainRecord(args) && args['status'] === 'complete' && this.mode.isActive) {
        const pending = this.getPendingCheckpoint();
        if (pending !== null) {
          event.veto(
            denyToolExecution(
              'Goal completion is blocked: a research checkpoint is pending commit. Commit or discard it before completing the goal.',
            ),
          );
        }
      }
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCheckpoint(r: ResearchCheckpointRecord): ResearchCheckpoint {
  return {
    checkpointId: r.checkpointId,
    questionId: r.questionId,
    lineSlug: r.lineSlug,
    assessment: r.assessment,
    nextAction: r.nextAction,
    idempotencyKey: r.idempotencyKey,
    persistence: r.persistence,
    createdAt: r.createdAt,
  };
}

function toQuestion(r: ResearchQuestionRecord): ResearchQuestion {
  return {
    id: r.id,
    lineSlug: r.lineSlug,
    wording: r.wording,
    assessment: r.assessment,
    priority: r.priority,
    neededEvidence: r.neededEvidence,
    evidenceRefs: r.evidenceRefs,
    falsifierRefs: r.falsifierRefs,
    nextBoundedAction: r.nextBoundedAction,
    workflow: r.workflow,
    epistemic: r.epistemic,
    persistence: r.persistence,
    revision: r.revision,
  };
}

function toLine(r: ResearchLineRecord): ResearchLine {
  return {
    slug: r.slug,
    title: r.title,
    objective: r.objective,
    assessment: r.assessment,
    status: r.status,
    createdAt: r.createdAt,
    revision: r.revision,
  };
}
