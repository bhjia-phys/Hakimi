/**
 * `goal` domain — `IAgentGoalService` implementation.
 *
 * Owns the main-agent goal lifecycle; persists the goal in the `wire`
 * `GoalModel` (`GoalState | null`) through the `goal.create` / `goal.update` /
 * `goal.clear` Ops (`wire.dispatch`), reads it through `wire.getModel`,
 * publishes `goal.updated` live to `IEventBus`, and normalizes replayed state
 * after the ordered restore barrier: a valid task wait lease stays active while
 * an ordinary replayed `active` goal is moved to `paused`. The accumulated
 * `wallClockMs` lives in the Model (set from each Op payload, never by
 * `Date.now()` inside `apply`); the active interval's epoch-ms
 * `wallClockResumedAt` anchor is
 * persisted at create/resume boundaries so recovery can settle crash-spanning
 * elapsed time without periodic writes. A `forked` wire Op clears the Model
 * at a fork boundary. Injects reminders through
 * `contextInjector`, drives continuation turns by enqueueing `newTurn`
 * `StepRequest`s onto `loop` (the continuation message materializes when the
 * loop pops it). Folds the `GoalCompletionGuardContribution` and
 * `GoalContinuationParticipantContribution` collections at Agent scope:
 * `markComplete` consults the completion guards before dispatching the
 * completion (a deny rejects the call with a coded error), and the automatic
 * continuation launch consults the continuation participants before enqueueing
 * (a hold skips the enqueue and leaves the goal active). A structured wait
 * lease can suspend continuations on background task terminal events without
 * charging active wall-clock time; it is persisted and wakes at most one turn.
 * Accounts live turn usage through `usage`, observes terminal goal tool results through
 * `toolExecutor`, appends one-time reminder events through `systemReminder`, reports
 * telemetry through `telemetry`, and checks main-agent eligibility through
 * `scopeContext`. Measures time and arms hard deadlines through `goal`'s
 * App-scoped deadline scheduler. Two `onBeforeExecuteTool` veto listeners
 * guard the goal lifecycle: stale or budget-exhausted goal tool calls are
 * vetoed with synthetic results, and a `CreateGoal` call carrying a
 * `goal_start` display outside `auto` mode defers to a cold `waitUntil`
 * factory that runs the goal-start review through `toolApproval` under the
 * origin `goal-start-review-ask` — including the permission-mode switch
 * picked on the approval surface. The mutable turn-tracking and wall-clock
 * state (`liveTurnId`, `goalDrivenTurns`, `countedGoalTurns`,
 * `goalStarterTurns`, `goalOutcomeToolResultTurns`,
 * `goalOutcomeContinuationTurns`, `budgetGraceTurns`,
 * `pendingContinuationGoals`, `goalTurnTargets`, `exhaustedTurnBudgetGoals`,
 * `liveWallClockStartedAt`, `resumeContinuation`) is registered into
 * `agentState` (`IAgentStateService`) and read/written through it; the
 * `pendingContinuation` promise lock and the `wallClockDeadline` disposable
 * slot stay plain fields. Bound at Agent scope.
 * Subagent instances reject every goal command and do not install goal
 * injection, accounting, budget, or continuation hooks.
 */

import { randomUUID } from 'node:crypto';

import type { TurnEndedEvent, TurnStartedEvent } from '#/agent/loop/turnEvents';
import { Disposable, MutableDisposable, type IDisposable } from '#/_base/di/lifecycle';
import { isPromiseLike } from '#/_base/lifecycle/disposer';
import { type CollectionView } from '#/_base/di/collection';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { defineState } from '#/_base/state/stateRegistry';
import { abortError } from '#/_base/utils/abort';
import { isPlainRecord } from '#/_base/utils/canonical-args';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import type { ContextMessage } from '#/agent/contextMemory/types';
import { GoalInjection } from '#/agent/goal/injection/goalInjection';
import {
  IAgentLoopService,
  type AfterStepContext,
  type BeforeStepContext,
  type EnqueueReceipt,
} from '#/agent/loop/loop';
import { LOOP_CONTROL_SECTION, type LoopControl } from '#/agent/loop/configSection';
import { LoopErrors } from '#/agent/loop/errors';
import { ContinuationStepRequest, MessageStepRequest } from '#/agent/loop/stepRequest';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentStateService } from '#/agent/state/agentState';
import { IAgentSystemReminderService } from '#/agent/systemReminder/systemReminder';
import type { ExecutableToolResult } from '#/tool/toolContract';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import type { PermissionMode } from '#/agent/permissionPolicy/types';
import { IAgentToolApprovalService } from '#/agent/toolApproval/toolApproval';
import { IAgentToolExecutorService } from '#/agent/toolExecutor/toolExecutor';
import type { BeforeToolExecuteEvent } from '#/agent/toolExecutor/toolHooks';
import { IAgentUsageService, type UsageRecordedContext } from '#/agent/usage/usage';
import { IAgentTaskService } from '#/agent/task/task';
import { TERMINAL_STATUSES } from '#/agent/task/types';
import type { GoalBudgetProperties } from '#/app/telemetry/events';
import { ITelemetryService } from '#/app/telemetry/telemetry';
import { IConfigService } from '#/app/config/config';
import {
  ErrorCodes,
  Error2,
  toKimiErrorPayload,
  type KimiErrorPayload,
} from '#/errors';
import { IWireService } from '#/wire/wire';
import { defineModel } from '#/wire/model';
import { IEventBus } from '#/app/event/eventBus';

import { IAgentGoalService, type GoalReasonInput, type ResumeGoalInput, type WaitForTasksInput } from './goal';
import { IGoalDeadlineScheduler } from './goalDeadlineScheduler';
import {
  GoalCompletionGuardContribution,
  GoalContinuationParticipantContribution,
  type GoalCompletionGuardInput,
  type GoalContinuationDecisionResult,
  type GoalContinuationInput,
} from './goalContribution';
import { clearGoal, createGoal, GoalModel, updateGoal, type GoalState } from './goalOps';
import type {
  CreateGoalInput,
  GoalActor,
  GoalBudgetLimits,
  GoalBudgetReport,
  GoalChange,
  GoalChangeStats,
  GoalMutationRef,
  GoalSnapshot,
  GoalStatus,
  GoalToolResult,
  GoalWaitLease,
} from './types';

const MAX_GOAL_OBJECTIVE_LENGTH = 4000;
const MAX_GOAL_WAIT_TASKS = 32;

const MAX_GOAL_COMPLETION_CRITERION_LENGTH = MAX_GOAL_OBJECTIVE_LENGTH;

const GOAL_CANCELLED_REMINDER = [
  'The user cancelled the current goal.',
  'Ignore earlier active-goal reminders for that goal.',
  'Handle the next user request normally unless the user starts or resumes a goal.',
].join(' ');

const GOAL_FORK_CLEARED_REMINDER = [
  'This fork does not have a current goal.',
  'Ignore earlier active-goal reminders from the source session.',
  'Handle requests normally unless the user starts a new goal.',
].join(' ');

const GOAL_FORK_CLEARED_REMINDER_NAME = 'goal_fork_cleared';

const GOAL_RATE_LIMIT_PAUSE_REASON = 'Paused after provider rate limit';
const GOAL_PROVIDER_CONNECTION_PAUSE_PREFIX = 'Paused after provider connection error';
const GOAL_PROVIDER_AUTH_PAUSE_PREFIX = 'Paused after provider authentication error';
const GOAL_PROVIDER_API_PAUSE_PREFIX = 'Paused after provider API error';
const GOAL_MODEL_CONFIG_PAUSE_PREFIX = 'Paused after model configuration error';
const GOAL_RUNTIME_PAUSE_PREFIX = 'Paused after runtime error';
const GOAL_CONTINUATION_FAILURE_PAUSE_PREFIX = 'Paused after goal continuation failure';
const GOAL_INVALID_WAIT_LEASE_PAUSE_REASON = 'Paused after invalid background-task wait lease';
const GOAL_PROVIDER_FILTERED_PAUSE_REASON = 'Paused after provider safety policy block';
const GOAL_BUDGET_BLOCK_PREFIX = 'Blocked after goal budget reached';
const LLM_NOT_SET_MESSAGE = 'LLM not set, send "/login" to login';

const GOAL_BUDGET_STOP_REMINDER_NAME = 'goal_budget_stop';

const GOAL_BUDGET_STOP_REMINDER = [
  "The goal's hard budget was reached and the goal is now blocked; the user can resume it with /goal resume.",
  'Stop immediately.',
  'Do not call any more tools: they will be rejected.',
  'Write a brief final status message summarizing the progress so far.',
].join(' ');

const GOAL_BUDGET_TOOLS_REJECTED_MESSAGE =
  'Goal budget exhausted; tool calls are rejected. Write your final message.';
const GOAL_STALE_TOOL_RESULT =
  'Goal changed since this turn started; ignored stale goal tool call.';

const GOAL_CONTINUATION_PROMPT = [
  'Continue working toward the active goal.',
  'Keep the self-audit brief. Do not explore unrelated interpretations once the goal can be',
  'decided. If the objective is simple, already answered, impossible, unsafe, or contradictory,',
  'do not run another goal turn. Explain briefly if useful, then call UpdateGoal with `complete`',
  'or `blocked` in the same turn. Otherwise, weigh the objective and any completion criteria',
  'against the work done so far, choose one bounded, useful slice of work, and use the existing',
  'conversation context and your tools. Do not try to finish a broad goal in one turn unless the',
  'whole goal is genuinely small. Most goal turns should not call UpdateGoal: after completing a',
  'useful slice, if material work remains, end the turn normally without calling UpdateGoal so',
  'the runtime can continue the goal in the next turn. Call UpdateGoal with `complete` only when',
  'all required work is done, any stated validation has passed, and there is no useful next',
  'action. Completion audit: before calling `complete`, verify the current state against the',
  'actual objective and every explicit requirement. Treat weak or indirect evidence as not',
  'complete. Do not mark complete after only producing a plan, summary, first pass, or partial',
  'result. Do not mark complete merely because a budget is nearly exhausted or you want to stop.',
  'Blocked audit: do not call UpdateGoal with `blocked` the first time you hit a blocker. Use',
  '`blocked` only for a genuine impasse: an external condition, required user input, missing',
  'credentials or permissions, or a persistent technical failure. For those non-terminal',
  'blockers, the same blocking condition must repeat for at least 3 consecutive goal turns before',
  'you call `blocked`, counting the original/user-triggered turn and automatic continuations.',
  'If a previously blocked goal is resumed, treat the resumed run as a fresh blocked audit.',
  'Exception: if the objective itself is impossible, unsafe, or contradictory, call UpdateGoal',
  'with `blocked` in the same turn; do not run more goal turns just to satisfy the audit. Do not',
  'use `blocked` because the work is large, hard, slow, uncertain, incomplete, still needs',
  'validation, would benefit from clarification, or needs more goal turns. Once the 3-turn',
  'threshold is met and you cannot make meaningful progress without user input or an',
  'external-state change, call UpdateGoal with `blocked`; do not keep reporting the blocker while',
  'leaving the goal active. Do not ask the user for input unless a real blocker prevents progress.',
].join(' ');

const GOAL_STEP_CAP_CONTINUATION_PROMPT = [
  'The previous goal turn reached the per-turn step limit before finishing its work,',
  'so a new turn was started for you. Pick up where that turn stopped and keep each',
  'slice of work small enough to fit the limit.',
  GOAL_CONTINUATION_PROMPT,
].join(' ');

interface GoalForkNoticeState {
  readonly goalPresent: boolean;
  readonly reminderPending: boolean;
}

type ContinuationReservationPhase = 'deciding' | 'held' | 'enqueued';

interface WaitingWake {
  readonly goalId: string;
  readonly generation: number;
  scheduled: boolean;
}

interface PendingContinuation {
  readonly goalId: string;
  readonly generation: number;
  readonly stepCapped: boolean;
  phase: ContinuationReservationPhase;
  retryRequested: boolean;
  receipt?: EnqueueReceipt;
  turnId?: number;
}

interface ResumeContinuation {
  readonly turnId: number;
  readonly goalId: string;
}

const GoalForkNoticeModel = defineModel<GoalForkNoticeState>(
  'goalForkNotice',
  () => ({ goalPresent: false, reminderPending: false }),
  {
    reducers: {
      'goal.create': (state) => ({ ...state, goalPresent: true }),
      'goal.clear': (state) => ({ ...state, goalPresent: false }),
      forked: (state) => ({
        goalPresent: false,
        reminderPending: state.goalPresent || state.reminderPending,
      }),
      'context.append_message': (state, payload: { message?: ContextMessage }) =>
        state.reminderPending && isGoalForkClearedReminder(payload.message)
          ? { ...state, reminderPending: false }
          : state,
    },
  },
);

function isGoalForkClearedReminder(message: ContextMessage | undefined): boolean {
  const origin = message?.origin;
  if (origin?.kind === 'injection') return origin.variant === GOAL_FORK_CLEARED_REMINDER_NAME;
  return origin?.kind === 'system_trigger' && origin.name === GOAL_FORK_CLEARED_REMINDER_NAME;
}

function isGoalContinuationOrigin(origin: TurnStartedEvent['origin']): boolean {
  return origin.kind === 'system_trigger' && origin.name === 'goal_continuation';
}

export const goalLiveTurnIdKey = defineState<number | undefined>(
  'goal.liveTurnId',
  () => undefined as number | undefined,
);
export const goalGoalDrivenTurnsKey = defineState<Map<number, string>>(
  'goal.goalDrivenTurns',
  () => new Map(),
);
export const goalCountedGoalTurnsKey = defineState<Set<number>>(
  'goal.countedGoalTurns',
  () => new Set(),
);
export const goalGoalStarterTurnsKey = defineState<Set<number>>(
  'goal.goalStarterTurns',
  () => new Set(),
);
export const goalGoalOutcomeToolResultTurnsKey = defineState<Map<number, string>>(
  'goal.goalOutcomeToolResultTurns',
  () => new Map(),
);
export const goalGoalOutcomeContinuationTurnsKey = defineState<Set<number>>(
  'goal.goalOutcomeContinuationTurns',
  () => new Set(),
);
export const goalBudgetGraceTurnsKey = defineState<Set<number>>(
  'goal.budgetGraceTurns',
  () => new Set(),
);
export const goalPendingContinuationGoalsKey = defineState<Map<number, string>>(
  'goal.pendingContinuationGoals',
  () => new Map(),
);
export const goalGoalTurnTargetsKey = defineState<Map<number, string>>(
  'goal.goalTurnTargets',
  () => new Map(),
);
export const goalExhaustedTurnBudgetGoalsKey = defineState<Map<number, string>>(
  'goal.exhaustedTurnBudgetGoals',
  () => new Map(),
);
export const goalLiveWallClockStartedAtKey = defineState<number | undefined>(
  'goal.liveWallClockStartedAt',
  () => undefined as number | undefined,
);
export const goalResumeContinuationKey = defineState<ResumeContinuation | undefined>(
  'goal.resumeContinuation',
  () => undefined as ResumeContinuation | undefined,
);

// NOTE: stays Disposable — its own 'config' collides with the Fiber
export class AgentGoalService extends Disposable implements IAgentGoalService {
  declare readonly _serviceBrand: undefined;

  private readonly wallClockDeadline = this._register(new MutableDisposable<IDisposable>());
  private readonly continuationRetrySubscriptions = new Map<
    GoalContinuationParticipantContribution,
    IDisposable
  >();
  private pendingContinuation?: PendingContinuation;
  private continuationGeneration = 0;
  private waitingWake?: WaitingWake;

  constructor(
    @IWireService private readonly wire: IWireService,
    @IEventBus private readonly eventBus: IEventBus,
    @IAgentSystemReminderService private readonly reminders: IAgentSystemReminderService,
    @ITelemetryService private readonly telemetry: ITelemetryService,
    @IAgentContextInjectorService injector: IAgentContextInjectorService,
    @IAgentLoopService private readonly loopService: IAgentLoopService,
    @IAgentTaskService private readonly tasks: IAgentTaskService,
    @IAgentToolExecutorService toolExecutor: IAgentToolExecutorService,
    @IAgentToolApprovalService private readonly toolApproval: IAgentToolApprovalService,
    @IAgentPermissionModeService private readonly permissionMode: IAgentPermissionModeService,
    @IAgentUsageService usageService: IAgentUsageService,
    @IConfigService private readonly config: IConfigService,
    @IGoalDeadlineScheduler private readonly deadlineScheduler: IGoalDeadlineScheduler,
    @IAgentScopeContext private readonly agentContext: IAgentScopeContext,
    @IAgentStateService private readonly states: IAgentStateService,
    @GoalCompletionGuardContribution private readonly completionGuards: CollectionView<GoalCompletionGuardContribution>,
    @GoalContinuationParticipantContribution
    private readonly continuationParticipants: CollectionView<GoalContinuationParticipantContribution>,
  ) {
    super();
    this.states.register(goalLiveTurnIdKey);
    this.states.register(goalGoalDrivenTurnsKey);
    this.states.register(goalCountedGoalTurnsKey);
    this.states.register(goalGoalStarterTurnsKey);
    this.states.register(goalGoalOutcomeToolResultTurnsKey);
    this.states.register(goalGoalOutcomeContinuationTurnsKey);
    this.states.register(goalBudgetGraceTurnsKey);
    this.states.register(goalPendingContinuationGoalsKey);
    this.states.register(goalGoalTurnTargetsKey);
    this.states.register(goalExhaustedTurnBudgetGoalsKey);
    this.states.register(goalLiveWallClockStartedAtKey);
    this.states.register(goalResumeContinuationKey);
    if (!this.isSupportedAgent) return;
    this._register(
      this.eventBus.subscribe('task.terminated', ({ info }) => {
        if (this.wire.isRestoring()) return;
        queueMicrotask(() => {
          this.handleTaskTerminated(info.taskId);
        });
      }),
    );
    for (const participant of this.continuationParticipants.items) {
      this.bindContinuationRetry(participant);
    }
    this._register(
      this.continuationParticipants.onDidChange(({ added, removed }) => {
        for (const participant of removed) {
          this.continuationRetrySubscriptions.get(participant)?.dispose();
          this.continuationRetrySubscriptions.delete(participant);
        }
        for (const participant of added) {
          this.bindContinuationRetry(participant);
        }
      }),
    );
    this._register(
      new GoalInjection(
        {
          getGoal: () => this.getGoal().goal,
        },
        injector,
      ),
    );
    this._register(
      this.wire.hooks.onDidRestore.register('goal', async (_ctx, next) => {
        await next();
        this.normalizeAfterReplay();
      }),
    );
    this._register(
      this.eventBus.subscribe('turn.started', (e) => {
        this.handleTurnLaunched(e.turnId, e.origin);
      }),
    );
    this._register(
      usageService.onDidRecord((ctx) => this.handleUsageRecorded(ctx)),
    );
    this._register(
      loopService.hooks.onWillBeginStep.register('goal-count-turn', async (ctx, next) => {
        await this.handleBeforeStep(ctx);
        await next();
      }),
    );
    this._register(
      loopService.hooks.onDidFinishStep.register('goal-outcome-continuation', async (ctx, next) => {
        this.handleAfterStep(ctx);
        await next();
      }),
    );
    this._register(
      toolExecutor.onBeforeExecuteTool((event) => {
        if (
          event.toolCall.name !== 'CreateGoal' ||
          this.permissionMode.mode === 'auto' ||
          event.execution.display?.kind !== 'goal_start'
        ) {
          return;
        }
        event.waitUntil(async () =>
          this.toolApproval.requestToolApproval(
            event,
            {
              kind: 'ask',
              resolveApproval: (approval) => {
                if (approval.decision !== 'approved') return undefined;
                const mode = toGoalStartReviewPermissionMode(approval.selectedLabel);
                if (mode !== undefined && mode !== this.permissionMode.mode) {
                  this.permissionMode.setMode(mode);
                }
                return undefined;
              },
            },
            'goal-start-review-ask',
          ),
        );
      }),
    );
    this._register(
      toolExecutor.onBeforeExecuteTool((event) => {
        if (this.isStaleGoalToolCall(event)) {
          event.veto({ output: GOAL_STALE_TOOL_RESULT });
          return;
        }
        if (this.budgetGraceTurns.has(event.turnId)) {
          event.veto({ output: GOAL_BUDGET_TOOLS_REJECTED_MESSAGE });
        }
      }),
    );
    this._register(
      toolExecutor.hooks.onDidExecuteTool.register('goal-outcome-tool-result', async (ctx, next) => {
        const goalId = this.goalTurnTarget(ctx.turnId);
        if (
          goalId !== undefined &&
          isTerminalUpdateGoalResult(ctx.toolCall.name, ctx.args, ctx.result)
        ) {
          this.goalOutcomeToolResultTurns.set(ctx.turnId, goalId);
        }
        await next();
      }),
    );
    this._register(
      this.eventBus.subscribe('turn.ended', (e) => {
        const goalId = this.goalTurnTarget(e.turnId);
        void this.handleTurnEnded(e.turnId, { reason: e.reason, error: e.error }).catch((error) =>
          this.settleGoalAfterContinuationFailure(error, goalId),
        );
      }),
    );
  }

  private get liveTurnId(): number | undefined {
    return this.states.get(goalLiveTurnIdKey);
  }

  private set liveTurnId(value: number | undefined) {
    this.states.set(goalLiveTurnIdKey, value);
  }

  private get goalDrivenTurns(): Map<number, string> {
    return this.states.get(goalGoalDrivenTurnsKey);
  }

  private get countedGoalTurns(): Set<number> {
    return this.states.get(goalCountedGoalTurnsKey);
  }

  private get goalStarterTurns(): Set<number> {
    return this.states.get(goalGoalStarterTurnsKey);
  }

  private get goalOutcomeToolResultTurns(): Map<number, string> {
    return this.states.get(goalGoalOutcomeToolResultTurnsKey);
  }

  private get goalOutcomeContinuationTurns(): Set<number> {
    return this.states.get(goalGoalOutcomeContinuationTurnsKey);
  }

  private get budgetGraceTurns(): Set<number> {
    return this.states.get(goalBudgetGraceTurnsKey);
  }

  private get pendingContinuationGoals(): Map<number, string> {
    return this.states.get(goalPendingContinuationGoalsKey);
  }

  private get goalTurnTargets(): Map<number, string> {
    return this.states.get(goalGoalTurnTargetsKey);
  }

  private get exhaustedTurnBudgetGoals(): Map<number, string> {
    return this.states.get(goalExhaustedTurnBudgetGoalsKey);
  }

  private get liveWallClockStartedAt(): number | undefined {
    return this.states.get(goalLiveWallClockStartedAtKey);
  }

  private set liveWallClockStartedAt(value: number | undefined) {
    this.states.set(goalLiveWallClockStartedAtKey, value);
  }

  private get resumeContinuation(): ResumeContinuation | undefined {
    return this.states.get(goalResumeContinuationKey);
  }

  private set resumeContinuation(value: ResumeContinuation | undefined) {
    this.states.set(goalResumeContinuationKey, value);
  }

  private get isSupportedAgent(): boolean {
    return this.agentContext.agentId === 'main';
  }

  private assertSupportedAgent(): void {
    if (this.isSupportedAgent) return;
    throw new Error2(
      ErrorCodes.GOAL_UNSUPPORTED_AGENT,
      'Goals are only supported by the main agent',
      { details: { agentId: this.agentContext.agentId } },
    );
  }

  private get goalState(): GoalState | null {
    return this.wire.getModel(GoalModel) as GoalState | null;
  }

  getGoal(): GoalToolResult {
    this.assertSupportedAgent();
    const state = this.goalState;
    return { goal: state === null ? null : this.toSnapshot(state) };
  }

  isGoalToolTarget(turnId: number, goalId: string): boolean {
    this.assertSupportedAgent();
    return this.goalTurnTargets.get(turnId) === goalId;
  }

  isGoalContinuationTurn(turnId: number, goalId?: string): boolean {
    this.assertSupportedAgent();
    if (goalId === undefined || this.goalState?.goalId !== goalId || this.goalState.status !== 'active') {
      return false;
    }
    return this.pendingContinuation?.goalId === goalId && (
      this.pendingContinuation.turnId === undefined || this.pendingContinuation.turnId === turnId
    );
  }

  async createGoal(input: CreateGoalInput, actor: GoalActor = 'user'): Promise<GoalSnapshot> {
    this.assertSupportedAgent();
    const objective = this.validateObjective(input.objective);
    this.prepareForGoalCreation(input.replace === true);
    const wallClockResumedAt = Date.now();
    const goalId = randomUUID();
    const mutation = this.newGoalMutation('create', goalId, 'active');
    this.wire.dispatch(
      createGoal({
        goalId,
        objective,
        completionCriterion: normalizeCompletionCriterion(input.completionCriterion),
        wallClockResumedAt,
        mutation,
      }),
    );
    this.liveWallClockStartedAt = this.deadlineScheduler.now();
    this.adoptStarterTurn(actor);
    const state = this.requireState();
    this.refreshWallClockDeadline(state);
    this.emitGoalUpdated(this.toSnapshot(state), undefined, mutation);
    this.telemetry.track2('goal_created', { actor, replace: input.replace === true });
    return this.toSnapshot(state);
  }

  private validateObjective(value: string): string {
    const objective = value.trim();
    if (objective.length === 0) {
      throw new Error2(ErrorCodes.GOAL_OBJECTIVE_EMPTY, 'Goal objective cannot be empty');
    }
    if (objective.length > MAX_GOAL_OBJECTIVE_LENGTH) {
      throw new Error2(
        ErrorCodes.GOAL_OBJECTIVE_TOO_LONG,
        `Goal objective cannot exceed ${MAX_GOAL_OBJECTIVE_LENGTH} characters. Put long content in a file and reference the file path.`,
      );
    }
    return objective;
  }

  private prepareForGoalCreation(replace: boolean): void {
    if (this.goalState === null) return;
    if (!replace) {
      throw new Error2(
        ErrorCodes.GOAL_ALREADY_EXISTS,
        'A goal already exists; use replace to start a new one',
      );
    }
    this.clearInternal('system');
  }

  async pauseGoal(input: GoalReasonInput = {}, actor: GoalActor = 'user'): Promise<GoalSnapshot> {
    this.assertSupportedAgent();
    const state = this.requireState();
    if (state.status === 'paused') return this.toSnapshot(state);
    if (state.status !== 'active') {
      throw new Error2(
        ErrorCodes.GOAL_STATUS_INVALID,
        `Cannot pause a goal in status "${state.status}"`,
      );
    }
    return this.applyLifecycle(state, 'paused', input.reason, actor);
  }

  async pauseActiveGoal(
    input: GoalReasonInput = {},
    actor: GoalActor = 'runtime',
  ): Promise<GoalSnapshot | null> {
    this.assertSupportedAgent();
    const state = this.goalState;
    if (state === null || state.status !== 'active') return null;
    return this.applyLifecycle(state, 'paused', input.reason, actor);
  }

  async resumeGoal(input: ResumeGoalInput = {}, actor: GoalActor = 'user'): Promise<GoalSnapshot> {
    this.assertSupportedAgent();
    const state = this.requireState();
    if (state.status === 'active') {
      if (state.waitingFor === undefined) {
        const snapshot = this.toSnapshot(state);
        const shouldContinue =
          actor === 'user' &&
          (input.continueIfPaused === true || input.continueIfBlocked === true);
        if (!shouldContinue) return snapshot;
        const budgetBlocked = this.blockIfBudgetReached(state);
        if (budgetBlocked !== null) return budgetBlocked;
        if (this.canLaunchContinuation()) {
          try {
            await this.launchContinuationTurn(state.goalId);
          } catch (error) {
            await this.settleGoalAfterContinuationFailure(error, state.goalId);
            throw error;
          }
        }
        return snapshot;
      }
      this.invalidateContinuation();
      const mutation = this.newGoalMutation('update', state.goalId, state.status);
      this.wire.dispatch(updateGoal({
        waitingFor: null,
        wallClockResumedAt: Date.now(),
        actor,
        mutation,
      }));
      this.liveWallClockStartedAt = this.deadlineScheduler.now();
      const resumed = this.requireState();
      this.refreshWallClockDeadline(resumed);
      this.emitGoalUpdated(this.toSnapshot(resumed), undefined, mutation);
      this.scheduleWaitingWake();
      return this.toSnapshot(resumed);
    }
    if (state.status !== 'paused' && state.status !== 'blocked') {
      throw new Error2(
        ErrorCodes.GOAL_NOT_RESUMABLE,
        `Cannot resume a goal in status "${state.status}"`,
      );
    }
    const continuePaused =
      actor === 'user' && state.status === 'paused' && input.continueIfPaused === true;
    const shouldContinue =
      continuePaused ||
      (actor === 'user' && state.status === 'blocked' && input.continueIfBlocked === true);
    const snapshot = this.applyLifecycle(state, 'active', input.reason, actor);
    if (!shouldContinue) return snapshot;
    const budgetBlocked = this.blockIfBudgetReached(this.requireState());
    if (budgetBlocked !== null) return budgetBlocked;
    if (this.canLaunchContinuation()) {
      try {
        await this.launchContinuationTurn(state.goalId);
      } catch (error) {
        await this.settleGoalAfterContinuationFailure(error, state.goalId);
        throw error;
      }
    } else if (continuePaused && this.liveTurnId !== undefined) {
      this.resumeContinuation = { turnId: this.liveTurnId, goalId: state.goalId };
    }
    return snapshot;
  }

  async waitForTasks(
    input: WaitForTasksInput,
    actor: GoalActor = 'model',
  ): Promise<GoalSnapshot> {
    this.assertSupportedAgent();
    const state = this.requireState();
    if (state.status !== 'active') {
      throw new Error2(
        ErrorCodes.GOAL_STATUS_INVALID,
        `Cannot wait for tasks while the goal is ${state.status}.`,
      );
    }
    const rawTaskIds: unknown = input?.taskIds;
    if (
      !Array.isArray(rawTaskIds) ||
      rawTaskIds.length === 0 ||
      rawTaskIds.length > MAX_GOAL_WAIT_TASKS ||
      rawTaskIds.some((taskId) => typeof taskId !== 'string' || taskId.length === 0)
    ) {
      throw new Error2(
        ErrorCodes.GOAL_STATUS_INVALID,
        `Waiting requires 1-${MAX_GOAL_WAIT_TASKS} non-empty task IDs.`,
      );
    }
    const policy = input?.policy ?? 'any';
    if (policy !== 'any' && policy !== 'all') {
      throw new Error2(ErrorCodes.GOAL_STATUS_INVALID, 'Waiting policy must be "any" or "all".');
    }
    const taskIds = [...new Set(rawTaskIds as string[])];
    for (const taskId of taskIds) {
      const task = this.tasks.getTask(taskId);
      if (task === undefined) {
        throw new Error2(
          ErrorCodes.GOAL_STATUS_INVALID,
          `Cannot wait for unknown task "${taskId}".`,
        );
      }
      if (task.detached === false) {
        throw new Error2(
          ErrorCodes.GOAL_STATUS_INVALID,
          `Cannot wait for foreground task "${taskId}".`,
        );
      }
    }
    const waitingFor = { taskIds, policy } satisfies GoalWaitLease;
    if (this.isWaitSatisfied(waitingFor)) return this.toSnapshot(state);
    this.invalidateContinuation();
    const mutation = this.newGoalMutation('update', state.goalId, state.status);
    this.wire.dispatch(updateGoal({
      waitingFor,
      wallClockMs: this.settleWallClock(state),
      clearWallClockResumedAt: true,
      actor,
      mutation,
    }));
    this.wallClockDeadline.clear();
    this.liveWallClockStartedAt = undefined;
    const next = this.requireState();
    this.emitGoalUpdated(this.toSnapshot(next), undefined, mutation);
    return this.toSnapshot(next);
  }

  async setBudgetLimits(
    input: { readonly budgetLimits: GoalBudgetLimits },
    actor: GoalActor = 'user',
  ): Promise<GoalSnapshot> {
    this.assertSupportedAgent();
    const state = this.requireState();
    const budgetLimits = { ...state.budgetLimits, ...input.budgetLimits };
    const mutation = this.newGoalMutation('update', state.goalId, state.status);
    this.wire.dispatch(updateGoal({ budgetLimits, mutation }));
    const next = this.requireState();
    this.emitGoalUpdated(this.toSnapshot(next), undefined, mutation);
    this.telemetry.track2('goal_budget_set', {
      actor,
      ...budgetTelemetryProperties(input.budgetLimits),
    });
    const blocked = this.blockIfBudgetReached(next);
    if (blocked !== null) return blocked;
    this.refreshWallClockDeadline(next);
    return this.toSnapshot(next);
  }

  async cancelGoal(_input: GoalReasonInput = {}, actor: GoalActor = 'user'): Promise<GoalSnapshot> {
    this.assertSupportedAgent();
    const state = this.requireState();
    const snapshot = this.toSnapshot(state);
    if (state.status === 'active' && this.liveTurnId !== undefined) {
      this.loopService.cancel(this.liveTurnId, abortError('Goal cancelled'));
    }
    this.clearInternal(actor);
    if (actor === 'user') {
      this.reminders.appendSystemReminder(GOAL_CANCELLED_REMINDER, {
        kind: 'injection',
        variant: 'goal_cancelled',
      });
    }
    return snapshot;
  }

  async markBlocked(
    input: GoalReasonInput = {},
    actor: GoalActor = 'runtime',
  ): Promise<GoalSnapshot | null> {
    this.assertSupportedAgent();
    const state = this.goalState;
    if (state === null || state.status !== 'active') return null;
    const snapshot = this.applyLifecycle(state, 'blocked', input.reason, actor, {
      preserveLiveContinuation: true,
    });
    return snapshot;
  }

  async markComplete(
    input: GoalReasonInput = {},
    actor: GoalActor = 'model',
  ): Promise<GoalSnapshot | null> {
    this.assertSupportedAgent();
    const state = this.goalState;
    if (state === null || state.status !== 'active') return null;
    await this.assertCompletionAllowed(state, input.reason, actor);
    const mutation = this.dispatchCompletion(state, input.reason, actor);
    const completed = this.requireState();
    const snapshot = this.toSnapshot(completed);
    this.emitCompletion(completed, snapshot, input.reason, actor, mutation);
    this.trackStatusChanged(completed, actor);
    this.clearInternal(actor, { preserveLiveContinuation: true });
    return snapshot;
  }

  private async assertCompletionAllowed(
    state: GoalState,
    reason: string | undefined,
    actor: GoalActor,
  ): Promise<void> {
    for (const record of this.completionGuards.records) {
      const result = await record.value.guard(this.toCompletionGuardInput(state, reason, actor));
      if (result.allow === true) continue;
      const deny = result;
      throw new Error2(ErrorCodes.GOAL_STATUS_INVALID, deny.reason, {
        details: {
          goalId: state.goalId,
          guard: record.providerName,
          ...(deny.code !== undefined ? { code: deny.code } : {}),
          ...(deny.owner !== undefined ? { owner: deny.owner } : {}),
          ...(deny.nextStep !== undefined ? { nextStep: deny.nextStep } : {}),
        },
      });
    }
  }

  private toCompletionGuardInput(
    state: GoalState,
    reason: string | undefined,
    actor: GoalActor,
  ): GoalCompletionGuardInput {
    return {
      goalId: state.goalId,
      objective: state.objective,
      reason,
      actor,
    };
  }

  private dispatchCompletion(
    state: GoalState,
    reason: string | undefined,
    actor: GoalActor,
  ): GoalMutationRef {
    const wallClockMs = this.settleWallClock(state);
    const mutation = this.newGoalMutation('update', state.goalId, 'complete');
    this.wire.dispatch(updateGoal({ status: 'complete', reason, wallClockMs, actor, mutation }));
    return mutation;
  }

  private emitCompletion(
    state: GoalState,
    snapshot: GoalSnapshot,
    reason: string | undefined,
    actor: GoalActor,
    mutation: GoalMutationRef,
  ): void {
    this.emitGoalUpdated(snapshot, {
      kind: 'completion',
      status: 'complete',
      reason,
      stats: this.statsOf(state),
      actor,
    }, mutation);
  }

  async pauseOnInterrupt(input: GoalReasonInput = {}): Promise<GoalSnapshot | null> {
    this.assertSupportedAgent();
    return this.pauseActiveGoal(input, 'user');
  }

  async recordTokenUsage(tokenDelta: number): Promise<GoalSnapshot | null> {
    this.assertSupportedAgent();
    return this.accountTokenUsage(tokenDelta);
  }

  private accountTokenUsage(tokenDelta: number, goalId?: string): GoalSnapshot | null {
    const state = this.goalState;
    if (state === null || state.status !== 'active' || !matchesGoal(state, goalId)) return null;
    const tokensUsed = state.tokensUsed + Math.max(0, tokenDelta);
    const mutation = this.newGoalMutation('update', state.goalId, state.status);
    this.wire.dispatch(updateGoal({ tokensUsed, mutation }));
    const next = this.requireState();
    const snapshot = this.toSnapshot(next);
    this.emitGoalUpdated(snapshot, undefined, mutation);
    return this.blockIfBudgetReached(next) ?? snapshot;
  }

  async incrementTurn(): Promise<GoalSnapshot | null> {
    this.assertSupportedAgent();
    return this.incrementGoalTurn();
  }

  private incrementGoalTurn(goalId?: string): GoalSnapshot | null {
    const state = this.goalState;
    if (state === null || state.status !== 'active' || !matchesGoal(state, goalId)) return null;
    const turnsUsed = state.turnsUsed + 1;
    const mutation = this.newGoalMutation('update', state.goalId, state.status);
    this.wire.dispatch(updateGoal({ turnsUsed, mutation }));
    const next = this.requireState();
    this.emitGoalUpdated(this.toSnapshot(next), undefined, mutation);
    this.telemetry.track2('goal_continued', { turns_used: next.turnsUsed });
    return this.toSnapshot(next);
  }

  private handleTaskTerminated(taskId: string): void {
    if (this.wire.isRestoring()) return;
    const state = this.goalState;
    const waitingFor = state?.waitingFor;
    if (state === null || state?.status !== 'active' || waitingFor === undefined) return;
    if (!waitingFor.taskIds.includes(taskId) || !this.isWaitSatisfied(waitingFor)) return;

    const mutation = this.newGoalMutation('update', state.goalId, state.status);
    this.wire.dispatch(updateGoal({
      waitingFor: null,
      wallClockResumedAt: Date.now(),
      actor: 'runtime',
      mutation,
    }));
    this.liveWallClockStartedAt = this.deadlineScheduler.now();
    const next = this.requireState();
    this.refreshWallClockDeadline(next);
    this.emitGoalUpdated(this.toSnapshot(next), undefined, mutation);
    this.scheduleWaitingWake();
  }

  private isWaitSatisfied(waitingFor: GoalWaitLease): boolean {
    const terminal = waitingFor.taskIds.map((taskId) => {
      const task = this.tasks.getTask(taskId);
      return task !== undefined && TERMINAL_STATUSES.has(task.status);
    });
    return waitingFor.policy === 'all' ? terminal.every(Boolean) : terminal.some(Boolean);
  }

  private scheduleWaitingWake(): void {
    const state = this.goalState;
    if (state === null || state.status !== 'active' || state.waitingFor !== undefined) return;
    const pending = this.waitingWake;
    if (
      pending?.goalId === state.goalId &&
      pending.generation === this.continuationGeneration
    ) {
      if (pending.scheduled || this.wire.isRestoring()) return;
      pending.scheduled = true;
      this.enqueueWaitingWake(pending);
      return;
    }

    const wake: WaitingWake = {
      goalId: state.goalId,
      generation: this.continuationGeneration,
      scheduled: false,
    };
    this.waitingWake = wake;
    if (this.wire.isRestoring()) return;
    wake.scheduled = true;
    this.enqueueWaitingWake(wake);
  }

  private enqueueWaitingWake(wake: WaitingWake): void {
    queueMicrotask(() => {
      if (this.waitingWake !== wake) return;
      wake.scheduled = false;
      if (!this.canLaunchContinuation(wake.goalId, wake.generation)) {
        if (
          this.continuationGeneration !== wake.generation ||
          !this.isActiveGoal(wake.goalId) ||
          this.goalState?.waitingFor !== undefined
        ) {
          this.waitingWake = undefined;
        }
        return;
      }
      this.waitingWake = undefined;
      void Promise.resolve().then(() => this.launchContinuationTurn(wake.goalId)).catch((error) =>
        this.settleGoalAfterContinuationFailure(error, wake.goalId),
      );
    });
  }

  private handleTurnLaunched(turnId: number, origin: TurnStartedEvent['origin']): void {
    this.liveTurnId = turnId;
    this.goalTurnTargets.delete(turnId);
    this.exhaustedTurnBudgetGoals.delete(turnId);
    if (!this.goalDrivenTurns.has(turnId)) {
      const state = this.goalState;
      const continuationGoalId = isGoalContinuationOrigin(origin)
        ? this.pendingContinuationGoals.get(turnId)
        : undefined;
      if (continuationGoalId !== undefined && state?.goalId !== continuationGoalId) {
        this.goalDrivenTurns.set(turnId, continuationGoalId);
      } else if (state?.status === 'active' && this.blockIfBudgetReached(state) === null) {
        this.goalDrivenTurns.set(turnId, state.goalId);
      }
    }
    this.pendingContinuationGoals.delete(turnId);
    this.goalOutcomeToolResultTurns.delete(turnId);
    this.goalOutcomeContinuationTurns.delete(turnId);
  }

  private adoptStarterTurn(actor: GoalActor): void {
    const turnId = this.liveTurnId;
    if (turnId === undefined) return;
    const state = this.goalState;
    if (state === null || state.status !== 'active') return;
    const goalId = this.goalDrivenTurns.get(turnId);
    if (actor === 'model') this.goalTurnTargets.set(turnId, state.goalId);
    if (this.toSnapshot(state).budget.turnBudgetReached) {
      this.exhaustedTurnBudgetGoals.set(turnId, state.goalId);
    } else {
      this.exhaustedTurnBudgetGoals.delete(turnId);
    }
    if (goalId !== undefined) return;
    this.goalDrivenTurns.set(turnId, state.goalId);
    this.countedGoalTurns.add(turnId);
    this.goalStarterTurns.add(turnId);
  }

  private async handleBeforeStep(ctx: BeforeStepContext): Promise<void> {
    const goalId = this.goalDrivenTurns.get(ctx.turnId);
    if (goalId === undefined) return;
    if (this.countedGoalTurns.has(ctx.turnId)) return;
    this.countedGoalTurns.add(ctx.turnId);
    this.incrementGoalTurn(goalId);
  }

  private handleUsageRecorded(ctx: UsageRecordedContext): void {
    const source = ctx.source;
    if (source?.type !== 'turn') return;
    const goalId = this.goalDrivenTurns.get(source.turnId);
    if (goalId === undefined) return;
    this.accountTokenUsage(ctx.usage.output, goalId);
  }

  private handleAfterStep(ctx: AfterStepContext): void {
    if (this.stopAfterBudgetReached(ctx)) return;
    this.enqueueGoalOutcomeContinuation(ctx);
  }

  private stopAfterBudgetReached(ctx: AfterStepContext): boolean {
    const goalId = this.goalTurnTarget(ctx.turnId);
    const state = this.goalState;
    const budget = state === null ? null : this.toSnapshot(state).budget;
    const turnBudgetBlocksCurrentTurn =
      budget?.turnBudgetReached === true &&
      (this.exhaustedTurnBudgetGoals.get(ctx.turnId) === goalId ||
        (state?.status === 'blocked' &&
          state.terminalReason?.startsWith(GOAL_BUDGET_BLOCK_PREFIX) === true));
    if (
      goalId === undefined ||
      state === null ||
      state.goalId !== goalId ||
      budget === null ||
      (!budget.tokenBudgetReached &&
        !budget.wallClockBudgetReached &&
        !turnBudgetBlocksCurrentTurn)
    ) {
      return false;
    }
    const maxSteps = this.config.get<LoopControl>(LOOP_CONTROL_SECTION)?.maxStepsPerTurn;
    if (
      ctx.finishReason === 'tool_calls' &&
      !this.budgetGraceTurns.has(ctx.turnId) &&
      hasStepBudgetRemaining(maxSteps, ctx.step)
    ) {
      this.budgetGraceTurns.add(ctx.turnId);
      this.reminders.appendSystemReminder(GOAL_BUDGET_STOP_REMINDER, {
        kind: 'injection',
        variant: GOAL_BUDGET_STOP_REMINDER_NAME,
      });
      return true;
    }
    ctx.stopTurn = true;
    return true;
  }

  private enqueueGoalOutcomeContinuation(ctx: AfterStepContext): void {
    if (this.goalOutcomeContinuationTurns.has(ctx.turnId)) return;
    const goalId = this.goalTurnTarget(ctx.turnId);
    const outcomeGoalId = this.goalOutcomeToolResultTurns.get(ctx.turnId);
    this.goalOutcomeToolResultTurns.delete(ctx.turnId);
    if (goalId === undefined || outcomeGoalId !== goalId) return;
    const state = this.goalState;
    if (state !== null && state.goalId !== goalId) return;
    this.goalOutcomeContinuationTurns.add(ctx.turnId);
    const maxSteps = this.config.get<LoopControl>(LOOP_CONTROL_SECTION)?.maxStepsPerTurn;
    if (!hasStepBudgetRemaining(maxSteps, ctx.step)) return;
    this.loopService.enqueue(new ContinuationStepRequest());
  }

  private async handleTurnEnded(
    turnId: number,
    result: Pick<TurnEndedEvent, 'reason' | 'error'>,
  ): Promise<void> {
    const { goalId, lifecycleGoalId, starterTurn } = this.clearTurnTracking(turnId);
    const resumeContinuation = this.resumeContinuation;
    if (resumeContinuation?.turnId === turnId) this.resumeContinuation = undefined;
    if (resumeContinuation?.turnId === turnId && result.reason === 'cancelled') {
      const state = this.goalState;
      if (state === null || state.status !== 'active' || state.goalId !== resumeContinuation.goalId) {
        return;
      }
      if (this.blockIfBudgetReached(state) !== null) return;
      await this.launchContinuationTurn(resumeContinuation.goalId);
      return;
    }
    if (goalId === undefined || lifecycleGoalId === undefined) {
      this.scheduleWaitingWake();
      return;
    }
    const stepCapped = isMaxStepsTurnFailure(result);
    if (
      !stepCapped &&
      (result.reason === 'blocked' ||
        result.reason === 'cancelled' ||
        result.reason === 'failed')
    ) {
      await this.settleAbnormalTurn(result, lifecycleGoalId);
      return;
    }
    if (starterTurn) this.incrementGoalTurn(goalId);

    const state = this.goalState;
    if (state === null || state.status !== 'active' || state.goalId !== lifecycleGoalId) return;
    if (this.blockIfBudgetReached(state) !== null) return;
    if (state.waitingFor !== undefined) return;
    if (this.waitingWake !== undefined) {
      this.scheduleWaitingWake();
      return;
    }
    await this.launchContinuationTurn(lifecycleGoalId, stepCapped);
  }

  private clearTurnTracking(
    turnId: number,
  ): {
    readonly goalId?: string;
    readonly lifecycleGoalId?: string;
    readonly starterTurn: boolean;
  } {
    if (this.pendingContinuation?.turnId === turnId) this.pendingContinuation = undefined;
    if (this.liveTurnId === turnId) this.liveTurnId = undefined;
    const goalId = this.goalDrivenTurns.get(turnId);
    const lifecycleGoalId = this.goalTurnTarget(turnId);
    const starterTurn = this.goalStarterTurns.delete(turnId);
    this.goalDrivenTurns.delete(turnId);
    this.countedGoalTurns.delete(turnId);
    this.goalOutcomeToolResultTurns.delete(turnId);
    this.goalOutcomeContinuationTurns.delete(turnId);
    this.budgetGraceTurns.delete(turnId);
    this.pendingContinuationGoals.delete(turnId);
    this.goalTurnTargets.delete(turnId);
    this.exhaustedTurnBudgetGoals.delete(turnId);
    return { goalId, lifecycleGoalId, starterTurn };
  }

  private async settleAbnormalTurn(
    result: Pick<TurnEndedEvent, 'reason' | 'error'>,
    goalId: string,
  ): Promise<boolean> {
    if (!this.isActiveGoal(goalId)) return false;
    if (result.reason === 'blocked') {
      await this.markBlocked({ reason: 'Blocked by UserPromptSubmit hook' });
      return true;
    }
    if (result.reason === 'cancelled') {
      await this.pauseOnInterrupt({ reason: 'Paused after interruption' });
      return true;
    }
    if (result.reason === 'failed') {
      await this.pauseActiveGoal({ reason: goalFailurePauseReason(result.error) });
      return true;
    }
    return false;
  }

  private async settleGoalAfterContinuationFailure(
    error: unknown,
    goalId: string | undefined,
  ): Promise<void> {
    if (goalId === undefined || !this.isActiveGoal(goalId)) return;
    try {
      const reason = pauseReasonWithMessage(
        GOAL_CONTINUATION_FAILURE_PAUSE_PREFIX,
        normalizeGoalErrorPayload(error).message,
      );
      await this.pauseActiveGoal({ reason }, 'system');
    } catch {}
  }

  private launchContinuationTurn(goalId: string, stepCapped = false): void | Promise<void> {
    const state = this.goalState;
    if (
      this.wire.isRestoring() ||
      state?.status !== 'active' ||
      state.goalId !== goalId ||
      state.waitingFor !== undefined
    ) return;
    this.waitingWake = undefined;
    const existing = this.pendingContinuation;
    if (existing !== undefined) {
      if (existing.phase !== 'held' || existing.goalId !== goalId) return;
      this.pendingContinuation = undefined;
    }

    const pending: PendingContinuation = {
      goalId,
      generation: ++this.continuationGeneration,
      stepCapped,
      phase: 'deciding',
      retryRequested: false,
    };
    this.pendingContinuation = pending;

    if (this.continuationParticipants.records.length === 0) {
      this.enqueueContinuation(pending);
      return;
    }
    const decision = this.decideContinuation(pending);
    if (!isPromiseLike(decision)) return;
    return Promise.resolve(decision).catch((error) => {
      if (this.pendingContinuation === pending) this.pendingContinuation = undefined;
      throw error;
    });
  }

  private enqueueContinuation(pending: PendingContinuation): void {
    if (!this.isCurrentContinuation(pending)) return;
    const message: ContextMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: pending.stepCapped ? GOAL_STEP_CAP_CONTINUATION_PROMPT : GOAL_CONTINUATION_PROMPT,
        },
      ],
      toolCalls: [],
      origin: {
        kind: 'system_trigger',
        name: 'goal_continuation',
        goalId: pending.goalId,
      },
    };
    const request = new MessageStepRequest(message, {
      kind: 'goal_continuation',
      admission: 'newTurn',
      turnIntent: {
        kind: 'goal_continuation',
        owner: 'goal',
        goalId: pending.goalId,
      },
    });
    pending.phase = 'enqueued';
    let receipt: EnqueueReceipt;
    try {
      receipt = this.loopService.enqueue(request);
    } catch (error) {
      if (this.pendingContinuation === pending) this.pendingContinuation = undefined;
      throw error;
    }
    pending.receipt = receipt;
    void receipt.assigned
      .then(({ turn }) => {
        if (!this.isCurrentContinuation(pending)) return;
        pending.turnId = turn.id;
        if (!this.goalDrivenTurns.has(turn.id)) {
          this.pendingContinuationGoals.set(turn.id, pending.goalId);
        }
        return turn.result;
      })
      .catch(() => undefined)
      .finally(() => {
        if (pending.turnId !== undefined) this.pendingContinuationGoals.delete(pending.turnId);
        if (this.pendingContinuation === pending) this.pendingContinuation = undefined;
      });
  }

  private decideContinuation(pending: PendingContinuation): void | Promise<void> {
    if (!this.isCurrentContinuation(pending)) return;
    const settle = (isHeld: boolean): void => {
      if (!this.isCurrentContinuation(pending)) return;
      if (isHeld) {
        this.markContinuationHeld(pending);
        return;
      }
      if (pending.retryRequested) {
        pending.retryRequested = false;
        this.scheduleContinuationDecision(pending);
        return;
      }
      this.enqueueContinuation(pending);
    };

    const result = this.holdContinuation(pending.goalId);
    if (isPromiseLike(result)) {
      return Promise.resolve(result as PromiseLike<boolean>).then(settle);
    }
    settle(result);
  }

  private scheduleContinuationDecision(pending: PendingContinuation): void {
    void Promise.resolve()
      .then(() => this.decideContinuation(pending))
      .catch((error) => this.failContinuationDecision(pending, error));
  }

  private failContinuationDecision(pending: PendingContinuation, error: unknown): void {
    if (this.pendingContinuation !== pending && pending.phase !== 'enqueued') return;
    if (this.pendingContinuation === pending) this.pendingContinuation = undefined;
    void this.settleGoalAfterContinuationFailure(error, pending.goalId);
  }

  private bindContinuationRetry(participant: GoalContinuationParticipantContribution): void {
    if (this.continuationRetrySubscriptions.has(participant)) return;
    const onDidRequestRetry = participant.onDidRequestRetry;
    if (onDidRequestRetry === undefined) return;
    const subscription = onDidRequestRetry((goalId) => {
      this.retryHeldContinuation(goalId);
    });
    this.continuationRetrySubscriptions.set(participant, subscription);
    this._register(subscription);
  }

  private retryHeldContinuation(goalId: string): void {
    const pending = this.pendingContinuation;
    if (pending?.goalId !== goalId) return;
    if (pending.phase === 'deciding') {
      pending.retryRequested = true;
      return;
    }
    if (pending.phase !== 'held') return;
    if (
      !this.isActiveGoal(goalId) ||
      this.goalState?.waitingFor !== undefined ||
      this.wire.isRestoring()
    ) {
      this.invalidateContinuation();
      return;
    }
    if (!this.isLoopReadyForContinuation()) return;

    pending.phase = 'deciding';
    pending.retryRequested = false;
    this.scheduleContinuationDecision(pending);
  }

  private markContinuationHeld(pending: PendingContinuation): void {
    pending.phase = 'held';
    if (pending.retryRequested) this.retryHeldContinuation(pending.goalId);
  }

  private holdContinuation(goalId: string, index = 0): boolean | Promise<boolean> {
    const record = this.continuationParticipants.records[index];
    if (record === undefined) return false;
    const result = record.value.decide(this.toContinuationInput(goalId));
    const resolve = (decision: GoalContinuationDecisionResult): boolean | Promise<boolean> => {
      if (decision.decision === 'abstain') return this.holdContinuation(goalId, index + 1);
      return decision.decision === 'hold';
    };
    return isPromiseLike(result)
      ? Promise.resolve(result as PromiseLike<GoalContinuationDecisionResult>).then(resolve)
      : resolve(result);
  }

  private toContinuationInput(goalId: string): GoalContinuationInput {
    const state = this.goalState;
    return {
      goalId,
      objective: state === null ? '' : state.objective,
      turnsUsed: state === null ? 0 : state.turnsUsed,
    };
  }

  private canLaunchContinuation(goalId?: string, generation?: number): boolean {
    const state = this.goalState;
    if (state?.status !== 'active' || state.waitingFor !== undefined) return false;
    if (goalId !== undefined && state.goalId !== goalId) return false;
    if (generation !== undefined && this.continuationGeneration !== generation) return false;
    if (this.wire.isRestoring()) return false;
    if (this.liveTurnId !== undefined || this.pendingContinuation !== undefined) return false;
    return this.isLoopReadyForContinuation();
  }

  private isLoopReadyForContinuation(): boolean {
    const status = this.loopService.status();
    return status.state === 'idle' && !status.hasPendingRequests;
  }

  private isCurrentContinuation(pending: PendingContinuation): boolean {
    return this.pendingContinuation === pending &&
      pending.generation === this.continuationGeneration &&
      this.isActiveGoal(pending.goalId) &&
      this.goalState?.waitingFor === undefined;
  }

  private isActiveGoal(goalId: string): boolean {
    const state = this.goalState;
    return state?.status === 'active' && state.goalId === goalId;
  }

  private isStaleGoalToolCall(ctx: BeforeToolExecuteEvent): boolean {
    const toolName = ctx.toolCall.name;
    if (!isGoalMutationTool(toolName)) return false;
    const goalId = this.goalTurnTarget(ctx.turnId);
    if (goalId === undefined) return false;
    return this.goalState?.goalId !== goalId;
  }

  private goalTurnTarget(turnId: number): string | undefined {
    return this.goalTurnTargets.get(turnId) ?? this.goalDrivenTurns.get(turnId);
  }

  private cancelPendingContinuation(
    preserveLiveContinuation = false,
    reason?: unknown,
  ): void {
    const pending = this.pendingContinuation;
    if (preserveLiveContinuation && pending?.turnId === this.liveTurnId) return;
    this.pendingContinuation = undefined;
    const cancellation = reason ?? abortError('Goal continuation cancelled');
    const aborted = pending?.receipt?.abort(cancellation) ?? false;
    if (pending !== undefined && !aborted && pending.turnId !== undefined) {
      this.loopService.cancel(pending.turnId, cancellation);
    }
  }

  private invalidateContinuation(
    preserveLiveContinuation = false,
    reason?: unknown,
  ): void {
    this.waitingWake = undefined;
    const pending = this.pendingContinuation;
    if (preserveLiveContinuation && pending?.turnId === this.liveTurnId) return;
    this.continuationGeneration += 1;
    this.cancelPendingContinuation(preserveLiveContinuation, reason);
  }

  private normalizeAfterReplay(): void {
    this.invalidateContinuation();
    this.appendForkClearedReminder();
    this.wallClockDeadline.clear();
    this.liveWallClockStartedAt = undefined;
    const state = this.goalState;
    if (state === null) return;
    if (state.status === 'complete') {
      this.clearInternal('runtime', { emit: false, track: false });
      return;
    }
    if (state.status !== 'active') return;
    if (state.waitingFor !== undefined) {
      const waitingFor = state.waitingFor;
      if (waitingFor.taskIds.some((taskId) => this.tasks.getTask(taskId) === undefined)) {
        this.applyLifecycle(
          state,
          'paused',
          GOAL_INVALID_WAIT_LEASE_PAUSE_REASON,
          'runtime',
        );
        return;
      }
      const taskId = waitingFor.taskIds[0];
      if (taskId !== undefined && this.isWaitSatisfied(waitingFor)) {
        this.handleTaskTerminated(taskId);
      }
      return;
    }

    const reason = 'Paused after agent resume';
    const mutation = this.newGoalMutation('update', state.goalId, 'paused');
    this.wire.dispatch(
      updateGoal({
        status: 'paused',
        reason,
        wallClockMs: this.settleWallClock(state),
        actor: 'runtime',
        mutation,
      }),
    );
    const paused = this.requireState();
    this.emitGoalUpdated(this.toSnapshot(paused), {
      kind: 'lifecycle',
      status: 'paused',
      reason,
      actor: 'runtime',
    }, mutation);
    this.trackStatusChanged(paused, 'runtime');
  }

  private appendForkClearedReminder(): void {
    if (!this.wire.getModel(GoalForkNoticeModel).reminderPending) return;
    this.reminders.appendSystemReminder(GOAL_FORK_CLEARED_REMINDER, {
      kind: 'injection',
      variant: GOAL_FORK_CLEARED_REMINDER_NAME,
    });
  }

  private clearInternal(
    actor: GoalActor,
    opts: { readonly emit?: boolean; readonly track?: boolean; readonly preserveLiveContinuation?: boolean } = {},
  ): void {
    const state = this.goalState;
    if (state === null) {
      this.invalidateContinuation();
      return;
    }
    const mutation = this.newGoalMutation('clear', state.goalId);
    this.resumeContinuation = undefined;
    this.invalidateContinuation(opts.preserveLiveContinuation === true);
    this.wallClockDeadline.clear();
    this.liveWallClockStartedAt = undefined;
    this.wire.dispatch(clearGoal({ goalId: state.goalId, mutation }));
    if (opts.emit !== false) this.emitGoalUpdated(null, undefined, mutation);
    if (opts.track !== false) this.telemetry.track2('goal_cleared', { actor });
  }

  private applyLifecycle(
    state: GoalState,
    status: GoalStatus,
    reason: string | undefined,
    actor: GoalActor,
    opts: {
      readonly preserveLiveContinuation?: boolean;
      readonly cancellationReason?: unknown;
    } = {},
  ): GoalSnapshot {
    const wallClockMs = this.settleWallClock(state);
    const wallClockResumedAt = status === 'active' ? Date.now() : undefined;
    if (status === 'active') {
      this.liveWallClockStartedAt = this.deadlineScheduler.now();
    } else if (state.status === 'active') {
      this.resumeContinuation = undefined;
      this.invalidateContinuation(
        opts.preserveLiveContinuation === true,
        opts.cancellationReason,
      );
      this.wallClockDeadline.clear();
      this.liveWallClockStartedAt = undefined;
    }
    const mutation = this.newGoalMutation('update', state.goalId, status);
    this.wire.dispatch(
      updateGoal({ status, reason, wallClockMs, wallClockResumedAt, actor, mutation }),
    );
    const next = this.requireState();
    if (status === 'active') this.adoptStarterTurn(actor);
    if (status === 'active') this.refreshWallClockDeadline(next);
    this.emitGoalUpdated(this.toSnapshot(next), { kind: 'lifecycle', status, reason, actor }, mutation);
    this.trackStatusChanged(next, actor);
    return this.toSnapshot(next);
  }

  private trackStatusChanged(state: GoalState, actor: GoalActor): void {
    this.telemetry.track2('goal_status_changed', {
      actor,
      status: state.status,
      turns_used: state.turnsUsed,
      tokens_used: state.tokensUsed,
      wall_clock_ms: this.liveWallClockMs(state),
      ...budgetTelemetryProperties(state.budgetLimits),
    });
  }

  private requireState(): GoalState {
    const state = this.goalState;
    if (state === null) {
      throw new Error2(ErrorCodes.GOAL_NOT_FOUND, 'No current goal');
    }
    return state;
  }

  private newGoalMutation(
    kind: GoalMutationRef['kind'],
    goalId: string,
    status?: GoalStatus,
  ): GoalMutationRef {
    return { id: randomUUID(), at: Date.now(), kind, goalId, status };
  }

  private emitGoalUpdated(
    snapshot: GoalSnapshot | null,
    change?: GoalChange,
    mutation?: GoalMutationRef,
  ): void {
    this.eventBus.publish({ type: 'goal.updated', snapshot, change, mutation });
  }

  private settleWallClock(state: GoalState): number {
    if (state.status === 'active' && this.liveWallClockStartedAt !== undefined) {
      return (
        state.wallClockMs +
        Math.max(0, this.deadlineScheduler.now() - this.liveWallClockStartedAt)
      );
    }
    if (state.status === 'active' && state.wallClockResumedAt !== undefined) {
      return state.wallClockMs + Math.max(0, Date.now() - state.wallClockResumedAt);
    }
    return state.wallClockMs;
  }

  private liveWallClockMs(state: GoalState): number {
    if (state.status === 'active' && this.liveWallClockStartedAt !== undefined) {
      return (
        state.wallClockMs +
        Math.max(0, this.deadlineScheduler.now() - this.liveWallClockStartedAt)
      );
    }
    if (state.status === 'active' && state.wallClockResumedAt !== undefined) {
      return state.wallClockMs + Math.max(0, Date.now() - state.wallClockResumedAt);
    }
    return state.wallClockMs;
  }

  private statsOf(state: GoalState): GoalChangeStats {
    return {
      turnsUsed: state.turnsUsed,
      tokensUsed: state.tokensUsed,
      wallClockMs: this.liveWallClockMs(state),
    };
  }

  private toSnapshot(state: GoalState): GoalSnapshot {
    const wallClockMs = this.liveWallClockMs(state);
    return {
      goalId: state.goalId,
      objective: state.objective,
      completionCriterion: state.completionCriterion,
      status: state.status,
      turnsUsed: state.turnsUsed,
      tokensUsed: state.tokensUsed,
      wallClockMs,
      budget: computeBudgetReport(state, wallClockMs),
      waitingFor: state.waitingFor,
      terminalReason: state.terminalReason,
    };
  }

  private blockIfBudgetReached(state: GoalState): GoalSnapshot | null {
    if (state.status !== 'active') return null;
    const reason = goalBudgetBlockReason(this.toSnapshot(state).budget);
    if (reason === undefined) return null;
    return this.applyLifecycle(state, 'blocked', reason, 'runtime', {
      preserveLiveContinuation: true,
    });
  }

  private refreshWallClockDeadline(state: GoalState): void {
    this.wallClockDeadline.clear();
    const budgetMs = state.budgetLimits.wallClockBudgetMs;
    if (
      state.status !== 'active' ||
      budgetMs === undefined ||
      this.liveWallClockStartedAt === undefined
    ) {
      return;
    }
    const remainingMs = Math.max(0, budgetMs - this.liveWallClockMs(state));
    this.wallClockDeadline.value = this.deadlineScheduler.schedule(remainingMs, () => {
      this.handleWallClockDeadline();
    });
  }

  private handleWallClockDeadline(): void {
    this.wallClockDeadline.clear();
    const state = this.goalState;
    if (state === null || state.status !== 'active') return;
    const budgetMs = state.budgetLimits.wallClockBudgetMs;
    if (budgetMs === undefined) return;
    if (this.liveWallClockMs(state) < budgetMs) {
      this.refreshWallClockDeadline(state);
      return;
    }
    const reason = goalBudgetBlockReason(this.toSnapshot(state).budget);
    if (reason === undefined) return;
    const cancellation = abortError(reason);
    const liveTurnId = this.liveTurnId;
    const pendingTurnId = this.pendingContinuation?.turnId;
    this.applyLifecycle(state, 'blocked', reason, 'runtime', {
      cancellationReason: cancellation,
    });
    if (liveTurnId !== undefined && liveTurnId !== pendingTurnId) {
      this.loopService.cancel(liveTurnId, cancellation);
    }
  }
}

function computeBudgetReport(state: GoalState, wallClockMs: number): GoalBudgetReport {
  const tokenBudget = state.budgetLimits.tokenBudget ?? null;
  const turnBudget = state.budgetLimits.turnBudget ?? null;
  const wallClockBudgetMs = state.budgetLimits.wallClockBudgetMs ?? null;

  const tokenBudgetReached = tokenBudget !== null && state.tokensUsed >= tokenBudget;
  const turnBudgetReached = turnBudget !== null && state.turnsUsed >= turnBudget;
  const wallClockBudgetReached = wallClockBudgetMs !== null && wallClockMs >= wallClockBudgetMs;

  return {
    tokenBudget,
    turnBudget,
    wallClockBudgetMs,
    remainingTokens: tokenBudget === null ? null : Math.max(0, tokenBudget - state.tokensUsed),
    remainingTurns: turnBudget === null ? null : Math.max(0, turnBudget - state.turnsUsed),
    remainingWallClockMs:
      wallClockBudgetMs === null ? null : Math.max(0, wallClockBudgetMs - wallClockMs),
    tokenBudgetReached,
    turnBudgetReached,
    wallClockBudgetReached,
    overBudget: tokenBudgetReached || turnBudgetReached || wallClockBudgetReached,
  };
}

function matchesGoal(state: GoalState, goalId: string | undefined): boolean {
  return goalId === undefined || state.goalId === goalId;
}

function isGoalMutationTool(toolName: string): boolean {
  return toolName === 'CreateGoal' || toolName === 'UpdateGoal' || toolName === 'SetGoalBudget';
}

function toGoalStartReviewPermissionMode(label: string | undefined): PermissionMode | undefined {
  if (label === 'auto' || label === 'yolo' || label === 'manual') return label;
  return undefined;
}

function goalBudgetBlockReason(budget: GoalBudgetReport): string | undefined {
  const reached: string[] = [];
  if (budget.turnBudgetReached) {
    reached.push(`turn budget ${budget.turnBudget ?? ''}`.trim());
  }
  if (budget.tokenBudgetReached) {
    reached.push(`token budget ${budget.tokenBudget ?? ''}`.trim());
  }
  if (budget.wallClockBudgetReached) {
    reached.push(`wall-clock budget ${budget.wallClockBudgetMs ?? ''}ms`.trim());
  }
  return reached.length === 0 ? undefined : `${GOAL_BUDGET_BLOCK_PREFIX}: ${reached.join(', ')}`;
}

function budgetTelemetryProperties(limits: GoalBudgetLimits): GoalBudgetProperties {
  return {
    has_token_budget: limits.tokenBudget !== undefined,
    has_turn_budget: limits.turnBudget !== undefined,
    has_wall_clock_budget: limits.wallClockBudgetMs !== undefined,
  };
}

function normalizeCompletionCriterion(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed?.length) return undefined;
  return trimmed.length > MAX_GOAL_COMPLETION_CRITERION_LENGTH
    ? trimmed.slice(0, MAX_GOAL_COMPLETION_CRITERION_LENGTH)
    : trimmed;
}

function hasStepBudgetRemaining(maxSteps: number | undefined, currentStep: number): boolean {
  return maxSteps === undefined || maxSteps <= 0 || currentStep < maxSteps;
}

function isTerminalUpdateGoalResult(
  toolName: string,
  args: unknown,
  result: ExecutableToolResult,
): boolean {
  if (toolName !== 'UpdateGoal' || result.isError === true || result.stopTurn !== true) {
    return false;
  }
  if (!isPlainRecord(args)) return false;
  const status = args['status'];
  return status === 'complete' || status === 'blocked';
}

function isMaxStepsTurnFailure(result: Pick<TurnEndedEvent, 'reason' | 'error'>): boolean {
  return (
    result.reason === 'failed' &&
    normalizeGoalErrorPayload(result.error).code === LoopErrors.codes.LOOP_MAX_STEPS_EXCEEDED
  );
}

function goalFailurePauseReason(error: unknown): string {
  const payload = normalizeGoalErrorPayload(error);
  switch (payload.code) {
    case ErrorCodes.PROVIDER_RATE_LIMIT:
      return GOAL_RATE_LIMIT_PAUSE_REASON;
    case ErrorCodes.PROVIDER_CONNECTION_ERROR:
      return pauseReasonWithMessage(GOAL_PROVIDER_CONNECTION_PAUSE_PREFIX, payload.message);
    case ErrorCodes.PROVIDER_AUTH_ERROR:
      return pauseReasonWithMessage(GOAL_PROVIDER_AUTH_PAUSE_PREFIX, payload.message);
    case ErrorCodes.PROVIDER_FILTERED:
      return GOAL_PROVIDER_FILTERED_PAUSE_REASON;
    case ErrorCodes.PROVIDER_API_ERROR:
      return pauseReasonWithMessage(GOAL_PROVIDER_API_PAUSE_PREFIX, payload.message);
    case ErrorCodes.MODEL_NOT_CONFIGURED:
      return pauseReasonWithMessage(GOAL_MODEL_CONFIG_PAUSE_PREFIX, LLM_NOT_SET_MESSAGE);
    case ErrorCodes.MODEL_CONFIG_INVALID:
      return pauseReasonWithMessage(GOAL_MODEL_CONFIG_PAUSE_PREFIX, payload.message);
    default:
      return pauseReasonWithMessage(GOAL_RUNTIME_PAUSE_PREFIX, payload.message);
  }
}

function normalizeGoalErrorPayload(error: unknown): KimiErrorPayload {
  const payload = toKimiErrorPayload(error);
  if (payload.code === ErrorCodes.MODEL_NOT_CONFIGURED) {
    return { ...payload, message: LLM_NOT_SET_MESSAGE };
  }
  return payload;
}

function pauseReasonWithMessage(prefix: string, message: string | undefined): string {
  const trimmed = message?.trim();
  return trimmed === undefined || trimmed.length === 0 ? prefix : `${prefix}: ${trimmed}`;
}

registerScopedService(
  LifecycleScope.Agent,
  IAgentGoalService,
  AgentGoalService,
  ScopeActivation.OnScopeCreated,
  'goal',
);
