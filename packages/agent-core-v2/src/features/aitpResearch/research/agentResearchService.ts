/**
 * `aitpResearch` domain — `IAgentResearchService` implementation.
 *
 * Manages the Research state through wire dispatches on the checkpointed
 * `ResearchModel` (questions, lines, focus, pending checkpoint, alerts, and
 * the scientific state layer — phase / action / progress / state change /
 * human gate) and the non-checkpointed `ResearchCursorModel` (committed
 * cursor). Deterministic lifecycle alerts are reconciled from question, mode,
 * checkpoint, and maintenance state; alert records are fingerprinted,
 * replayable, and acknowledgement-aware. Line and question mutations carry
 * optimistic-concurrency revisions. Human steering commands carry
 * `expectedRevision` for optimistic concurrency: a command with a stale revision
 * is rejected. The AITP commit barrier
 * (`commitCheckpoint`) requires a non-empty `entryId` and calls the
 * Session-scope adapter's `show` + `check` before advancing the committed
 * cursor and acknowledging the checkpointed working state. Reads reconcile a
 * committed cursor with an undone pending checkpoint idempotently. The
 * scientific state layer (plan/start/complete/record/set-phase/request/resolve-gate)
 * performs pre-dispatch validation (throws on invalid transitions, missing
 * actions, wrong action status, or mismatched gates) while the wire ops themselves are no-ops
 * on mismatched state so they replay safely. `getScientificProgress(level)`
 * is a pure derived read with brief/detail/audit projections. Publishes a
 * `research.updated` event carrying the full `ResearchStatusSnapshot` after
 * every direct mutation; the snapshot includes the Session coordinator's safe
 * current-state maintenance receipt when the mode is active and a read-only
 * Goal status/budget projection. Additionally subscribes to `aitp_mode.updated`
 * (fired by each mode op's `toEvent` and by undo / cold restore) and
 * `goal.updated`, so mode, loop, undo, degraded, and Goal status/budget
 * transitions all produce a complete `research.updated` snapshot push. These
 * subscriptions only read state and publish Research facts, so they cannot
 * form an event cycle. Registers an `onBeforeExecuteTool` veto that blocks
 * `UpdateGoal(complete)` while Research has a pending checkpoint, degraded
 * mode, or unresolved human gate, and vetoes AITP mutation tools on subagents.
 * Does not own continuation — Goal is the sole continuation owner. Bound at
 * Agent scope.
 */

import { randomUUID } from 'node:crypto';

import { Service } from '#/_base/di/service';
import { IAgentGoalService } from '#/agent/goal/goal';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentToolExecutorService } from '#/agent/toolExecutor/toolExecutor';
import { IEventBus } from '#/app/event/eventBus';
import { IWireService } from '#/wire/wire';
import { denyToolExecution } from '#/agent/toolExecutor/beforeToolExecuteEvent';
import type { BeforeToolExecuteEvent } from '#/agent/toolExecutor/toolHooks';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';
import type {
  HumanSteeringCommand,
  ResearchActionSpec,
  ResearchCheckpoint,
  ResearchCommittedCursor,
  ResearchHumanGate,
  ResearchLine,
  ResearchLineCreationInput,
  ResearchPhase,
  ResearchProgressLevel,
  ResearchProgressReport,
  ResearchQuestion,
  ResearchScientificSnapshot,
  ResearchStateChange,
  ResearchStatusSnapshot,
  ResearchAlert,
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
  researchUpsertAlert,
  researchClearAlert,
  researchAcknowledgeAlert,
  researchPlanAction,
  researchStartAction,
  researchCompleteAction,
  researchRecordProgress,
  researchSetPhase,
  researchRequestHumanDecision,
  researchResolveHumanDecision,
  type ResearchActionSpecRecord,
  type ResearchQuestionRecord,
  type ResearchLineRecord,
  type ResearchCheckpointRecord,
  type ResearchHumanGateRecord,
  type ResearchProgressReportRecord,
  type ResearchStateChangeRecord,
} from '#/features/aitpResearch/aitpResearchOps';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

import {
  type CommitCheckpointInput,
  type CreateQuestionInput,
  IAgentResearchService,
  type PlanActionInput,
  type ProposeCheckpointInput,
  type RecordProgressInput,
  type RequestHumanDecisionInput,
  type ResolveHumanDecisionInput,
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
  'PlanResearchAction',
  'StartResearchAction',
  'CompleteResearchAction',
  'RecordResearchProgress',
  'RequestResearchDecision',
  'SetResearchPhase',
  'ResolveResearchDecision',
  'AcknowledgeResearchAlert',
  'aitp_record_prepare',
  'aitp_record_save',
  'aitp_note_prepare',
  'aitp_note_save',
]);

const ALERT_FINGERPRINTS = {
  degraded: 'research.alert.degraded.mode',
  stale: 'research.alert.stale.maintenance',
  aitpFailure: 'research.alert.blocked.aitp-failure',
  commitFailed: 'research.alert.commit_failed.checkpoint',
  reopened: 'research.alert.reopened.question',
} as const;

type AlertInput = Omit<ResearchAlert, 'acknowledgedAt'>;

function blockedQuestionFingerprint(questionId: string): string {
  return `research.alert.blocked.question.${questionId}`;
}

function blockedQuestionMessage(questionId: string): string {
  return `Question ${questionId} is blocked; resolve its blocking condition before continuing.`;
}

function reopenedQuestionMessage(questionId: string): string {
  return `Question ${questionId} was reopened; reassess it before continuing.`;
}

function now(): number {
  return Date.now();
}

export class AgentResearchService extends Service implements IAgentResearchService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IWireService private readonly wire: IWireService,
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
    @IEventBus private readonly eventBus: IEventBus,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentToolExecutorService toolExecutor: IAgentToolExecutorService,
    @IAgentGoalService private readonly goal: IAgentGoalService,
    @ISessionAitpLifecycleCoordinator private readonly coordinator?: ISessionAitpLifecycleCoordinator,
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
    this._register(
      this.eventBus.subscribe('goal.updated', () => {
        this.publishResearchUpdated();
      }),
    );
    this._register(
      this.wire.hooks.onDidRestore.register('researchAlerts', async (_ctx, next) => {
        await next();
        this.reconcileAlerts();
      }),
    );
  }

  getSnapshot(): ResearchStatusSnapshot {
    this.reconcileCommittedCheckpoint();
    this.reconcileAlerts();
    const state = this.wire.getModel(ResearchModel).current;
    const cursor = this.wire.getModel(ResearchCursorModel);
    const questions = Object.values(state.questions).map(toQuestion);
    const lines = Object.values(state.lines).map(toLine);
    const currentQuestion = state.focus
      ? questions.find((q) => q.id === state.focus!.questionId)
      : undefined;
    const currentLineSlug = this.mode.isActive
      ? this.wire.getModel(AitpModeModel).current.currentLineSlug
      : undefined;
    const aitpMaintenance = this.mode.isActive
      ? this.coordinator?.snapshot()
      : undefined;

    return {
      mode: this.mode.phase,
      loopStatus: this.mode.loopStatus,
      currentLineSlug,
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
      goalSummary: this.getGoalSummary(),
      aitpHealth: this.mode.health ?? { phase: 'inactive' },
      aitpMaintenance,
      pendingCheckpoint: state.pendingCheckpoint === null
        ? undefined
        : toCheckpoint(state.pendingCheckpoint),
      latestCommittedCheckpoint: cursor.cursor ?? undefined,
      phase: state.phase,
      currentAction: state.currentAction === null ? undefined : toActionSpec(state.currentAction),
      latestProgress: state.latestProgress === null ? undefined : toProgressReport(state.latestProgress),
      recentStateChange: state.recentStateChange === null ? undefined : toStateChange(state.recentStateChange),
      humanGate: state.humanGate === null ? undefined : toHumanGate(state.humanGate),
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

  getScientificProgress(level: ResearchProgressLevel): ResearchScientificSnapshot {
    const state = this.wire.getModel(ResearchModel).current;
    const progress = state.latestProgress;
    return {
      phase: state.phase,
      currentAction: state.currentAction === null ? undefined : toActionSpec(state.currentAction),
      latestProgress: level === 'brief'
        ? progress === null
          ? undefined
          : {
              headline: progress.headline,
              question: progress.question,
              motivation: progress.motivation,
              workPerformed: progress.workPerformed,
              result: progress.result,
              mainlineImpact: progress.mainlineImpact,
              uncertainties: progress.uncertainties,
              nextAction: progress.nextAction,
              recordedAt: progress.recordedAt,
            }
        : level === 'detail'
          ? progress === null
            ? undefined
            : { ...progress, detail: progress.detail }
          : progress === null
            ? undefined
            : toProgressReport(progress),
      recentStateChange: state.recentStateChange === null ? undefined : toStateChange(state.recentStateChange),
      humanGate: state.humanGate === null ? undefined : toHumanGate(state.humanGate),
    };
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
      researchUpsertAlert({
        fingerprint: `${ALERT_FINGERPRINTS.reopened}.${questionId}`,
        kind: 'reopened',
        message: reopenedQuestionMessage(questionId),
        questionId,
        lineSlug: existing.lineSlug,
        createdAt: now(),
      }),
    );
    this.publishResearchUpdated();
  }

  acknowledgeAlert(fingerprint: string): void {
    this.assertStateMutationAllowed();
    this.wire.dispatch(researchAcknowledgeAlert({ fingerprint, acknowledgedAt: now() }));
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
      this.markCommitBarrierFailed();
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
        this.markCommitBarrierFailed();
        if (error instanceof AitpResearchError) throw error;
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `AITP commit barrier failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (report.counts.errors > 0) {
        this.markCommitBarrierFailed();
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

  planAction(input: PlanActionInput): ResearchActionSpec {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (
      state.phase !== 'gap_analysis' &&
      state.phase !== 'action_planned' &&
      state.phase !== 'awaiting_human'
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Cannot plan action from phase '${state.phase}'`,
      );
    }
    if (input.questionId !== undefined && state.questions[input.questionId] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${input.questionId} not found`,
      );
    }
    if (input.lineSlug !== undefined && state.lines[input.lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${input.lineSlug} not found`,
      );
    }
    const actionId = input.actionId ?? randomUUID();
    this.wire.dispatch(
      researchPlanAction({
        actionId,
        questionId: input.questionId,
        lineSlug: input.lineSlug,
        kind: input.kind,
        purpose: input.purpose,
        expectedEvidence: input.expectedEvidence !== undefined ? [...input.expectedEvidence] : [],
        stopCondition: input.stopCondition,
        allowedToolKinds: input.allowedToolKinds !== undefined ? [...input.allowedToolKinds] : [],
        requiresHumanApproval: input.requiresHumanApproval ?? false,
        createdAt: Date.now(),
      }),
    );
    this.publishResearchUpdated();
    const record = this.wire.getModel(ResearchModel).current.currentAction;
    if (record === null || record.actionId !== actionId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        `Failed to plan action ${actionId}`,
      );
    }
    return toActionSpec(record);
  }

  startAction(actionId: string): void {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const action = state.currentAction;
    if (action === null || action.actionId !== actionId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        `Action ${actionId} not found`,
      );
    }
    if (action.status !== 'planned') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${actionId} is not in 'planned' status (got '${action.status}')`,
      );
    }
    if (
      action.requiresHumanApproval &&
      (
        state.humanGate === null ||
        state.humanGate.kind !== 'approval' ||
        state.humanGate.actionId !== actionId ||
        state.humanGate.resolvedAt === undefined
      )
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_HUMAN_APPROVAL_REQUIRED,
        `Action ${actionId} requires a resolved human approval gate before it can start`,
      );
    }
    if (state.phase !== 'action_planned') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Cannot start action from phase '${state.phase}'`,
      );
    }
    this.wire.dispatch(researchStartAction({ actionId, startedAt: Date.now() }));
    this.publishResearchUpdated();
  }

  completeAction(actionId: string, status: 'completed' | 'abandoned'): void {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const action = state.currentAction;
    if (action === null || action.actionId !== actionId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        `Action ${actionId} not found`,
      );
    }
    if (action.status !== 'in_progress') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${actionId} is not in 'in_progress' status (got '${action.status}')`,
      );
    }
    if (state.phase !== 'action_executing') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Cannot complete action from phase '${state.phase}'`,
      );
    }
    this.wire.dispatch(researchCompleteAction({ actionId, status, completedAt: Date.now() }));
    this.publishResearchUpdated();
  }

  recordProgress(input: RecordProgressInput): ResearchProgressReport {
    this.assertMutationAllowed();
    if (
      input.phaseChange !== undefined &&
      !isPhaseTransitionValid(input.phaseChange.from, input.phaseChange.to)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Invalid phase transition: ${input.phaseChange.from} → ${input.phaseChange.to}`,
      );
    }
    const recordedAt = Date.now();
    this.wire.dispatch(
      researchRecordProgress({
        headline: input.headline,
        question: input.question,
        motivation: input.motivation,
        workPerformed: input.workPerformed,
        result: input.result,
        mainlineImpact: input.mainlineImpact,
        uncertainties: input.uncertainties !== undefined ? [...input.uncertainties] : [],
        nextAction: input.nextAction,
        phaseChange: input.phaseChange,
        humanDecision: input.humanDecision,
        detail: input.detail === undefined ? undefined : {
          assumptions: input.detail.assumptions !== undefined ? [...input.detail.assumptions] : undefined,
          derivation: input.detail.derivation,
          tests: input.detail.tests !== undefined ? [...input.detail.tests] : undefined,
          observations: input.detail.observations !== undefined ? [...input.detail.observations] : undefined,
          sources: input.detail.sources !== undefined ? [...input.detail.sources] : undefined,
          limitations: input.detail.limitations !== undefined ? [...input.detail.limitations] : undefined,
          detailHint: input.detail.detailHint,
          artifactRefs: input.detail.artifactRefs !== undefined ? [...input.detail.artifactRefs] : undefined,
        },
        recordedAt,
      }),
    );
    this.clearTransitionAlerts();
    this.publishResearchUpdated();
    const record = this.wire.getModel(ResearchModel).current.latestProgress;
    if (record === null || record.recordedAt !== recordedAt) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        'Failed to record progress',
      );
    }
    return toProgressReport(record);
  }

  setPhase(phase: ResearchPhase, reason?: string): ResearchStateChange {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (state.phase === phase) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Phase is already '${phase}'`,
      );
    }
    if (!isPhaseTransitionValid(state.phase, phase)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Invalid phase transition: ${state.phase} → ${phase}`,
      );
    }
    const changedAt = Date.now();
    this.wire.dispatch(researchSetPhase({ phase, reason, changedAt }));
    this.publishResearchUpdated();
    const record = this.wire.getModel(ResearchModel).current.recentStateChange;
    if (record === null || record.changedAt !== changedAt) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Failed to set phase to '${phase}'`,
      );
    }
    return toStateChange(record);
  }

  requestHumanDecision(input: RequestHumanDecisionInput): ResearchHumanGate {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (input.actionId !== undefined && state.currentAction?.actionId !== input.actionId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        `Action ${input.actionId} not found`,
      );
    }
    if (input.questionId !== undefined && state.questions[input.questionId] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${input.questionId} not found`,
      );
    }
    const gateId = input.gateId ?? randomUUID();
    const createdAt = Date.now();
    this.wire.dispatch(
      researchRequestHumanDecision({
        gateId,
        kind: input.kind,
        actionId: input.actionId,
        questionId: input.questionId,
        prompt: input.prompt,
        createdAt,
      }),
    );
    this.publishResearchUpdated();
    const record = this.wire.getModel(ResearchModel).current.humanGate;
    if (record === null || record.gateId !== gateId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_GATE_PENDING,
        `Failed to create human gate ${gateId}`,
      );
    }
    return toHumanGate(record);
  }

  resolveHumanDecision(input: ResolveHumanDecisionInput): ResearchHumanGate {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const gate = state.humanGate;
    if (gate === null || gate.gateId !== input.gateId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_HUMAN_GATE_NOT_FOUND,
        `No unresolved human gate with id ${input.gateId}`,
      );
    }
    if (gate.resolvedAt !== undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_HUMAN_GATE_ALREADY_RESOLVED,
        `Human gate ${input.gateId} is already resolved`,
      );
    }
    if (state.phase !== 'awaiting_human' || !isPhaseTransitionValid('awaiting_human', input.nextPhase)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Invalid human-gate recovery phase: awaiting_human → ${input.nextPhase}`,
      );
    }

    const changedAt = Date.now();
    this.wire.dispatch(
      researchResolveHumanDecision({
        gateId: input.gateId,
        resolution: input.resolution,
        nextPhase: input.nextPhase,
        changedAt,
      }),
    );
    this.publishResearchUpdated();
    const resolved = this.wire.getModel(ResearchModel).current.humanGate;
    if (
      resolved === null ||
      resolved.gateId !== input.gateId ||
      resolved.resolvedAt !== changedAt ||
      resolved.resolution !== input.resolution
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_HUMAN_GATE_NOT_FOUND,
        `Human gate ${input.gateId} could not be resolved`,
      );
    }
    return toHumanGate(resolved);
  }

  private reconcileAlerts(): void {
    const state = this.wire.getModel(ResearchModel).current;
    const desired = new Map<string, AlertInput>();
    const clear = new Set<string>();

    for (const question of Object.values(state.questions)) {
      const fingerprint = blockedQuestionFingerprint(question.id);
      if (question.workflow === 'blocked') {
        desired.set(fingerprint, {
          fingerprint,
          kind: 'blocked',
          message: blockedQuestionMessage(question.id),
          questionId: question.id,
          lineSlug: question.lineSlug,
          createdAt: now(),
        });
      } else {
        clear.add(fingerprint);
      }
    }

    if (this.mode.phase === 'degraded') {
      desired.set(ALERT_FINGERPRINTS.degraded, {
        fingerprint: ALERT_FINGERPRINTS.degraded,
        kind: 'degraded',
        message: 'AITP Research Mode is degraded; restore a ready adapter before continuing.',
        createdAt: now(),
      });
    } else if (this.mode.phase === 'ready') {
      clear.add(ALERT_FINGERPRINTS.degraded);
    }

    const maintenance = this.mode.isActive ? this.coordinator?.snapshot() : undefined;
    if (maintenance?.activeNewerThanWorkingNote === true) {
      desired.set(ALERT_FINGERPRINTS.stale, {
        fingerprint: ALERT_FINGERPRINTS.stale,
        kind: 'stale',
        message: 'AITP active entries are newer than the latest Working Note; review current state before continuing.',
        createdAt: now(),
      });
    } else if (maintenance?.activeNewerThanWorkingNote === false) {
      clear.add(ALERT_FINGERPRINTS.stale);
    }
    if (maintenance !== undefined && maintenance.unresolvedFailureCount > 0) {
      desired.set(ALERT_FINGERPRINTS.aitpFailure, {
        fingerprint: ALERT_FINGERPRINTS.aitpFailure,
        kind: 'blocked',
        message: `AITP reports ${maintenance.unresolvedFailureCount} unresolved failure(s); review them before continuing.`,
        createdAt: now(),
      });
    } else if (maintenance?.unresolvedFailureCount === 0) {
      clear.add(ALERT_FINGERPRINTS.aitpFailure);
    }

    for (const fingerprint of clear) {
      if (desired.has(fingerprint)) continue;
      if (state.alerts.some((alert) => alert.fingerprint === fingerprint)) {
        this.wire.dispatch(researchClearAlert({ fingerprint }));
      }
    }
    for (const alert of desired.values()) {
      const existing = state.alerts.find((candidate) => candidate.fingerprint === alert.fingerprint);
      if (
        existing !== undefined &&
        existing.kind === alert.kind &&
        existing.message === alert.message &&
        existing.questionId === alert.questionId &&
        existing.lineSlug === alert.lineSlug
      ) continue;
      this.wire.dispatch(researchUpsertAlert(alert));
    }
  }

  private clearTransitionAlerts(): void {
    const alerts = this.wire.getModel(ResearchModel).current.alerts;
    for (const fingerprint of [
      `${ALERT_FINGERPRINTS.reopened}.`,
      ALERT_FINGERPRINTS.commitFailed,
    ]) {
      if (alerts.some((alert) => alert.fingerprint === fingerprint || alert.fingerprint.startsWith(fingerprint))) {
        if (fingerprint.endsWith('.')) {
          for (const alert of alerts) {
            if (alert.fingerprint.startsWith(fingerprint)) {
              this.wire.dispatch(researchClearAlert({ fingerprint: alert.fingerprint }));
            }
          }
        } else {
          this.wire.dispatch(researchClearAlert({ fingerprint }));
        }
      }
    }
  }

  private markCommitBarrierFailed(): void {
    this.mode.setPhase('degraded');
    this.wire.dispatch(
      researchUpsertAlert({
        fingerprint: ALERT_FINGERPRINTS.commitFailed,
        kind: 'commit_failed',
        message: 'Research checkpoint commit failed; the pending checkpoint remains uncommitted.',
        createdAt: now(),
      }),
      researchUpsertAlert({
        fingerprint: ALERT_FINGERPRINTS.degraded,
        kind: 'degraded',
        message: 'AITP Research Mode is degraded; restore a ready adapter before continuing.',
        createdAt: now(),
      }),
    );
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

  private getGoalSummary(): ResearchStatusSnapshot['goalSummary'] {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return undefined;
    const goal = this.goal.getGoal().goal;
    if (goal === null) return undefined;
    const remainingTurns = goal.budget.remainingTurns;
    return remainingTurns === null
      ? { status: goal.status }
      : { status: goal.status, remainingTurns };
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
          return;
        }
        if (this.mode.phase === 'degraded') {
          event.veto(
            denyToolExecution(
              'Goal completion is blocked: Research Mode is degraded. Restore a ready Research Mode state before completing the goal.',
            ),
          );
          return;
        }
        const humanGate = this.wire.getModel(ResearchModel).current.humanGate;
        if (humanGate !== null && humanGate.resolvedAt === undefined) {
          event.veto(
            denyToolExecution(
              'Goal completion is blocked: a Research human gate is unresolved. Resolve the gate before completing the goal.',
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

function toActionSpec(r: ResearchActionSpecRecord): ResearchActionSpec {
  return {
    actionId: r.actionId,
    questionId: r.questionId,
    lineSlug: r.lineSlug,
    kind: r.kind,
    purpose: r.purpose,
    expectedEvidence: r.expectedEvidence,
    stopCondition: r.stopCondition,
    allowedToolKinds: r.allowedToolKinds,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    requiresHumanApproval: r.requiresHumanApproval,
  };
}

function toProgressReport(r: ResearchProgressReportRecord): ResearchProgressReport {
  return {
    headline: r.headline,
    question: r.question,
    motivation: r.motivation,
    workPerformed: r.workPerformed,
    result: r.result,
    mainlineImpact: r.mainlineImpact,
    uncertainties: r.uncertainties,
    nextAction: r.nextAction,
    phaseChange: r.phaseChange,
    humanDecision: r.humanDecision,
    detail: r.detail,
    recordedAt: r.recordedAt,
  };
}

function toStateChange(r: ResearchStateChangeRecord): ResearchStateChange {
  return {
    beforePhase: r.beforePhase,
    afterPhase: r.afterPhase,
    actionId: r.actionId,
    summary: r.summary,
    changedAt: r.changedAt,
  };
}

function toHumanGate(r: ResearchHumanGateRecord): ResearchHumanGate {
  return {
    gateId: r.gateId,
    kind: r.kind,
    actionId: r.actionId,
    questionId: r.questionId,
    prompt: r.prompt,
    resolvedAt: r.resolvedAt,
    resolution: r.resolution,
    createdAt: r.createdAt,
  };
}

const VALID_PHASE_TRANSITIONS: Readonly<Record<ResearchPhase, readonly ResearchPhase[]>> = {
  idle: ['orienting', 'gap_analysis', 'action_planned', 'awaiting_human'],
  orienting: ['gap_analysis', 'idle', 'awaiting_human'],
  gap_analysis: ['action_planned', 'idle', 'awaiting_human'],
  action_planned: ['action_executing', 'idle', 'awaiting_human'],
  action_executing: ['evaluating', 'idle', 'awaiting_human'],
  evaluating: ['state_updated', 'idle', 'awaiting_human'],
  state_updated: ['checkpoint_pending', 'gap_analysis', 'idle', 'awaiting_human'],
  checkpoint_pending: ['idle', 'gap_analysis', 'awaiting_human'],
  awaiting_human: ['idle', 'gap_analysis', 'action_planned', 'action_executing', 'evaluating'],
};

function isPhaseTransitionValid(from: ResearchPhase, to: ResearchPhase): boolean {
  return VALID_PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}
