/**
 * `aitpResearch` domain — `IAgentResearchService` implementation.
 *
 * Manages the Research state through wire dispatches on the checkpointed
 * `ResearchModel` (questions, lines, focus, pending checkpoint, alerts, and
 * the scientific state layer — phase / action / progress / state change /
 * human gate). Committed AITP facts — the latest committed cursor, the
 * ordered commit history, and the global revision — are read and written
 * exclusively through the non-checkpointed external-fact facade
 * (`IAitpExternalFactService`), never by touching `ResearchCursorModel`
 * directly. Deterministic lifecycle alerts are reconciled from question, mode,
 * checkpoint, and maintenance state; alert records are fingerprinted,
 * replayable, and acknowledgement-aware. Line and question mutations carry
 * optimistic-concurrency revisions. Human steering commands carry
 * `expectedRevision` for optimistic concurrency: a command with a stale revision
 * is rejected. The AITP commit barrier
 * (`commitCheckpoint`) requires a non-empty `entryId` and calls the
 * Session-scope adapter's `show` + `check` before advancing the committed
 * cursor and acknowledging the checkpointed working state. The read surface
 * (`getSnapshot` / `getQuestions` / `getLines` / `getPendingCheckpoint` /
 * `getCommittedCursor` / `getScientificProgress`) is pure: it only projects the
 * current wire models and never dispatches an op, reconciles alerts or the
 * committed cursor, publishes an event, or calls the adapter. Deterministic
 * alert / committed-cursor reconciliation runs through the explicit
 * `reconcile()` lifecycle hook, invoked only on a direct mutation (via
 * `publishResearchUpdated`), a maintenance receipt update
 * (`coordinator.onDidUpdate`), a commit barrier, a wire restore, or a
 * conversation undo (`context.undone`). The
 * scientific state layer (plan/start/complete/record/set-phase/request/resolve-gate)
 * and typed subagent evidence review performs pre-dispatch validation (throws on invalid transitions, missing
 * actions, wrong action status, or mismatched gates) while the wire ops themselves are no-ops
 * on mismatched state so they replay safely. Both the live validation and the
 * replay no-ops consult the single phase-transition authority in
 * `transitions/researchTransitionAuthority`, which is the one and only copy of
 * the phase policy. `getScientificProgress(level)`
 * is a pure derived read with brief/detail/audit projections. Publishes a
 * `research.updated` event carrying the full `ResearchStatusSnapshot` after
 * every direct mutation; the snapshot includes the Session coordinator's safe
 * current-state maintenance receipt when the mode is active and a read-only
 * Goal status/budget projection. The snapshot also projects the layered
 * Program / Period / Status state: the topic-bound `program` is formed only
 * from a real AITP `enter` topic observed through a maintenance receipt
 * (never fabricated, never adopted automatically), the auditable `period`
 * window is started/ended only at the clear semantic points (mode enter,
 * line switch via `aitp_mode.updated`, mode exit, and each admitted loop
 * boundary through `noteLoopBoundary` — ordinary turns never write period
 * records), and the workstream-isolated `status` projection is a pure
 * derived read. Additionally subscribes to `aitp_mode.updated`
 * (fired by each mode op's `toEvent` and by undo / cold restore) and
 * `goal.updated`, so mode, loop, undo, degraded, and Goal status/budget
 * transitions all produce a complete `research.updated` snapshot push. These
 * subscriptions only read state and publish Research facts, so they cannot
 * form an event cycle. Contributes a `GoalCompletionGuardContribution` that
 * blocks goal completion while Research has a pending checkpoint, degraded
 * mode, or unresolved human gate (only when the mode is active; otherwise it
 * allows), and a `GoalContinuationParticipantContribution` that holds the
 * goal's automatic continuation while the mode is active and the research
 * loop is paused, the mode is degraded, or a human gate is unresolved —
 * otherwise it abstains, leaving the continuation decision to Goal. Also
 * registers an `onBeforeExecuteTool` veto that blocks AITP mutation tools on
 * subagents. Goal is the sole continuation owner. Bound at Agent scope.
 */

import { randomUUID } from 'node:crypto';

import { Service } from '#/_base/di/service';
import { Emitter } from '#/_base/event';
import { currentConstruction } from '#/_base/di/fiber';
import { IAgentGoalService } from '#/agent/goal/goal';
import {
  GoalCompletionGuardContribution,
  GoalContinuationParticipantContribution,
} from '#/agent/goal/goalContribution';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentToolExecutorService } from '#/agent/toolExecutor/toolExecutor';
import { IAgentPlanService } from '#/features/plan/plan';
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
  AitpCheckReport,
  AitpModePhase,
  ResearchCheckpoint,
  ResearchCheckpointCheckReceipt,
  ResearchCheckpointReceipt,
  ResearchCommittedCursor,
  ResearchHumanGate,
  ResearchLine,
  ResearchLineCreationInput,
  ResearchPhase,
  ResearchProgressLevel,
  ResearchProgressReport,
  ResearchQuestion,
  ResearchRunState,
  ResearchScientificSnapshot,
  ResearchStateChange,
  ResearchStatusSnapshot,
  ResearchEffectiveNextStep,
  ResearchAlert,
  ResearchProgram,
  ResearchPeriod,
  ResearchPlan,
  ResearchStatusHealth,
  ResearchStatusProjection,
  AitpMaintenanceReceipt,
} from '#/features/aitpResearch/types';
import {
  AitpModeModel,
  ResearchModel,
  aitpModeSetLine,
  researchCreateLine,
  researchUpdateLine,
  researchCreateQuestion,
  researchUpdateQuestion,
  researchSetFocus,
  researchSwitchLine,
  researchSteer,
  researchProposeCheckpoint,
  researchBindCheckpointReceipt,
  researchAcknowledgeCheckpoint,
  researchReopenQuestion,
  researchUpsertAlert,
  researchClearAlert,
  researchAcknowledgeAlert,
  researchPlanAction,
  researchBeginAction,
  researchBindCheckpointEntry,
  researchStartAction,
  researchCompleteAction,
  researchObserveRun,
  researchRecordProgress,
  researchSetPhase,
  researchRequestHumanDecision,
  researchResolveHumanDecision,
  researchSetProgram,
  researchStartPeriod,
  researchUpdatePeriod,
  researchEndPeriod,
  type ResearchActionSpecRecord,
  type ResearchRunStateRecord,
  type ResearchQuestionRecord,
  type ResearchLineRecord,
  type ResearchFocusRecord,
  type ResearchCheckpointRecord,
  type ResearchHumanGateRecord,
  type ResearchProgressReportRecord,
  type ResearchStateChangeRecord,
  type ResearchWorkingState,
} from '#/features/aitpResearch/aitpResearchOps';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import {
  ResearchPlanModel,
  researchPlanDraft,
  researchPlanFinalize,
  researchPlanDiscard,
} from '#/features/aitpResearch/researchPlanOps';
import { IAitpExternalFactService } from './externalFact';
import { createExternalFactFacade, toWireCheckpointReceipt } from './externalFactService';
import { IDurableCommitService } from './durableCommit';
import type { ResearchEvidencePacket, ResearchEvidenceReview } from './evidencePacket';
import {
  PLAN_ACTION_PHASES,
  allowedNextPhases,
  isLiveForegroundAction,
  isPhaseTransitionValid,
  isUnresolvedHumanGate,
} from '#/features/aitpResearch/transitions/researchTransitionAuthority';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';

import {
  type CommitCheckpointInput,
  type ConcludeResearchActionInput,
  type ResearchActionConclusion,
  type CreateQuestionInput,
  type ObserveResearchRunInput,
  type PrepareResearchPlanInput,
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
  'BeginResearchAction',
  'StartResearchAction',
  'CompleteResearchAction',
  'ConcludeResearchAction',
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

  private readonly externalFact: IAitpExternalFactService;
  private readonly continuationRetryEmitter = this._register(
    new Emitter<string>('research-goal-continuation-retry'),
  );
  private researchPlanMutationTail: Promise<void> = Promise.resolve();

  constructor(
    @IWireService private readonly wire: IWireService,
    @IAgentScopeContext private readonly scopeCtx: IAgentScopeContext,
    @IEventBus private readonly eventBus: IEventBus,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentToolExecutorService toolExecutor: IAgentToolExecutorService,
    @IAgentGoalService private readonly goal: IAgentGoalService,
    @ISessionAitpLifecycleCoordinator private readonly coordinator?: ISessionAitpLifecycleCoordinator,
    @IDurableCommitService private readonly durable?: IDurableCommitService,
    @IAitpExternalFactService externalFact?: IAitpExternalFactService,
    @IAgentPlanService private readonly plan?: IAgentPlanService,
  ) {
    super();
    // Manual construction (tests) may omit the facade; fall back to the
    // wire-backed projection so the cursor boundary is always enforced.
    this.externalFact = externalFact ?? createExternalFactFacade(this.wire);
    // The completion guard and continuation participant are collection records
    // and can only be provided through a bound unit runtime. Container
    // construction (which binds the runtime and flushes the buffered op)
    // provides them; manual `new` construction (used by unit tests) skips the
    // registration so the service stays constructible without a container.
    if (currentConstruction() !== undefined) {
      this._register(
        this.provide(GoalCompletionGuardContribution, {
          guard: (input) => this.guardGoalCompletion(input),
        }),
      );
      this._register(
        this.provide(GoalContinuationParticipantContribution, {
          decide: (input) => this.decideGoalContinuation(input),
          onDidRequestRetry: this.continuationRetryEmitter.event,
        }),
      );
    }
    this._register(
      toolExecutor.onBeforeExecuteTool((event) => this.guardToolExecution(event)),
    );
    if (this.coordinator !== undefined) {
      this._register(
        this.coordinator.onDidUpdate(() => {
          this.reconcileProgram(this.coordinator?.snapshot());
          this.publishResearchUpdated();
        }),
      );
    }
    this._register(
      this.eventBus.subscribe('aitp_mode.updated', () => {
        this.reconcilePeriodLifecycle();
        this.publishResearchUpdated();
      }),
    );
    this._register(
      this.eventBus.subscribe('goal.updated', () => {
        this.publishResearchUpdated(false);
      }),
    );
    this._register(
      this.wire.hooks.onDidRestore.register('researchReconcile', async (_ctx, next) => {
        await next();
        this.reconcile();
      }),
    );
    this._register(
      this.eventBus.subscribe('context.undone', () => {
        this.reconcile();
      }),
    );
  }

  getSnapshot(): ResearchStatusSnapshot {
    const state = this.wire.getModel(ResearchModel).current;
    const cursor = this.externalFact.getCommittedCursor();
    const commitHistory = this.externalFact.getCommitHistory();
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
    const currentAction = state.currentAction === null ? undefined : toActionSpec(state.currentAction);
    const latestProgress = state.latestProgress === null ? undefined : toProgressReport(state.latestProgress);
    const humanGate = state.humanGate === null ? undefined : toHumanGate(state.humanGate);
    const effectiveNextStep = deriveEffectiveNextStep({
      phase: state.phase,
      currentAction,
      currentRun: state.currentRun === null ? undefined : toRunState(state.currentRun),
      latestProgress,
      currentQuestion,
      humanGate,
      maintenance: aitpMaintenance,
    });

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
      alerts: state.alerts.map(toAlert),
      effectiveNextStep,
      goalSummary: this.getGoalSummary(),
      aitpHealth: this.mode.health ?? { phase: 'inactive' },
      aitpMaintenance,
      pendingCheckpoint: state.pendingCheckpoint === null
        ? undefined
        : toCheckpoint(state.pendingCheckpoint),
      latestCommittedCheckpoint: cursor ?? undefined,
      committedCheckpointHistory: commitHistory,
      phase: state.phase,
      currentAction,
      currentRun: state.currentRun === null ? undefined : toRunState(state.currentRun),
      latestProgress,
      recentStateChange: state.recentStateChange === null ? undefined : toStateChange(state.recentStateChange),
      humanGate,
      program: state.program ?? undefined,
      period: state.period ?? undefined,
      researchPlan: this.getResearchPlan() ?? undefined,
      status: this.mode.isActive
        ? deriveStatusProjection({
            modePhase: this.mode.phase,
            phase: state.phase,
            currentLineSlug,
            focus: state.focus,
            questions: state.questions,
            currentAction,
            effectiveNextStep,
            humanGate,
            alerts: state.alerts,
          })
        : undefined,
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
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    return pending === null ? null : toCheckpoint(pending);
  }

  getCommittedCursor(): ResearchCommittedCursor | null {
    return this.externalFact.getCommittedCursor();
  }

  getProgram(): ResearchProgram | null {
    return this.wire.getModel(ResearchModel).current.program;
  }

  getPeriod(): ResearchPeriod | null {
    return this.wire.getModel(ResearchModel).current.period;
  }

  getResearchPlan(): ResearchPlan | null {
    return this.wire.getModel(ResearchPlanModel).current;
  }

  async prepareResearchPlan(input: PrepareResearchPlanInput): Promise<ResearchPlan> {
    return this.serializeResearchPlanMutation(() => this.prepareResearchPlanUnsafe(input));
  }

  private async prepareResearchPlanUnsafe(input: PrepareResearchPlanInput): Promise<ResearchPlan> {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const modeState = this.wire.getModel(AitpModeModel).current;
    const existing = this.wire.getModel(ResearchPlanModel).current;
    const questionId = input.questionId ?? state.focus?.questionId;
    const question = questionId === undefined ? undefined : state.questions[questionId];
    if (questionId !== undefined && question === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${questionId} not found`,
      );
    }
    const lineSlug = input.lineSlug ?? question?.lineSlug ?? modeState.currentLineSlug;
    const line = lineSlug === undefined ? undefined : state.lines[lineSlug];
    if (lineSlug !== undefined && line === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${lineSlug} not found`,
      );
    }
    if (question !== undefined && lineSlug !== undefined && question.lineSlug !== lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${lineSlug} does not own question ${question.id}`,
      );
    }
    if (
      modeState.currentLineSlug !== undefined &&
      lineSlug !== undefined &&
      modeState.currentLineSlug !== lineSlug
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research line is stale. Current line is ${modeState.currentLineSlug}, got ${lineSlug}.`,
      );
    }
    if (state.period !== null && lineSlug !== undefined && state.period.lineSlug !== lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research period is bound to line ${state.period.lineSlug}, got ${lineSlug}.`,
      );
    }

    const planId = input.planId ?? (existing?.status === 'draft' ? existing.planId : randomUUID());
    const draftInput = {
      planId,
      researchRevision: state.revision,
      programId: state.program?.topicId,
      periodId: state.period?.id,
      lineSlug,
      questionId,
      lineRevision: line?.revision,
      questionRevision: question?.revision,
      objective: input.objective,
      steps: [...input.steps],
      expectedEvidence: [...input.expectedEvidence],
      stopCondition: input.stopCondition,
      status: 'draft' as const,
    };
    if (input.usePlanMode === true) {
      if (this.plan === undefined) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
          'Plan mode bridge is unavailable in this Research host.',
        );
      }
      await this.plan.enter(planId, true);
      try {
        this.assertResearchPlanFresh(draftInput);
      } catch (error) {
        const entered = await this.plan.status().catch(() => null);
        if (entered?.id === planId) this.plan.cancel(planId);
        throw error;
      }
    }

    this.wire.dispatch(researchPlanDraft({
      ...draftInput,
      steps: [...draftInput.steps],
      expectedEvidence: [...draftInput.expectedEvidence],
    }));
    this.publishResearchUpdated();
    const draft = this.getResearchPlan();
    if (draft === null || draft.status !== 'draft') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `ResearchPlan ${planId} could not become a draft`,
      );
    }
    return draft;
  }

  async finalizeResearchPlan(): Promise<ResearchPlan> {
    return this.serializeResearchPlanMutation(() => this.finalizeResearchPlanUnsafe());
  }

  private async finalizeResearchPlanUnsafe(): Promise<ResearchPlan> {
    this.assertMutationAllowed();
    const draft = this.getResearchPlan();
    if (draft === null || draft.status !== 'draft') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        'No pending ResearchPlan draft is available to finalize.',
      );
    }
    const plan = this.plan;
    if (plan === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        'Plan mode bridge is unavailable in this Research host.',
      );
    }
    if (await plan.status() !== null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        'Exit ordinary Plan mode before finalizing the ResearchPlan.',
      );
    }
    const resolution = plan.getResolution?.() ?? null;
    if (resolution === null || resolution.outcome !== 'approved') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        'An approved ordinary Plan resolution is required before finalizing the ResearchPlan.',
      );
    }
    if (resolution.planId !== draft.planId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Plan resolution ${resolution.planId} does not match ResearchPlan ${draft.planId}.`,
      );
    }
    this.assertResearchPlanFresh(draft);
    const finalized = {
      ...draft,
      steps: [...draft.steps],
      expectedEvidence: [...draft.expectedEvidence],
      status: 'finalized' as const,
      resolution: {
        planId: resolution.planId,
        planRevision: resolution.planRevision,
        outcome: 'approved' as const,
        selectedLabel: resolution.selectedLabel,
      },
    };
    this.wire.dispatch(researchPlanFinalize({
      ...finalized,
      steps: [...finalized.steps],
      expectedEvidence: [...finalized.expectedEvidence],
    }));
    this.publishResearchUpdated();
    return finalized;
  }

  discardResearchPlan(): ResearchPlan | null {
    this.assertStateMutationAllowed();
    const current = this.getResearchPlan();
    if (current === null || current.status === 'discarded') return current;
    const discarded = {
      ...current,
      steps: [...current.steps],
      expectedEvidence: [...current.expectedEvidence],
      status: 'discarded' as const,
      resolution: undefined,
    };
    this.wire.dispatch(researchPlanDiscard({
      ...discarded,
      steps: [...discarded.steps],
      expectedEvidence: [...discarded.expectedEvidence],
    }));
    this.publishResearchUpdated();
    return this.getResearchPlan();
  }

  noteLoopBoundary(): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return;
    const modeState = this.wire.getModel(AitpModeModel).current;
    if (!this.mode.isActive || modeState.currentLineSlug === undefined) return;
    const state = this.wire.getModel(ResearchModel).current;
    const line = modeState.currentLineSlug;
    const open = state.period;
    if (open === null || open.lineSlug !== line || open.endedAt !== undefined) {
      this.wire.dispatch(
        researchStartPeriod({ id: randomUUID(), lineSlug: line, startedAt: now() }),
      );
    } else {
      const focusQuestion = state.focus === null
        ? undefined
        : state.questions[state.focus.questionId];
      this.wire.dispatch(
        researchUpdatePeriod({
          id: open.id,
          loopCount: open.loopCount + 1,
          currentQuestionId:
            focusQuestion !== undefined && focusQuestion.lineSlug === line
              ? focusQuestion.id
              : null,
          summary: state.latestProgress?.headline ?? null,
        }),
      );
    }
    if (this.wire.getModel(ResearchModel).current.revision !== state.revision) {
      this.publishResearchUpdated();
    }
  }

  getScientificProgress(level: ResearchProgressLevel): ResearchScientificSnapshot {
    const state = this.wire.getModel(ResearchModel).current;
    const progress = state.latestProgress;
    return {
      phase: state.phase,
      currentAction: state.currentAction === null ? undefined : toActionSpec(state.currentAction),
      currentRun: state.currentRun === null ? undefined : toRunState(state.currentRun),
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

  observeRun(input: ObserveResearchRunInput): ResearchRunState {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (input.expectedRevision !== state.revision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${input.expectedRevision}, got ${state.revision}.`,
      );
    }
    if (state.currentAction?.actionId !== input.actionId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        `Run observation targets action ${input.actionId}, which is not the current Research action.`,
      );
    }
    if (input.terminalState === undefined && ['completed', 'failed', 'cancelled'].includes(input.schedulerState)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Terminal scheduler state ${input.schedulerState} requires an explicit terminal state.`,
      );
    }
    if (state.phase !== 'action_executing' || state.currentAction.status !== 'in_progress') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Run observation requires an in-progress action in the action_executing phase.`,
      );
    }
    const observedAt = now();
    this.wire.dispatch(researchObserveRun({
      actionId: input.actionId,
      campaign: input.campaign,
      jobId: input.jobId,
      sourcePin: input.sourcePin,
      binaryPin: input.binaryPin,
      stage: input.stage,
      schedulerState: input.schedulerState,
      lastObservedAt: observedAt,
      nextCheckAt: input.nextCheckAt,
      terminalState: input.terminalState,
      artifactRefs: input.artifactRefs === undefined ? [] : [...input.artifactRefs],
    }));
    this.publishResearchUpdated();
    const run = this.wire.getModel(ResearchModel).current.currentRun;
    if (run === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Run observation for ${input.jobId} could not be retained.`,
      );
    }
    return toRunState(run);
  }

  reviewEvidencePacket(
    packet: ResearchEvidencePacket,
    expectedRevision: number,
  ): ResearchEvidenceReview {
    this.assertMainAgent();
    const state = this.wire.getModel(ResearchModel).current;
    if (state.revision !== expectedRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${expectedRevision}, got ${state.revision}. Review the packet against the current Research state.`,
      );
    }
    const action = state.currentAction;
    if (packet.action_id !== undefined && action?.actionId !== packet.action_id) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        `Evidence packet ${packet.packet_id} targets action ${packet.action_id}, which is not the current Research action.`,
      );
    }
    const questionId = packet.question_id ?? action?.questionId ?? state.focus?.questionId;
    const question = questionId === undefined ? undefined : state.questions[questionId];
    if (questionId !== undefined && question === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Evidence packet ${packet.packet_id} targets unknown question ${questionId}.`,
      );
    }
    const lineSlug = packet.line_slug ?? action?.lineSlug ?? question?.lineSlug;
    if (packet.line_slug !== undefined && state.lines[packet.line_slug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Evidence packet ${packet.packet_id} targets unknown line ${packet.line_slug}.`,
      );
    }
    if (question !== undefined && lineSlug !== undefined && question.lineSlug !== lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Evidence packet ${packet.packet_id} targets line ${lineSlug}, but question ${question.id} belongs to ${question.lineSlug}.`,
      );
    }

    return {
      packet,
      researchRevision: state.revision,
      questionId,
      lineSlug,
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
    if (lineChanged) {
      this.wire.dispatch(
        researchSwitchLine({
          lineSlug: question.lineSlug,
          expectedRevision: state.revision,
        }),
      );
      const switched = this.wire.getModel(ResearchModel).current;
      this.wire.dispatch(
        researchSetFocus({
          questionId,
          boundedAction: focusBoundedAction,
          expectedRevision: switched.revision,
        }),
        aitpModeSetLine({ lineSlug: question.lineSlug }),
      );
      return;
    }
    this.wire.dispatch(
      researchSetFocus({
        questionId,
        boundedAction: focusBoundedAction,
        expectedRevision: state.revision,
      }),
    );
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
        classification: 'warning',
        source: 'question',
        state: 'active',
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
    if (input.expectedRevision !== 0 && input.expectedRevision !== state.revision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${input.expectedRevision}, got ${state.revision}.`,
      );
    }
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

  bindPendingCheckpointReceipt(receipt: ResearchCheckpointReceipt): ResearchCheckpoint {
    this.assertMutationAllowed();
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (pending === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        'Cannot bind an AITP receipt without a pending research checkpoint',
      );
    }
    if (!checkpointQuestionRevisionMatches(this.wire.getModel(ResearchModel).current, pending)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} was created from an older question revision; re-propose it before binding AITP receipts`,
      );
    }
    const existingReceipt = pending.receipt;
    if (
      receipt.prepare !== undefined &&
      existingReceipt?.prepare !== undefined &&
      JSON.stringify(receipt.prepare) !== JSON.stringify(existingReceipt.prepare)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} is already bound to a different AITP prepare receipt`,
      );
    }
    if (receipt.preSaveCheck !== undefined && existingReceipt?.save !== undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} cannot replace its pre-save baseline after save`,
      );
    }
    const mergedReceipt: ResearchCheckpointReceipt = {
      prepare: receipt.prepare ?? existingReceipt?.prepare,
      save: receipt.save ?? existingReceipt?.save,
      preSaveCheck: receipt.preSaveCheck ?? existingReceipt?.preSaveCheck,
      postSaveCheck: receipt.postSaveCheck ?? existingReceipt?.postSaveCheck,
    };
    if (receipt.save !== undefined && mergedReceipt.prepare === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} cannot bind a save receipt before prepare`,
      );
    }
    if (
      receipt.save !== undefined &&
      mergedReceipt.prepare !== undefined &&
      receipt.save.draftPath !== mergedReceipt.prepare.path
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} save receipt does not match its prepared draft`,
      );
    }
    if (receipt.postSaveCheck !== undefined && mergedReceipt.save === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} cannot bind a post-save check before save`,
      );
    }
    const preparedId = mergedReceipt.prepare === undefined
      ? undefined
      : mergedReceipt.prepare.id;
    const preparedKey = mergedReceipt.prepare?.status === 'existing'
      ? mergedReceipt.prepare.idempotencyKey
      : mergedReceipt.prepare?.idempotencyKey;
    if (preparedKey !== undefined && preparedKey !== pending.idempotencyKey) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `AITP prepare receipt idempotency key does not match checkpoint ${pending.checkpointId}`,
      );
    }
    if (preparedId !== undefined && pending.committedEntryId !== undefined && pending.committedEntryId !== preparedId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `AITP prepare receipt is bound to ${preparedId}, not ${pending.committedEntryId}`,
      );
    }
    if (preparedId !== undefined) {
      this.wire.dispatch(
        researchBindCheckpointEntry({
          checkpointId: pending.checkpointId,
          entryId: preparedId,
        }),
      );
    }
    this.wire.dispatch(
      researchBindCheckpointReceipt({
        checkpointId: pending.checkpointId,
        receipt: toWireCheckpointReceipt(receipt),
      }),
    );
    const updated = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (updated === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} could not retain its AITP receipt`,
      );
    }
    return toCheckpoint(updated);
  }

  async commitCheckpoint(input: CommitCheckpointInput): Promise<void> {
    this.assertMutationAllowed();
    const current = this.wire.getModel(ResearchModel).current;
    const currentCursor = this.externalFact.getCommittedCursor();
    const committedHistory = this.externalFact.getCommitHistory();

    // Same checkpoint + same Entry is idempotent, even if it is not the latest.
    const duplicateCommit = committedHistory.find(
      (c) => c.checkpointId === input.checkpointId && c.entryId === input.entryId,
    );
    if (duplicateCommit !== undefined) {
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
    // Same checkpoint + different Entry is rejected.
    const existingCommit = committedHistory.find(
      (c) => c.checkpointId === input.checkpointId,
    );
    if (existingCommit !== undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} is already committed to AITP entry ${existingCommit.entryId ?? '?'}`,
      );
    }
    const pending = current.pendingCheckpoint;
    if (pending === null || pending.checkpointId !== input.checkpointId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `No pending checkpoint with id ${input.checkpointId}`,
      );
    }
    if (pending.questionId !== undefined && pending.questionRevision !== undefined) {
      const question = current.questions[pending.questionId];
      if (question === undefined || question.revision !== pending.questionRevision) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
          `Checkpoint ${input.checkpointId} was created from an older question revision; re-propose it from the current research state`,
        );
      }
    }
    if (pending.committedEntryId !== undefined && pending.committedEntryId !== input.entryId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} is already bound to AITP entry ${pending.committedEntryId}`,
      );
    }
    const receipt = pending.receipt;
    if (receipt?.prepare === undefined || receipt.save === undefined || receipt.preSaveCheck === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} has no complete AITP prepare/save receipt; prepare and save through the Research AITP tools before committing`,
      );
    }
    const preSaveCheck = receipt.preSaveCheck;
    if (receipt.prepare.id !== undefined && receipt.prepare.id !== input.entryId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} prepare receipt identifies ${receipt.prepare.id}, not ${input.entryId}`,
      );
    }
    if (receipt.save.draftPath !== receipt.prepare.path) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} save receipt does not match its prepared draft`,
      );
    }
    try {
      if (this.durable !== undefined) {
        await this.durable.verifyEntry(input.entryId);
      } else {
        const shown = await this.adapter.show({ id: input.entryId });
        if (shown.id !== input.entryId || shown.status !== 'active') {
          throw new AitpResearchError(
            AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
            `AITP entry ${input.entryId} was not returned as an active matching entry`,
          );
        }
      }
    } catch (error) {
      this.markCommitBarrierFailed();
      if (error instanceof AitpResearchError) throw error;
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `AITP commit barrier failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (pending.committedEntryId === undefined) {
      this.wire.dispatch(
        researchBindCheckpointEntry({
          checkpointId: input.checkpointId,
          entryId: input.entryId,
        }),
      );
    }
    const afterShow = this.wire.getModel(ResearchModel).current;
    const afterShowCursor = this.externalFact.getCommittedCursor();
    const afterShowPending = afterShow.pendingCheckpoint;
    const showAlreadyCommitted = afterShowCursor?.checkpointId === input.checkpointId &&
      afterShowCursor.entryId === input.entryId;
    if (!showAlreadyCommitted) {
      if (
        !cursorEquals(afterShowCursor, currentCursor) ||
        afterShowPending === null ||
        afterShowPending.checkpointId !== input.checkpointId ||
        afterShowPending.committedEntryId !== input.entryId ||
        afterShowPending.idempotencyKey !== pending.idempotencyKey ||
        !checkpointQuestionRevisionMatches(afterShow, afterShowPending)
      ) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
          `Checkpoint ${input.checkpointId} changed while the AITP show barrier was running`,
        );
      }
      let postSaveCheck: ResearchCheckpointCheckReceipt;
      try {
        if (this.durable !== undefined) {
          postSaveCheck = (await this.durable.checkAfterSave({
            workstreams: receipt.prepare.workstreams,
            preSaveCheck,
          })).postSaveCheck;
        } else {
          const workstreams = receipt.prepare.workstreams;
          const report = await this.adapter.check(workstreams?.length === 1
            ? { workstream: workstreams[0] }
            : undefined);
          postSaveCheck = toCheckpointCheckReceipt(report, preSaveCheck);
          if (report.counts.errors > 0 && preSaveCheck === undefined) {
            throw new AitpResearchError(
              AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
              `AITP check reports ${report.counts.errors} error finding(s) and no reliable pre-save baseline is available. Checkpoint remains pending.`,
            );
          }
          if ((postSaveCheck.newErrorFindingFingerprints?.length ?? 0) > 0) {
            throw new AitpResearchError(
              AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
              `AITP check reports ${postSaveCheck.newErrorFindingFingerprints!.length} new error finding(s) after commit. Checkpoint remains pending.`,
            );
          }
        }
      } catch (error) {
        this.markCommitBarrierFailed();
        if (error instanceof AitpResearchError) throw error;
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `AITP commit barrier failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.wire.dispatch(
        researchBindCheckpointReceipt({
          checkpointId: input.checkpointId,
          receipt: toWireCheckpointReceipt({ postSaveCheck }),
        }),
      );
    }

    const after = this.wire.getModel(ResearchModel).current;
    const afterCursor = this.externalFact.getCommittedCursor();
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
      !cursorEquals(afterCursor, currentCursor) ||
      afterPending === null ||
      afterPending.checkpointId !== input.checkpointId ||
      afterPending.committedEntryId !== input.entryId ||
      afterPending.idempotencyKey !== pending.idempotencyKey ||
      !checkpointQuestionRevisionMatches(after, afterPending)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} changed while the AITP commit barrier was running`,
      );
    }

    const committedReceipt = afterPending.receipt;
    if (
      committedReceipt?.prepare === undefined ||
      committedReceipt.save === undefined ||
      committedReceipt.preSaveCheck === undefined ||
      committedReceipt.postSaveCheck === undefined
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} is missing a complete AITP barrier receipt`,
      );
    }
    const committedAt = Date.now();
    this.externalFact.commitExternalFact({
      checkpointId: input.checkpointId,
      entryId: input.entryId,
      receipt: committedReceipt,
      committedAt,
    });
    this.wire.dispatch(
      researchAcknowledgeCheckpoint({
        checkpointId: input.checkpointId,
        entryId: input.entryId,
      }),
    );
    const committedCursor = this.externalFact.getCommittedCursor();
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

  private assertActionCanBePlanned(
    input: PlanActionInput,
    state: ResearchWorkingState,
  ): { readonly lineSlug?: string } {
    if (!PLAN_ACTION_PHASES.includes(state.phase)) {
      const allowed = allowedNextPhases(state.phase).join(', ');
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Cannot plan action from phase '${state.phase}'. Allowed next phases: ${allowed || 'none'}. Read Research status and continue from the current phase.`,
      );
    }
    if (isLiveForegroundAction(state.currentAction)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Cannot plan a new action while action ${state.currentAction!.actionId} is still ${state.currentAction!.status}. Complete or abandon it before planning a new action.`,
      );
    }
    if (isUnresolvedHumanGate(state.humanGate)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_GATE_PENDING,
        `Human gate ${state.humanGate.gateId} is unresolved; resolve it before planning or beginning an action.`,
      );
    }
    const question = input.questionId === undefined ? undefined : state.questions[input.questionId];
    if (input.questionId !== undefined && question === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${input.questionId} not found`,
      );
    }
    const modeLine = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    const lineSlug = input.lineSlug ?? question?.lineSlug ?? modeLine;
    if (lineSlug !== undefined && state.lines[lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${lineSlug} not found`,
      );
    }
    if (question !== undefined && lineSlug !== undefined && question.lineSlug !== lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${lineSlug} does not own question ${question.id}`,
      );
    }
    if (modeLine !== undefined && lineSlug !== modeLine) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research action is bound to line ${lineSlug}, but current line is ${modeLine}. Switch lines before continuing.`,
      );
    }
    return { lineSlug };
  }

  planAction(input: PlanActionInput): ResearchActionSpec {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const ownership = this.assertActionCanBePlanned(input, state);
    const actionId = input.actionId ?? randomUUID();
    this.wire.dispatch(
      researchPlanAction({
        actionId,
        questionId: input.questionId,
        lineSlug: ownership.lineSlug,
        kind: input.kind,
        purpose: input.purpose,
        expectedEvidence: input.expectedEvidence !== undefined ? [...input.expectedEvidence] : [],
        stopCondition: input.stopCondition,
        allowedToolKinds: input.allowedToolKinds !== undefined ? [...input.allowedToolKinds] : [],
        retryOfEntryId: input.retryOfEntryId,
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

  planAndStartAction(input: PlanActionInput): ResearchActionSpec {
    if (input.requiresHumanApproval === true) {
      this.assertMutationAllowed();
      const state = this.wire.getModel(ResearchModel).current;
      this.assertActionCanBePlanned(input, state);
      const action = this.planAction(input);
      this.requestHumanDecision({
        kind: 'approval',
        actionId: action.actionId,
        questionId: action.questionId,
        prompt: `Approve the ${action.kind} action: ${action.purpose}`,
      });
      return this.getSnapshot().currentAction ?? action;
    }

    // The normal BeginResearchAction path is one bounded state transition:
    // planning and entering execution cannot leave a phantom planned action
    // between two separate wire dispatches.
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const ownership = this.assertActionCanBePlanned(input, state);
    const actionId = input.actionId ?? randomUUID();
    this.wire.dispatch(
      researchBeginAction({
        actionId,
        questionId: input.questionId,
        lineSlug: ownership.lineSlug,
        kind: input.kind,
        purpose: input.purpose,
        expectedEvidence: input.expectedEvidence !== undefined ? [...input.expectedEvidence] : [],
        stopCondition: input.stopCondition,
        allowedToolKinds: input.allowedToolKinds !== undefined ? [...input.allowedToolKinds] : [],
        retryOfEntryId: input.retryOfEntryId,
        requiresHumanApproval: false,
        createdAt: Date.now(),
      }),
    );
    const action = this.wire.getModel(ResearchModel).current.currentAction;
    if (action === null || action.actionId !== actionId || action.status !== 'in_progress') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Failed to begin action ${actionId}; inspect the current Research status before retrying`,
      );
    }
    this.publishResearchUpdated();
    return toActionSpec(action);
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

  concludeAction(input: ConcludeResearchActionInput): ResearchActionConclusion {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const action = state.currentAction;
    if (action === null || action.actionId !== input.actionId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_NOT_FOUND,
        `Action ${input.actionId} not found`,
      );
    }
    if (action.status !== 'in_progress') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${input.actionId} is not in 'in_progress' status (got '${action.status}')`,
      );
    }
    if (state.phase !== 'action_executing') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Cannot conclude action from phase '${state.phase}'`,
      );
    }

    const completedAt = Date.now();
    const recordedAt = Date.now();
    this.wire.dispatch(
      researchCompleteAction({
        actionId: input.actionId,
        status: input.status,
        completedAt,
      }),
      researchRecordProgress({
        headline: input.progress.headline,
        question: input.progress.question,
        motivation: input.progress.motivation,
        workPerformed: input.progress.workPerformed,
        result: input.progress.result,
        mainlineImpact: input.progress.mainlineImpact,
        uncertainties: input.progress.uncertainties !== undefined ? [...input.progress.uncertainties] : [],
        nextAction: input.progress.nextAction,
        phaseChange: { from: 'evaluating', to: 'state_updated' },
        humanDecision: input.progress.humanDecision,
        detail: input.progress.detail === undefined ? undefined : {
          assumptions: input.progress.detail.assumptions !== undefined ? [...input.progress.detail.assumptions] : undefined,
          derivation: input.progress.detail.derivation,
          tests: input.progress.detail.tests !== undefined ? [...input.progress.detail.tests] : undefined,
          observations: input.progress.detail.observations !== undefined ? [...input.progress.detail.observations] : undefined,
          sources: input.progress.detail.sources !== undefined ? [...input.progress.detail.sources] : undefined,
          limitations: input.progress.detail.limitations !== undefined ? [...input.progress.detail.limitations] : undefined,
          detailHint: input.progress.detail.detailHint,
          artifactRefs: input.progress.detail.artifactRefs !== undefined ? [...input.progress.detail.artifactRefs] : undefined,
        },
        recordedAt,
      }),
    );
    this.clearTransitionAlerts();
    this.publishResearchUpdated();

    const next = this.wire.getModel(ResearchModel).current;
    const completedAction = next.currentAction;
    const progress = next.latestProgress;
    if (
      completedAction === null ||
      completedAction.actionId !== input.actionId ||
      completedAction.status !== input.status ||
      progress === null ||
      progress.recordedAt !== recordedAt ||
      next.phase !== 'state_updated'
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${input.actionId} conclusion did not produce a consistent Research state; inspect the current snapshot before retrying`,
      );
    }
    return {
      action: toActionSpec(completedAction),
      progress: toProgressReport(progress),
    };
  }

  recordProgress(input: RecordProgressInput): ResearchProgressReport {
    this.assertMutationAllowed();
    const currentPhase = this.wire.getModel(ResearchModel).current.phase;
    if (
      input.phaseChange !== undefined &&
      (
        input.phaseChange.from !== currentPhase ||
        !isPhaseTransitionValid(input.phaseChange.from, input.phaseChange.to)
      )
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Invalid phase transition from current phase '${currentPhase}': ${input.phaseChange.from} → ${input.phaseChange.to}. Read Research status before recording progress.`,
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
    if (isUnresolvedHumanGate(state.humanGate)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_GATE_PENDING,
        `Human gate ${state.humanGate.gateId} is already pending; resolve it before requesting a new decision`,
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
    if (
      input.nextPhase === 'action_executing' &&
      (state.currentAction === null || state.currentAction.status !== 'in_progress')
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        'Cannot resolve a human gate to action_executing without an in-progress action.',
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
          classification: 'active_blocker',
          source: 'question',
          state: 'active',
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
        classification: 'active_blocker',
        source: 'adapter',
        state: 'active',
        message: this.mode.maintenanceDegradedReason === 'workstream_unbound'
          ? 'AITP Research Mode is degraded because no research line is bound; set or switch to a research line before continuing.'
          : 'AITP Research Mode is degraded; restore a ready adapter before continuing.',
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
        classification: 'warning',
        source: 'aitp_check',
        state: 'active',
        message: 'AITP active entries are newer than the latest Working Note; review current state before following the previous handoff.',
        reason: 'active entries are newer than the latest Working Note',
        createdAt: now(),
      });
    } else if (maintenance?.activeNewerThanWorkingNote === false) {
      clear.add(ALERT_FINGERPRINTS.stale);
    }

    const failurePrefix = `${ALERT_FINGERPRINTS.aitpFailure}.`;
    const failures = maintenance?.unresolvedFailures ?? [];
    const retryAction = state.currentAction?.retryOfEntryId === undefined
      ? undefined
      : state.currentAction;
    if (failures.length > 0) {
      for (const failure of failures) {
        const fingerprint = `${failurePrefix}${failure.entryId}`;
        const superseded = retryAction?.retryOfEntryId === failure.entryId;
        desired.set(fingerprint, {
          fingerprint,
          kind: 'stale',
          classification: superseded ? 'superseded_by_retry' : 'historical_unresolved',
          source: 'aitp_failure',
          state: 'active',
          message: superseded
            ? `Historical AITP failure ${failure.entryId} is superseded by retry action ${retryAction.actionId}; await new evidence before drawing a conclusion.`
            : `Historical AITP failure ${failure.entryId}: ${failure.summary}. This does not block a new retry.`,
          relatedEntryId: failure.entryId,
          workstream: failure.workstream,
          retryOfEntryId: superseded ? failure.entryId : undefined,
          reason: superseded ? 'a retry action is active' : 'unresolved historical failure',
          createdAt: failure.createdAt ?? now(),
        });
      }
    } else if (maintenance !== undefined && maintenance.unresolvedFailureCount > 0) {
      desired.set(ALERT_FINGERPRINTS.aitpFailure, {
        fingerprint: ALERT_FINGERPRINTS.aitpFailure,
        kind: 'stale',
        classification: 'historical_unresolved',
        source: 'aitp_failure',
        state: 'active',
        message: `AITP reports ${maintenance.unresolvedFailureCount} historical unresolved failure(s). This does not block a new retry.`,
        reason: 'unresolved historical failure',
        createdAt: maintenance.refreshedAt,
      });
    } else if (maintenance?.unresolvedFailureCount === 0) {
      clear.add(ALERT_FINGERPRINTS.aitpFailure);
    }

    for (const alert of state.alerts) {
      if (alert.fingerprint.startsWith(failurePrefix) && !desired.has(alert.fingerprint)) {
        clear.add(alert.fingerprint);
      }
    }

    const warningPrefix = 'research.alert.warning.aitp.';
    for (const warning of maintenance?.warningSummaries ?? []) {
      const fingerprint = `${warningPrefix}${warning.code}`;
      desired.set(fingerprint, {
        fingerprint,
        kind: 'stale',
        classification: 'warning',
        source: 'aitp_check',
        state: 'active',
        message: `AITP data-quality warning: ${warning.code}.`,
        reason: warning.code,
        createdAt: maintenance?.refreshedAt ?? now(),
      });
    }
    for (const alert of state.alerts) {
      if (alert.fingerprint.startsWith(warningPrefix) && !desired.has(alert.fingerprint)) {
        clear.add(alert.fingerprint);
      }
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
        existing.classification === alert.classification &&
        existing.source === alert.source &&
        existing.state === alert.state &&
        existing.message === alert.message &&
        existing.questionId === alert.questionId &&
        existing.lineSlug === alert.lineSlug &&
        existing.relatedEntryId === alert.relatedEntryId &&
        existing.workstream === alert.workstream &&
        existing.retryOfEntryId === alert.retryOfEntryId &&
        existing.reason === alert.reason
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
        classification: 'active_blocker',
        source: 'checkpoint',
        state: 'active',
        message: 'Research checkpoint commit failed; the pending checkpoint remains uncommitted.',
        createdAt: now(),
      }),
      researchUpsertAlert({
        fingerprint: ALERT_FINGERPRINTS.degraded,
        kind: 'degraded',
        classification: 'active_blocker',
        source: 'adapter',
        state: 'active',
        message: 'AITP Research Mode is degraded; restore a ready adapter before continuing.',
        createdAt: now(),
      }),
    );
    this.publishResearchUpdated();
  }

  private reconcile(): void {
    this.reconcileCommittedCheckpoint();
    this.reconcileAlerts();
  }

  /**
   * Forms the topic-bound program from a maintenance receipt's safe topic
   * fields. Never fabricates: without a topic the existing program is left
   * untouched, and a differing topic id replaces the program outright.
   */
  private reconcileProgram(receipt: AitpMaintenanceReceipt | undefined): void {
    if (!this.mode.isActive || receipt === undefined || receipt.topic === undefined) return;
    const state = this.wire.getModel(ResearchModel).current;
    const program = state.program;
    if (
      program !== null &&
      program.topicId === receipt.topic.id &&
      program.title === receipt.topic.title &&
      program.goalText === receipt.topic.goalText &&
      program.goalSource === receipt.topic.goalSource
    ) return;
    this.wire.dispatch(
      researchSetProgram({
        topicId: receipt.topic.id,
        title: receipt.topic.title,
        goalText: receipt.topic.goalText,
        goalSource: receipt.topic.goalSource,
        establishedAt: program?.topicId === receipt.topic.id ? program.establishedAt : now(),
      }),
    );
  }

  /**
   * Keeps the open period aligned with the mode's current line at the clear
   * semantic points (mode enter / exit / line switch, all signalled by
   * `aitp_mode.updated`): starts a period for a newly bound line (archiving
   * the previous one), and closes the open period when the mode exits or no
   * line is bound. Idempotent — replays and repeated signals are no-ops.
   */
  private reconcilePeriodLifecycle(): void {
    const state = this.wire.getModel(ResearchModel).current;
    const modeState = this.wire.getModel(AitpModeModel).current;
    const open = state.period;
    if (!this.mode.isActive || modeState.currentLineSlug === undefined) {
      if (open !== null && open.endedAt === undefined) {
        this.wire.dispatch(researchEndPeriod({ endedAt: now() }));
      }
      return;
    }
    const line = modeState.currentLineSlug;
    if (open === null || open.lineSlug !== line || open.endedAt !== undefined) {
      this.wire.dispatch(
        researchStartPeriod({ id: randomUUID(), lineSlug: line, startedAt: now() }),
      );
    }
  }

  private reconcileCommittedCheckpoint(): void {
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (pending === null) return;
    const commits = this.externalFact.getCommitHistory();
    const matched = commits.find(
      (commit) =>
        commit.checkpointId === pending.checkpointId &&
        (pending.committedEntryId === undefined || commit.entryId === pending.committedEntryId),
    );
    if (matched === undefined) return;
    this.wire.dispatch(
      researchAcknowledgeCheckpoint({
        checkpointId: pending.checkpointId,
        entryId: matched.entryId,
      }),
    );
  }

  private serializeResearchPlanMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.researchPlanMutationTail.then(operation);
    this.researchPlanMutationTail = run.then(() => undefined, () => undefined);
    return run;
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

  private assertResearchPlanFresh(plan: ResearchPlan): void {
    const state = this.wire.getModel(ResearchModel).current;
    const modeState = this.wire.getModel(AitpModeModel).current;
    if (state.revision !== plan.researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `ResearchPlan revision is stale. Expected ${plan.researchRevision}, got ${state.revision}.`,
      );
    }
    if (state.program?.topicId !== plan.programId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'ResearchPlan is bound to a stale Research Program.',
      );
    }
    if (state.period?.id !== plan.periodId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'ResearchPlan is bound to a stale Research Period.',
      );
    }
    if (modeState.currentLineSlug !== plan.lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'ResearchPlan is bound to a stale Research line.',
      );
    }
    const line = plan.lineSlug === undefined ? undefined : state.lines[plan.lineSlug];
    if (line?.revision !== plan.lineRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'ResearchPlan line revision is stale.',
      );
    }
    const question = plan.questionId === undefined ? undefined : state.questions[plan.questionId];
    if (question?.revision !== plan.questionRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'ResearchPlan question revision is stale.',
      );
    }
    if (question !== undefined && question.lineSlug !== plan.lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'ResearchPlan question is bound to a stale line.',
      );
    }
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

  private publishResearchUpdated(notifyGoal = true): void {
    this.reconcile();
    this.eventBus.publish({ type: 'research.updated', snapshot: this.getSnapshot() });
    if (notifyGoal) this.requestGoalContinuationRetry();
  }

  private requestGoalContinuationRetry(): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return;
    const goal = this.goal.getGoal().goal;
    if (goal !== null) this.continuationRetryEmitter.fire(goal.goalId);
  }

  private async guardToolExecution(event: BeforeToolExecuteEvent): Promise<void> {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID && AITP_MUTATION_TOOLS.has(event.toolCall.name)) {
      event.veto(
        denyToolExecution(
          'AITP/Research mutation tools are only available on the main agent. Use typed packets to return results.',
        ),
      );
    }
  }

  private guardGoalCompletion(
    _input: import('#/agent/goal/goalContribution').GoalCompletionGuardInput,
  ): import('#/agent/goal/goalContribution').GoalCompletionGuardResult {
    if (!this.mode.isActive) return { allow: true };
    const pending = this.getPendingCheckpoint();
    if (pending !== null) {
      return {
        allow: false,
        owner: 'aitpResearch',
        code: 'research.checkpoint.pending',
        reason:
          'Goal completion is blocked: a research checkpoint is pending commit. Commit or discard it before completing the goal.',
        nextStep: 'CommitResearchCheckpoint',
      };
    }
    if (this.mode.phase === 'degraded') {
      return {
        allow: false,
        owner: 'aitpResearch',
        code: 'research.mode.degraded',
        reason:
          'Goal completion is blocked: Research Mode is degraded. Restore a ready Research Mode state before completing the goal.',
        nextStep: 'EnterAITPMode',
      };
    }
    const humanGate = this.wire.getModel(ResearchModel).current.humanGate;
    if (humanGate !== null && humanGate.resolvedAt === undefined) {
      return {
        allow: false,
        owner: 'aitpResearch',
        code: 'research.human-gate.unresolved',
        reason:
          'Goal completion is blocked: a Research human gate is unresolved. Resolve the gate before completing the goal.',
        nextStep: 'ResolveResearchDecision',
      };
    }
    return { allow: true };
  }

  private decideGoalContinuation(
    _input: import('#/agent/goal/goalContribution').GoalContinuationInput,
  ): import('#/agent/goal/goalContribution').GoalContinuationDecisionResult {
    // The participant only weighs in while Research Mode is active; an
    // inactive mode leaves the automatic continuation decision to Goal.
    if (!this.mode.isActive) return { decision: 'abstain' };
    if (this.mode.loopStatus !== 'active') {
      return {
        decision: 'hold',
        owner: 'aitpResearch',
        reason: 'The research loop is paused. Resume the research loop before continuing the goal automatically.',
      };
    }
    if (this.mode.phase === 'degraded') {
      return {
        decision: 'hold',
        owner: 'aitpResearch',
        reason: 'Research Mode is degraded. Restore a ready Research Mode state before continuing the goal automatically.',
      };
    }
    const humanGate = this.wire.getModel(ResearchModel).current.humanGate;
    if (humanGate !== null && humanGate.resolvedAt === undefined) {
      return {
        decision: 'hold',
        owner: 'aitpResearch',
        reason: 'A Research human gate is unresolved. Resolve the gate before continuing the goal automatically.',
      };
    }
    return { decision: 'abstain' };
  }
}

function toCheckpointCheckReceipt(
  report: AitpCheckReport,
  baseline?: ResearchCheckpointCheckReceipt,
): ResearchCheckpointCheckReceipt {
  const findingFingerprints = report.findings.map((finding) =>
    `${finding.level}:${finding.code}:${finding.path}:${finding.message}`,
  ).toSorted();
  const errorFindingFingerprints = report.findings
    .filter((finding) => finding.level === 'error')
    .map((finding) => `${finding.code}:${finding.path}:${finding.message}`)
    .toSorted();
  const baselineErrors = baseline === undefined
    ? undefined
    : new Set(baseline.errorFindingFingerprints);
  return {
    status: report.status,
    errors: report.counts.errors,
    warnings: report.counts.warnings,
    findingFingerprints,
    errorFindingFingerprints,
    newErrorFindingFingerprints: baselineErrors === undefined
      ? undefined
      : errorFindingFingerprints.filter((fingerprint) => !baselineErrors.has(fingerprint)),
    preExistingErrorFindingFingerprints: baselineErrors === undefined
      ? undefined
      : errorFindingFingerprints.filter((fingerprint) => baselineErrors.has(fingerprint)),
    checkedAt: Date.now(),
  };
}

function checkpointQuestionRevisionMatches(
  state: ResearchWorkingState,
  checkpoint: ResearchCheckpointRecord,
): boolean {
  if (checkpoint.questionId === undefined || checkpoint.questionRevision === undefined) return true;
  return state.questions[checkpoint.questionId]?.revision === checkpoint.questionRevision;
}

function cursorEquals(
  a: ResearchCommittedCursor | null,
  b: ResearchCommittedCursor | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.checkpointId === b.checkpointId && a.entryId === b.entryId;
}

function toCheckpoint(r: ResearchCheckpointRecord): ResearchCheckpoint {
  return {
    checkpointId: r.checkpointId,
    committedEntryId: r.committedEntryId,
    questionId: r.questionId,
    questionRevision: r.questionRevision,
    lineSlug: r.lineSlug,
    assessment: r.assessment,
    nextAction: r.nextAction,
    idempotencyKey: r.idempotencyKey,
    persistence: r.persistence,
    receipt: r.receipt,
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

function toRunState(r: ResearchRunStateRecord): ResearchRunState {
  return {
    actionId: r.actionId,
    campaign: r.campaign,
    jobId: r.jobId,
    sourcePin: r.sourcePin,
    binaryPin: r.binaryPin,
    stage: r.stage,
    schedulerState: r.schedulerState,
    lastObservedAt: r.lastObservedAt,
    nextCheckAt: r.nextCheckAt,
    terminalState: r.terminalState,
    artifactRefs: r.artifactRefs,
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
    retryOfEntryId: r.retryOfEntryId,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    requiresHumanApproval: r.requiresHumanApproval,
    run: r.run === undefined ? undefined : toRunState(r.run),
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

function toAlert(alert: ResearchAlert): ResearchAlert {
  const classification = alert.classification ?? (alert.kind === 'blocked' ? 'active_blocker' : 'warning');
  const source = alert.source ?? (
    alert.questionId !== undefined
      ? 'question'
      : alert.kind === 'commit_failed'
        ? 'checkpoint'
        : 'adapter'
  );
  return {
    ...alert,
    classification,
    source,
    state: alert.state ?? (alert.acknowledgedAt === undefined ? 'active' : 'acknowledged'),
  };
}

function deriveEffectiveNextStep(input: {
  readonly phase: ResearchPhase;
  readonly currentAction?: ResearchActionSpec;
  readonly currentRun?: ResearchRunState;
  readonly latestProgress?: ResearchProgressReport;
  readonly currentQuestion?: ResearchQuestion;
  readonly humanGate?: ResearchHumanGate;
  readonly maintenance?: AitpMaintenanceReceipt;
}): ResearchEffectiveNextStep | undefined {
  const gate = input.humanGate;
  if (gate !== undefined && gate.resolvedAt === undefined) {
    return {
      text: `Human ${gate.kind} required: ${gate.prompt}`,
      source: 'human_gate',
      freshness: 'blocked',
      observedAt: gate.createdAt,
      derivedFrom: {
        actionId: gate.actionId,
        questionId: gate.questionId,
      },
    };
  }

  const run = input.currentRun;
  if (run !== undefined && (run.schedulerState === 'pending' || run.schedulerState === 'running')) {
    const isOverdue = run.nextCheckAt !== undefined && run.nextCheckAt < now();
    return {
      text: isOverdue
        ? `Observe HPC job ${run.jobId} now; its expected check time has passed.`
        : `Wait for HPC job ${run.jobId} and observe it at the scheduled check time.`,
      source: 'research_run',
      freshness: isOverdue ? 'stale' : 'current',
      observedAt: run.lastObservedAt,
      derivedFrom: { actionId: run.actionId },
    };
  }
  if (run !== undefined && run.terminalState !== undefined) {
    return {
      text: `Evaluate the ${run.terminalState} HPC evidence for job ${run.jobId} before changing the scientific assessment.`,
      source: 'research_run',
      freshness: 'current',
      observedAt: run.lastObservedAt,
      derivedFrom: { actionId: run.actionId },
    };
  }

  const action = input.currentAction;
  if (action !== undefined) {
    if (action.status === 'planned') {
      return {
        text: `Start the planned ${action.kind} action when ready.`,
        source: 'research_action',
        freshness: 'current',
        observedAt: action.createdAt,
        derivedFrom: {
          actionId: action.actionId,
          questionId: action.questionId,
          lineSlug: action.lineSlug,
        },
      };
    }
    if (action.status === 'in_progress') {
      return {
        text: `Continue the ${action.kind} action and collect its expected evidence before evaluation.`,
        source: 'research_action',
        freshness: 'current',
        observedAt: action.createdAt,
        derivedFrom: {
          actionId: action.actionId,
          questionId: action.questionId,
          lineSlug: action.lineSlug,
        },
      };
    }
    if (input.phase === 'evaluating') {
      return {
        text: `Evaluate the evidence from the completed ${action.kind} action before updating the research state.`,
        source: 'research_action',
        freshness: 'current',
        observedAt: action.completedAt ?? action.createdAt,
        derivedFrom: {
          actionId: action.actionId,
          questionId: action.questionId,
          lineSlug: action.lineSlug,
        },
      };
    }
  }

  if (input.latestProgress?.nextAction !== undefined) {
    return {
      text: input.latestProgress.nextAction,
      source: 'question',
      freshness: 'current',
      observedAt: input.latestProgress.recordedAt,
      derivedFrom: {
        questionId: input.currentQuestion?.id,
        lineSlug: input.currentQuestion?.lineSlug,
      },
    };
  }

  if (input.currentQuestion?.nextBoundedAction !== undefined) {
    return {
      text: input.currentQuestion.nextBoundedAction,
      source: 'question',
      freshness: 'current',
      observedAt: now(),
      derivedFrom: {
        questionId: input.currentQuestion.id,
        lineSlug: input.currentQuestion.lineSlug,
      },
    };
  }

  const maintenance = input.maintenance;
  if (maintenance?.activeNewerThanWorkingNote === true) {
    return {
      text: 'Review active AITP entries newer than the latest Working Note before following the previous handoff.',
      source: 'aitp_maintenance',
      freshness: 'stale',
      observedAt: maintenance.refreshedAt,
      derivedFrom: {
        entryId: maintenance.nextActionDetails?.entryId,
        lineSlug: maintenance.workstream,
      },
    };
  }
  if (maintenance?.nextAction !== undefined) {
    return {
      text: maintenance.nextAction,
      source: 'aitp_maintenance',
      freshness: 'current',
      observedAt: maintenance.refreshedAt,
      derivedFrom: {
        entryId: maintenance.nextActionDetails?.entryId,
        lineSlug: maintenance.workstream,
      },
    };
  }

  return undefined;
}

function deriveStatusProjection(input: {
  readonly modePhase: AitpModePhase;
  readonly phase: ResearchPhase;
  readonly currentLineSlug?: string;
  readonly focus: ResearchFocusRecord | null;
  readonly questions: Readonly<Record<string, ResearchQuestionRecord>>;
  readonly currentAction?: ResearchActionSpec;
  readonly effectiveNextStep?: ResearchEffectiveNextStep;
  readonly humanGate?: ResearchHumanGate;
  readonly alerts: readonly ResearchAlert[];
}): ResearchStatusProjection {
  const focusQuestion = input.focus === null
    ? undefined
    : input.questions[input.focus.questionId];
  const focusOutsideWorkstream = focusQuestion !== undefined &&
    input.currentLineSlug !== undefined &&
    focusQuestion.lineSlug !== input.currentLineSlug;
  const currentQuestionId = focusOutsideWorkstream ? undefined : focusQuestion?.id;
  const actionMatchesWorkstream = input.currentAction !== undefined && (
    input.currentAction.lineSlug === undefined ||
    input.currentAction.lineSlug === input.currentLineSlug ||
    (currentQuestionId !== undefined && input.currentAction.questionId === currentQuestionId)
  );
  const attentionAlerts = input.alerts
    .filter((alert) =>
      (alert.state ?? (alert.acknowledgedAt === undefined ? 'active' : 'acknowledged')) === 'active')
    .filter((alert) => alert.lineSlug === undefined || alert.lineSlug === input.currentLineSlug);
  const hasBlocker = attentionAlerts.some((alert) =>
    (alert.classification ?? (alert.kind === 'blocked' ? 'active_blocker' : 'warning')) ===
    'active_blocker');
  const humanGateUnresolved = input.humanGate !== undefined && input.humanGate.resolvedAt === undefined;
  const focusBlocked =
    focusQuestion !== undefined && !focusOutsideWorkstream && focusQuestion.workflow === 'blocked';
  let health: ResearchStatusHealth = 'ok';
  if (humanGateUnresolved || hasBlocker || focusBlocked) {
    health = 'blocked';
  } else if (input.modePhase === 'degraded') {
    health = 'degraded';
  } else if (attentionAlerts.length > 0) {
    health = 'attention';
  }
  const stepFromOutside = focusOutsideWorkstream && input.effectiveNextStep?.source === 'question';
  return {
    currentLineSlug: input.currentLineSlug,
    currentQuestionId,
    currentActionId: actionMatchesWorkstream ? input.currentAction?.actionId : undefined,
    phase: input.phase,
    nextStep: stepFromOutside ? undefined : input.effectiveNextStep?.text,
    health,
    attention: attentionAlerts.map((alert) => alert.message),
  };
}
