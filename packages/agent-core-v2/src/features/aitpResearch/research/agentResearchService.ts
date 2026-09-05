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
 * conversation undo (`context.undone`), or the admitted Research turn boundary
 * immediately before context injection. The turn-boundary pass only repairs
 * mechanically determined structure; it never infers scientific completion,
 * abandons an action, resolves a checkpoint, or writes AITP. The
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
 * line switch via `aitp_mode.updated`, mode exit, and each admitted Research
 * turn boundary through `noteLoopBoundary` — ordinary turns never write period
 * records), and the workstream-isolated `status` projection is a pure
 * derived read. Additionally subscribes to `aitp_mode.updated`
 * (fired by each mode op's `toEvent` and by undo / cold restore) and
 * `goal.updated`, so mode, loop, undo, degraded, and Goal status/budget
 * transitions all produce a complete `research.updated` snapshot push. On an
 * inactive→active edge, the mode subscription first clears any checkpointed
 * Program/Goal binding from the prior lifecycle; later maintenance can then
 * establish only the current AITP topic. Other subscription work only reads
 * state and publishes Research facts, so it cannot form an event cycle.
 * Contributes a `GoalCompletionGuardContribution` that
 * blocks goal completion while Research has a pending checkpoint, degraded
 * mode, an unresolved human gate, or an unconfirmed/stale/conflicting explicit
 * Goal-to-Program binding (only when the mode is active; otherwise it allows),
 * and a `GoalContinuationParticipantContribution` that holds the goal's
 * automatic continuation for those same active-mode conditions — otherwise it
 * abstains, leaving the continuation decision to Goal. Also
 * registers an `onBeforeExecuteTool` veto that blocks AITP mutation tools on
 * subagents and makes action capability ownership executor-authoritative for
 * main-agent work tools while Research Mode is active. Goal is the sole
 * continuation owner. Post-commit Note I/O rechecks an ephemeral context captured
 * from the verified checkpoint's exact Line/Topic/workstream confirmation at
 * actual tool execution. Only its prepared draft gets local edit/save access;
 * scope changes, mode unavailability, undo and restore revoke that context.
 * Local Line rebinding waits for in-flight Note I/O. This is not an atomic AITP
 * Note compare-and-save contract or a recoverable distillation coordinator.
 * Degraded AITP permits provisional action-scoped work on admitted turns but
 * never grants canonical persistence, autonomous admission or Goal completion.
 * Bound at Agent scope.
 */

import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';

import { Service } from '#/_base/di/service';
import { Emitter } from '#/_base/event';
import { currentConstruction } from '#/_base/di/fiber';
import { IAgentGoalService } from '#/agent/goal/goal';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
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
import {
  ISessionAitpAdapter,
  type AitpAdapterNotePrepareOptions,
  type AitpAdapterNoteSaveOptions,
} from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import { AitpResearchError, AitpResearchErrors } from '#/features/aitpResearch/errors';
import { IResearchTurnAdmission } from '#/features/aitpResearch/loop/researchTurnAdmission';
import type {
  HumanSteeringCommand,
  ResearchActionSpec,
  AitpCheckReport,
  AitpShowResult,
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
  ResearchGoalAlignment,
  ResearchPeriod,
  ResearchPlan,
  ResearchPlanV2,
  ResearchPlanV2ActionBinding,
  ResearchPlanningPolicy,
  ResearchActionPlanBinding,
  ResearchStatusHealth,
  ResearchStatusProjection,
  AitpMaintenanceReceipt,
  ResearchGoalSummary,
  ResearchGoalProjection,
  ResearchLineWorkstreamAlignment,
  ResearchLineWorkstreamBinding,
  ResearchDurableCommitCandidate,
  ResearchDistillationAttention,
  AitpNotePrepareResult,
  AitpNoteSaveResult,
} from '#/features/aitpResearch/types';
import type { GoalSnapshot } from '#/agent/goal/types';
import {
  AitpModeModel,
  ResearchModel,
  ResearchRevisionModel,
  ResearchDistillationModel,
  researchAdvanceRevision,
  aitpModeSetLine,
  researchCreateLine,
  researchUpdateLine,
  researchCreateQuestion,
  researchUpdateQuestion,
  researchSetFocus,
  researchSwitchLine,
  researchSteer,
  researchProposeCheckpoint,
  researchDiscardHistoricalCheckpoint,
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
  researchConfirmGoalAlignment,
  researchClearGoalAlignment,
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
import { researchPutPlanV2 } from '#/features/aitpResearch/researchPlanV2Ops';
import { researchSetPlanningPolicy } from '#/features/aitpResearch/researchPlanningPolicyOps';
import {
  researchClearWorkstreamBinding,
  researchConfirmWorkstreamBinding,
} from '#/features/aitpResearch/researchWorkstreamBindingOps';
import { IAitpExternalFactService } from './externalFact';
import { createExternalFactFacade, toWireCheckpointReceipt } from './externalFactService';
import { IDurableCommitService } from './durableCommit';
import {
  deriveLineWorkstreamAlignment,
  isMaintenanceReceiptAligned,
  sameLineWorkstreamBinding,
} from './workstreamBinding';
import type { ResearchEvidencePacket, ResearchEvidenceReview } from './evidencePacket';
import {
  PLAN_ACTION_PHASES,
  RESEARCH_ACTION_RECOVERY_PREFIX,
  allowedNextPhases,
  isRecoveredLiveAction,
  isLiveForegroundAction,
  isLiveResearchRun,
  isPhaseTransitionValid,
  isUnresolvedHumanGate,
  researchActionOwnedPhase,
} from '#/features/aitpResearch/transitions/researchTransitionAuthority';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import {
  classifyResearchTool,
  isResearchRecordInspection,
  researchCapabilityGranted,
  type ResearchExecutionCapability,
} from './researchExecutionPolicy';

import {
  type ClearGoalAlignmentInput,
  type ClearLineWorkstreamBindingInput,
  type ConfirmLineWorkstreamBindingInput,
  type ConfirmGoalAlignmentInput,
  type CommitCheckpointInput,
  type CommitCheckpointResult,
  type DiscardHistoricalCheckpointInput,
  type ConcludeResearchActionInput,
  type ResearchActionConclusion,
  type CreateQuestionInput,
  type ObserveResearchRunInput,
  type PrepareResearchPlanInput,
  type PrepareResearchPlanV2Input,
  type TransitionResearchPlanV2Input,
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
  'ConfirmResearchWorkstreamBinding',
  'ClearResearchWorkstreamBinding',
  'CreateResearchQuestion',
  'UpdateResearchQuestion',
  'SetResearchFocus',
  'ProposeResearchCheckpoint',
  'DiscardHistoricalResearchCheckpoint',
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

function isCompatiblePrepareReceiptTransition(
  existing: NonNullable<ResearchCheckpointReceipt['prepare']>,
  incoming: NonNullable<ResearchCheckpointReceipt['prepare']>,
): boolean {
  if (JSON.stringify(incoming) === JSON.stringify(existing)) return true;
  return existing.status === 'prepared' &&
    incoming.status === 'existing' &&
    existing.id !== undefined &&
    incoming.id === existing.id &&
    existing.idempotencyKey !== undefined &&
    incoming.idempotencyKey === existing.idempotencyKey &&
    JSON.stringify(incoming.workstreams) === JSON.stringify(existing.workstreams) &&
    incoming.path.startsWith('.aitp/topic/entries/entry-') &&
    incoming.path.endsWith('.md');
}

const AUTO_PERMISSION_MODE_STANDING_APPROVAL =
  'Standing auto permission applied: no new human response was required for this action approval.';

interface ResearchNoteReviewContext {
  readonly owner:
    | { readonly kind: 'checkpoint'; readonly checkpointId: string; readonly entryId: string }
    | { readonly kind: 'action'; readonly actionId: string; readonly entryIds: readonly string[] };
  readonly workstreamBinding: ResearchLineWorkstreamBinding;
}

export class AgentResearchService extends Service implements IAgentResearchService {
  declare readonly _serviceBrand: undefined;

  private readonly externalFact: IAitpExternalFactService;
  private readonly continuationRetryEmitter = this._register(
    new Emitter<string>('research-goal-continuation-retry'),
  );
  private researchPlanMutationTail: Promise<void> = Promise.resolve();
  private lastModeActive: boolean;
  private reservedResearchRevision = 0;
  private noteReviewContext?: ResearchNoteReviewContext;
  private notePersistenceInFlight = false;
  private distillationDraftLease?: {
    readonly context: ResearchNoteReviewContext;
    readonly path: string;
  };

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
    @IAgentPermissionModeService private readonly permissionMode?: IAgentPermissionModeService,
    @IResearchTurnAdmission private readonly turnAdmission?: IResearchTurnAdmission,
  ) {
    super();
    this.lastModeActive = this.mode.isActive;
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
      toolExecutor.onBeforeExecuteTool((event) => {
        this.guardToolExecution(event);
      }),
    );
    this._register(
      this.eventBus.subscribe('research.revision_advanced', ({ notifyGoal }) => {
        this.revokeStaleNoteReview();
        this.eventBus.publish({ type: 'research.updated', snapshot: this.getSnapshot() });
        if (notifyGoal) this.requestGoalContinuationRetry();
      }),
    );
    this._register(
      this.eventBus.subscribe('research.distillation_attention_updated', () => {
        this.revokeStaleNoteReview();
        this.publishResearchUpdated(false);
      }),
    );
    if (this.coordinator !== undefined) {
      this._register(
        this.coordinator.onDidUpdate(() => {
          // A raw coordinator update fires before the mode service can inspect
          // the awaited receipt. Invalid cross-Topic data still advances the
          // public snapshot (with the receipt filtered out), but must not wake
          // autonomous Goal continuation while the mode is momentarily ready.
          this.publishResearchUpdated(this.currentMaintenanceReceipt()?.status === 'ready');
        }),
      );
    }
    this._register(
      this.eventBus.subscribe('aitp_mode.updated', () => {
        const modeActive = this.mode.isActive;
        this.revokeStaleNoteReview();
        if (!this.lastModeActive && modeActive && !this.wire.isRestoring()) {
          const state = this.wire.getModel(ResearchModel).current;
          if (state.program !== null || state.goalProgramBinding !== null) {
            this.wire.dispatch(researchSetProgram({ clear: true }));
          }
        }
        this.lastModeActive = modeActive;
        this.reconcile();
        if (!this.resumeActionWithAutoStandingApproval()) {
          this.publishResearchUpdated();
        }
      }),
    );
    if (this.permissionMode !== undefined) {
      this._register(
        this.permissionMode.onDidChangeMode(({ mode }) => {
          if (mode === 'auto') this.resumeActionWithAutoStandingApproval();
        }),
      );
    }
    this._register(
      this.eventBus.subscribe('goal.updated', () => {
        this.publishResearchUpdated(false);
      }),
    );
    this._register(
      this.wire.hooks.onDidRestore.register('researchReconcile', async (_ctx, next) => {
        await next();
        this.clearNoteReview();
        if (!this.resumeActionWithAutoStandingApproval()) this.reconcile();
      }),
    );
    this._register(
      this.eventBus.subscribe('context.undone', () => {
        this.clearNoteReview();
        // Undo has already restored the checkpointed mode model. Capture that
        // baseline before the mode service's asynchronous fresh observation
        // publishes, so an inactive -> active replay is not mistaken for a
        // new live entry and cannot clear the freshly observed Program.
        this.lastModeActive = this.mode.isActive;
        // The public Research revision is intentionally non-checkpointed. Move
        // it past the abandoned branch synchronously, before UndoService
        // returns to its caller, so a command carrying the pre-undo token
        // cannot mutate the restored working state while the fresh AITP probe
        // is still pending. This boundary never wakes Goal continuation.
        this.publishResearchUpdated(false);
      }),
    );
  }

  getSnapshot(): ResearchStatusSnapshot {
    const state = this.wire.getModel(ResearchModel).current;
    const cursor = this.externalFact.getCommittedCursor();
    const commitHistory = this.externalFact.getCommitHistory();
    const distillation = this.wire.getModel(ResearchDistillationModel).attention;
    const distillationAttention = distillation !== null &&
      cursor?.checkpointId === distillation.checkpointId &&
      cursor.entryId === distillation.entryId
      ? distillation
      : undefined;
    const questions = Object.values(state.questions).map(toQuestion);
    const lines = Object.values(state.lines).map(toLine);
    const currentLineSlug = this.mode.isActive
      ? this.wire.getModel(AitpModeModel).current.currentLineSlug
      : undefined;
    const focusedQuestion = state.focus
      ? questions.find((q) => q.id === state.focus!.questionId)
      : undefined;
    const currentQuestion = focusedQuestion?.lineSlug === currentLineSlug
      ? focusedQuestion
      : undefined;
    const storedLineWorkstreamBindings = state.lineWorkstreamBindings ?? {};
    const lineWorkstreamBindings = lines.flatMap((line) => {
      const binding = storedLineWorkstreamBindings[line.slug];
      return binding?.lineSlug === line.slug ? [{ ...binding }] : [];
    });
    const currentWorkstreamBinding = currentLineSlug === undefined
      ? undefined
      : this.getLineWorkstreamAlignment(currentLineSlug);
    const aitpMaintenance = this.currentMaintenanceReceipt();
    const currentAction = state.currentAction === null ? undefined : toActionSpec(state.currentAction);
    const currentRun = state.currentRun === null ? undefined : toRunState(state.currentRun);
    const scopedCurrentAction = currentLineAction({
      action: currentAction,
      currentLineSlug,
      questions,
      lines,
    });
    const scopedCurrentRun = currentLineRun(scopedCurrentAction, currentRun);
    const latestProgress = state.latestProgress === null ? undefined : toProgressReport(state.latestProgress);
    const humanGate = state.humanGate === null ? undefined : toHumanGate(state.humanGate);
    const scopedHumanGate = currentLineHumanGate({
      gate: humanGate,
      rawAction: currentAction,
      scopedAction: scopedCurrentAction,
      currentLineSlug,
      questions,
    });
    const goalSummary = this.getGoalSummary();
    const activeGoal = goalSummary?.status === 'active';
    const goalAlignment = this.getGoalAlignment();
    const researchGoal = this.getResearchGoalProjection({
      state,
      currentLineSlug,
      humanGate: scopedHumanGate,
      goalAlignment,
    });
    const effectiveNextStep = deriveEffectiveNextStep({
      phase: state.phase,
      currentAction: scopedCurrentAction,
      currentRun: scopedCurrentRun,
      pendingCheckpoint: state.pendingCheckpoint === null ? undefined : toCheckpoint(state.pendingCheckpoint),
      latestProgress,
      currentQuestion,
      humanGate: scopedHumanGate,
      recentStateChange: state.recentStateChange === null
        ? undefined
        : toStateChange(state.recentStateChange),
      goalAlignment,
      activeGoal,
      maintenance: aitpMaintenance,
      currentLineSlug,
    });

    return {
      mode: this.mode.phase,
      loopStatus: this.mode.loopStatus,
      currentLineSlug,
      currentWorkstreamBinding,
      lineWorkstreamBindings,
      currentFocus: state.focus !== null && currentQuestion !== undefined
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
      goalSummary,
      researchGoal,
      goalAlignment,
      aitpHealth: this.mode.health ?? { phase: 'inactive' },
      aitpMaintenance,
      pendingCheckpoint: state.pendingCheckpoint === null
        ? undefined
        : toCheckpoint(state.pendingCheckpoint),
      latestCommittedCheckpoint: cursor ?? undefined,
      committedCheckpointHistory: commitHistory,
      distillationAttention,
      phase: state.phase,
      currentAction,
      currentRun,
      latestProgress,
      recentStateChange: state.recentStateChange === null ? undefined : toStateChange(state.recentStateChange),
      humanGate,
      program: this.getProgram() ?? undefined,
      period: state.period ?? undefined,
      researchPlan: this.getResearchPlan() ?? undefined,
      actionPlan: this.getResearchPlan() ?? undefined,
      researchPlanV2: this.getResearchPlanV2() ?? undefined,
      planningPolicy: state.planningPolicy,
      status: this.mode.isActive
        ? deriveStatusProjection({
            modePhase: this.mode.phase,
            phase: state.phase,
            currentLineSlug,
            focus: state.focus,
            questions: state.questions,
            currentAction: scopedCurrentAction,
            effectiveNextStep,
            pendingCheckpoint: state.pendingCheckpoint === null ? undefined : toCheckpoint(state.pendingCheckpoint),
            humanGate: scopedHumanGate,
            goalAlignment,
            workstreamAlignment: currentWorkstreamBinding,
            activeGoal,
            maintenance: aitpMaintenance,
            alerts: state.alerts,
            distillationAttention,
          })
        : undefined,
      revision: this.currentResearchRevision(),
    };
  }

  private currentMaintenanceReceipt(): AitpMaintenanceReceipt | undefined {
    if (!this.mode.isActive) return undefined;
    const state = this.wire.getModel(ResearchModel).current;
    const lineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    if (lineSlug === undefined || state.lines[lineSlug] === undefined) return undefined;
    const program = state.program;
    if (program === null) return undefined;
    const observedProgram = {
      ...program,
      observedRevision: program.observedRevision ?? 1,
    };
    const alignment = deriveLineWorkstreamAlignment({
      lineSlug,
      binding: (state.lineWorkstreamBindings ?? {})[lineSlug],
      program: observedProgram,
    });
    const binding = alignment.status === 'bound' ? alignment.binding : undefined;
    const receipt = this.coordinator?.snapshot();
    if (binding === undefined || receipt === undefined) return undefined;
    return isMaintenanceReceiptAligned({ receipt, binding, program: observedProgram })
      ? receipt
      : undefined;
  }

  private currentResearchRevision(): number {
    const worldRevision = this.wire.getModel(ResearchRevisionModel).revision;
    const revision = worldRevision > 0
      ? worldRevision
      : this.wire.getModel(ResearchModel).current.revision;
    this.reservedResearchRevision = Math.max(this.reservedResearchRevision, revision);
    return revision;
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
    const program = this.wire.getModel(ResearchModel).current.program;
    return program === null ? null : { ...program, observedRevision: program.observedRevision ?? 1 };
  }

  getGoalAlignment(): ResearchGoalAlignment {
    const goal = this.scopeCtx.agentId === MAIN_AGENT_ID ? this.goal.getGoal().goal : null;
    const program = this.getProgram();
    const binding = this.wire.getModel(ResearchModel).current.goalProgramBinding ?? null;
    if (goal === null || program === null) {
      return {
        status: 'unavailable',
        reason: goal === null ? 'Hakimi Goal is unavailable.' : 'AITP Research Goal has not been observed.',
        binding: binding ?? undefined,
      };
    }
    if (binding === null) {
      return {
        status: 'confirmation_required',
        reason: 'Confirm the explicit relationship between the Hakimi Goal and the observed AITP Research Goal.',
      };
    }
    if (binding.goalId !== goal.goalId || binding.topicId !== program.topicId) {
      return {
        status: 'stale',
        reason: 'The confirmed Goal or observed AITP topic changed; confirm the relationship again.',
        binding,
      };
    }
    if (binding.observedRevision !== program.observedRevision) {
      return {
        status: 'stale',
        reason: 'The observed AITP Research Goal changed; confirm the relationship again.',
        binding,
      };
    }
    if (binding.relation === 'unrelated') {
      return {
        status: 'conflict',
        reason: 'The confirmed relationship says the Hakimi Goal is unrelated to the observed AITP Research Goal.',
        binding,
      };
    }
    return {
      status: 'aligned',
      reason: `Confirmed as ${binding.relation}.`,
      binding,
    };
  }

  confirmGoalAlignment(input: ConfirmGoalAlignmentInput): void {
    this.assertStateMutationAllowed();
    if (!this.matchesCurrentGoalProgram(input)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'Goal alignment confirmation is stale. Refresh the Research snapshot and retry.',
      );
    }
    this.wire.dispatch(researchConfirmGoalAlignment({
      relation: input.relation,
      expectedRevision: this.wire.getModel(ResearchModel).current.revision,
      goalId: input.goalId,
      topicId: input.topicId,
      observedRevision: input.observedRevision,
      confirmedAt: now(),
    }));
    this.publishResearchUpdated();
  }

  clearGoalAlignment(input: ClearGoalAlignmentInput): void {
    this.assertStateMutationAllowed();
    if (!this.matchesCurrentGoalProgram(input)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'Goal alignment clear request is stale. Refresh the Research snapshot and retry.',
      );
    }
    this.wire.dispatch(researchClearGoalAlignment({
      ...input,
      expectedRevision: this.wire.getModel(ResearchModel).current.revision,
    }));
    this.publishResearchUpdated();
  }

  getLineWorkstreamAlignment(lineSlug: string): ResearchLineWorkstreamAlignment {
    const state = this.wire.getModel(ResearchModel).current;
    if (state.lines[lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${lineSlug} not found`,
      );
    }
    return deriveLineWorkstreamAlignment({
      lineSlug,
      binding: (state.lineWorkstreamBindings ?? {})[lineSlug],
      program: this.getProgram(),
    });
  }

  getCurrentWorkstreamAlignment(): ResearchLineWorkstreamAlignment | undefined {
    if (!this.mode.isActive) return undefined;
    const lineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    return lineSlug === undefined ? undefined : this.getLineWorkstreamAlignment(lineSlug);
  }

  async confirmLineWorkstreamBinding(
    input: ConfirmLineWorkstreamBindingInput,
  ): Promise<ResearchLineWorkstreamBinding> {
    this.assertStateMutationAllowed();
    if (!this.adapter.isReady()) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_NOT_READY,
        'Observe the AITP Topic with a ready adapter before confirming a workstream binding.',
      );
    }
    const state = this.wire.getModel(ResearchModel).current;
    const researchRevision = this.currentResearchRevision();
    if (researchRevision !== input.expectedRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${input.expectedRevision}, got ${researchRevision}.`,
      );
    }
    if (state.lines[input.lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${input.lineSlug} not found`,
      );
    }
    const program = this.getProgram();
    if (program === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'No current AITP Topic has been observed; refresh Research Mode before confirming membership.',
      );
    }
    const existing = (state.lineWorkstreamBindings ?? {})[input.lineSlug];
    if (existing !== undefined) {
      if (
        existing.workstream === input.workstream &&
        existing.topicId === program.topicId &&
        existing.observedRevision === program.observedRevision &&
        existing.confirmedBy === input.confirmedBy
      ) return { ...existing };
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Line ${input.lineSlug} already has a different immutable workstream confirmation; clear it explicitly before rebinding.`,
      );
    }
    this.assertLineWorkstreamBindingMutable(state, input.lineSlug);

    const binding: ResearchLineWorkstreamBinding = {
      confirmationId: randomUUID(),
      lineSlug: input.lineSlug,
      workstream: input.workstream,
      topicId: program.topicId,
      observedRevision: program.observedRevision,
      confirmedBy: input.confirmedBy,
      confirmedAt: now(),
    };
    this.wire.dispatch(researchConfirmWorkstreamBinding({
      ...binding,
      expectedRevision: state.revision,
    }));
    const stored = (this.wire.getModel(ResearchModel).current.lineWorkstreamBindings ?? {})[input.lineSlug];
    if (!sameLineWorkstreamBinding(stored, binding)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'The workstream binding changed before it could be confirmed; refresh and retry.',
      );
    }
    this.publishResearchUpdated();

    if (
      this.coordinator !== undefined &&
      this.wire.getModel(AitpModeModel).current.currentLineSlug === input.lineSlug
    ) {
      this.coordinator.reset();
      let observed: ResearchLineWorkstreamBinding | undefined;
      try {
        observed = await this.mode.reconcileCurrentTopicBinding(input.lineSlug);
      } catch (error) {
        if (
          error instanceof AitpResearchError &&
          error.code === AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED
        ) throw error;
        if (
          this.mode.isActive &&
          this.wire.getModel(AitpModeModel).current.currentLineSlug === input.lineSlug &&
          sameLineWorkstreamBinding(
            (this.wire.getModel(ResearchModel).current.lineWorkstreamBindings ?? {})[input.lineSlug],
            binding,
          )
        ) this.mode.setPhase('degraded');
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `Fresh AITP Topic observation failed after workstream confirmation: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!sameLineWorkstreamBinding(observed, binding)) {
        if (
          this.mode.isActive &&
          this.wire.getModel(AitpModeModel).current.currentLineSlug === input.lineSlug &&
          sameLineWorkstreamBinding(
            (this.wire.getModel(ResearchModel).current.lineWorkstreamBindings ?? {})[input.lineSlug],
            binding,
          )
        ) this.mode.setPhase('degraded');
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
          'The newly confirmed workstream no longer matches the freshly observed AITP Topic; scoped maintenance was not run.',
        );
      }
      const receipt = await this.coordinator.refresh({ workstream: binding.workstream, force: true });
      const alignment = this.getLineWorkstreamAlignment(input.lineSlug);
      if (
        !this.mode.isActive ||
        receipt.degradedReason === 'stale_generation' ||
        alignment.status !== 'bound' ||
        !sameLineWorkstreamBinding(alignment.binding, binding)
      ) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
          'The workstream binding changed while scoped maintenance was running; refresh and retry.',
        );
      }
      const currentProgram = this.getProgram();
      if (
        currentProgram === null ||
        !isMaintenanceReceiptAligned({ receipt, binding, program: currentProgram })
      ) {
        this.coordinator.reset();
        if (
          this.mode.isActive &&
          this.wire.getModel(AitpModeModel).current.currentLineSlug === input.lineSlug
        ) this.mode.setPhase('degraded');
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          'Scoped AITP maintenance observed a different Topic than the fresh Program; the receipt was rejected.',
        );
      }
      if (
        this.wire.getModel(AitpModeModel).current.currentLineSlug === input.lineSlug &&
        this.mode.phase !== receipt.status
      ) this.mode.setPhase(receipt.status);
    }
    return { ...binding };
  }

  clearLineWorkstreamBinding(input: ClearLineWorkstreamBindingInput): void {
    this.assertStateMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const researchRevision = this.currentResearchRevision();
    if (researchRevision !== input.expectedRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${input.expectedRevision}, got ${researchRevision}.`,
      );
    }
    if (state.lines[input.lineSlug] === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${input.lineSlug} not found`,
      );
    }
    const binding = (state.lineWorkstreamBindings ?? {})[input.lineSlug];
    if (binding === undefined) return;
    if (binding.confirmationId !== input.expectedConfirmationId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'The workstream confirmation changed; refresh and retry the clear against the current binding.',
      );
    }
    this.assertLineWorkstreamBindingMutable(state, input.lineSlug);
    this.wire.dispatch(researchClearWorkstreamBinding({
      binding,
      targetLineSlug: input.lineSlug,
      expectedRevision: state.revision,
    }));
    if ((this.wire.getModel(ResearchModel).current.lineWorkstreamBindings ?? {})[input.lineSlug] !== undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'The workstream binding changed before it could be cleared; refresh and retry.',
      );
    }
    if (this.wire.getModel(AitpModeModel).current.currentLineSlug === input.lineSlug) {
      this.coordinator?.reset();
      if (this.adapter.isReady() && this.mode.phase !== 'ready') this.mode.setPhase('ready');
    }
    this.publishResearchUpdated();
  }

  getPeriod(): ResearchPeriod | null {
    return this.wire.getModel(ResearchModel).current.period;
  }

  getResearchPlan(): ResearchPlan | null {
    return this.wire.getModel(ResearchPlanModel).current;
  }

  getResearchPlanV2(): ResearchPlanV2 | null {
    return this.wire.getModel(ResearchModel).current.researchPlanV2 ?? null;
  }

  getPlanningPolicy(): ResearchPlanningPolicy {
    return this.wire.getModel(ResearchModel).current.planningPolicy;
  }

  setPlanningPolicy(policy: ResearchPlanningPolicy, expectedRevision: number): void {
    const state = this.wire.getModel(ResearchModel).current;
    const researchRevision = this.currentResearchRevision();
    if (researchRevision !== expectedRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${String(expectedRevision)}, got ${String(researchRevision)}.`,
      );
    }
    if (state.planningPolicy === policy) return;
    this.wire.dispatch(researchSetPlanningPolicy(policy));
    this.publishResearchUpdated();
  }

  prepareResearchPlanV2(input: PrepareResearchPlanV2Input): ResearchPlanV2 {
    this.assertMutationAllowed();
    const binding = this.currentResearchPlanV2Binding();
    const current = this.getResearchPlanV2();
    const planId = input.planId ?? current?.planId ?? randomUUID();
    let revision = 1;
    let createdAt = Date.now();
    if (current !== null && current.planId === planId) {
      this.assertResearchPlanV2NotBoundToLiveAction(current);
      if (input.expectedRevision !== current.revision) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
          `Research Plan ${planId} is stale. Expected revision ${String(input.expectedRevision)}, got ${current.revision}.`,
        );
      }
      revision = current.revision + 1;
      createdAt = current.createdAt;
    } else if (current !== null && current.status !== 'completed' && current.status !== 'discarded') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Research Plan ${current.planId} is still ${current.status}; complete or discard it before creating ${planId}.`,
      );
    } else if (input.expectedRevision !== undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research Plan ${planId} does not have revision ${input.expectedRevision}.`,
      );
    }
    const updatedAt = Date.now();
    const plan: ResearchPlanV2 = {
      schema: 'hakimi/research-plan-0.2',
      planId,
      revision,
      goalId: binding.goalId,
      programId: binding.programId,
      programObservedRevision: binding.programObservedRevision,
      goalRelation: binding.goalRelation,
      objective: input.objective,
      completionCriterion: input.completionCriterion,
      milestones: input.milestones.map((milestone) => ({
        ...milestone,
        evidenceRequirements: [...milestone.evidenceRequirements],
      })),
      evidenceRequirements: [...input.evidenceRequirements],
      decisionPoints: input.decisionPoints.map((decision) => ({ ...decision })),
      assumptions: [...input.assumptions],
      currentMilestoneId: input.currentMilestoneId,
      stopConditions: [...input.stopConditions],
      replanConditions: [...input.replanConditions],
      status: 'draft',
      createdAt,
      updatedAt,
    };
    this.wire.dispatch(researchPutPlanV2(toResearchPlanV2Payload(plan)));
    this.publishResearchUpdated();
    return this.requireResearchPlanV2(planId, revision);
  }

  activateResearchPlanV2(input: TransitionResearchPlanV2Input): ResearchPlanV2 {
    return this.transitionResearchPlanV2(input, 'draft', 'active');
  }

  completeResearchPlanV2(input: TransitionResearchPlanV2Input): ResearchPlanV2 {
    return this.transitionResearchPlanV2(input, 'active', 'completed');
  }

  discardResearchPlanV2(input: TransitionResearchPlanV2Input): ResearchPlanV2 {
    this.assertMutationAllowed();
    const current = this.requireResearchPlanV2(input.planId, input.expectedRevision);
    if (current.status !== 'draft' && current.status !== 'active') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Research Plan ${current.planId} cannot be discarded from ${current.status}.`,
      );
    }
    this.assertResearchPlanV2BindingFresh(current);
    this.assertResearchPlanV2NotBoundToLiveAction(current);
    return this.putResearchPlanV2Status(current, 'discarded');
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
    if (!this.mode.isActive) return;
    const beforeRevision = this.wire.getModel(ResearchModel).current.revision;
    // This is the shared pre-answer reconciliation point for every admitted
    // Research turn. Keep it deterministic and local: external AITP refreshes
    // remain at lifecycle boundaries and changed turn ends.
    this.reconcile();
    const reconciledModeState = this.wire.getModel(AitpModeModel).current;
    if (reconciledModeState.currentLineSlug === undefined) return;
    const state = this.wire.getModel(ResearchModel).current;
    const line = reconciledModeState.currentLineSlug;
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
    if (this.wire.getModel(ResearchModel).current.revision !== beforeRevision) {
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
    const researchRevision = this.currentResearchRevision();
    if (input.expectedRevision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${input.expectedRevision}, got ${researchRevision}.`,
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
    const researchRevision = this.currentResearchRevision();
    if (researchRevision !== expectedRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${expectedRevision}, got ${researchRevision}. Review the packet against the current Research state.`,
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
      researchRevision,
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
    const state = this.wire.getModel(ResearchModel).current;
    const existing = state.lines[input.slug];
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
    if (input.status === 'completed' && state.pendingCheckpoint?.lineSlug === input.slug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Line ${input.slug} cannot be completed while checkpoint ${state.pendingCheckpoint.checkpointId} is pending durable commit.`,
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
    const state = this.wire.getModel(ResearchModel).current;
    const existing = state.questions[input.questionId];
    if (existing === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
        `Question ${input.questionId} not found`,
      );
    }
    if (
      input.workflow === 'closed' &&
      state.pendingCheckpoint?.questionId === input.questionId
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Question ${input.questionId} cannot be closed while checkpoint ${state.pendingCheckpoint.checkpointId} is pending durable commit.`,
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
    const researchRevision = this.currentResearchRevision();
    const revision = focusExpectedRevision ?? researchRevision;
    if (revision !== 0 && revision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${revision}, got ${researchRevision}.`,
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
      this.assertLineSwitchSafe(state, question.lineSlug);
      this.archiveCurrentCycleForLineSwitch(state);
      const current = this.wire.getModel(ResearchModel).current;
      this.wire.dispatch(
        researchSwitchLine({
          lineSlug: question.lineSlug,
          expectedRevision: current.revision,
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
    const researchRevision = this.currentResearchRevision();
    const revision = expectedRevision ?? researchRevision;
    if (revision !== 0 && revision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${revision}, got ${researchRevision}.`,
      );
    }
    const currentLineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    const lineChanged = currentLineSlug !== lineSlug;
    const focusQuestion = state.focus === null
      ? undefined
      : state.questions[state.focus.questionId];
    const focusBelongsElsewhere = focusQuestion !== undefined && focusQuestion.lineSlug !== lineSlug;
    if (!lineChanged && !focusBelongsElsewhere) return;
    if (lineChanged) {
      this.assertLineSwitchSafe(state, lineSlug);
      this.archiveCurrentCycleForLineSwitch(state);
    }
    const current = this.wire.getModel(ResearchModel).current;
    this.wire.dispatch(
      researchSwitchLine({
        lineSlug,
        expectedRevision: current.revision,
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
    const researchRevision = this.currentResearchRevision();
    if (command.expectedRevision !== 0 && command.expectedRevision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${command.expectedRevision}, got ${researchRevision}.`,
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
    if (
      command.kind === 'close_question' &&
      state.pendingCheckpoint?.questionId === command.questionId
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Question ${command.questionId} cannot be closed while checkpoint ${state.pendingCheckpoint.checkpointId} is pending durable commit.`,
      );
    }
    this.wire.dispatch(
      researchSteer({
        kind: command.kind,
        questionId: 'questionId' in command ? command.questionId : undefined,
        lineSlug: undefined,
        expectedRevision: state.revision,
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
    const researchRevision = this.currentResearchRevision();
    const revision = reopenExpectedRevision ?? researchRevision;
    if (revision !== 0 && revision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${revision}, got ${researchRevision}.`,
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
    const researchRevision = this.currentResearchRevision();
    if (input.expectedRevision !== 0 && input.expectedRevision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${input.expectedRevision}, got ${researchRevision}.`,
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
    const lineSlug = input.lineSlug
      ?? question?.lineSlug
      ?? this.wire.getModel(AitpModeModel).current.currentLineSlug;
    const line = lineSlug === undefined ? undefined : state.lines[lineSlug];
    if (lineSlug === undefined || line === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        lineSlug === undefined
          ? 'A Research checkpoint requires a current Line with an explicit workstream binding.'
          : `Line ${lineSlug} not found`,
      );
    }
    if (question !== undefined && question.lineSlug !== lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
        `Line ${lineSlug} does not own question ${question.id}`,
      );
    }
    const workstreamBinding = this.requireCurrentLineWorkstreamBinding(lineSlug);
    const checkpointId = randomUUID();
    const idempotencyKey = randomUUID();
    const createdAt = Date.now();
    this.wire.dispatch(
      researchProposeCheckpoint({
        checkpointId,
        questionId: input.questionId,
        lineSlug,
        workstreamBinding,
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

  bindPendingCheckpointReceipt(
    receipt: ResearchCheckpointReceipt,
    expectedCheckpointId?: string,
  ): ResearchCheckpoint {
    const capturesExternalSave = receipt.save !== undefined;
    if (capturesExternalSave) this.assertMainAgent();
    else this.assertMutationAllowed();
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (pending === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        'Cannot bind an AITP receipt without a pending research checkpoint',
      );
    }
    if (expectedCheckpointId !== undefined && pending.checkpointId !== expectedCheckpointId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${expectedCheckpointId} changed while its AITP receipt was being captured`,
      );
    }
    if (
      !capturesExternalSave &&
      !checkpointQuestionRevisionMatches(this.wire.getModel(ResearchModel).current, pending)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} was created from an older question revision; re-propose it before binding AITP receipts`,
      );
    }
    if (!capturesExternalSave) this.assertCheckpointWorkstreamBindingCurrent(pending);
    const expectedWorkstream = pending.workstreamBinding!.workstream;
    if (
      receipt.prepare !== undefined &&
      (receipt.prepare.workstreams?.length !== 1 ||
        receipt.prepare.workstreams[0] !== expectedWorkstream)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `Checkpoint ${pending.checkpointId} prepare receipt must use only confirmed workstream ${expectedWorkstream}.`,
      );
    }
    const existingReceipt = pending.receipt;
    const preserveCompletedPrepare =
      receipt.prepare !== undefined &&
      existingReceipt?.prepare !== undefined &&
      existingReceipt.save !== undefined &&
      isCompatiblePrepareReceiptTransition(existingReceipt.prepare, receipt.prepare);
    const incomingPrepare = preserveCompletedPrepare ? undefined : receipt.prepare;
    if (
      incomingPrepare !== undefined &&
      existingReceipt?.prepare !== undefined &&
      !isCompatiblePrepareReceiptTransition(existingReceipt.prepare, incomingPrepare)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} is already bound to a different AITP prepare receipt`,
      );
    }
    if (
      receipt.preSaveCheck !== undefined &&
      existingReceipt?.preSaveCheck !== undefined &&
      JSON.stringify(receipt.preSaveCheck) !== JSON.stringify(existingReceipt.preSaveCheck)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} cannot replace its first pre-save baseline`,
      );
    }
    if (
      receipt.preSaveCheck !== undefined &&
      existingReceipt?.preSaveCheck === undefined &&
      existingReceipt?.save !== undefined
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} cannot replace its pre-save baseline after save`,
      );
    }
    const mergedReceipt: ResearchCheckpointReceipt = {
      prepare: incomingPrepare ?? existingReceipt?.prepare,
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
        receipt: toWireCheckpointReceipt({ ...receipt, prepare: incomingPrepare }),
      }),
    );
    const updated = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (updated === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${pending.checkpointId} could not retain its AITP receipt`,
      );
    }
    if (capturesExternalSave) {
      const currentState = this.wire.getModel(ResearchModel).current;
      let recoveryReason = !checkpointQuestionRevisionMatches(currentState, updated)
        ? `Checkpoint ${updated.checkpointId} was created from an older question revision.`
        : undefined;
      if (recoveryReason === undefined) {
        try {
          this.assertCheckpointWorkstreamBindingCurrent(updated, currentState);
        } catch (error) {
          recoveryReason = error instanceof Error ? error.message : String(error);
        }
      }
      if (recoveryReason !== undefined) {
        this.markCheckpointSaveRecoveryRequired(
          pending.checkpointId,
          receipt.save.path,
          recoveryReason,
        );
      }
    }
    return toCheckpoint(updated);
  }

  discardHistoricalCheckpoint(
    input: DiscardHistoricalCheckpointInput,
  ): ResearchCheckpoint {
    this.assertStateMutationAllowed();
    const researchRevision = this.currentResearchRevision();
    if (input.expectedRevision !== 0 && input.expectedRevision !== researchRevision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research revision is stale. Expected ${input.expectedRevision}, got ${researchRevision}.`,
      );
    }
    const discarded = this.discardHistoricalCheckpointIfSafe(input.checkpointId);
    if (discarded === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${input.checkpointId} is not a safely discardable historical proposal. Refresh Research state; current checkpoints and proposals with AITP receipts must be committed or recovered explicitly.`,
      );
    }
    this.publishResearchUpdated();
    return discarded;
  }

  async commitCheckpoint(input: CommitCheckpointInput): Promise<CommitCheckpointResult> {
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
      return { status: 'already_committed' };
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
    this.assertCheckpointWorkstreamBindingCurrent(pending, current);
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
    const checkpointWorkstream = pending.workstreamBinding!.workstream;
    const checkpointTopicId = pending.workstreamBinding!.topicId;
    if (
      receipt.prepare.workstreams?.length !== 1 ||
      receipt.prepare.workstreams[0] !== checkpointWorkstream
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `Checkpoint ${input.checkpointId} prepare receipt does not use its exact confirmed workstream ${checkpointWorkstream}.`,
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
    await this.reconcileCheckpointWorkstreamForCommit(pending);
    try {
      let shown: AitpShowResult;
      if (this.durable !== undefined) {
        shown = await this.durable.verifyEntry(input.entryId, checkpointWorkstream, checkpointTopicId);
      } else {
        shown = await this.adapter.show({ id: input.entryId });
        const workstreams = shown.frontmatter?.['workstreams'];
        if (
          shown.id !== input.entryId ||
          shown.status !== 'active' ||
          shown.frontmatter?.['topic'] !== checkpointTopicId ||
          !Array.isArray(workstreams) ||
          !workstreams.every((workstream) => typeof workstream === 'string') ||
          workstreams.length !== 1 ||
          workstreams[0] !== checkpointWorkstream
        ) {
          throw new AitpResearchError(
            AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
            `AITP entry ${input.entryId} was not returned as an active matching entry for Topic ${checkpointTopicId} and workstream ${checkpointWorkstream}`,
          );
        }
      }
      const candidate = pending.commitCandidate;
      if (
        candidate !== undefined &&
        (shown.frontmatter?.['kind'] !== candidate.entryKind ||
          shown.frontmatter?.['authority'] !== candidate.authority ||
          shown.frontmatter?.['created_by'] !== (candidate.authority === 'agent' ? 'agent:main' : undefined))
      ) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `Saved AITP entry ${input.entryId} does not match the assessed candidate kind, authority, and creator. The saved Entry and receipt are retained; review the actual record before recovery.`,
        );
      }
    } catch (error) {
      this.markCommitBarrierFailed(pending, error);
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
      this.assertCheckpointWorkstreamBindingCurrent(afterShowPending, afterShow);
      await this.reconcileCheckpointWorkstreamForCommit(afterShowPending);
      let postSaveCheck: ResearchCheckpointCheckReceipt;
      try {
        if (this.durable !== undefined) {
          postSaveCheck = (await this.durable.checkAfterSave({
            workstream: checkpointWorkstream,
            preSaveCheck,
          })).postSaveCheck;
        } else {
          const report = await this.adapter.check({ workstream: checkpointWorkstream });
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
        this.markCommitBarrierFailed(afterShowPending, error);
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
      const afterCheckPending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
      if (afterCheckPending === null || afterCheckPending.checkpointId !== input.checkpointId) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
          `Checkpoint ${input.checkpointId} changed after the AITP check barrier`,
        );
      }
      await this.reconcileCheckpointWorkstreamForCommit(afterCheckPending);
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
      return { status: 'already_committed' };
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
    this.assertCheckpointWorkstreamBindingCurrent(afterPending, after);

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
    this.clearNoteReview();
    if (afterPending.workstreamBinding !== undefined) {
      this.noteReviewContext = {
        owner: { kind: 'checkpoint', checkpointId: input.checkpointId, entryId: input.entryId },
        workstreamBinding: { ...afterPending.workstreamBinding },
      };
    }
    this.publishResearchUpdated();
    return { status: 'committed' };
  }

  async prepareReviewNote(input: AitpAdapterNotePrepareOptions): Promise<AitpNotePrepareResult> {
    const args = { workstreams: input.workstreams };
    return this.persistReviewNote('aitp_note_prepare', args, input.signal, async (context) => {
      const result = await this.adapter.notePrepare(input);
      const path = normalizeResearchPath(result.path);
      this.assertNoteReviewUnchanged(context, result);
      if (path === undefined || !/^\.aitp\/local\/drafts\/note-[A-Za-z0-9_-]+\.md$/.test(path)) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `AITP Note prepare returned an unsupported draft path; no draft permission was granted: ${result.path}`,
        );
      }
      this.distillationDraftLease = { context, path };
      return result;
    });
  }

  async saveReviewNote(input: AitpAdapterNoteSaveOptions): Promise<AitpNoteSaveResult> {
    return this.persistReviewNote('aitp_note_save', { draft_path: input.draftPath }, input.signal, async (context) => {
      const result = await this.adapter.noteSave(input);
      this.distillationDraftLease = undefined;
      this.assertNoteReviewUnchanged(context, result);
      return result;
    });
  }

  private async persistReviewNote<T>(
    toolName: string,
    args: unknown,
    signal: AbortSignal | undefined,
    execute: (context: ResearchNoteReviewContext) => Promise<T>,
  ): Promise<T> {
    this.assertMainAgent();
    signal?.throwIfAborted();
    const blocker = this.distillationPersistenceBlockerFor(toolName, args);
    const context = this.currentNoteReviewContext()
      ?? (toolName === 'aitp_note_prepare' ? this.actionNoteReviewCandidate() : undefined);
    if (blocker !== undefined || context === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        blocker ?? 'No current verified handoff or bounded Note Action owns this Note.',
      );
    }
    this.noteReviewContext = context;
    this.notePersistenceInFlight = true;
    try {
      const observed = await this.mode.reconcileCurrentTopicBinding(context.workstreamBinding.lineSlug);
      signal?.throwIfAborted();
      if (!sameLineWorkstreamBinding(observed, context.workstreamBinding)) this.clearNoteReview();
      this.assertNoteReviewUnchanged(context);
      if (context.owner.kind === 'action') {
        for (const entryId of context.owner.entryIds) {
          const shown = await this.adapter.show({ id: entryId, signal });
          signal?.throwIfAborted();
          this.assertNoteReviewUnchanged(context);
          const workstreams = shown.frontmatter?.['workstreams'];
          if (
            shown.id !== entryId || shown.status !== 'active' ||
            shown.frontmatter?.['topic'] !== context.workstreamBinding.topicId ||
            !Array.isArray(workstreams) ||
            !workstreams.includes(context.workstreamBinding.workstream)
          ) {
            throw new AitpResearchError(
              AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
              `Note basis Entry ${entryId} is not active in the captured Topic/workstream. Reassess the selected evidence before preparing or saving this Note.`,
            );
          }
        }
      }
      const result = await execute(context);
      signal?.throwIfAborted();
      return result;
    } finally {
      if (signal?.aborted === true) this.clearNoteReview();
      this.notePersistenceInFlight = false;
    }
  }

  private assertNoteReviewUnchanged(
    context: ResearchNoteReviewContext,
    result?: AitpNotePrepareResult | AitpNoteSaveResult,
  ): void {
    if (this.currentNoteReviewContext() === context) return;
    this.clearNoteReview();
    throw new AitpResearchError(
      AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
      result === undefined
        ? 'The Note review scope changed before AITP Note I/O; no write permission remains. Recorded evidence is still available for inspection.'
        : `The Note review scope changed during AITP Note I/O. The adapter reported ${JSON.stringify(result)}; inspect that artifact before retrying. No draft permission remains and no rollback is claimed.`,
    );
  }

  private assertActionCanBePlanned(
    input: PlanActionInput,
    state: ResearchWorkingState,
  ): { readonly lineSlug?: string } {
    if (state.pendingCheckpoint !== null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${state.pendingCheckpoint.checkpointId} is pending; finish its persistence or safely discard a historical proposal before beginning another action.`,
      );
    }
    if (isLiveResearchRun(state.currentRun) || isLiveResearchRun(state.currentAction?.run)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        'An unresolved run is still attached to the foreground work. Inspect the current action/run before replacement; a concluded action does not prove the run has finished.',
      );
    }
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

  private resolveActionPlanBindings(
    input: PlanActionInput,
    actionId: string,
    lineSlug?: string,
  ): {
    readonly researchPlanBinding?: ResearchPlanV2ActionBinding;
    readonly actionPlanBinding: ResearchActionPlanBinding;
  } {
    const planningLevel = input.planningLevel ?? 'simple';
    if (planningLevel === 'simple') {
      if (
        input.researchPlanId !== undefined ||
        input.researchPlanRevision !== undefined ||
        input.milestoneId !== undefined ||
        input.actionPlanId !== undefined ||
        input.actionPlanRevision !== undefined
      ) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
          'A simple Research action cannot carry reviewed-plan bindings.',
        );
      }
      return {
        actionPlanBinding: {
          schema: 'hakimi/action-plan-binding-0.1',
          kind: 'minimal',
          planId: `minimal:${actionId}`,
          planRevision: 1,
        },
      };
    }
    if (
      input.actionPlanId === undefined ||
      input.actionPlanRevision === undefined
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        'A planned Research action requires a reviewed Action Plan ID and revision.',
      );
    }
    const parentProvided = input.researchPlanId !== undefined ||
      input.researchPlanRevision !== undefined || input.milestoneId !== undefined;
    const currentParent = this.getResearchPlanV2();
    let researchPlanBinding: ResearchPlanV2ActionBinding | undefined;
    if (parentProvided) {
      if (
        input.researchPlanId === undefined ||
        input.researchPlanRevision === undefined ||
        input.milestoneId === undefined
      ) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
          'Research Plan ID, revision, and milestone must be provided together.',
        );
      }
      const researchPlan = this.requireResearchPlanV2(input.researchPlanId, input.researchPlanRevision);
      if (researchPlan.status !== 'active' || researchPlan.currentMilestoneId !== input.milestoneId) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
          `Research Plan ${researchPlan.planId} is not active on milestone ${input.milestoneId}.`,
        );
      }
      this.assertResearchPlanV2BindingFresh(researchPlan);
      researchPlanBinding = {
        planId: researchPlan.planId,
        planRevision: researchPlan.revision,
        milestoneId: researchPlan.currentMilestoneId,
      };
    } else if (currentParent !== null && currentParent.status !== 'completed' && currentParent.status !== 'discarded') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'The current Research Plan must be active and explicitly bound to its current milestone before a planned action can begin.',
      );
    }
    const actionPlan = this.getResearchPlan();
    if (
      actionPlan === null ||
      actionPlan.status !== 'finalized' ||
      actionPlan.planId !== input.actionPlanId ||
      actionPlan.resolution?.planRevision !== input.actionPlanRevision ||
      actionPlan.resolution.outcome !== 'approved'
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Action Plan ${input.actionPlanId} revision ${input.actionPlanRevision} is not the current finalized plan.`,
      );
    }
    if (
      input.actionPlanRevision < 1 ||
      this.plan === undefined ||
      this.plan.getRevision?.(input.actionPlanId) !== input.actionPlanRevision
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Action Plan ${input.actionPlanId} revision ${input.actionPlanRevision} is stale in local Plan state.`,
      );
    }
    this.assertResearchPlanFresh(actionPlan);
    if (actionPlan.lineSlug !== lineSlug || actionPlan.questionId !== input.questionId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'The reviewed Action Plan does not match the Research action line and question.',
      );
    }
    return {
      researchPlanBinding,
      actionPlanBinding: {
        schema: 'hakimi/action-plan-binding-0.1',
        kind: 'reviewed_plan',
        planId: actionPlan.planId,
        planRevision: input.actionPlanRevision,
      },
    };
  }

  private assertActionPlanBindingsFresh(action: ResearchActionSpecRecord): void {
    if (action.researchPlanBinding !== undefined) {
      const binding = action.researchPlanBinding;
      const researchPlan = this.requireResearchPlanV2(binding.planId, binding.planRevision);
      if (
        researchPlan.status !== 'active' ||
        researchPlan.currentMilestoneId !== binding.milestoneId
      ) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
          `Action ${action.actionId} is bound to a stale Research Plan milestone.`,
        );
      }
      this.assertResearchPlanV2BindingFresh(researchPlan);
    }
    const binding = action.actionPlanBinding;
    if (binding === undefined || binding.kind === 'minimal') return;
    const actionPlan = this.getResearchPlan();
    if (
      actionPlan === null ||
      actionPlan.status !== 'finalized' ||
      actionPlan.planId !== binding.planId ||
      actionPlan.resolution?.planRevision !== binding.planRevision ||
      this.plan === undefined ||
      this.plan.getRevision?.(binding.planId) !== binding.planRevision
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Action ${action.actionId} is bound to a stale local Action Plan revision.`,
      );
    }
    this.assertActionPlanContextFresh(actionPlan);
  }

  private assertActionPlanContextFresh(plan: ResearchPlan): void {
    const state = this.wire.getModel(ResearchModel).current;
    const modeState = this.wire.getModel(AitpModeModel).current;
    const line = plan.lineSlug === undefined ? undefined : state.lines[plan.lineSlug];
    const question = plan.questionId === undefined ? undefined : state.questions[plan.questionId];
    if (
      state.program?.topicId !== plan.programId ||
      state.period?.id !== plan.periodId ||
      modeState.currentLineSlug !== plan.lineSlug ||
      line?.revision !== plan.lineRevision ||
      question?.revision !== plan.questionRevision ||
      (question !== undefined && question.lineSlug !== plan.lineSlug)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Action Plan ${plan.planId} is bound to stale Research context.`,
      );
    }
  }

  planAction(input: PlanActionInput): ResearchActionSpec {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    const ownership = this.assertActionCanBePlanned(input, state);
    const actionId = input.actionId ?? randomUUID();
    const bindings = this.resolveActionPlanBindings(input, actionId, ownership.lineSlug);
    this.wire.dispatch(
      researchPlanAction({
        actionId,
        questionId: input.questionId,
        questionRevision: input.questionId === undefined
          ? undefined
          : state.questions[input.questionId]?.revision,
        lineSlug: ownership.lineSlug,
        lineRevision: ownership.lineSlug === undefined
          ? undefined
          : state.lines[ownership.lineSlug]?.revision,
        kind: input.kind,
        purpose: input.purpose,
        expectedEvidence: input.expectedEvidence !== undefined ? [...input.expectedEvidence] : [],
        stopCondition: input.stopCondition,
        allowedToolKinds: input.allowedToolKinds !== undefined ? [...input.allowedToolKinds] : [],
        retryOfEntryId: input.retryOfEntryId,
        requiresHumanApproval: input.requiresHumanApproval ?? false,
        researchPlanBinding: bindings.researchPlanBinding,
        actionPlanBinding: bindings.actionPlanBinding,
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
    const bindings = this.resolveActionPlanBindings(input, actionId, ownership.lineSlug);
    this.wire.dispatch(
      researchBeginAction({
        actionId,
        questionId: input.questionId,
        questionRevision: input.questionId === undefined
          ? undefined
          : state.questions[input.questionId]?.revision,
        lineSlug: ownership.lineSlug,
        lineRevision: ownership.lineSlug === undefined
          ? undefined
          : state.lines[ownership.lineSlug]?.revision,
        kind: input.kind,
        purpose: input.purpose,
        expectedEvidence: input.expectedEvidence !== undefined ? [...input.expectedEvidence] : [],
        stopCondition: input.stopCondition,
        allowedToolKinds: input.allowedToolKinds !== undefined ? [...input.allowedToolKinds] : [],
        retryOfEntryId: input.retryOfEntryId,
        requiresHumanApproval: false,
        researchPlanBinding: bindings.researchPlanBinding,
        actionPlanBinding: bindings.actionPlanBinding,
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
    this.assertActionPlanBindingsFresh(action);
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
    if (state.phase !== 'action_executing' && isUnresolvedHumanGate(state.humanGate)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_GATE_PENDING,
        `Human gate ${state.humanGate.gateId} is unresolved; resolve it before completing action ${actionId}.`,
      );
    }
    this.assertActionPlanBindingsFresh(action);
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
      const progress = state.latestProgress;
      const commitCandidate = state.pendingCheckpoint?.commitCandidate;
      if (
        action.status === input.status &&
        progress !== null &&
        state.recentStateChange?.actionId === action.actionId &&
        state.recentStateChange.changedAt === progress.recordedAt &&
        sameConclusionProgress(progress, input) &&
        sameDurabilityAssessment(commitCandidate, input, progress.recordedAt)
      ) {
        return {
          action: toActionSpec(action),
          progress: toProgressReport(progress),
          commitCandidate,
        };
      }
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${input.actionId} is not in 'in_progress' status (got '${action.status}')`,
      );
    }
    if (state.phase !== 'action_executing' && isUnresolvedHumanGate(state.humanGate)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_GATE_PENDING,
        `Human gate ${state.humanGate.gateId} is unresolved; resolve it before concluding action ${input.actionId}.`,
      );
    }
    this.assertActionPlanBindingsFresh(action);

    let checkpointContext: {
      readonly questionId?: string;
      readonly lineSlug: string;
      readonly workstreamBinding: ResearchLineWorkstreamBinding;
    } | undefined;
    if (input.durability.status === 'durable_delta') {
      assertDurableCommitProvenance(input.durability);
      if (state.pendingCheckpoint !== null) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
          `Checkpoint ${state.pendingCheckpoint.checkpointId} is already pending commit`,
        );
      }
      const question = action.questionId === undefined
        ? undefined
        : state.questions[action.questionId];
      if (action.questionId !== undefined && question === undefined) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_QUESTION_NOT_FOUND,
          `Question ${action.questionId} not found`,
        );
      }
      const lineSlug = action.lineSlug
        ?? question?.lineSlug
        ?? this.wire.getModel(AitpModeModel).current.currentLineSlug;
      const line = lineSlug === undefined ? undefined : state.lines[lineSlug];
      if (lineSlug === undefined || line === undefined) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
          lineSlug === undefined
            ? 'A durable conclusion requires a current Line with an explicit workstream binding.'
            : `Line ${lineSlug} not found`,
        );
      }
      if (question !== undefined && question.lineSlug !== lineSlug) {
        throw new AitpResearchError(
          AitpResearchErrors.codes.RESEARCH_LINE_NOT_FOUND,
          `Line ${lineSlug} does not own question ${question.id}`,
        );
      }
      checkpointContext = {
        questionId: question?.id,
        lineSlug,
        workstreamBinding: this.requireCurrentLineWorkstreamBinding(lineSlug),
      };
    }

    const completedAt = Date.now();
    const recordedAt = Date.now();
    const complete = researchCompleteAction({
      actionId: input.actionId,
      status: input.status,
      completedAt,
    });
    const record = researchRecordProgress({
      headline: input.progress.headline,
      question: input.progress.question,
      motivation: input.progress.motivation,
      workPerformed: input.progress.workPerformed,
      result: input.progress.result,
      mainlineImpact: input.progress.mainlineImpact,
      uncertainties: input.progress.uncertainties !== undefined ? [...input.progress.uncertainties] : [],
      nextAction: input.progress.nextAction,
      phaseChange: { from: 'evaluating', to: 'state_updated' },
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
    });
    let proposedCandidate: ResearchDurableCommitCandidate | undefined;
    if (checkpointContext === undefined || input.durability.status === 'no_durable_delta') {
      this.wire.dispatch(complete, record);
    } else {
      proposedCandidate = {
        sourceActionId: input.actionId,
        progressRecordedAt: recordedAt,
        entryKind: input.durability.entryKind,
        authority: input.durability.authority,
        provenance: input.durability.provenance,
        rationale: input.durability.rationale,
      };
      this.wire.dispatch(
        complete,
        record,
        researchProposeCheckpoint({
          checkpointId: randomUUID(),
          questionId: checkpointContext.questionId,
          lineSlug: checkpointContext.lineSlug,
          workstreamBinding: checkpointContext.workstreamBinding,
          commitCandidate: proposedCandidate,
          assessment: input.progress.mainlineImpact,
          nextAction: input.progress.nextAction,
          idempotencyKey: randomUUID(),
          createdAt: recordedAt,
        }),
      );
    }
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
      next.phase !== 'state_updated' ||
      (proposedCandidate !== undefined &&
        !sameCommitCandidate(next.pendingCheckpoint?.commitCandidate, proposedCandidate))
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${input.actionId} conclusion did not produce a consistent Research state; inspect the current snapshot before retrying`,
      );
    }
    return {
      action: toActionSpec(completedAction),
      progress: toProgressReport(progress),
      commitCandidate: next.pendingCheckpoint?.commitCandidate,
    };
  }

  recordProgress(input: RecordProgressInput): ResearchProgressReport {
    this.assertMutationAllowed();
    const state = this.wire.getModel(ResearchModel).current;
    if (isLiveForegroundAction(state.currentAction)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${state.currentAction!.actionId} is still ${state.currentAction!.status}. Use ConcludeResearchAction instead of recording standalone progress.`,
      );
    }
    if (isCurrentConclusionProgress(state)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${state.currentAction!.actionId} was already concluded with its progress report. Do not call RecordResearchProgress for the same conclusion.`,
      );
    }
    const currentPhase = state.phase;
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
    if (isLiveForegroundAction(state.currentAction)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${state.currentAction!.actionId} is still ${state.currentAction!.status}. Use ConcludeResearchAction before changing phase; start the action first if it is only planned.`,
      );
    }
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
    if (!this.resumeActionWithAutoStandingApproval()) {
      this.publishResearchUpdated();
    }
    const record = this.wire.getModel(ResearchModel).current.humanGate;
    if (record === null || record.gateId !== gateId) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_GATE_PENDING,
        `Failed to create human gate ${gateId}`,
      );
    }
    return toHumanGate(record);
  }

  private resumeActionWithAutoStandingApproval(): boolean {
    if (
      this.permissionMode?.mode !== 'auto' ||
      this.scopeCtx.agentId !== MAIN_AGENT_ID ||
      !this.mode.isActive ||
      this.mode.loopStatus !== 'active' ||
      this.wire.isRestoring()
    ) return false;

    const state = this.wire.getModel(ResearchModel).current;
    const gate = state.humanGate;
    const action = state.currentAction;
    if (
      state.phase !== 'awaiting_human' ||
      gate === null ||
      gate.resolvedAt !== undefined ||
      gate.kind !== 'approval' ||
      gate.actionId === undefined ||
      action === null ||
      action.actionId !== gate.actionId ||
      action.status !== 'planned' ||
      !action.requiresHumanApproval
    ) return false;

    const changedAt = now();
    this.wire.dispatch(
      researchResolveHumanDecision({
        gateId: gate.gateId,
        resolution: AUTO_PERMISSION_MODE_STANDING_APPROVAL,
        nextPhase: 'action_planned',
        changedAt,
      }),
      researchStartAction({ actionId: action.actionId, startedAt: changedAt }),
    );
    this.publishResearchUpdated();
    return true;
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
    const actionOwnedPhase = researchActionOwnedPhase(state.currentAction);
    if (actionOwnedPhase !== undefined && input.nextPhase !== actionOwnedPhase) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Action ${state.currentAction!.actionId} is ${state.currentAction!.status}; resolve its gate to ${actionOwnedPhase} so the live action remains structurally owned.`,
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
        classification: 'warning',
        source: 'adapter',
        state: 'active',
        message: this.mode.maintenanceDegradedReason === 'workstream_unbound'
          ? 'AITP scoped persistence is unavailable without an explicit Line/workstream binding. User-directed bounded exploration remains provisional.'
          : 'AITP persistence, automatic Goal continuation and completion are unavailable until the adapter is ready. User-directed bounded exploration remains provisional.',
        createdAt: now(),
      });
    } else if (this.mode.phase === 'ready') {
      clear.add(ALERT_FINGERPRINTS.degraded);
    }

    const maintenance = this.currentMaintenanceReceipt();
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

    if (maintenance !== undefined) {
      for (const alert of state.alerts) {
        if (alert.fingerprint.startsWith(failurePrefix) && !desired.has(alert.fingerprint)) {
          clear.add(alert.fingerprint);
        }
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
    if (maintenance !== undefined) {
      for (const alert of state.alerts) {
        if (alert.fingerprint.startsWith(warningPrefix) && !desired.has(alert.fingerprint)) {
          clear.add(alert.fingerprint);
        }
      }
    }

    for (const fingerprint of clear) {
      if (desired.has(fingerprint)) continue;
      if (state.alerts.some(
        (alert) => alert.fingerprint === fingerprint && alert.state !== 'cleared',
      )) {
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
      if (alerts.some((alert) =>
        alert.state !== 'cleared' &&
        (alert.fingerprint === fingerprint || alert.fingerprint.startsWith(fingerprint))
      )) {
        if (fingerprint.endsWith('.')) {
          for (const alert of alerts) {
            if (alert.state !== 'cleared' && alert.fingerprint.startsWith(fingerprint)) {
              this.wire.dispatch(researchClearAlert({ fingerprint: alert.fingerprint }));
            }
          }
        } else {
          this.wire.dispatch(researchClearAlert({ fingerprint }));
        }
      }
    }
  }

  private markCommitBarrierFailed(
    checkpoint: ResearchCheckpointRecord,
    error?: unknown,
  ): void {
    if (
      !this.mode.isActive ||
      this.wire.getModel(AitpModeModel).current.currentLineSlug !== checkpoint.lineSlug ||
      (
        error instanceof AitpResearchError &&
        error.code === AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED
      )
    ) return;
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
        message: 'AITP persistence, automatic Goal continuation and completion are unavailable until the adapter is ready. User-directed bounded exploration remains provisional.',
        createdAt: now(),
      }),
    );
    this.publishResearchUpdated();
  }

  private markCheckpointSaveRecoveryRequired(
    checkpointId: string,
    canonicalPath: string,
    reason: string,
  ): void {
    if (!this.mode.isActive) return;
    this.mode.setPhase('degraded');
    this.wire.dispatch(
      researchUpsertAlert({
        fingerprint: ALERT_FINGERPRINTS.commitFailed,
        kind: 'commit_failed',
        classification: 'active_blocker',
        source: 'checkpoint',
        state: 'active',
        message: `AITP save completed at ${canonicalPath}, but checkpoint ${checkpointId} cannot commit with stale captured Research state; inspect the Entry and undo the pending checkpoint proposal before rebinding.`,
        reason,
        createdAt: now(),
      }),
      researchUpsertAlert({
        fingerprint: ALERT_FINGERPRINTS.degraded,
        kind: 'degraded',
        classification: 'active_blocker',
        source: 'adapter',
        state: 'active',
        message: 'AITP Research Mode is degraded because an external save completed after its captured checkpoint state became stale; the canonical Entry remains saved.',
        reason,
        createdAt: now(),
      }),
    );
    this.publishResearchUpdated();
  }

  private reconcile(): void {
    this.reconcileCommittedCheckpoint();
    this.reconcileHistoricalCheckpoint();
    this.reconcileResearchStructure();
    this.reconcilePeriodLifecycle();
    this.reconcileAlerts();
  }

  private reconcileHistoricalCheckpoint(): void {
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (pending === null) return;
    this.discardHistoricalCheckpointIfSafe(pending.checkpointId);
  }

  private discardHistoricalCheckpointIfSafe(
    checkpointId: string,
  ): ResearchCheckpoint | null {
    const state = this.wire.getModel(ResearchModel).current;
    const pending = state.pendingCheckpoint;
    const committedCursor = this.externalFact.getCommittedCursor();
    if (
      pending === null ||
      pending.checkpointId !== checkpointId ||
      pending.committedEntryId !== undefined ||
      pending.receipt !== undefined ||
      committedCursor?.checkpointId === checkpointId ||
      this.externalFact.getCommitHistory().some((commit) => commit.checkpointId === checkpointId)
    ) return null;

    const question = pending.questionId === undefined
      ? undefined
      : state.questions[pending.questionId];
    const questionRevisionSuperseded = pending.questionRevision !== undefined &&
      question !== undefined &&
      question.revision !== pending.questionRevision;
    const capturedBinding = pending.workstreamBinding;
    const currentBinding = pending.lineSlug === undefined
      ? undefined
      : state.lineWorkstreamBindings?.[pending.lineSlug];
    const program = state.program;
    const workstreamBindingStale = capturedBinding !== undefined &&
      pending.lineSlug === capturedBinding.lineSlug &&
      currentBinding !== undefined &&
      !sameLineWorkstreamBinding(currentBinding, capturedBinding);
    const programContextStale = capturedBinding !== undefined &&
      pending.lineSlug === capturedBinding.lineSlug &&
      program !== null &&
      (program.topicId !== capturedBinding.topicId ||
        (program.observedRevision ?? 1) !== capturedBinding.observedRevision);
    if (!questionRevisionSuperseded && !workstreamBindingStale && !programContextStale) return null;

    const discarded = toCheckpoint(pending);
    if (
      questionRevisionSuperseded &&
      question !== undefined &&
      pending.questionRevision !== undefined
    ) {
      this.wire.dispatch(researchDiscardHistoricalCheckpoint({
        checkpointId,
        reason: 'question_revision',
        questionId: question.id,
        checkpointQuestionRevision: pending.questionRevision,
        currentQuestionRevision: question.revision,
      }));
    } else {
      this.wire.dispatch(researchDiscardHistoricalCheckpoint({
        checkpointId,
        reason: workstreamBindingStale ? 'workstream_binding' : 'program_context',
        capturedWorkstreamBinding: capturedBinding!,
      }));
    }
    return this.wire.getModel(ResearchModel).current.pendingCheckpoint === null
      ? discarded
      : null;
  }

  /**
   * Repairs only state-machine facts that have one mechanically determined
   * answer. It never infers a scientific outcome: a recovered live action
   * remains live and is marked for evidence-based resolution on the next
   * Research turn.
   */
  private reconcileResearchStructure(): void {
    let state = this.wire.getModel(ResearchModel).current;
    const modeState = this.wire.getModel(AitpModeModel).current;
    const foregroundLine = deterministicForegroundLine(state);
    if (
      this.mode.isActive &&
      foregroundLine !== undefined &&
      modeState.currentLineSlug !== foregroundLine
    ) {
      this.wire.dispatch(aitpModeSetLine({ lineSlug: foregroundLine }));
      state = this.wire.getModel(ResearchModel).current;
    }

    if (isUnresolvedHumanGate(state.humanGate)) {
      if (state.phase !== 'awaiting_human') {
        this.wire.dispatch(researchSetPhase({
          phase: 'awaiting_human',
          reason: `Recovered unresolved human gate ${state.humanGate.gateId} from phase ${state.phase}; the gate remains pending for an explicit resolution.`,
          changedAt: now(),
        }));
      }
      return;
    }
    const actionOwnedPhase = researchActionOwnedPhase(state.currentAction);
    if (actionOwnedPhase !== undefined) {
      if (state.phase === actionOwnedPhase) return;
      this.wire.dispatch(researchSetPhase({
        phase: actionOwnedPhase,
        reason: `${RESEARCH_ACTION_RECOVERY_PREFIX} Action ${state.currentAction!.actionId} remained ${state.currentAction!.status} while phase was ${state.phase}; scientific completion or abandonment remains unresolved.`,
        changedAt: now(),
      }));
      return;
    }

    if (state.phase !== 'action_planned' && state.phase !== 'action_executing') return;
    const terminalAction = state.currentAction?.status === 'completed' ||
      state.currentAction?.status === 'abandoned';
    const phase = state.phase === 'action_executing' && terminalAction
      ? 'evaluating'
      : 'idle';
    this.wire.dispatch(researchSetPhase({
      phase,
      reason: `Recovered orphan Research phase ${state.phase}: no live foreground action owns it.`,
      changedAt: now(),
    }));
  }

  private assertLineSwitchSafe(state: ResearchWorkingState, nextLineSlug: string): void {
    this.assertNoNotePersistenceInFlight();
    const pending = state.pendingCheckpoint;
    if (pending !== null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Cannot switch to Research Line ${nextLineSlug} while checkpoint ${pending.checkpointId} is pending. Commit it or undo its proposal before switching lines.`,
      );
    }
    if (isLiveForegroundAction(state.currentAction)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Cannot switch to Research Line ${nextLineSlug} while action ${state.currentAction!.actionId} is ${state.currentAction!.status}. Conclude or abandon the action before switching lines.`,
      );
    }
    if (isLiveResearchRun(state.currentRun) || isLiveResearchRun(state.currentAction?.run)) {
      const run = isLiveResearchRun(state.currentRun) ? state.currentRun : state.currentAction!.run!;
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Cannot switch to Research Line ${nextLineSlug} while run ${run.jobId} is unresolved. Finish or cancel the run and conclude its Research action before switching lines.`,
      );
    }
    if (isUnresolvedHumanGate(state.humanGate)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_GATE_PENDING,
        `Cannot switch to Research Line ${nextLineSlug} while human gate ${state.humanGate.gateId} is unresolved. Resolve the gate before switching lines.`,
      );
    }
    if (state.phase !== 'idle') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_PHASE_TRANSITION_INVALID,
        `Cannot switch to Research Line ${nextLineSlug} while the current Research phase is ${state.phase}. Return the current cycle to idle through a valid transition before switching lines.`,
      );
    }
  }

  private archiveCurrentCycleForLineSwitch(state: ResearchWorkingState): void {
    const period = state.period;
    if (period === null || period.endedAt !== undefined) return;
    const question = state.focus === null ? undefined : state.questions[state.focus.questionId];
    const currentQuestionId = question?.lineSlug === period.lineSlug ? question.id : null;
    const summary = state.latestProgress?.headline ?? period.summary ?? null;
    this.wire.dispatch(researchUpdatePeriod({
      id: period.id,
      currentQuestionId,
      summary,
    }));
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

  private assertLineWorkstreamBindingMutable(
    state: ResearchWorkingState,
    lineSlug: string,
  ): void {
    this.assertNoNotePersistenceInFlight();
    if (state.pendingCheckpoint?.lineSlug === lineSlug) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Line ${lineSlug} has a pending checkpoint; finish or undo it before changing the workstream binding.`,
      );
    }
    if (
      state.currentAction?.lineSlug === lineSlug &&
      isLiveForegroundAction(state.currentAction)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Line ${lineSlug} has a live Research action; conclude it before changing the workstream binding.`,
      );
    }
  }

  private requireCurrentLineWorkstreamBinding(
    lineSlug: string,
  ): ResearchLineWorkstreamBinding {
    const alignment = this.getLineWorkstreamAlignment(lineSlug);
    if (alignment.status !== 'bound' || alignment.binding === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `Line ${lineSlug} cannot make a scoped durable claim while its workstream binding is ${alignment.status}: ${alignment.reason}`,
      );
    }
    return { ...alignment.binding };
  }

  private assertCheckpointWorkstreamBindingCurrent(
    checkpoint: ResearchCheckpointRecord,
    state = this.wire.getModel(ResearchModel).current,
  ): void {
    const captured = checkpoint.workstreamBinding;
    if (checkpoint.lineSlug === undefined || captured === undefined) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `Checkpoint ${checkpoint.checkpointId} predates explicit Line-to-workstream binding and cannot make a scoped durable claim.`,
      );
    }
    const current = (state.lineWorkstreamBindings ?? {})[checkpoint.lineSlug];
    const program = state.program === null
      ? null
      : { ...state.program, observedRevision: state.program.observedRevision ?? 1 };
    const alignment = deriveLineWorkstreamAlignment({
      lineSlug: checkpoint.lineSlug,
      binding: current,
      program,
    });
    if (
      alignment.status !== 'bound' ||
      current === undefined ||
      !sameLineWorkstreamBinding(current, captured)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `Checkpoint ${checkpoint.checkpointId} no longer matches the current confirmed workstream binding. Re-propose it from the current Research state.`,
      );
    }
  }

  private async reconcileCheckpointWorkstreamBinding(
    checkpoint: ResearchCheckpointRecord,
  ): Promise<void> {
    const captured = checkpoint.workstreamBinding;
    if (checkpoint.lineSlug === undefined || captured === undefined) {
      this.assertCheckpointWorkstreamBindingCurrent(checkpoint);
      return;
    }
    const observed = await this.mode.reconcileCurrentTopicBinding(checkpoint.lineSlug);
    if (!sameLineWorkstreamBinding(observed, captured)) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `Checkpoint ${checkpoint.checkpointId} no longer matches the freshly observed AITP Topic and workstream binding.`,
      );
    }
    const state = this.wire.getModel(ResearchModel).current;
    const pending = state.pendingCheckpoint;
    if (
      pending === null ||
      pending.checkpointId !== checkpoint.checkpointId ||
      !sameLineWorkstreamBinding(pending.workstreamBinding, captured)
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Checkpoint ${checkpoint.checkpointId} changed during fresh Topic reconciliation`,
      );
    }
    this.assertCheckpointWorkstreamBindingCurrent(pending, state);
  }

  private async reconcileCheckpointWorkstreamForCommit(
    checkpoint: ResearchCheckpointRecord,
  ): Promise<void> {
    try {
      await this.reconcileCheckpointWorkstreamBinding(checkpoint);
    } catch (error) {
      this.markCommitBarrierFailed(checkpoint, error);
      if (error instanceof AitpResearchError) throw error;
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `AITP commit barrier failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private matchesCurrentGoalProgram(input: {
    readonly expectedRevision: number;
    readonly goalId: string;
    readonly topicId: string;
    readonly observedRevision: number;
  }): boolean {
    const goal = this.goal.getGoal().goal;
    const program = this.getProgram();
    return (
      this.currentResearchRevision() === input.expectedRevision &&
      goal?.goalId === input.goalId &&
      program?.topicId === input.topicId &&
      program.observedRevision === input.observedRevision
    );
  }

  private currentResearchPlanV2Binding(): {
    readonly goalId: string;
    readonly programId: string;
    readonly programObservedRevision: number;
    readonly goalRelation: ResearchPlanV2['goalRelation'];
  } {
    const goal = this.goal.getGoal().goal;
    const program = this.getProgram();
    const alignment = this.getGoalAlignment();
    if (
      goal === null ||
      program === null ||
      alignment.status !== 'aligned' ||
      alignment.binding === undefined ||
      alignment.binding.relation === 'unrelated'
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        'A Research Plan requires one current Goal, observed Program, and confirmed Goal-to-Program alignment.',
      );
    }
    return {
      goalId: goal.goalId,
      programId: program.topicId,
      programObservedRevision: program.observedRevision,
      goalRelation: alignment.binding.relation,
    };
  }

  private requireResearchPlanV2(planId: string, revision: number): ResearchPlanV2 {
    const current = this.getResearchPlanV2();
    if (current === null || current.planId !== planId || current.revision !== revision) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research Plan ${planId} revision ${revision} is stale or unavailable.`,
      );
    }
    return current;
  }

  private transitionResearchPlanV2(
    input: TransitionResearchPlanV2Input,
    from: ResearchPlanV2['status'],
    to: ResearchPlanV2['status'],
  ): ResearchPlanV2 {
    this.assertMutationAllowed();
    const current = this.requireResearchPlanV2(input.planId, input.expectedRevision);
    if (current.status !== from) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Research Plan ${current.planId} cannot transition from ${current.status} to ${to}.`,
      );
    }
    const pending = this.wire.getModel(ResearchModel).current.pendingCheckpoint;
    if (to === 'completed' && pending !== null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
        `Research Plan ${current.planId} cannot complete while checkpoint ${pending.checkpointId} is pending durable commit.`,
      );
    }
    this.assertResearchPlanV2BindingFresh(current);
    this.assertResearchPlanV2NotBoundToLiveAction(current);
    return this.putResearchPlanV2Status(current, to);
  }

  private assertResearchPlanV2NotBoundToLiveAction(plan: ResearchPlanV2): void {
    const action = this.wire.getModel(ResearchModel).current.currentAction;
    if (
      isLiveForegroundAction(action) &&
      action?.researchPlanBinding?.planId === plan.planId &&
      action.researchPlanBinding.planRevision === plan.revision
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
        `Research Plan ${plan.planId} cannot change while action ${action.actionId} is still ${action.status}. Complete or abandon the action first.`,
      );
    }
  }

  private putResearchPlanV2Status(
    current: ResearchPlanV2,
    status: ResearchPlanV2['status'],
  ): ResearchPlanV2 {
    const next: ResearchPlanV2 = {
      ...current,
      revision: current.revision + 1,
      status,
      updatedAt: Date.now(),
    };
    this.wire.dispatch(researchPutPlanV2(toResearchPlanV2Payload(next)));
    this.publishResearchUpdated();
    return this.requireResearchPlanV2(next.planId, next.revision);
  }

  private assertResearchPlanV2BindingFresh(plan: ResearchPlanV2): void {
    const binding = this.currentResearchPlanV2Binding();
    if (
      plan.goalId !== binding.goalId ||
      plan.programId !== binding.programId ||
      plan.programObservedRevision !== binding.programObservedRevision ||
      plan.goalRelation !== binding.goalRelation
    ) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.RESEARCH_REVISION_STALE,
        `Research Plan ${plan.planId} is bound to a stale Goal or Program revision.`,
      );
    }
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

  private getGoalSummary(): ResearchGoalSummary | undefined {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return undefined;
    const goal = this.goal.getGoal().goal;
    if (goal === null) return undefined;
    const turnBudget = goal.budget.turnBudget;
    return {
      goalId: goal.goalId,
      objective: goal.objective,
      completionCriterion: goal.completionCriterion,
      status: goal.status,
      turnBudget: turnBudget ?? undefined,
      remainingTurns: goal.budget.remainingTurns ?? undefined,
      terminalReason: goal.terminalReason,
      waitingFor: goal.waitingFor === undefined
        ? undefined
        : { taskIds: [...goal.waitingFor.taskIds], policy: goal.waitingFor.policy },
      continuation: goal.continuation,
    };
  }

  private getResearchGoalProjection(input: {
    readonly state: ResearchWorkingState;
    readonly currentLineSlug?: string;
    readonly humanGate?: ResearchHumanGate;
    readonly goalAlignment: ResearchGoalAlignment;
  }): ResearchGoalProjection | undefined {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return undefined;
    const goal = this.goal.getGoal().goal;
    if (goal === null) return undefined;
    return deriveResearchGoalProjection(goal, {
      modeActive: this.mode.isActive,
      modePhase: this.mode.phase,
      loopStatus: this.mode.loopStatus,
      state: input.state,
      currentLineSlug: input.currentLineSlug,
      currentWorkstreamAlignment: input.currentLineSlug === undefined
        ? undefined
        : this.getLineWorkstreamAlignment(input.currentLineSlug),
      humanGate: input.humanGate,
      goalAlignment: input.goalAlignment,
      researchRevision: this.currentResearchRevision(),
    });
  }

  private publishResearchUpdated(notifyGoal = true): void {
    this.reconcile();
    const worldRevision = this.wire.getModel(ResearchRevisionModel).revision;
    const nextRevision = Math.max(
      this.reservedResearchRevision + 1,
      worldRevision + 1,
      worldRevision === 0
        ? this.wire.getModel(ResearchModel).current.revision + (this.wire.isRestoring() ? 1 : 0)
        : 0,
    );
    this.reservedResearchRevision = nextRevision;
    this.wire.dispatch(researchAdvanceRevision({ nextRevision, notifyGoal }));
  }

  private requestGoalContinuationRetry(): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID) return;
    const goal = this.goal.getGoal().goal;
    if (goal !== null) this.continuationRetryEmitter.fire(goal.goalId);
  }

  private guardToolExecution(event: BeforeToolExecuteEvent): void {
    if (this.scopeCtx.agentId !== MAIN_AGENT_ID && AITP_MUTATION_TOOLS.has(event.toolCall.name)) {
      event.veto(
        denyToolExecution(
          'AITP/Research mutation tools are only available on the main agent. Use typed packets to return results.',
        ),
      );
      return;
    }
    if (
      this.scopeCtx.agentId !== MAIN_AGENT_ID ||
      !this.mode.isActive
    ) return;

    const classification = classifyResearchTool(event.toolCall.name);
    if (classification.kind === 'control') return;
    if (classification.kind === 'checkpoint_persistence') {
      const blocker = this.checkpointPersistenceBlocker(event);
      if (blocker !== undefined) event.veto(denyToolExecution(blocker));
      return;
    }
    if (classification.kind === 'distillation_persistence') {
      const blocker = this.distillationPersistenceBlocker(event);
      if (blocker !== undefined) event.veto(denyToolExecution(blocker));
      return;
    }

    if (
      this.mode.phase === 'ready' &&
      isResearchRecordInspection(event.toolCall.name, event.args)
    ) return;

    const checkpointDraft = this.checkpointDraftAccess(event);
    if (checkpointDraft === true) return;
    if (typeof checkpointDraft === 'string') {
      event.veto(denyToolExecution(checkpointDraft));
      return;
    }

    const blocker = this.actionWorkBlocker(
      event,
      classification.capability,
    );
    if (blocker !== undefined) event.veto(denyToolExecution(blocker));
  }

  private actionWorkBlocker(
    event: BeforeToolExecuteEvent,
    capability: ResearchExecutionCapability | `tool:${string}`,
  ): string | undefined {
    return this.actionScopeBlocker(
      event.toolCall.name,
      capability,
      this.turnAdmission?.leaseForTurn(event.turnId),
      event.toolCalls.some((call) => call.name === 'BeginResearchAction'),
    );
  }

  private actionScopeBlocker(
    toolName: string,
    capability: ResearchExecutionCapability | `tool:${string}`,
    lease: import('#/features/aitpResearch/loop/researchTurnAdmission').ResearchTurnLease | undefined,
    beginsInBatch = false,
  ): string | undefined {
    if (this.mode.phase !== 'ready' && this.mode.phase !== 'degraded') {
      return `Research action policy denied ${toolName}: AITP Research Mode is ${this.mode.phase}; only status or recovery tools may run.`;
    }
    if (this.mode.loopStatus !== 'active') {
      return `Research action policy denied ${toolName}: the Research Loop is paused.`;
    }
    if (lease === 'none' || lease === undefined) {
      return `Research action policy denied ${toolName}: this turn has no Research lease.`;
    }
    if (this.mode.phase === 'degraded' && lease !== 'interactive_research') {
      return `Research action policy denied ${toolName}: AITP is degraded; only user-directed provisional exploration may run. Automatic Goal work is held.`;
    }

    const state = this.wire.getModel(ResearchModel).current;
    if (isUnresolvedHumanGate(state.humanGate)) {
      return `Research action policy denied ${toolName}: human gate ${state.humanGate.gateId} is unresolved.`;
    }
    if (beginsInBatch) {
      return `Research action policy denied ${toolName}: BeginResearchAction and research work cannot share one tool batch. Begin the action first, then run its tools in the next batch.`;
    }
    const action = state.currentAction;
    if (action === null || action.status !== 'in_progress') {
      return `Research action policy denied ${toolName}: no in-progress ResearchAction owns this work. Begin one bounded action first.`;
    }
    if (state.phase !== 'action_executing') {
      return `Research action policy denied ${toolName}: action ${action.actionId} is in progress but the Research phase is ${state.phase}.`;
    }
    const currentLineSlug = this.wire.getModel(AitpModeModel).current.currentLineSlug;
    if (action.lineSlug !== undefined && action.lineSlug !== currentLineSlug) {
      return `Research action policy denied ${toolName}: action ${action.actionId} belongs to Research Line ${action.lineSlug}, not the current line ${currentLineSlug ?? 'none'}.`;
    }
    const question = action.questionId === undefined
      ? undefined
      : state.questions[action.questionId];
    if (
      action.questionId !== undefined &&
      (question === undefined ||
        (action.lineSlug !== undefined && question.lineSlug !== action.lineSlug))
    ) {
      return `Research action policy denied ${toolName}: action ${action.actionId} has a stale Question or Line binding.`;
    }
    const line = action.lineSlug === undefined ? undefined : state.lines[action.lineSlug];
    if (
      action.lineSlug !== undefined &&
      (action.lineRevision === undefined || line?.revision !== action.lineRevision)
    ) {
      return `Research action policy denied ${toolName}: action ${action.actionId} cannot prove a fresh Research Line revision.`;
    }
    if (
      action.questionId !== undefined &&
      (action.questionRevision === undefined || question?.revision !== action.questionRevision)
    ) {
      return `Research action policy denied ${toolName}: action ${action.actionId} cannot prove a fresh Research Question revision.`;
    }
    try {
      this.assertActionPlanBindingsFresh(action);
    } catch (error) {
      return `Research action policy denied ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (!researchCapabilityGranted(action.allowedToolKinds, toolName, capability)) {
      return `Research action policy denied ${toolName}: action ${action.actionId} does not grant capability ${capability}. Start a correctly scoped action rather than widening it after execution begins.`;
    }
    return undefined;
  }

  private checkpointPersistenceBlocker(event: BeforeToolExecuteEvent): string | undefined {
    if (this.mode.phase !== 'ready') {
      return `Research checkpoint persistence denied ${event.toolCall.name}: AITP Research Mode is ${this.mode.phase}.`;
    }
    const state = this.wire.getModel(ResearchModel).current;
    const checkpoint = state.pendingCheckpoint;
    if (checkpoint === null) {
      return `Research checkpoint persistence denied ${event.toolCall.name}: no pending checkpoint owns this write.`;
    }
    if (isHistoricalCheckpoint(checkpoint, Object.values(state.questions))) {
      return `Research checkpoint persistence denied ${event.toolCall.name}: checkpoint ${checkpoint.checkpointId} is historical and must be discarded or explicitly recovered.`;
    }
    try {
      this.assertCheckpointWorkstreamBindingCurrent(checkpoint, state);
    } catch (error) {
      return `Research checkpoint persistence denied ${event.toolCall.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
    const checkpointId = stringArg(event.args, 'checkpoint_id');
    if (checkpointId !== checkpoint.checkpointId) {
      return `Research checkpoint persistence denied ${event.toolCall.name}: checkpoint_id must equal ${checkpoint.checkpointId}.`;
    }
    if (event.toolCall.name === 'aitp_record_prepare') return undefined;
    const prepare = checkpoint.receipt?.prepare;
    if (prepare === undefined) {
      return `Research checkpoint persistence denied ${event.toolCall.name}: prepare checkpoint ${checkpoint.checkpointId} in an earlier tool batch first.`;
    }
    if (
      event.toolCall.name === 'aitp_record_save' &&
      normalizeResearchPath(stringArg(event.args, 'draft_path')) !== normalizeResearchPath(prepare.path)
    ) {
      return `Research checkpoint persistence denied ${event.toolCall.name}: the draft path is not the one prepared for checkpoint ${checkpoint.checkpointId}.`;
    }
    if (event.toolCall.name === 'CommitResearchCheckpoint') {
      const receipt = checkpoint.receipt;
      if (receipt?.save === undefined || receipt.preSaveCheck === undefined) {
        return `Research checkpoint persistence denied ${event.toolCall.name}: save checkpoint ${checkpoint.checkpointId} in an earlier tool batch first.`;
      }
    }
    return undefined;
  }

  private checkpointDraftAccess(
    event: BeforeToolExecuteEvent,
  ): true | string | undefined {
    if (!['Read', 'Edit', 'Write'].includes(event.toolCall.name)) return undefined;
    const path = normalizeResearchPath(stringArg(event.args, 'path'));
    if (path === undefined || !isAitpPath(path)) return undefined;
    if (this.mode.phase !== 'ready') {
      return `Research persistence denied ${event.toolCall.name}: AITP Research Mode is ${this.mode.phase}.`;
    }
    if (isCanonicalAitpPath(path)) {
      return `Research persistence denied ${event.toolCall.name}: canonical AITP files must be accessed through AITP tools, except Read of a workspace-relative .aitp/topic/notes/note-*.md. Read Entries with aitp_show; all canonical writes require AITP save.`;
    }

    const state = this.wire.getModel(ResearchModel).current;
    const checkpoint = state.pendingCheckpoint;
    const preparedPath = normalizeResearchPath(checkpoint?.receipt?.prepare?.path);
    if (
      checkpoint !== null &&
      preparedPath !== undefined &&
      path === preparedPath &&
      checkpoint.receipt?.save === undefined &&
      !isHistoricalCheckpoint(checkpoint, Object.values(state.questions))
    ) {
      try {
        this.assertCheckpointWorkstreamBindingCurrent(checkpoint, state);
        return true;
      } catch (error) {
        return `Research persistence denied ${event.toolCall.name}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const context = this.currentNoteReviewContext();
    const lease = this.distillationDraftLease;
    if (
      context !== undefined &&
      lease?.context === context &&
      !this.notePersistenceInFlight &&
      lease.path === path &&
      isLocalAitpDraftPath(path)
    ) {
      return true;
    }
    return `Research persistence denied ${event.toolCall.name}: ${path} is not owned by the current checkpoint or distillation handoff.`;
  }

  private distillationPersistenceBlocker(event: BeforeToolExecuteEvent): string | undefined {
    if (this.mode.phase !== 'ready') return this.distillationPersistenceBlockerFor(event.toolCall.name, event.args);
    if (event.toolCalls.some((call) => call.name === 'BeginResearchAction')) {
      return 'BeginResearchAction and Note persistence cannot share one tool batch. Begin the Action first.';
    }
    if (this.wire.getModel(ResearchModel).current.currentAction?.status === 'in_progress') {
      const blocker = this.actionWorkBlocker(event, `tool:${event.toolCall.name.toLowerCase()}`);
      if (blocker !== undefined) return blocker;
    }
    return this.distillationPersistenceBlockerFor(event.toolCall.name, event.args);
  }

  private distillationPersistenceBlockerFor(toolName: string, args: unknown): string | undefined {
    if (this.mode.phase !== 'ready') {
      return `Research distillation persistence denied ${toolName}: AITP Research Mode is ${this.mode.phase}.`;
    }
    if (this.notePersistenceInFlight) {
      return `Research distillation persistence denied ${toolName}: another Note persistence operation is in flight; wait for its result.`;
    }
    const context = this.currentNoteReviewContext()
      ?? (toolName === 'aitp_note_prepare' ? this.actionNoteReviewCandidate() : undefined);
    if (context === undefined) {
      return `Research Note persistence denied ${toolName}: no current post-commit distillation handoff or bounded Note Action owns this Note. To organize existing evidence after restore, read the relevant canonical Entries and update the Question evidenceRefs/falsifierRefs before beginning a fresh Question-bound Note Action with exact tool:aitp_note_prepare and tool:aitp_note_save grants. Updating the Question after Begin makes that Action stale; conclude any existing reading Action before updating and starting the Note Action. Old attention never restores draft permission.`;
    }
    if (toolName === 'aitp_note_save') {
      const draftPath = normalizeResearchPath(stringArg(args, 'draft_path'));
      const lease = this.distillationDraftLease;
      return draftPath !== undefined &&
        isLocalAitpDraftPath(draftPath) &&
        lease?.context === context &&
        lease.path === draftPath
        ? undefined
        : `Research distillation persistence denied ${toolName}: save only the exact draft returned by aitp_note_prepare for the current handoff.`;
    }
    const workstreams = arrayStringArg(args, 'workstreams');
    if (
      workstreams.length !== 1 ||
      workstreams[0] !== context.workstreamBinding.workstream
    ) {
      return `Research Note persistence denied ${toolName}: the Note must target exactly the current explicitly bound AITP workstream captured by its owner.`;
    }
    return undefined;
  }

  private clearNoteReview(): void {
    this.noteReviewContext = undefined;
    this.distillationDraftLease = undefined;
  }

  private revokeStaleNoteReview(): void {
    const context = this.noteReviewContext;
    if (context === undefined) return;
    const alignment = this.getCurrentWorkstreamAlignment();
    if (
      !this.mode.isActive ||
      this.mode.phase !== 'ready' ||
      alignment?.status !== 'bound' ||
      !sameLineWorkstreamBinding(alignment.binding, context.workstreamBinding)
    ) {
      this.clearNoteReview();
      return;
    }
    const owner = context.owner;
    if (owner.kind === 'action') {
      const candidate = this.actionNoteReviewCandidate();
      if (candidate?.owner.kind !== 'action' || candidate.owner.actionId !== owner.actionId) this.clearNoteReview();
      return;
    }
    const cursor = this.externalFact.getCommittedCursor();
    const state = this.wire.getModel(ResearchModel).current;
    const attention = this.wire.getModel(ResearchDistillationModel).attention;
    if (
      isLiveForegroundAction(state.currentAction) ||
      cursor?.checkpointId !== owner.checkpointId || cursor.entryId !== owner.entryId ||
      (attention?.checkpointId === owner.checkpointId &&
        attention.entryId === owner.entryId && attention.status !== 'review_requested')
    ) this.clearNoteReview();
  }

  private currentNoteReviewContext(): ResearchNoteReviewContext | undefined {
    this.revokeStaleNoteReview();
    const context = this.noteReviewContext;
    if (context?.owner.kind === 'action') return context;
    const attention = this.wire.getModel(ResearchDistillationModel).attention;
    if (
      context === undefined ||
      attention?.status !== 'review_requested' ||
      context.owner.checkpointId !== attention.checkpointId ||
      context.owner.entryId !== attention.entryId
    ) return undefined;
    return context;
  }

  private actionNoteReviewCandidate(): ResearchNoteReviewContext | undefined {
    if (!this.mode.isActive || this.mode.phase !== 'ready') return undefined;
    for (const toolName of ['aitp_note_prepare', 'aitp_note_save']) {
      if (this.actionScopeBlocker(toolName, `tool:${toolName}`, this.turnAdmission?.currentLease()) !== undefined) return undefined;
    }
    const state = this.wire.getModel(ResearchModel).current;
    if (state.pendingCheckpoint !== null) return undefined;
    const action = state.currentAction;
    const question = action?.questionId === undefined ? undefined : state.questions[action.questionId];
    const alignment = this.getCurrentWorkstreamAlignment();
    if (action === null || question === undefined || alignment?.status !== 'bound' || alignment.binding === undefined) return undefined;
    const entryIds = [...new Set([...question.evidenceRefs, ...question.falsifierRefs])];
    if (entryIds.length === 0) return undefined;
    return {
      owner: { kind: 'action', actionId: action.actionId, entryIds },
      workstreamBinding: { ...alignment.binding },
    };
  }

  private assertNoNotePersistenceInFlight(): void {
    if (!this.notePersistenceInFlight) return;
    throw new AitpResearchError(
      AitpResearchErrors.codes.AITP_CHECKPOINT_PENDING,
      'A Note persistence operation is in flight; wait for its result before changing Research Line ownership.',
    );
  }

  private guardGoalCompletion(
    input: import('#/agent/goal/goalContribution').GoalCompletionGuardInput,
  ): import('#/agent/goal/goalContribution').GoalCompletionGuardResult {
    if (!this.mode.isActive) return { allow: true };
    const pending = this.getPendingCheckpoint();
    if (pending !== null) {
      const questions = this.getQuestions();
      const historical = isHistoricalCheckpoint(pending, questions);
      const checkpointBlocker = historical
        ? pendingCheckpointBlockerText(
            pending,
            checkpointQuestionFor(pending, questions),
          )
        : 'a research checkpoint is pending commit. Commit it or undo its proposal before completing the goal.';
      return {
        allow: false,
        owner: 'aitpResearch',
        code: 'research.checkpoint.pending',
        reason: `Goal completion is blocked: ${checkpointBlocker}`,
        nextStep: historical
          ? 'Undo'
          : 'CommitResearchCheckpoint',
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
    if (this.mode.phase !== 'ready') {
      return {
        allow: false,
        owner: 'aitpResearch',
        code: `research.mode.${this.mode.phase}`,
        reason:
          `Goal completion is blocked: Research Mode is ${this.mode.phase}. Wait for a ready Research Mode state before completing the goal.`,
        nextStep: 'GetResearchStatus',
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
    const researchState = this.wire.getModel(ResearchModel).current;
    const liveAction = researchState.currentAction;
    if (liveAction !== null && isLiveForegroundAction(liveAction)) {
      return {
        allow: false,
        owner: 'aitpResearch',
        code: 'research.action.live',
        reason: `Goal completion is blocked: Research action ${liveAction.actionId} is still ${liveAction.status}. Resolve it from evidence before completing the goal.`,
        nextStep: 'ConcludeResearchAction',
      };
    }
    const goal = this.goal.getGoal().goal;
    const alignment = this.getGoalAlignment();
    if (isAlignmentBlocking(alignment, goal?.status === 'active' && goal.goalId === input.goalId)) {
      return {
        allow: false,
        owner: 'aitpResearch',
        code: `research.goal-alignment.${alignment.status}`,
        reason: `Goal completion is blocked: ${alignment.reason}`,
        nextStep: 'ConfirmGoalAlignment',
      };
    }
    const workstreamAlignment = this.getCurrentWorkstreamAlignment();
    if (workstreamAlignment?.status !== 'bound') {
      return {
        allow: false,
        owner: 'aitpResearch',
        code: `research.workstream-binding.${workstreamAlignment?.status ?? 'unbound'}`,
        reason: `Goal completion is blocked: ${workstreamAlignment?.reason ?? 'the current Research Line has no explicit AITP workstream binding.'}`,
        nextStep: 'ConfirmResearchWorkstreamBinding',
      };
    }
    return { allow: true };
  }

  private decideGoalContinuation(
    input: import('#/agent/goal/goalContribution').GoalContinuationInput,
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
    if (this.mode.phase !== 'ready') {
      return {
        decision: 'hold',
        owner: 'aitpResearch',
        reason:
          `Research Mode is ${this.mode.phase}. Wait for a ready Research Mode state before continuing the goal automatically.`,
      };
    }
    const pending = this.getPendingCheckpoint();
    if (pending !== null) {
      const questions = this.getQuestions();
      const checkpointQuestion = checkpointQuestionFor(pending, questions);
      return {
        decision: 'hold',
        owner: 'aitpResearch',
        reason: isHistoricalCheckpoint(pending, questions)
          ? pendingCheckpointBlockerText(pending, checkpointQuestion)
          : 'A research checkpoint is pending commit. Commit it or undo its proposal before continuing the goal automatically.',
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
    const researchState = this.wire.getModel(ResearchModel).current;
    if (isRecoveredLiveAction({
      action: researchState.currentAction,
      recentStateChange: researchState.recentStateChange,
    })) {
      return {
        decision: 'hold',
        owner: 'aitpResearch',
        reason: `Research action ${researchState.currentAction!.actionId} was recovered from a stranded action/phase state. Resolve it from recorded evidence on the next Research turn; do not start another action or ask for a bookkeeping-only decision.`,
      };
    }
    const goal = this.goal.getGoal().goal;
    const alignment = this.getGoalAlignment();
    if (isAlignmentBlocking(alignment, goal?.status === 'active' && goal.goalId === input.goalId)) {
      return {
        decision: 'hold',
        owner: 'aitpResearch',
        reason: `Goal continuation is held: ${alignment.reason}`,
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

function assertDurableCommitProvenance(
  assessment: Extract<ConcludeResearchActionInput['durability'], { readonly status: 'durable_delta' }>,
): void {
  const valid = (() => {
    switch (assessment.provenance) {
      case 'agent_verification':
        return assessment.authority === 'agent' &&
          assessment.entryKind !== 'decision' &&
          assessment.entryKind !== 'source';
      case 'tool_verification':
        return assessment.authority === 'tool' &&
          ['observation', 'result', 'failure', 'run'].includes(assessment.entryKind);
      case 'source_assessment':
        return assessment.authority === 'source' && assessment.entryKind === 'source';
      case 'human_assertion':
        return assessment.authority === 'human' && assessment.entryKind === 'observation';
      case 'human_decision':
        return assessment.authority === 'human' && assessment.entryKind === 'decision';
    }
  })();
  if (valid) return;
  throw new AitpResearchError(
    AitpResearchErrors.codes.RESEARCH_ACTION_STATUS_INVALID,
    `Durable candidate provenance ${assessment.provenance} is inconsistent with Entry kind ${assessment.entryKind} and authority ${assessment.authority}. Keep human assertions/decisions separate from agent, tool, or source verification.`,
  );
}

function sameDurabilityAssessment(
  candidate: ResearchDurableCommitCandidate | undefined,
  input: ConcludeResearchActionInput,
  recordedAt: number,
): boolean {
  if (input.durability.status === 'no_durable_delta') return candidate === undefined;
  return candidate !== undefined &&
    candidate.sourceActionId === input.actionId &&
    candidate.progressRecordedAt === recordedAt &&
    candidate.entryKind === input.durability.entryKind &&
    candidate.authority === input.durability.authority &&
    candidate.provenance === input.durability.provenance &&
    candidate.rationale === input.durability.rationale;
}

function sameConclusionProgress(
  progress: ResearchProgressReportRecord,
  input: ConcludeResearchActionInput,
): boolean {
  const expected = input.progress;
  return progress.headline === expected.headline &&
    progress.question === expected.question &&
    progress.motivation === expected.motivation &&
    progress.workPerformed === expected.workPerformed &&
    progress.result === expected.result &&
    progress.mainlineImpact === expected.mainlineImpact &&
    sameStrings(progress.uncertainties, expected.uncertainties ?? []) &&
    progress.nextAction === expected.nextAction &&
    progress.humanDecision === undefined &&
    progress.phaseChange?.from === 'evaluating' &&
    progress.phaseChange.to === 'state_updated' &&
    sameProgressDetail(progress.detail, expected.detail);
}

function sameProgressDetail(
  left: ResearchProgressReportRecord['detail'],
  right: ConcludeResearchActionInput['progress']['detail'],
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return sameStrings(left.assumptions ?? [], right.assumptions ?? []) &&
    left.derivation === right.derivation &&
    sameStrings(left.tests ?? [], right.tests ?? []) &&
    sameStrings(left.observations ?? [], right.observations ?? []) &&
    sameStrings(left.sources ?? [], right.sources ?? []) &&
    sameStrings(left.limitations ?? [], right.limitations ?? []) &&
    left.detailHint === right.detailHint &&
    sameStrings(left.artifactRefs ?? [], right.artifactRefs ?? []);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCommitCandidate(
  left: ResearchDurableCommitCandidate | undefined,
  right: ResearchDurableCommitCandidate,
): boolean {
  return left !== undefined &&
    left.sourceActionId === right.sourceActionId &&
    left.progressRecordedAt === right.progressRecordedAt &&
    left.entryKind === right.entryKind &&
    left.authority === right.authority &&
    left.provenance === right.provenance &&
    left.rationale === right.rationale;
}

function isCurrentConclusionProgress(state: ResearchWorkingState): boolean {
  const action = state.currentAction;
  const progress = state.latestProgress;
  const change = state.recentStateChange;
  return action !== null &&
    (action.status === 'completed' || action.status === 'abandoned') &&
    progress !== null &&
    change?.actionId === action.actionId &&
    change.changedAt === progress.recordedAt;
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
    workstreamBinding: r.workstreamBinding === undefined ? undefined : { ...r.workstreamBinding },
    commitCandidate: r.commitCandidate === undefined ? undefined : { ...r.commitCandidate },
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
    questionRevision: r.questionRevision,
    lineSlug: r.lineSlug,
    lineRevision: r.lineRevision,
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
    researchPlanBinding: r.researchPlanBinding,
    actionPlanBinding: r.actionPlanBinding,
    run: r.run === undefined ? undefined : toRunState(r.run),
  };
}

function toResearchPlanV2Payload(plan: ResearchPlanV2) {
  return {
    ...plan,
    milestones: plan.milestones.map((milestone) => ({
      ...milestone,
      evidenceRequirements: [...milestone.evidenceRequirements],
    })),
    evidenceRequirements: [...plan.evidenceRequirements],
    decisionPoints: plan.decisionPoints.map((decision) => ({ ...decision })),
    assumptions: [...plan.assumptions],
    stopConditions: [...plan.stopConditions],
    replanConditions: [...plan.replanConditions],
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

function isAlignmentBlocking(
  alignment: ResearchGoalAlignment,
  activeGoal: boolean,
): boolean {
  if (!activeGoal) return false;
  return alignment.status === 'unavailable'
    || alignment.status === 'confirmation_required'
    || alignment.status === 'stale'
    || alignment.status === 'conflict';
}

function deriveResearchGoalProjection(
  goal: GoalSnapshot,
  input: {
    readonly modeActive: boolean;
    readonly modePhase: AitpModePhase;
    readonly loopStatus: 'active' | 'paused';
    readonly state: ResearchWorkingState;
    readonly currentLineSlug?: string;
    readonly currentWorkstreamAlignment?: ResearchLineWorkstreamAlignment;
    readonly humanGate?: ResearchHumanGate;
    readonly goalAlignment: ResearchGoalAlignment;
    readonly researchRevision: number;
  },
): ResearchGoalProjection {
  const applicability = input.modeActive ? undefined : 'Research Mode is inactive.';
  const pendingCheckpoint = input.state.pendingCheckpoint === null
    ? undefined
    : toCheckpoint(input.state.pendingCheckpoint);
  const checkpointQuestion = pendingCheckpoint?.questionId === undefined
    ? undefined
    : input.state.questions[pendingCheckpoint.questionId];
  const persistenceGuards: ResearchGoalProjection['persistenceGuards'] = [
    {
      code: 'research.checkpoint.pending',
      status: applicability !== undefined
        ? 'inactive'
        : input.state.pendingCheckpoint === null
          ? 'clear'
          : 'blocked',
      reason: applicability
        ?? (pendingCheckpoint === undefined
          ? 'No research checkpoint is pending commit.'
          : pendingCheckpointBlockerText(pendingCheckpoint, checkpointQuestion)),
    },
    {
      code: `research.mode.${input.modePhase}`,
      status: applicability !== undefined
        ? 'inactive'
        : input.modePhase === 'ready'
          ? 'clear'
          : 'blocked',
      reason: applicability
        ?? (input.modePhase === 'ready'
          ? 'Research Mode is ready.'
          : `Research Mode is ${input.modePhase}.`),
    },
    {
      code: `research.goal-alignment.${input.goalAlignment.status}`,
      status: applicability !== undefined
        ? 'inactive'
        : input.goalAlignment.status === 'aligned'
          ? 'clear'
          : 'blocked',
      reason: applicability ?? input.goalAlignment.reason,
    },
    {
      code: `research.workstream-binding.${input.currentWorkstreamAlignment?.status ?? 'unbound'}`,
      status: applicability !== undefined
        ? 'inactive'
        : input.currentWorkstreamAlignment?.status === 'bound'
          ? 'clear'
          : 'blocked',
      reason: applicability
        ?? input.currentWorkstreamAlignment?.reason
        ?? 'The current Research Line has no explicit AITP workstream binding.',
    },
  ];
  const stopConditions: Array<ResearchGoalProjection['stopConditions'][number]> = [];
  if (goal.budget.tokenBudget !== null) {
    stopConditions.push({
      code: 'goal.budget.tokens',
      reached: goal.budget.tokenBudgetReached,
      reason: goal.budget.tokenBudgetReached
        ? 'The Goal token budget was reached.'
        : 'The Goal token budget remains available.',
    });
  }
  if (goal.budget.turnBudget !== null) {
    stopConditions.push({
      code: 'goal.budget.turns',
      reached: goal.budget.turnBudgetReached,
      reason: goal.budget.turnBudgetReached
        ? 'The Goal turn budget was reached.'
        : 'The Goal turn budget remains available.',
    });
  }
  if (goal.budget.wallClockBudgetMs !== null) {
    stopConditions.push({
      code: 'goal.budget.wall_clock',
      reached: goal.budget.wallClockBudgetReached,
      reason: goal.budget.wallClockBudgetReached
        ? 'The Goal wall-clock budget was reached.'
        : 'The Goal wall-clock budget remains available.',
    });
  }
  stopConditions.push({
    code: 'research.loop.paused',
    reached: input.modeActive && input.loopStatus === 'paused',
    reason: input.loopStatus === 'paused'
      ? 'The Research Loop is paused.'
      : 'The Research Loop is running.',
  });
  for (const guard of persistenceGuards) {
    if (guard.status !== 'inactive') {
      stopConditions.push({
        code: guard.code,
        reached: guard.status === 'blocked',
        reason: guard.reason,
      });
    }
  }
  if (input.humanGate !== undefined) {
    stopConditions.push({
      code: 'research.human-gate.unresolved',
      reached: input.humanGate.resolvedAt === undefined,
      reason: input.humanGate.resolvedAt === undefined
        ? `A Research human gate is unresolved: ${input.humanGate.prompt}`
        : 'The current Research human gate is resolved.',
    });
  }
  if (goal.status !== 'active') {
    stopConditions.push({
      code: `goal.status.${goal.status}`,
      reached: true,
      reason: goal.terminalReason ?? `The Goal is ${goal.status}.`,
    });
  }
  return {
    schema: 'hakimi/research-goal-0.1',
    goalId: goal.goalId,
    objective: goal.objective,
    completionCriterion: goal.completionCriterion,
    scope: {
      programTopicId: input.state.program?.topicId,
      lineSlug: input.currentLineSlug,
      questionId: input.state.focus?.questionId,
    },
    nonGoals: [],
    budget: { ...goal.budget },
    stopConditions,
    status: goal.status,
    terminalReason: goal.terminalReason,
    waitingFor: goal.waitingFor === undefined
      ? undefined
      : { taskIds: [...goal.waitingFor.taskIds], policy: goal.waitingFor.policy },
    continuation: goal.continuation,
    programRelation: input.goalAlignment,
    humanGates: input.humanGate === undefined ? [] : [input.humanGate],
    persistenceGuards,
    researchRevision: input.researchRevision,
  };
}

function goalAlignmentBlockerText(alignment: ResearchGoalAlignment): string {
  return alignment.status === 'unavailable'
    ? 'No current AITP Research Goal was observed; refresh AITP state before using /research align.'
    : `Goal alignment is ${alignment.status}; use /research align or refresh AITP state before continuing.`;
}

function actionLineFromWorkingState(
  state: ResearchWorkingState,
  action: ResearchActionSpecRecord | null,
): string | undefined {
  if (action === null) return undefined;
  const explicit = action.lineSlug !== undefined && state.lines[action.lineSlug] !== undefined
    ? action.lineSlug
    : undefined;
  const question = action.questionId === undefined ? undefined : state.questions[action.questionId];
  const fromQuestion = question !== undefined && state.lines[question.lineSlug] !== undefined
    ? question.lineSlug
    : undefined;
  if (explicit !== undefined && fromQuestion !== undefined && explicit !== fromQuestion) {
    return undefined;
  }
  if (explicit !== undefined || fromQuestion !== undefined) return explicit ?? fromQuestion;
  const lineSlugs = Object.keys(state.lines);
  return lineSlugs.length === 1 ? lineSlugs[0] : undefined;
}

function deterministicForegroundLine(state: ResearchWorkingState): string | undefined {
  const candidates = new Set<string>();
  if (isLiveForegroundAction(state.currentAction)) {
    const actionLine = actionLineFromWorkingState(state, state.currentAction);
    if (actionLine !== undefined) candidates.add(actionLine);
  }
  if (isUnresolvedHumanGate(state.humanGate)) {
    const gateAction = state.humanGate.actionId === state.currentAction?.actionId
      ? state.currentAction
      : null;
    const actionLine = actionLineFromWorkingState(state, gateAction);
    const question = state.humanGate.questionId === undefined
      ? undefined
      : state.questions[state.humanGate.questionId];
    if (actionLine !== undefined) candidates.add(actionLine);
    if (question !== undefined && state.lines[question.lineSlug] !== undefined) {
      candidates.add(question.lineSlug);
    }
  }
  const checkpointLine = state.pendingCheckpoint?.lineSlug;
  if (checkpointLine !== undefined && state.lines[checkpointLine] !== undefined) {
    candidates.add(checkpointLine);
  }
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

function currentLineAction(input: {
  readonly action?: ResearchActionSpec;
  readonly currentLineSlug?: string;
  readonly questions: readonly ResearchQuestion[];
  readonly lines: readonly ResearchLine[];
}): ResearchActionSpec | undefined {
  const { action, currentLineSlug } = input;
  if (action === undefined) return undefined;
  const explicit = action.lineSlug;
  const question = action.questionId === undefined
    ? undefined
    : input.questions.find((candidate) => candidate.id === action.questionId);
  if (explicit !== undefined && question !== undefined && explicit !== question.lineSlug) {
    return undefined;
  }
  const lineSlug = explicit ?? question?.lineSlug;
  if (currentLineSlug === undefined) {
    return lineSlug === undefined && input.lines.length <= 1 ? action : undefined;
  }
  if (lineSlug !== undefined) return lineSlug === currentLineSlug ? action : undefined;
  return input.lines.length === 0 || (input.lines.length === 1 && input.lines[0]?.slug === currentLineSlug)
    ? action
    : undefined;
}

function currentLineRun(
  action: ResearchActionSpec | undefined,
  run: ResearchRunState | undefined,
): ResearchRunState | undefined {
  if (action === undefined) return undefined;
  if (action.run?.actionId === action.actionId) return action.run;
  return run?.actionId === action.actionId ? run : undefined;
}

function currentLineHumanGate(input: {
  readonly gate?: ResearchHumanGate;
  readonly rawAction?: ResearchActionSpec;
  readonly scopedAction?: ResearchActionSpec;
  readonly currentLineSlug?: string;
  readonly questions: readonly ResearchQuestion[];
}): ResearchHumanGate | undefined {
  const { gate } = input;
  if (gate === undefined) return undefined;
  if (gate.actionId !== undefined) {
    if (input.rawAction?.actionId !== gate.actionId) return undefined;
    if (input.scopedAction?.actionId !== gate.actionId) return undefined;
  }
  if (gate.questionId !== undefined) {
    const question = input.questions.find((candidate) => candidate.id === gate.questionId);
    if (question === undefined || question.lineSlug !== input.currentLineSlug) return undefined;
  }
  return gate;
}

function actionRecoveryStep(input: {
  readonly phase: ResearchPhase;
  readonly currentAction?: ResearchActionSpec;
  readonly humanGate?: ResearchHumanGate;
  readonly recentStateChange?: ResearchStateChange;
}): ResearchEffectiveNextStep | undefined {
  const action = input.currentAction;
  if (action === undefined || (action.status !== 'planned' && action.status !== 'in_progress')) {
    return undefined;
  }
  if (input.humanGate !== undefined && input.humanGate.resolvedAt === undefined) {
    return undefined;
  }
  if (isRecoveredLiveAction({ action, recentStateChange: input.recentStateChange })) {
    return {
      text: `Resolve recovered action ${action.actionId} from its recorded evidence: continue only the missing in-scope work, then call ConcludeResearchAction once with completed or abandoned. Do not start another action or ask the user merely to repair bookkeeping.`,
      source: 'research_action',
      freshness: 'blocked',
      observedAt: input.recentStateChange?.changedAt ?? action.createdAt,
      derivedFrom: {
        actionId: action.actionId,
        questionId: action.questionId,
        lineSlug: action.lineSlug,
      },
    };
  }
  const phaseMatches = action.status === 'planned'
    ? input.phase === 'action_planned'
    : input.phase === 'action_executing';
  if (phaseMatches) return undefined;
  return {
    text: `Recover action ${action.actionId}: it is ${action.status} while the Research phase is ${input.phase}; conclude or abandon it before starting another action.`,
    source: 'research_action',
    freshness: 'blocked',
    observedAt: action.createdAt,
    derivedFrom: {
      actionId: action.actionId,
      questionId: action.questionId,
      lineSlug: action.lineSlug,
    },
  };
}

function stringArg(args: unknown, key: string): string | undefined {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function arrayStringArg(args: unknown, key: string): readonly string[] {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return [];
  const value = (args as Record<string, unknown>)[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}

function normalizeResearchPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const normalized = posix.normalize(path.replaceAll('\\', '/'));
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

function isAitpPath(path: string): boolean {
  return path.startsWith('.aitp/') || path.includes('/.aitp/');
}

function isCanonicalAitpPath(path: string): boolean {
  return path.startsWith('.aitp/topic/') || path.includes('/.aitp/topic/');
}

function isLocalAitpDraftPath(path: string): boolean {
  return path.startsWith('.aitp/local/') || path.includes('/.aitp/local/');
}

type CheckpointQuestionRevision = Pick<ResearchQuestion, 'id' | 'revision'>;

function checkpointQuestionFor(
  checkpoint: ResearchCheckpoint,
  questions: readonly CheckpointQuestionRevision[],
): CheckpointQuestionRevision | undefined {
  if (checkpoint.questionId === undefined) return undefined;
  return questions.find((question) => question.id === checkpoint.questionId);
}

function isHistoricalCheckpoint(
  checkpoint: ResearchCheckpoint,
  questions: readonly CheckpointQuestionRevision[],
): boolean {
  const question = checkpointQuestionFor(checkpoint, questions);
  return checkpoint.questionRevision !== undefined &&
    question !== undefined &&
    checkpoint.questionRevision !== question.revision;
}

function pendingCheckpointBlockerText(
  checkpoint: ResearchCheckpoint,
  question?: CheckpointQuestionRevision,
): string {
  if (
    checkpoint.questionRevision !== undefined &&
    question !== undefined &&
    question.id === checkpoint.questionId &&
    checkpoint.questionRevision !== question.revision
  ) {
    return `Historical checkpoint ${checkpoint.checkpointId} was proposed for question revision ${String(checkpoint.questionRevision)}, but the current revision is ${String(question.revision)}; do not commit it as current evidence. Explicitly undo its proposal before automatic continuation.`;
  }
  return `Checkpoint ${checkpoint.checkpointId} is pending durable commit; commit it or undo its proposal before automatic continuation.`;
}

function deriveEffectiveNextStep(input: {
  readonly phase: ResearchPhase;
  readonly currentAction?: ResearchActionSpec;
  readonly currentRun?: ResearchRunState;
  readonly pendingCheckpoint?: ResearchCheckpoint;
  readonly latestProgress?: ResearchProgressReport;
  readonly currentQuestion?: ResearchQuestion;
  readonly humanGate?: ResearchHumanGate;
  readonly recentStateChange?: ResearchStateChange;
  readonly goalAlignment?: ResearchGoalAlignment;
  readonly activeGoal?: boolean;
  readonly maintenance?: AitpMaintenanceReceipt;
  readonly currentLineSlug?: string;
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

  const recovery = actionRecoveryStep(input);
  if (recovery !== undefined) return recovery;

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

  const checkpoint = input.pendingCheckpoint;
  if (checkpoint !== undefined) {
    return {
      text: pendingCheckpointBlockerText(checkpoint, input.currentQuestion),
      source: 'aitp_maintenance',
      freshness: 'blocked',
      observedAt: checkpoint.createdAt,
      derivedFrom: {
        questionId: checkpoint.questionId,
        lineSlug: checkpoint.lineSlug,
      },
    };
  }

  const alignment = input.goalAlignment;
  if (alignment !== undefined && isAlignmentBlocking(alignment, input.activeGoal === true)) {
    return {
      text: goalAlignmentBlockerText(alignment),
      source: 'aitp_maintenance',
      freshness: 'blocked',
      observedAt: input.maintenance?.refreshedAt ?? now(),
      derivedFrom: {
        lineSlug: input.currentLineSlug,
      },
    };
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
        lineSlug: input.currentLineSlug,
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
        lineSlug: input.currentLineSlug,
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
  readonly pendingCheckpoint?: ResearchCheckpoint;
  readonly humanGate?: ResearchHumanGate;
  readonly goalAlignment?: ResearchGoalAlignment;
  readonly workstreamAlignment?: ResearchLineWorkstreamAlignment;
  readonly activeGoal?: boolean;
  readonly maintenance?: AitpMaintenanceReceipt;
  readonly alerts: readonly ResearchAlert[];
  readonly distillationAttention?: ResearchDistillationAttention;
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
  const distillationUnavailable = input.distillationAttention?.status === 'handoff_unavailable';
  const alignmentBlocked = input.goalAlignment !== undefined &&
    isAlignmentBlocking(input.goalAlignment, input.activeGoal === true);
  const actionRecoveryBlocked = input.effectiveNextStep?.source === 'research_action' &&
    input.effectiveNextStep.freshness === 'blocked';
  const checkpointBlocked = input.pendingCheckpoint !== undefined;
  const focusBlocked =
    focusQuestion !== undefined && !focusOutsideWorkstream && focusQuestion.workflow === 'blocked';
  let health: ResearchStatusHealth = 'ok';
  if (
    actionRecoveryBlocked || checkpointBlocked || alignmentBlocked ||
    humanGateUnresolved || hasBlocker || focusBlocked
  ) {
    health = 'blocked';
  } else if (input.modePhase === 'degraded') {
    health = 'degraded';
  } else if (
    attentionAlerts.length > 0 ||
    distillationUnavailable ||
    (input.currentLineSlug !== undefined && input.workstreamAlignment?.status !== 'bound')
  ) {
    health = 'attention';
  }
  const stepFromOutside = focusOutsideWorkstream && input.effectiveNextStep?.source === 'question';
  const bindingAttention = input.currentLineSlug !== undefined && input.workstreamAlignment?.status !== 'bound'
    ? [`Scoped AITP persistence is unavailable: ${input.workstreamAlignment?.reason ?? 'confirm an explicit workstream binding.'}`]
    : [];
  const recoveryAttention = actionRecoveryBlocked && input.effectiveNextStep !== undefined
    ? [input.effectiveNextStep.text]
    : [];
  const checkpointAttention = checkpointBlocked && input.pendingCheckpoint !== undefined
    ? [pendingCheckpointBlockerText(
        input.pendingCheckpoint,
        checkpointQuestionFor(input.pendingCheckpoint, Object.values(input.questions)),
      )]
    : [];
  const alignmentAttention = alignmentBlocked && input.goalAlignment !== undefined
    ? [goalAlignmentBlockerText(input.goalAlignment)]
    : [];
  const attention = deduplicateAttention([
    ...recoveryAttention,
    ...checkpointAttention,
    ...alignmentAttention,
    ...bindingAttention,
    ...distillationAttentionText(input.distillationAttention),
    ...attentionAlerts.map((alert) => alert.message),
  ]);
  return {
    currentLineSlug: input.currentLineSlug,
    currentQuestionId,
    currentActionId: actionMatchesWorkstream ? input.currentAction?.actionId : undefined,
    phase: input.phase,
    nextStep: stepFromOutside ? undefined : input.effectiveNextStep?.text,
    health,
    attention,
  };
}

function deduplicateAttention(messages: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const identity = message.replaceAll(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
    if (identity.length === 0 || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function distillationAttentionText(
  attention: ResearchDistillationAttention | undefined,
): readonly string[] {
  return attention?.status === 'handoff_unavailable'
    ? [`Method review handoff unavailable for Entry ${attention.entryId}: ${attention.reason}`]
    : [];
}
