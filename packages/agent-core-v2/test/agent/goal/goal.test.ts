/**
 * Scenario: goal lifecycle, durable wire records, continuation scheduling, and
 * the goal completion-guard / continuation-participant contribution seams,
 * including the AITP Research feature's real participant folded by
 * `AgentGoalService` through the Agent-scope collection.
 * Responsibilities: verify public goal commands, replayable state, one-turn
 * admission, and guard/participant folding (deny, multiple guards, hold).
 * Wiring: real goal/wire services; loop is stubbed only for focused scheduling cases.
 * Run: `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/agent/goal/goal.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isUserCancellation } from '#/_base/utils/abort';
import type { TurnEndedEvent } from '#/agent/loop/turnEvents';

import type { IDisposable } from '#/_base/di/lifecycle';
import { Emitter } from '#/_base/event';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { createDecorator } from '#/_base/di/instantiation';
import { Service } from '#/_base/di/service';
import { IAgentAgentsMdReminderService } from '#/agent/agentsMdReminder/agentsMdReminder';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IAgentStateService } from '#/agent/state/agentState';
import { AgentStateService } from '#/agent/state/agentStateService';
import { USER_PROMPT_ORIGIN } from '#/agent/contextMemory/types';
import { IAgentGoalService } from '#/agent/goal/goal';
import { IAgentTaskService } from '#/agent/task/task';
import {
  GoalCompletionGuardContribution,
  GoalContinuationParticipantContribution,
  type GoalCompletionGuardResult,
  type GoalContinuationDecisionResult,
} from '#/agent/goal/goalContribution';
import { IGoalDeadlineScheduler } from '#/agent/goal/goalDeadlineScheduler';
import { type AgentGoalService } from '#/agent/goal/goalService';
import { UpdateGoalToolInputSchema } from '#/agent/tools/goal/update-goal/update-goal';
import { UpdateGoalTool } from '#/agent/tools/goal/update-goal/updateGoalTool';
import {
  createMaxStepsExceededError,
  IAgentLoopService,
  type AfterStepContext,
  type EnqueueReceipt,
  type Step,
  type Turn,
} from '#/agent/loop/loop';
import { MessageStepRequest } from '#/agent/loop/stepRequest';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentSwarmService } from '#/features/swarm/agent/swarm';
import { IAgentPermissionModeService } from '#/agent/permissionMode/permissionMode';
import type { PermissionMode, PermissionPolicyResult } from '#/agent/permissionPolicy/types';
import { IAgentToolApprovalService } from '#/agent/toolApproval/toolApproval';
import { IAgentProfileService } from '#/agent/profile/profile';
import { IFlagService } from '#/app/flag/flag';
import { EventBusService } from '#/app/event/eventBusService';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { researchSetProgram } from '#/features/aitpResearch/aitpResearchOps';
import { AitpResearchErrors } from '#/features/aitpResearch/errors';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { ISessionAitpLifecycleCoordinator } from '#/features/aitpResearch/coordinator/sessionAitpLifecycleCoordinator';
import { IAgentPlanService } from '#/features/plan/plan';
import {
  IAgentToolExecutorService,
  type ToolExecutionResult,
} from '#/agent/toolExecutor/toolExecutor';
import type { ResolvedToolExecutionHookContext } from '#/agent/toolExecutor/toolHooks';
import { IAgentToolRegistryService } from '#/agent/toolRegistry/toolRegistry';
import { IAgentUsageService } from '#/agent/usage/usage';
import type { WireRecord } from '#/wire/record';
import { taskTerminated } from '#/agent/task/taskOps';
import { type DomainEvent, IEventBus } from '#/app/event/eventBus';
import { APIConnectionError, APIStatusError } from '#/kosong/contract/errors';
import type { ToolCall } from '#/kosong/contract/message';
import type { TokenUsage } from '#/kosong/contract/usage';
import { ErrorCodes, Error2, errorInfo, toKimiErrorPayload } from '#/errors';
import type { ExecutableTool, RunnableToolExecution } from '#/tool/toolContract';
import type { ToolInputDisplay } from '#/tool/toolInputDisplay';

import {
  InMemoryWireRecordPersistence,
  appService,
  agentService,
  createTestAgent as createHarnessTestAgent,
  permissionModeServices,
  sessionService,
  telemetryServices,
  wireRecordPersistenceServices,
  type TestAgentContext,
  type TestAgentOptions,
  type TestAgentServiceOverride,
} from '../../harness';
import { recordingTelemetry, type TelemetryRecord } from '../../app/telemetry/stubs';
import { stubLoopWithHooks, type StubLoop } from '../loop/stubs';
import { stubToolExecutorEvents, type ToolExecutorEventStubs } from '../toolExecutor/stubs';
import { stubAgentSwarm } from './stubs';

function createTestAgent(
  ...inputs: readonly (TestAgentServiceOverride | TestAgentOptions)[]
): TestAgentContext {
  return createHarnessTestAgent(agentService(IAgentSwarmService, stubAgentSwarm()), ...inputs);
}

const testAgent = createTestAgent;

type GoalServiceTestManager = IAgentGoalService & AgentGoalService;
type GoalRecord = WireRecord & { type: `goal.${string}` };
type AgentEvent = DomainEvent;
type GoalUpdatedEvent = Extract<AgentEvent, { type: 'goal.updated' }>;
type TurnEndedInput = {
  readonly reason: TurnEndedEvent['reason'];
  readonly error?: unknown;
};

interface ManualDeadline {
  readonly dueAt: number;
  readonly callback: () => void;
  cancelled: boolean;
}

class ManualGoalDeadlineScheduler implements IGoalDeadlineScheduler {
  declare readonly _serviceBrand: undefined;

  private currentTime = 0;
  private readonly deadlines = new Set<ManualDeadline>();

  now(): number {
    return this.currentTime;
  }

  schedule(delayMs: number, callback: () => void): IDisposable {
    const deadline: ManualDeadline = {
      dueAt: this.currentTime + Math.max(0, delayMs),
      callback,
      cancelled: false,
    };
    this.deadlines.add(deadline);
    return {
      dispose: () => {
        deadline.cancelled = true;
        this.deadlines.delete(deadline);
      },
    };
  }

  advanceBy(deltaMs: number): void {
    this.currentTime += deltaMs;
    while (true) {
      const due = [...this.deadlines]
        .filter((deadline) => !deadline.cancelled && deadline.dueAt <= this.currentTime)
        .toSorted((left, right) => left.dueAt - right.dueAt)[0];
      if (due === undefined) return;
      this.deadlines.delete(due);
      due.callback();
    }
  }
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function blockingGenerate(): {
  readonly generate: NonNullable<TestAgentOptions['generate']>;
  readonly started: Promise<void>;
  readonly signal: () => AbortSignal;
} {
  const started = deferred();
  let activeSignal: AbortSignal | undefined;
  const generate: NonNullable<TestAgentOptions['generate']> = async (
    _chat,
    _systemPrompt,
    _tools,
    _history,
    _callbacks,
    options,
  ) => {
    const signal = options?.signal;
    if (signal === undefined) throw new Error('Expected an LLM abort signal');
    options?.onRequestStart?.();
    activeSignal = signal;
    started.resolve();
    return waitForAbort(signal);
  };
  return {
    generate,
    started: started.promise,
    signal: () => {
      if (activeSignal === undefined) throw new Error('LLM request has not started');
      return activeSignal;
    },
  };
}

const zeroUsage: TokenUsage = {
  inputCacheRead: 0,
  inputCacheCreation: 0,
  inputOther: 0,
  output: 0,
};

function goalRecords(records: readonly WireRecord[]): readonly GoalRecord[] {
  return records.filter((record): record is GoalRecord => record.type.startsWith('goal.'));
}

async function restoreGoalRecords(
  ctx: TestAgentContext,
  goals: IAgentGoalService,
  records: readonly WireRecord[],
): Promise<void> {
  goals.getGoal();
  await ctx.restore(records as readonly WireRecord[]);
}

function makeTurn(id: number): Turn {
  return {
    id,
    signal: new AbortController().signal,
    ready: Promise.resolve(),
    result: Promise.resolve({ type: 'completed', steps: 0, truncated: false }),
    cancel: () => true,
  };
}

async function runGoalStep(loopService: StubLoop, turn: Turn): Promise<boolean> {
  const step = {
    turnId: turn.id,
    step: 1,
    firstStepOfTurn: true,
    signal: turn.signal,
  };
  const afterStep: AfterStepContext = {
    turnId: turn.id,
    step: 1,
    firstStepOfTurn: true,
    signal: turn.signal,
    usage: zeroUsage,
    finishReason: 'completed' as const,
    stopTurn: false,
  };
  await loopService.hooks.onWillBeginStep.run(step);
  await loopService.hooks.onDidFinishStep.run(afterStep);
  return loopService.queue.takeNextBatch() !== undefined;
}

function recordStepUsage(
  usageService: IAgentUsageService,
  goals: IAgentGoalService,
  turn: Turn,
  usage: TokenUsage,
): boolean {
  usageService.record('mock-model', usage, { type: 'turn', turnId: turn.id, step: 1 });
  return goals.getGoal().goal?.budget.overBudget === true;
}

async function runTerminalUpdateGoalResult(
  toolExecutor: IAgentToolExecutorService,
  turn: Turn,
  status: 'complete' | 'blocked',
  output: string,
): Promise<void> {
  const toolCall: ToolCall = {
    type: 'function',
    id: 'call_update_goal',
    name: 'UpdateGoal',
    arguments: JSON.stringify({ status }),
  };
  await toolExecutor.hooks.onDidExecuteTool.run({
    turnId: turn.id,
    signal: turn.signal,
    toolCall,
    toolCalls: [toolCall],
    args: { status },
    outcome: 'executed',
    result: { output, stopTurn: true },
  });
}

async function executeToolCall(
  toolExecutor: IAgentToolExecutorService,
  turn: Turn,
  toolCall: ToolCall,
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];
  for await (const result of toolExecutor.execute([toolCall], {
    turnId: turn.id,
    signal: turn.signal,
  })) {
    results.push(result);
  }
  return results;
}

function endTurn(
  eventBus: IEventBus,
  turn: Turn,
  result: TurnEndedInput = { reason: 'completed' },
): void {
  const error = result.error !== undefined ? toKimiErrorPayload(result.error) : undefined;
  eventBus.publish({
    type: 'turn.ended',
    turnId: turn.id,
    reason: result.reason,
    error,
    durationMs: 0,
  });
}

describe('AgentGoalService', () => {
  let ctx: TestAgentContext;
  let context: IAgentContextMemoryService;
  let goals: GoalServiceTestManager;
  let records: WireRecord[];
  let events: GoalUpdatedEvent[];
  let telemetry: TelemetryRecord[];

  beforeEach(() => {
    const persistence = new InMemoryWireRecordPersistence();
    telemetry = [];
    events = [];
    ctx = createTestAgent(
      wireRecordPersistenceServices(persistence),
      telemetryServices(recordingTelemetry(telemetry)),
    );
    context = ctx.get(IAgentContextMemoryService);
    goals = ctx.get(IAgentGoalService) as GoalServiceTestManager;
    records = persistence.records;
    const eventBus = ctx.get(IEventBus);
    eventBus.subscribe((event) => {
      if (event.type === 'goal.updated') events.push(event);
    });
  });

  afterEach(async () => {
    try {
      await ctx.expectResumeMatches();
    } finally {
      await ctx.dispose();
    }
  });

  describe('AgentGoalService creation', () => {
    it('creates a goal and exposes it through getGoal', async () => {
      const snapshot = await goals.createGoal({ objective: 'Ship feature X' });

      expect(snapshot.objective).toBe('Ship feature X');
      expect(snapshot.status).toBe('active');
      expect(goals.getGoal().goal?.goalId).toBe(snapshot.goalId);
    });

    it('stores a completion criterion when provided', async () => {
      const snapshot = await goals.createGoal({
        objective: 'Ship feature X',
        completionCriterion: ' tests pass ',
      });

      expect(snapshot.completionCriterion).toBe('tests pass');
      expect(goals.getGoal().goal?.completionCriterion).toBe('tests pass');
    });

    it('truncates an over-long completion criterion instead of failing', async () => {
      const snapshot = await goals.createGoal({
        objective: 'Ship feature X',
        completionCriterion: 'c'.repeat(4001),
      });

      expect(snapshot.completionCriterion).toBe('c'.repeat(4000));
      expect(goals.getGoal().goal?.completionCriterion).toBe('c'.repeat(4000));
    });

    it('sets no default work caps when none is provided', async () => {
      const snapshot = await goals.createGoal({ objective: 'Do work' });

      expect(snapshot.budget.turnBudget).toBeNull();
      expect(snapshot.budget.tokenBudget).toBeNull();
      expect(snapshot.budget.wallClockBudgetMs).toBeNull();
      expect(snapshot.budget.overBudget).toBe(false);
    });

    it('rejects empty and too-long objectives', async () => {
      await expect(goals.createGoal({ objective: '   ' })).rejects.toMatchObject({
        code: ErrorCodes.GOAL_OBJECTIVE_EMPTY,
      });
      await expect(goals.createGoal({ objective: 'x'.repeat(4001) })).rejects.toMatchObject({
        code: ErrorCodes.GOAL_OBJECTIVE_TOO_LONG,
      });
    });

    it('rejects duplicate active, paused, and blocked goals without replace', async () => {
      await goals.createGoal({ objective: 'first' });
      await expect(goals.createGoal({ objective: 'second' })).rejects.toMatchObject({
        code: ErrorCodes.GOAL_ALREADY_EXISTS,
      });
      await goals.pauseGoal();
      await expect(goals.createGoal({ objective: 'second' })).rejects.toMatchObject({
        code: ErrorCodes.GOAL_ALREADY_EXISTS,
      });
      await goals.resumeGoal();
      await goals.markBlocked({ reason: 'stuck' });
      await expect(goals.createGoal({ objective: 'second' })).rejects.toMatchObject({
        code: ErrorCodes.GOAL_ALREADY_EXISTS,
      });
    });

    it('replaces an existing goal when replace is set', async () => {
      const first = await goals.createGoal({ objective: 'first' });
      const second = await goals.createGoal({ objective: 'second', replace: true });
      await ctx.wire.flush();

      expect(second.goalId).not.toBe(first.goalId);
      expect(goals.getGoal().goal?.objective).toBe('second');
      expect(goalRecords(records).map((record) => record.type)).toEqual([
        'goal.create',
        'goal.clear',
        'goal.create',
      ]);
    });

    it('cancels with dispatcher-style empty input', async () => {
      await goals.createGoal({ objective: 'work' });
      const removed = await goals.cancelGoal({});
      expect(removed.status).toBe('active');
      expect(goals.getGoal().goal).toBeNull();
    });
  });

  describe('AgentGoalService lifecycle', () => {
    it('emits typed lifecycle and completion changes', async () => {
      await goals.createGoal({ objective: 'work', completionCriterion: 'tests pass' });
      expect(events.at(-1)?.change).toBeUndefined();

      await goals.pauseGoal();
      expect(events.at(-1)?.change).toMatchObject({ kind: 'lifecycle', status: 'paused' });

      await goals.resumeGoal();
      expect(events.at(-1)?.change).toMatchObject({ kind: 'lifecycle', status: 'active' });

      await goals.markComplete({ reason: 'done' }, 'model');
      const completion = events.find((event) => event.change?.kind === 'completion')?.change;
      expect(completion).toMatchObject({ kind: 'completion', status: 'complete', reason: 'done' });
      expect(goals.getGoal().goal).toBeNull();
      expect(events.at(-1)?.snapshot).toBeNull();
    });

    it('keeps blocked goals resumable', async () => {
      await goals.createGoal({ objective: 'work', completionCriterion: 'tests pass' });
      const blocked = await goals.markBlocked({ reason: 'need creds' });
      expect(blocked?.status).toBe('blocked');
      expect(blocked?.terminalReason).toBe('need creds');

      const resumed = await goals.resumeGoal();
      expect(resumed.status).toBe('active');
      expect(resumed.terminalReason).toBeUndefined();
    });

    it('continues a resumed blocked goal after its first completed turn', async () => {
      ctx.configure({ tools: ['UpdateGoal'] });
      ctx.mockNextResponse({ type: 'text', text: 'Made progress.' });
      ctx.mockNextResponse({
        type: 'function',
        id: 'complete-after-resume',
        name: 'UpdateGoal',
        arguments: JSON.stringify({ status: 'complete' }),
      });
      ctx.mockNextResponse({ type: 'text', text: 'Goal completed.' });
      const endedTurnIds: number[] = [];
      const endedTurnReasons: string[] = [];
      const continuationTurnIds: number[] = [];
      const eventBus = ctx.get(IEventBus);
      eventBus.subscribe('turn.ended', (event) => {
        endedTurnIds.push(event.turnId);
        endedTurnReasons.push(event.reason);
      });
      eventBus.subscribe('turn.started', (event) => {
        if (
          event.origin.kind === 'system_trigger' &&
          event.origin.name === 'goal_continuation'
        ) {
          continuationTurnIds.push(event.turnId);
        }
      });

      await goals.createGoal({ objective: 'finish the task' });
      await goals.markBlocked({ reason: 'need credentials' });
      const [resumed, repeated] = await Promise.all([
        goals.resumeGoal({ continueIfBlocked: true }),
        goals.resumeGoal({ continueIfBlocked: true }),
      ]);

      expect(resumed.status).toBe('active');
      expect(repeated.status).toBe('active');
      await vi.waitFor(() => {
        expect(endedTurnIds).toHaveLength(2);
      });
      expect(ctx.llmCalls).toHaveLength(3);
      expect(continuationTurnIds).toEqual(endedTurnIds);
      expect(endedTurnReasons).toEqual(['completed', 'completed']);
      expect(goals.getGoal().goal).toBeNull();
    });

    it('pauseOnInterrupt parks active goals and no-ops for stopped goals', async () => {
      await goals.createGoal({ objective: 'work', completionCriterion: 'tests pass' });
      const paused = await goals.pauseOnInterrupt({ reason: 'Paused after interruption' });
      expect(paused?.status).toBe('paused');
      expect(paused?.terminalReason).toBe('Paused after interruption');

      expect(await goals.pauseOnInterrupt({ reason: 'again' })).toBeNull();
      expect(goals.getGoal().goal?.status).toBe('paused');
    });

    it('cancelGoal discards the goal and throws when missing', async () => {
      await goals.createGoal({ objective: 'work' });
      const removed = await goals.cancelGoal();
      expect(removed.status).toBe('active');
      expect(goals.getGoal()).toEqual({ goal: null });
      const reminder = context.get().at(-1);
      expect(reminder?.origin).toEqual({
        kind: 'injection',
        variant: 'goal_cancelled',
      });
      expect(JSON.stringify(reminder?.content)).toContain('Ignore earlier active-goal reminders');
      await expect(goals.cancelGoal()).rejects.toMatchObject({ code: ErrorCodes.GOAL_NOT_FOUND });
    });

    it('forbids model-driven goal pauses', async () => {
      await goals.createGoal({ objective: 'work' });
      const tool = new UpdateGoalTool(goals);

      for (const status of ['active', 'complete', 'blocked']) {
        expect(UpdateGoalToolInputSchema.safeParse({ status }).success).toBe(true);
      }
      for (const status of ['paused', 'impossible', 'cancelled', '']) {
        expect(UpdateGoalToolInputSchema.safeParse({ status }).success).toBe(false);
      }

      const execution = tool.resolveExecution({ status: 'paused' } as never);
      expect(execution).toMatchObject({
        isError: true,
        output: 'Invalid goal status. Use `active`, `complete`, or `blocked`.',
      });
      expect(goals.getGoal().goal?.status).toBe('active');
    });
  });

  describe('AgentGoalService accounting and budgets', () => {
    it.each(
      (['paused', 'blocked'] as const).flatMap((status) =>
        (['turn', 'token', 'wall-clock'] as const).flatMap((budget) =>
          [
            { actor: 'model' as const, input: {}, continuation: false },
            { actor: 'user' as const, input: {}, continuation: false },
            {
              actor: 'user' as const,
              input: { continueIfPaused: true, continueIfBlocked: true },
              continuation: true,
            },
          ].map((resume) => ({ status, budget, ...resume })),
        ),
      ),
    )(
      'preflights exhausted $budget budget before $actor resumes $status (continuation=$continuation)',
      async ({ status, budget, actor, input }) => {
        const budgetLimits = budget === 'turn'
          ? { turnBudget: 1 }
          : budget === 'token'
            ? { tokenBudget: 100 }
            : { wallClockBudgetMs: 600_000 };
        await restoreGoalRecords(ctx, goals, [
          { type: 'goal.create', goalId: 'recovery-goal', objective: 'finish bounded work' },
          {
            type: 'goal.update',
            status,
            reason: 'Interrupted before recovery',
            turnsUsed: 1,
            tokensUsed: 100,
            wallClockMs: 3_983_870,
            budgetLimits,
          },
        ]);
        const before = goals.getGoal().goal!;
        const eventOffset = events.length;

        const resumed = await goals.resumeGoal(input, actor);

        expect(resumed).toMatchObject({
          status: 'blocked',
          turnsUsed: before.turnsUsed,
          tokensUsed: before.tokensUsed,
          wallClockMs: before.wallClockMs,
          budget: before.budget,
          continuation: { state: 'idle' },
        });
        if (status === 'blocked') {
          expect(resumed.terminalReason).toBe(before.terminalReason);
        } else {
          expect(resumed.terminalReason).toMatch(/^Blocked after goal budget reached:/);
        }
        expect(events.slice(eventOffset).some((event) => event.snapshot?.status === 'active')).toBe(false);
        const repeatOffset = records.length;
        expect(await goals.resumeGoal(input, actor)).toEqual(resumed);
        expect(goalRecords(records.slice(repeatOffset))).toEqual([]);
      },
    );

    it('counts tokens and turns only while active', async () => {
      await goals.createGoal({ objective: 'work' });
      await goals.recordTokenUsage(30);
      await goals.incrementTurn();
      expect(goals.getGoal().goal).toMatchObject({ tokensUsed: 30, turnsUsed: 1 });

      await goals.pauseGoal();
      await goals.recordTokenUsage(12);
      await goals.incrementTurn();
      expect(goals.getGoal().goal).toMatchObject({ tokensUsed: 30, turnsUsed: 1 });
    });

    it('publishes token accounting updates once while active', async () => {
      await goals.createGoal({ objective: 'work' });
      events.length = 0;

      await goals.recordTokenUsage(30);

      expect(events).toHaveLength(1);
      expect(events[0]?.snapshot).toMatchObject({ status: 'active', tokensUsed: 30 });
      await goals.pauseGoal();
      events.length = 0;
      await goals.recordTokenUsage(12);
      expect(events).toHaveLength(0);
    });

    it('sets budget limits through SetGoalBudget-style updates', async () => {
      await goals.createGoal({ objective: 'work' });
      const snapshot = await goals.setBudgetLimits(
        {
          budgetLimits: { tokenBudget: 100, turnBudget: 2, wallClockBudgetMs: 1000 },
        },
        'model',
      );

      expect(snapshot.budget.tokenBudget).toBe(100);
      expect(snapshot.budget.turnBudget).toBe(2);
      expect(snapshot.budget.wallClockBudgetMs).toBe(1000);
    });

    it('blocks when a token budget is reached', async () => {
      await goals.createGoal({ objective: 'work' });
      await goals.setBudgetLimits({ budgetLimits: { tokenBudget: 10 } }, 'model');
      events.length = 0;

      const snapshot = await goals.recordTokenUsage(10);

      expect(events.map((event) => event.snapshot?.status)).toEqual(['active', 'blocked']);
      expect(events[0]?.snapshot).toMatchObject({ tokensUsed: 10 });
      expect(snapshot).toMatchObject({
        status: 'blocked',
        tokensUsed: 10,
        terminalReason: 'Blocked after goal budget reached: token budget 10',
      });
      expect(goals.getGoal().goal).toMatchObject({
        status: 'blocked',
        budget: {
          tokenBudgetReached: true,
          overBudget: true,
        },
      });
    });

    it('blocks when a newly set budget is already exhausted', async () => {
      await goals.createGoal({ objective: 'work' });
      await goals.incrementTurn();

      const snapshot = await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');

      expect(snapshot).toMatchObject({
        status: 'blocked',
        terminalReason: 'Blocked after goal budget reached: turn budget 1',
      });
    });

    it('tracks telemetry without goal text', async () => {
      await goals.createGoal({ objective: 'private objective', replace: true });
      await goals.setBudgetLimits({ budgetLimits: { tokenBudget: 100 } }, 'model');
      await goals.incrementTurn();
      await goals.pauseGoal({ reason: 'private pause reason' });
      await goals.resumeGoal();
      await goals.markComplete({ reason: 'private completion reason' }, 'model');

      expect(telemetry.map((record) => record.event)).toEqual([
        'goal_created',
        'goal_budget_set',
        'goal_continued',
        'goal_status_changed',
        'goal_status_changed',
        'goal_status_changed',
        'goal_cleared',
      ]);
      expect(telemetry[0]?.properties).toEqual({ agent_id: 'main', actor: 'user', replace: true });
      expect(telemetry[1]?.properties).toMatchObject({ actor: 'model', has_token_budget: true });
      expect(telemetry[3]?.properties).toMatchObject({ status: 'paused', actor: 'user' });
      expect(JSON.stringify(telemetry)).not.toContain('private objective');
      expect(JSON.stringify(telemetry)).not.toContain('private pause reason');
      expect(JSON.stringify(telemetry)).not.toContain('private completion reason');
    });
  });

  describe('AgentGoalService records', () => {
    it('records only replay-relevant create/update/clear fields', async () => {
      await goals.createGoal({ objective: 'work', completionCriterion: 'tests pass' });
      await goals.recordTokenUsage(5);
      await goals.incrementTurn();
      await goals.setBudgetLimits({ budgetLimits: { turnBudget: 2 } }, 'model');
      await goals.markBlocked({ reason: 'stuck' });
      await goals.resumeGoal();
      await goals.cancelGoal();
      await ctx.wire.flush();

      const recordsWithoutMetadata = goalRecords(records);
      expect(recordsWithoutMetadata).toEqual([
        expect.objectContaining({
          type: 'goal.create',
          goalId: expect.any(String),
          objective: 'work',
          completionCriterion: 'tests pass',
          wallClockResumedAt: expect.any(Number),
        }),
        expect.objectContaining({ type: 'goal.update', tokensUsed: 5 }),
        expect.objectContaining({ type: 'goal.update', turnsUsed: 1 }),
        expect.objectContaining({
          type: 'goal.update',
          budgetLimits: { turnBudget: 2 },
        }),
        expect.objectContaining({
          type: 'goal.update',
          status: 'blocked',
          reason: 'stuck',
          actor: 'runtime',
        }),
        expect.objectContaining({
          type: 'goal.update',
          status: 'active',
          wallClockResumedAt: expect.any(Number),
          actor: 'user',
        }),
        expect.objectContaining({ type: 'goal.clear' }),
      ]);
      expect(recordsWithoutMetadata[0]).not.toHaveProperty('actor');
      expect(recordsWithoutMetadata[0]).not.toHaveProperty('budgetLimits');
      expect(recordsWithoutMetadata[1]).not.toHaveProperty('goalId');
      expect(recordsWithoutMetadata[1]).not.toHaveProperty('status');
      // The clear record carries the goal identity anchoring its stable
      // mutation; free-floating audit fields stay out.
      expect(recordsWithoutMetadata.at(-1)).toMatchObject({ goalId: expect.any(String) });
      expect(recordsWithoutMetadata.at(-1)).not.toHaveProperty('reason');
    });

    it('shares one stable mutation between each wire record and its live event', async () => {
      const created = await goals.createGoal({ objective: 'work' });
      await goals.pauseGoal({ reason: 'break' });
      await goals.cancelGoal();
      await ctx.wire.flush();

      const goalOps = goalRecords(records);
      expect(goalOps.map((record) => record.type)).toEqual([
        'goal.create',
        'goal.update',
        'goal.clear',
      ]);
      expect(events).toHaveLength(3);

      // One mutation ref is minted per lifecycle call and lands on both the
      // persisted record and the live `goal.updated` event, so the cold fold
      // and the live projector derive the same marker id from either source.
      const [createRecord, updateRecord, clearRecord] = goalOps;
      const [createEvent, updateEvent, clearEvent] = events;
      expect(createRecord?.['mutation']).toEqual(createEvent?.mutation);
      expect(updateRecord?.['mutation']).toEqual(updateEvent?.mutation);
      expect(clearRecord?.['mutation']).toEqual(clearEvent?.mutation);

      expect(createEvent?.mutation).toMatchObject({
        kind: 'create',
        goalId: created.goalId,
        status: 'active',
      });
      expect(updateEvent?.mutation).toMatchObject({
        kind: 'update',
        goalId: created.goalId,
        status: 'paused',
      });
      expect(clearEvent?.mutation).toMatchObject({ kind: 'clear', goalId: created.goalId });
      const mutationIds = events.map((event) => event.mutation?.id);
      expect(new Set(mutationIds).size).toBe(3);
    });

    it('restores state from patch records', async () => {
      await restoreGoalRecords(ctx, goals, [
        {
          type: 'goal.create',
          goalId: 'g1',
          objective: 'work',
          completionCriterion: 'tests pass',
          time: Date.parse('2026-01-01T00:00:00.000Z'),
        },
        { type: 'goal.update', tokensUsed: 5 },
        { type: 'goal.update', turnsUsed: 1 },
        { type: 'goal.update', budgetLimits: { turnBudget: 2 } },
        { type: 'goal.update', status: 'blocked', reason: 'stuck' },
      ]);

      expect(goals.getGoal().goal).toMatchObject({
        objective: 'work',
        completionCriterion: 'tests pass',
        status: 'blocked',
        terminalReason: 'stuck',
        tokensUsed: 5,
        turnsUsed: 1,
      });
      expect(goals.getGoal().goal?.budget.turnBudget).toBe(2);
    });



    it('normalizes active replayed goals to paused', async () => {
      records.length = 0;
      events.length = 0;
      await restoreGoalRecords(ctx, goals, [
        {
          type: 'goal.create',
          goalId: 'g1',
          objective: 'resume me',
        },
      ]);

      expect(goals.getGoal().goal).toMatchObject({
        status: 'paused',
        terminalReason: 'Paused after agent resume',
      });
      expect(goalRecords(records).filter((record) => record.type === 'goal.update')).toEqual([
        expect.objectContaining({
          type: 'goal.update',
          status: 'paused',
          reason: 'Paused after agent resume',
        }),
      ]);
      expect(events).toEqual([
        expect.objectContaining({
          snapshot: expect.objectContaining({ status: 'paused' }),
          change: expect.objectContaining({
            kind: 'lifecycle',
            status: 'paused',
            reason: 'Paused after agent resume',
            actor: 'runtime',
          }),
        }),
      ]);
    });
  });
});

describe('AgentGoalService goal-start review', () => {
  interface ApprovalCall {
    readonly result: Extract<PermissionPolicyResult, { kind: 'ask' }>;
    readonly origin: string;
  }

  const goalStartDisplay: ToolInputDisplay = {
    kind: 'goal_start',
    objective: 'Ship feature X',
    completionCriterion: undefined,
    mode: 'manual',
  };

  let ctx: TestAgentContext | undefined;
  let executorEvents: ToolExecutorEventStubs;
  let approvalCalls: ApprovalCall[];

  function approvalStub(): IAgentToolApprovalService {
    return {
      _serviceBrand: undefined,
      resolvePermissionResolution: async () => undefined,
      requestToolApproval: async (_context, result, origin) => {
        approvalCalls.push({ result, origin });
        return undefined;
      },
      formatDenyMessage: (message) => message,
      formatApprovalRejectionMessage: () => 'rejected',
    };
  }

  function setup(mode: PermissionMode): void {
    approvalCalls = [];
    executorEvents = stubToolExecutorEvents();
    ctx = createTestAgent(
      permissionModeServices(mode),
      agentService(IAgentToolApprovalService, approvalStub()),
      agentService(IAgentToolExecutorService, executorEvents.executor),
    );
    ctx.get(IAgentGoalService);
  }

  afterEach(async () => {
    await ctx?.dispose();
  });

  function createGoalHookContext(display: ToolInputDisplay | undefined): ResolvedToolExecutionHookContext {
    const toolCall: ToolCall = {
      type: 'function',
      id: 'call_create_goal',
      name: 'CreateGoal',
      arguments: JSON.stringify({ objective: 'Ship feature X' }),
    };
    const execution: RunnableToolExecution = {
      description: 'Creating a goal',
      display,
      approvalRule: 'CreateGoal',
      execute: async () => ({ output: '' }),
    };
    return {
      turnId: 1,
      signal: new AbortController().signal,
      toolCall,
      toolCalls: [toolCall],
      args: { objective: 'Ship feature X' },
      execution,
    };
  }

  it('routes a goal_start CreateGoal through toolApproval and applies the mode switch', async () => {
    setup('manual');
    const hookCtx = createGoalHookContext(goalStartDisplay);

    const decision = await executorEvents.fireBeforeExecute(hookCtx);

    expect(approvalCalls).toHaveLength(1);
    expect(approvalCalls[0]!.origin).toBe('goal-start-review-ask');
    expect(approvalCalls[0]!.result.kind).toBe('ask');
    expect(decision).toBeUndefined();

    const resolved = approvalCalls[0]!.result.resolveApproval?.({
      decision: 'approved',
      selectedLabel: 'yolo',
    });
    expect(resolved).toBeUndefined();
    expect(ctx!.get(IAgentPermissionModeService).mode).toBe('yolo');
  });

  it('does not review CreateGoal in auto mode', async () => {
    setup('auto');
    const hookCtx = createGoalHookContext(goalStartDisplay);

    const decision = await executorEvents.fireBeforeExecute(hookCtx);

    expect(approvalCalls).toHaveLength(0);
    expect(decision).toBeUndefined();
  });

  it('does not review CreateGoal without a goal_start display', async () => {
    setup('manual');
    const hookCtx = createGoalHookContext({ kind: 'generic', summary: 'Creating a goal' });

    const decision = await executorEvents.fireBeforeExecute(hookCtx);

    expect(approvalCalls).toHaveLength(0);
    expect(decision).toBeUndefined();
  });
});

describe('AgentGoalService core workflow hooks', () => {
  let ctx: TestAgentContext | undefined;
  let context: IAgentContextMemoryService;
  let goals: IAgentGoalService;
  let loopService: StubLoop;
  let toolExecutor: IAgentToolExecutorService;
  let usageService: IAgentUsageService;
  let eventBus: IEventBus;
  let clock: ManualGoalDeadlineScheduler;

  beforeEach(() => {
    loopService = stubLoopWithHooks();
    clock = new ManualGoalDeadlineScheduler();
    ctx = createTestAgent(
      appService(IGoalDeadlineScheduler, clock),
      agentService(IAgentLoopService, loopService),
      permissionModeServices('auto'),
    );
    context = ctx.get(IAgentContextMemoryService);
    goals = ctx.get(IAgentGoalService);
    toolExecutor = ctx.get(IAgentToolExecutorService);
    usageService = ctx.get(IAgentUsageService);
    eventBus = ctx.get(IEventBus);
  });

  afterEach(async () => {
    await ctx?.dispose();
  });

  async function startLiveContinuation(
    abortResult = true,
  ): Promise<ReturnType<typeof vi.fn<() => boolean>>> {
    const abort = vi.fn<() => boolean>(() => abortResult);
    const turn: Turn = { ...makeTurn(41), result: new Promise<never>(() => {}) };
    const step: Step = {
      id: 'goal-continuation',
      turnId: turn.id,
      state: 'queued',
      signal: turn.signal,
      result: Promise.resolve({ type: 'completed' }),
      cancel: () => true,
    };
    const receipt: EnqueueReceipt = { assigned: Promise.resolve({ turn, step }), abort };
    vi.spyOn(loopService, 'enqueue').mockReturnValue(receipt);

    await goals.createGoal({ objective: 'finish the task' });
    await goals.markBlocked({ reason: 'need credentials' });
    await goals.resumeGoal({ continueIfBlocked: true });
    await Promise.resolve();
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    return abort;
  }

  it('starts a continuation when a user resumes an idle blocked goal', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.markBlocked({ reason: 'need credentials' });

    const resumed = await goals.resumeGoal({ continueIfBlocked: true });

    expect(resumed.status).toBe('active');
    expect(loopService.launches).toHaveLength(1);
    expect(loopService.drainNextBatch(context)).toBeDefined();
    expect(context.get().at(-1)?.origin).toMatchObject({
      kind: 'system_trigger',
      name: 'goal_continuation',
      goalId: expect.any(String),
    });
  });

  it.each([{ status: 'paused' as const }, { status: 'blocked' as const }])(
    'queues a continuation when a live non-goal turn resumes a $status goal',
    async ({ status }) => {
      await goals.createGoal({ objective: 'finish the task' });
      if (status === 'paused') {
        await goals.pauseGoal();
      } else {
        await goals.markBlocked({ reason: 'need credentials' });
      }
      const turn = makeTurn(49);
      eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
      await loopService.hooks.onWillBeginStep.run({
        turnId: turn.id,
        step: 1,
        firstStepOfTurn: true,
        signal: turn.signal,
      });

      await goals.resumeGoal();
      endTurn(eventBus, turn);

      await vi.waitFor(() => {
        expect(loopService.launches).toHaveLength(1);
      });
      expect(loopService.drainNextBatch(context)).toBeDefined();
      expect(context.get().at(-1)?.origin).toMatchObject({
        kind: 'system_trigger',
        name: 'goal_continuation',
        goalId: expect.any(String),
      });
    },
  );

  it('records a live non-goal turn against the paused goal it resumes', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.pauseGoal();
    const turn = makeTurn(50);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });

    await goals.resumeGoal();
    recordStepUsage(usageService, goals, turn, { ...zeroUsage, output: 5 });
    endTurn(eventBus, turn);

    expect(goals.getGoal().goal).toMatchObject({
      status: 'active',
      turnsUsed: 1,
      tokensUsed: 5,
    });
  });

  it('aborts a live continuation when the user pauses the goal', async () => {
    const abort = await startLiveContinuation();

    await goals.pauseGoal();

    expect(abort).toHaveBeenCalledOnce();
  });

  it('aborts a live continuation when the user cancels the goal', async () => {
    const abort = await startLiveContinuation();

    await goals.cancelGoal();

    expect(abort).toHaveBeenCalledOnce();
  });

  it('aborts a live continuation when the user replaces the goal', async () => {
    const abort = await startLiveContinuation();

    await goals.createGoal({ objective: 'new task', replace: true });

    expect(abort).toHaveBeenCalledOnce();
  });

  it('queues a continuation for a replacement goal created by its current goal turn', async () => {
    await goals.createGoal({ objective: 'old task' });
    const turn = makeTurn(47);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    const toolCall: ToolCall = {
      type: 'function',
      id: 'call_replace_goal',
      name: 'CreateGoal',
      arguments: JSON.stringify({ objective: 'new task', replace: true }),
    };
    const results = await executeToolCall(toolExecutor, turn, toolCall);
    expect(results[0]?.result.isError).not.toBe(true);

    endTurn(eventBus, turn);

    await vi.waitFor(() => {
      expect(loopService.launches).toHaveLength(1);
    });
    expect(goals.getGoal().goal).toMatchObject({ objective: 'new task', status: 'active' });
    expect(loopService.drainNextBatch(context)).toBeDefined();
    expect(context.get().at(-1)?.origin).toMatchObject({
      kind: 'system_trigger',
      name: 'goal_continuation',
      goalId: expect.any(String),
    });
  });

  it('does not charge a same-turn replacement goal for usage owned by the prior goal', async () => {
    await goals.createGoal({ objective: 'old task' });
    const turn = makeTurn(48);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    const toolCall: ToolCall = {
      type: 'function',
      id: 'call_replace_goal',
      name: 'CreateGoal',
      arguments: JSON.stringify({ objective: 'new task', replace: true }),
    };
    await executeToolCall(toolExecutor, turn, toolCall);

    recordStepUsage(usageService, goals, turn, { ...zeroUsage, output: 5 });

    expect(goals.getGoal().goal).toMatchObject({
      objective: 'new task',
      tokensUsed: 0,
    });
  });

  it('keeps a replacement goal isolated from late user-turn accounting', async () => {
    await goals.createGoal({ objective: 'old task' });
    const oldTurn = makeTurn(42);
    eventBus.publish({ type: 'turn.started', turnId: oldTurn.id, origin: USER_PROMPT_ORIGIN });

    const replacement = await goals.createGoal({ objective: 'new task', replace: true });
    await loopService.hooks.onWillBeginStep.run({
      turnId: oldTurn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: oldTurn.signal,
    });
    recordStepUsage(usageService, goals, oldTurn, { ...zeroUsage, output: 5 });
    endTurn(eventBus, oldTurn);

    expect(goals.getGoal().goal).toMatchObject({
      goalId: replacement.goalId,
      status: 'active',
      turnsUsed: 0,
      tokensUsed: 0,
    });
    expect(loopService.hasPendingRequests()).toBe(false);
    expect(loopService.launches).toEqual([]);
  });

  it('ignores a late outcome continuation from a replaced goal user turn', async () => {
    await goals.createGoal({ objective: 'old task' });
    const oldTurn = makeTurn(45);
    eventBus.publish({ type: 'turn.started', turnId: oldTurn.id, origin: USER_PROMPT_ORIGIN });
    const replacement = await goals.createGoal({ objective: 'new task', replace: true });

    await runTerminalUpdateGoalResult(toolExecutor, oldTurn, 'complete', 'old outcome');
    await loopService.hooks.onDidFinishStep.run({
      turnId: oldTurn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: oldTurn.signal,
      usage: zeroUsage,
      finishReason: 'completed',
      stopTurn: false,
    });

    expect(loopService.hasPendingRequests()).toBe(false);
    expect(goals.getGoal().goal).toMatchObject({
      goalId: replacement.goalId,
      status: 'active',
    });
  });

  it.each([
    { name: 'CreateGoal', args: { objective: 'late task', replace: true } },
    { name: 'UpdateGoal', args: { status: 'complete' } },
    { name: 'SetGoalBudget', args: { value: 5, unit: 'turns' } },
  ])('rejects a stale $name call from a replaced goal turn', async ({ name, args }) => {
    await goals.createGoal({ objective: 'old task' });
    const oldTurn = makeTurn(46);
    eventBus.publish({ type: 'turn.started', turnId: oldTurn.id, origin: USER_PROMPT_ORIGIN });
    const replacement = await goals.createGoal({ objective: 'new task', replace: true });
    const toolCall: ToolCall = {
      type: 'function',
      id: 'call_stale_goal_tool',
      name,
      arguments: JSON.stringify(args),
    };

    const results = await executeToolCall(toolExecutor, oldTurn, toolCall);

    expect(results).toHaveLength(1);
    expect(results[0]!.result.output).toBe(
      'Goal changed since this turn started; ignored stale goal tool call.',
    );
    expect(goals.getGoal().goal).toMatchObject({
      goalId: replacement.goalId,
      status: 'active',
      turnsUsed: 0,
      tokensUsed: 0,
    });
  });

  it.each([
    { reason: 'cancelled' as const },
    { reason: 'failed' as const, error: new Error('old turn failed') },
  ])('keeps a replacement goal active after the replaced goal turn ends as $reason', async (result) => {
    await goals.createGoal({ objective: 'old task' });
    const oldTurn = makeTurn(43);
    eventBus.publish({ type: 'turn.started', turnId: oldTurn.id, origin: USER_PROMPT_ORIGIN });
    const replacement = await goals.createGoal({ objective: 'new task', replace: true });

    endTurn(eventBus, oldTurn, result);

    expect(goals.getGoal().goal).toMatchObject({
      goalId: replacement.goalId,
      status: 'active',
      turnsUsed: 0,
      tokensUsed: 0,
    });
  });

  it.each([
    { reason: 'completed' as const },
    { reason: 'failed' as const, error: new Error('old continuation failed') },
  ])('keeps a replacement goal isolated when the replaced goal continuation settles as $reason', async (result) => {
    await goals.createGoal({ objective: 'old task' });
    const oldUserTurn = makeTurn(44);
    eventBus.publish({ type: 'turn.started', turnId: oldUserTurn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, oldUserTurn);
    endTurn(eventBus, oldUserTurn);
    await vi.waitFor(() => {
      expect(loopService.launches).toHaveLength(1);
    });

    const continuationTurn = makeTurn(loopService.launches[0]!);
    eventBus.publish({
      type: 'turn.started',
      turnId: continuationTurn.id,
      origin: { kind: 'system_trigger', name: 'goal_continuation' },
    });
    const replacement = await goals.createGoal({ objective: 'new task', replace: true });

    await loopService.hooks.onWillBeginStep.run({
      turnId: continuationTurn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: continuationTurn.signal,
    });
    recordStepUsage(usageService, goals, continuationTurn, { ...zeroUsage, output: 7 });
    endTurn(eventBus, continuationTurn, result);

    expect(goals.getGoal().goal).toMatchObject({
      goalId: replacement.goalId,
      status: 'active',
      turnsUsed: 0,
      tokensUsed: 0,
    });
    expect(loopService.launches).toHaveLength(1);
  });

  it('cancels a preserved continuation turn after its original receipt settles', async () => {
    const abort = await startLiveContinuation(false);
    const cancel = vi.spyOn(loopService, 'cancel').mockReturnValue(true);
    await goals.markBlocked({ reason: 'still need credentials' }, 'model');
    await goals.cancelGoal();

    expect(abort).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(41, expect.any(Error));
    expect(isUserCancellation(cancel.mock.calls[0]?.[1])).toBe(false);
  });

  it.each(['turn', 'token', 'wall-clock'] as const)(
    'keeps a goal blocked when its %s budget is exhausted before resume',
    async (budget) => {
      await goals.createGoal({ objective: 'finish the task' });
      if (budget === 'turn') {
        await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');
      } else if (budget === 'token') {
        await goals.setBudgetLimits({ budgetLimits: { tokenBudget: 1 } }, 'model');
      } else {
        await goals.setBudgetLimits({ budgetLimits: { wallClockBudgetMs: 1 } }, 'model');
        clock.advanceBy(1);
      }

      const turn = makeTurn(101);
      eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
      if (budget === 'token') {
        recordStepUsage(usageService, goals, turn, { ...zeroUsage, output: 1 });
      } else {
        await runGoalStep(loopService, turn);
      }
      endTurn(eventBus, turn);
      expect(loopService.status()).toMatchObject({ state: 'idle', hasPendingRequests: false });

      const resumed = await goals.resumeGoal({ continueIfBlocked: true });

      expect(resumed.status).toBe('blocked');
      expect(resumed.budget.overBudget).toBe(true);
      expect(resumed.terminalReason).toMatch(/^Blocked after goal budget reached:/);
      expect(loopService.launches).toEqual([]);
    },
  );

  it('does not launch another turn when a user resumes a blocked goal during a live turn', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const turn = loopService.startTurn();
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await goals.markBlocked({ reason: 'need credentials' });
    const resumed = await goals.resumeGoal({ continueIfBlocked: true });

    expect(resumed.status).toBe('active');
    expect(loopService.launches).toEqual([turn.id]);
  });

  it('does not launch a continuation when another loop request is pending', async () => {
    loopService.enqueue(
      new MessageStepRequest({
        role: 'user',
        content: [{ type: 'text', text: 'queued work' }],
        toolCalls: [],
        origin: USER_PROMPT_ORIGIN,
      }),
    );
    await goals.createGoal({ objective: 'finish the task' });
    await goals.markBlocked({ reason: 'need credentials' });

    const resumed = await goals.resumeGoal({ continueIfBlocked: true });

    expect(resumed.status).toBe('active');
    expect(loopService.launches).toEqual([]);
    expect(loopService.drainNextBatch(context)).toBeDefined();
    expect(context.get().at(-1)?.origin).toEqual(USER_PROMPT_ORIGIN);
  });

  it('launches only one continuation when blocked resume is repeated', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.markBlocked({ reason: 'need credentials' });

    await goals.resumeGoal({ continueIfBlocked: true });
    const repeated = await goals.resumeGoal({ continueIfBlocked: true });

    expect(repeated.status).toBe('active');
    expect(loopService.launches).toHaveLength(1);
  });

  it('does not launch a continuation when a paused goal resumes by default', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.pauseGoal();

    const resumed = await goals.resumeGoal();

    expect(resumed.status).toBe('active');
    expect(loopService.launches).toEqual([]);
  });

  it('starts one continuation when a caller opts to resume a paused goal', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.pauseGoal();

    const resumed = await goals.resumeGoal({ continueIfPaused: true });

    expect(resumed.status).toBe('active');
    expect(loopService.launches).toHaveLength(1);
  });

  it('starts one continuation when an explicit continue follows a lifecycle-only resume', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.markBlocked({ reason: 'need credentials' });
    await goals.resumeGoal();

    const resumed = await goals.resumeGoal({ continueIfBlocked: true });

    expect(resumed.status).toBe('active');
    expect(loopService.launches).toHaveLength(1);
  });

  it('starts a continuation after an opted paused resume waits for a cancelled turn', async () => {
    await startLiveContinuation();
    const enqueue = vi.mocked(loopService.enqueue);

    await goals.pauseGoal();
    const resumed = await goals.resumeGoal({ continueIfPaused: true });
    endTurn(eventBus, makeTurn(41), { reason: 'cancelled' });

    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
    expect(resumed.status).toBe('active');
    expect(goals.getGoal().goal?.status).toBe('active');
  });

  it('counts an active goal turn and launches the next continuation', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const turn = makeTurn(1);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, turn);
    endTurn(eventBus, turn);

    expect(goals.getGoal().goal).toMatchObject({
      status: 'active',
      turnsUsed: 1,
    });
    expect(loopService.launches).toHaveLength(1);
    expect(loopService.drainNextBatch(context)).toBeDefined();
    expect(context.get().at(-1)?.origin).toMatchObject({
      kind: 'system_trigger',
      name: 'goal_continuation',
      goalId: expect.any(String),
    });
    expect(JSON.stringify(context.get().at(-1)?.content)).toContain('Continue working toward');
  });

  it('blocks the next continuation only after the final allowed turn ends', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');

    const turn = makeTurn(11);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });

    expect(goals.getGoal().goal).toMatchObject({
      status: 'active',
      turnsUsed: 1,
    });

    const afterStep: AfterStepContext = {
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
      usage: zeroUsage,
      finishReason: 'completed',
      stopTurn: false,
    };
    await loopService.hooks.onDidFinishStep.run(afterStep);

    expect(afterStep.stopTurn).toBe(false);
    expect(goals.getGoal().goal?.status).toBe('active');

    endTurn(eventBus, turn);

    expect(goals.getGoal().goal).toMatchObject({
      status: 'blocked',
      turnsUsed: 1,
      terminalReason: 'Blocked after goal budget reached: turn budget 1',
    });
    expect(loopService.launches).toEqual([]);
  });

  it('completes on the final allowed continuation without applying the turn budget block', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.setBudgetLimits({ budgetLimits: { turnBudget: 2 } }, 'model');

    const firstTurn = makeTurn(14);
    eventBus.publish({ type: 'turn.started', turnId: firstTurn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, firstTurn);
    endTurn(eventBus, firstTurn);

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    const continuation = makeTurn(loopService.launches[0]!);
    eventBus.publish({
      type: 'turn.started',
      turnId: continuation.id,
      origin: { kind: 'system_trigger', name: 'goal_continuation' },
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: continuation.id,
      step: 1,
      firstStepOfTurn: true,
      signal: continuation.signal,
    });

    const completed = await goals.markComplete({ reason: 'done' }, 'model');
    endTurn(eventBus, continuation);

    expect(completed).toMatchObject({ status: 'complete', turnsUsed: 2 });
    expect(goals.getGoal().goal).toBeNull();
    expect(loopService.launches).toHaveLength(1);
  });

  it('requests a blocked outcome step when the final allowed turn blocks the goal', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');

    const turn = makeTurn(15);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    await goals.markBlocked({}, 'model');
    await runTerminalUpdateGoalResult(toolExecutor, turn, 'blocked', 'outcome prompt');

    const afterStep: AfterStepContext = {
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
      usage: zeroUsage,
      finishReason: 'completed',
      stopTurn: false,
    };
    await loopService.hooks.onDidFinishStep.run(afterStep);

    expect(loopService.hasPendingRequests()).toBe(true);
    expect(goals.getGoal().goal).toMatchObject({ status: 'blocked', turnsUsed: 1 });
  });

  it('accounts recorded turn usage for active goal turns', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    await goals.setBudgetLimits({ budgetLimits: { tokenBudget: 7 } }, 'model');

    const turn = loopService.startTurn();
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });

    expect(
      recordStepUsage(usageService, goals, turn, {
        inputCacheRead: 100_000,
        inputCacheCreation: 50_000,
        inputOther: 40_000,
        output: 4,
      }),
    ).toBe(false);
    expect(goals.getGoal().goal).toMatchObject({ status: 'active', tokensUsed: 4 });
    expect(
      recordStepUsage(usageService, goals, turn, {
        inputCacheRead: 0,
        inputCacheCreation: 0,
        inputOther: 90_000,
        output: 3,
      }),
    ).toBe(true);

    expect(goals.getGoal().goal).toMatchObject({
      status: 'blocked',
      tokensUsed: 7,
      terminalReason: 'Blocked after goal budget reached: token budget 7',
    });
  });

  it('ignores recorded turn usage for non-goal turns', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const turn = makeTurn(99);
    expect(
      recordStepUsage(usageService, goals, turn, {
        inputCacheRead: 0,
        inputCacheCreation: 0,
        inputOther: 10,
        output: 5,
      }),
    ).toBe(false);
    expect(goals.getGoal().goal).toMatchObject({
      status: 'active',
      tokensUsed: 0,
    });
  });

  it('counts the goal-creating turn as the first goal turn and continues', async () => {
    const turn = makeTurn(2);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, turn);

    await goals.createGoal({ objective: 'finish the task' }, 'model');
    endTurn(eventBus, turn);

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal).toMatchObject({
      status: 'active',
      turnsUsed: 1,
    });
  });

  it('blocks at the turn budget when the goal-creating turn consumes it', async () => {
    const turn = makeTurn(12);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, turn);

    await goals.createGoal({ objective: 'finish the task' }, 'model');
    await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');
    endTurn(eventBus, turn);

    await vi.waitFor(() => expect(goals.getGoal().goal?.status).toBe('blocked'));
    expect(goals.getGoal().goal).toMatchObject({
      status: 'blocked',
      turnsUsed: 1,
      terminalReason: 'Blocked after goal budget reached: turn budget 1',
    });
    expect(loopService.launches).toEqual([]);
  });

  it('charges post-creation step output tokens for the goal-creating turn', async () => {
    const turn = makeTurn(13);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, turn);

    await goals.createGoal({ objective: 'finish the task' }, 'model');
    expect(
      recordStepUsage(usageService, goals, turn, {
        inputCacheRead: 100,
        inputCacheCreation: 0,
        inputOther: 50,
        output: 6,
      }),
    ).toBe(false);

    expect(goals.getGoal().goal).toMatchObject({
      status: 'active',
      tokensUsed: 6,
    });
  });

  it('requests one final outcome turn after a terminal UpdateGoal tool result', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const turn = makeTurn(3);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    const step = {
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    };
    const afterStep: AfterStepContext = {
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
      usage: zeroUsage,
      finishReason: 'completed' as const,
      stopTurn: false,
    };
    await loopService.hooks.onWillBeginStep.run(step);

    await goals.markComplete({}, 'model');
    await runTerminalUpdateGoalResult(toolExecutor, turn, 'complete', 'outcome prompt');
    await loopService.hooks.onDidFinishStep.run(afterStep);

    expect(loopService.hasPendingRequests()).toBe(true);
    expect(goals.getGoal().goal).toBeNull();
    expect(loopService.launches).toEqual([]);
    expect(JSON.stringify(context.get())).not.toContain('goal_completion_summary');
    expect(JSON.stringify(context.get())).not.toContain('goal_blocked_reason');

    expect(loopService.drainNextBatch(context)).toBeDefined();
    const secondAfterStep: AfterStepContext = {
      turnId: turn.id,
      step: 2,
      firstStepOfTurn: false,
      signal: turn.signal,
      usage: zeroUsage,
      finishReason: 'completed' as const,
      stopTurn: false,
    };
    await loopService.hooks.onDidFinishStep.run(secondAfterStep);
    endTurn(eventBus, turn);
    expect(loopService.hasPendingRequests()).toBe(false);
  });

  it('pauses active goals after failed turns', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const turn = makeTurn(4);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    endTurn(eventBus, turn, { reason: 'failed', error: new Error('boom') });

    expect(goals.getGoal().goal).toMatchObject({
      status: 'paused',
      terminalReason: 'Paused after runtime error: boom',
    });
    expect(loopService.launches).toEqual([]);
  });

  it('continues the goal when a goal turn hits the per-turn step limit', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const turn = makeTurn(4);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, turn);
    endTurn(eventBus, turn, { reason: 'failed', error: createMaxStepsExceededError(1) });

    expect(goals.getGoal().goal).toMatchObject({ status: 'active', turnsUsed: 1 });
    expect(loopService.launches).toHaveLength(1);
    expect(loopService.drainNextBatch(context)).toBeDefined();
    expect(context.get().at(-1)?.origin).toMatchObject({
      kind: 'system_trigger',
      name: 'goal_continuation',
      goalId: expect.any(String),
    });
    const prompt = JSON.stringify(context.get().at(-1)?.content);
    expect(prompt).toContain('per-turn step limit');
    expect(prompt).toContain('Pick up where that turn stopped');
  });

  it('blocks active goals when the user prompt hook blocks the turn', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const turn = makeTurn(5);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    endTurn(eventBus, turn, { reason: 'blocked' });

    expect(goals.getGoal().goal).toMatchObject({
      status: 'blocked',
      terminalReason: 'Blocked by UserPromptSubmit hook',
    });
    expect(loopService.launches).toEqual([]);
  });

  it('pauses the goal when the continuation launch fails', async () => {
    await goals.createGoal({ objective: 'finish the task' });
    vi.spyOn(loopService, 'enqueue').mockImplementation(() => {
      throw new Error('wire dispatch exploded');
    });
    const updates: GoalUpdatedEvent[] = [];
    eventBus.subscribe((event) => {
      if (event.type === 'goal.updated') updates.push(event);
    });

    const turn = makeTurn(21);
    eventBus.publish({ type: 'turn.started', turnId: turn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, turn);
    endTurn(eventBus, turn);

    await vi.waitFor(() => expect(goals.getGoal().goal?.status).toBe('paused'));
    expect(goals.getGoal().goal?.terminalReason).toBe(
      'Paused after goal continuation failure: wire dispatch exploded',
    );
    expect(updates.at(-1)?.snapshot).toMatchObject({ status: 'paused' });
  });

  it('queues one continuation and lets the loop start it automatically', async () => {
    await goals.createGoal({ objective: 'finish the task' });

    const goalTurn = makeTurn(31);
    eventBus.publish({ type: 'turn.started', turnId: goalTurn.id, origin: USER_PROMPT_ORIGIN });
    await runGoalStep(loopService, goalTurn);
    endTurn(eventBus, goalTurn);

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal?.status).toBe('active');
    expect(loopService.hasPendingRequests()).toBe(true);
  });
});

describe('goal error catalog metadata', () => {
  it('surfaces title and action hints for every goal error code', () => {
    expect(errorInfo('goal.already_exists')).toEqual({
      title: 'A goal is already active',
      retryable: false,
      public: true,
      action: 'Use `/goal replace <objective>` to replace the current goal.',
    });
    expect(errorInfo('goal.not_found')).toEqual({
      title: 'No goal found',
      retryable: false,
      public: true,
      action: 'Start a goal with `/goal <objective>` first.',
    });
    expect(errorInfo('goal.objective_empty')).toEqual({
      title: 'Goal objective is empty',
      retryable: false,
      public: true,
      action: 'Provide a non-empty objective.',
    });
    expect(errorInfo('goal.objective_too_long')).toEqual({
      title: 'Goal objective is too long',
      retryable: false,
      public: true,
      action: 'Keep the objective under 4000 characters; reference long details by file path.',
    });
    expect(errorInfo('goal.status_invalid')).toEqual({
      title: 'Invalid goal status transition',
      retryable: false,
      public: true,
      action: 'Only an active goal can be paused; resume a blocked goal with `/goal resume`.',
    });
    expect(errorInfo('goal.metadata_reserved')).toEqual({
      title: 'Goal metadata is reserved',
      retryable: false,
      public: true,
      action: 'Do not write metadata.custom.goal directly; use the goal lifecycle methods.',
    });
    expect(errorInfo('goal.not_resumable')).toEqual({
      title: 'Goal is not resumable',
      retryable: false,
      public: true,
      action: 'Only paused or blocked goals can be resumed.',
    });
    expect(errorInfo('goal.unsupported_agent')).toEqual({
      title: 'Goals are unavailable for subagents',
      retryable: false,
      public: true,
      action: 'Run goal lifecycle commands on the main agent.',
    });
  });
});

describe('AgentGoalService agent eligibility', () => {
  let ctx: TestAgentContext;

  beforeEach(() => {
    ctx = createTestAgent(
      agentService(IAgentScopeContext, {
        _serviceBrand: undefined,
        agentId: 'sub-1',
        scope: (subKey?: string) =>
          subKey === undefined ? 'test/agents/sub-1' : `test/agents/sub-1/${subKey}`,
      }),
    );
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it.each([
    ['getGoal', (goals: IAgentGoalService) => goals.getGoal()],
    ['isGoalToolTarget', (goals: IAgentGoalService) => goals.isGoalToolTarget(1, 'goal-1')],
    ['createGoal', (goals: IAgentGoalService) => goals.createGoal({ objective: 'work' })],
    ['pauseGoal', (goals: IAgentGoalService) => goals.pauseGoal()],
    ['resumeGoal', (goals: IAgentGoalService) => goals.resumeGoal()],
    ['waitForTasks', (goals: IAgentGoalService) => goals.waitForTasks({ taskIds: ['task-1'] })],
    ['setBudgetLimits', (goals: IAgentGoalService) =>
      goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } })],
    ['cancelGoal', (goals: IAgentGoalService) => goals.cancelGoal()],
    ['markBlocked', (goals: IAgentGoalService) => goals.markBlocked()],
    ['markComplete', (goals: IAgentGoalService) => goals.markComplete()],
  ] as const)(
    '%s rejects direct goal service access when the agent is a subagent',
    async (_name, call) => {
      const goals = ctx.get(IAgentGoalService);
      await expect(Promise.resolve().then<unknown>(() => call(goals))).rejects.toMatchObject({
        code: 'goal.unsupported_agent',
        details: { agentId: 'sub-1' },
      });
    },
  );

  it.each([
    ['createGoal', () => ctx.rpc.createGoal({ objective: 'work' })],
    ['getGoal', () => ctx.rpc.getGoal({})],
    ['pauseGoal', () => ctx.rpc.pauseGoal({})],
    ['resumeGoal', () => ctx.rpc.resumeGoal({})],
    ['cancelGoal', () => ctx.rpc.cancelGoal({})],
  ] as const)(
    '%s rejects subagent goal RPC access with the stable goal error',
    async (_name, call) => {
      await expect(call()).rejects.toMatchObject({
        code: 'goal.unsupported_agent',
        details: { agentId: 'sub-1' },
      });
    },
  );

  it('does not continue a previously persisted goal when the agent is a subagent', async () => {
    await ctx.restore([
      { type: 'goal.create', goalId: 'legacy-subagent-goal', objective: 'work' },
    ]);
    ctx.mockNextResponse({ type: 'text', text: 'Handled as one normal subagent turn.' });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'continue' }] });
    await ctx.untilTurnEnd();
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.llmCalls).toHaveLength(1);
  });
});

describe('goal pause classification on provider errors', () => {
  type GenerateFn = NonNullable<TestAgentOptions['generate']>;

  function singleAttemptAgentOptions(): Pick<TestAgentOptions, 'initialConfig'> {
    return {
      initialConfig: {
        providers: {},
        loopControl: { maxAttemptsPerStep: 1 },
      },
    };
  }

  async function goalAfterFailedTurn(generate: GenerateFn) {
    const ctx = testAgent({ generate, ...singleAttemptAgentOptions() });
    ctx.configure();
    const goals = ctx.get(IAgentGoalService);
    await goals.createGoal({ objective: 'work' });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'work' }] });
    await ctx.untilTurnEnd();

    return goals.getGoal().goal;
  }

  it('pauses the goal on provider rate limits', async () => {
    const goal = await goalAfterFailedTurn(async () => {
      throw new APIStatusError(429, 'Rate limited', 'req-429');
    });

    expect(goal).toMatchObject({
      status: 'paused',
      terminalReason: 'Paused after provider rate limit',
    });
  });

  it('pauses the goal on provider connection errors', async () => {
    const goal = await goalAfterFailedTurn(async () => {
      throw new APIConnectionError('socket hang up');
    });

    expect(goal).toMatchObject({
      status: 'paused',
      terminalReason: 'Paused after provider connection error: socket hang up',
    });
  });

  it('pauses the goal on provider authentication errors', async () => {
    const goal = await goalAfterFailedTurn(async () => {
      throw new APIStatusError(401, 'Unauthorized', 'req-401');
    });

    expect(goal).toMatchObject({
      status: 'paused',
      terminalReason: 'Paused after provider authentication error: Unauthorized',
    });
  });

  it('pauses the goal on model configuration errors', async () => {
    const goal = await goalAfterFailedTurn(async () => {
      throw new Error2(ErrorCodes.MODEL_NOT_CONFIGURED, 'Model not set');
    });

    expect(goal).toMatchObject({
      status: 'paused',
      terminalReason: 'Paused after model configuration error: LLM not set, send "/login" to login',
    });
  });

  it('pauses the goal on provider safety policy blocks', async () => {
    const goal = await goalAfterFailedTurn(async () => ({
      id: 'mock-filtered',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'filtered' }],
        toolCalls: [],
      },
      usage: { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
      finishReason: 'filtered',
      rawFinishReason: 'content_filter',
    }));

    expect(goal).toMatchObject({
      status: 'paused',
      terminalReason: 'Paused after provider safety policy block',
    });
  });
});

describe('AgentGoalService hard wall-clock deadline', () => {
  it('reports an exhausted restored goal without arming a deadline or cancelling its recovery answer', async () => {
    const clock = new ManualGoalDeadlineScheduler();
    const ctx = createTestAgent(appService(IGoalDeadlineScheduler, clock));
    try {
      ctx.configure({ tools: ['UpdateGoal'] });
      const goals = ctx.get(IAgentGoalService);
      await restoreGoalRecords(ctx, goals, [
        { type: 'goal.create', goalId: 'recovery-goal', objective: 'finish bounded work' },
        {
          type: 'goal.update',
          status: 'paused',
          reason: 'Paused after agent resume',
          wallClockMs: 3_983_870,
          budgetLimits: { wallClockBudgetMs: 600_000 },
        },
      ]);
      const schedule = vi.spyOn(clock, 'schedule');
      const loop = ctx.get(IAgentLoopService);
      const cancel = vi.spyOn(loop, 'cancel');
      const advance = loop.hooks.onWillBeginStep.register('advance-recovery-clock', async (_step, next) => {
        clock.advanceBy(1);
        await next();
      });
      ctx.mockNextResponse({
        type: 'function',
        id: 'resume',
        name: 'UpdateGoal',
        arguments: JSON.stringify({ status: 'active' }),
      });
      ctx.mockNextResponse({ type: 'text', text: 'The goal was not resumed because its budget is exhausted.' });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'resume and report the outcome' }] });
      const events = await ctx.untilTurnEnd();
      advance.dispose();

      expect(schedule).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
      expect(ctx.llmCalls).toHaveLength(2);
      expect(events).toContainEqual(expect.objectContaining({
        event: 'turn.ended',
        args: expect.objectContaining({ reason: 'completed' }),
      }));
      const history = JSON.stringify(ctx.get(IAgentContextMemoryService).get());
      expect(history).toContain('Goal not resumed: the goal budget is exhausted.');
      expect(history).not.toContain('Goal resumed.');
      expect(history).toContain('The goal was not resumed because its budget is exhausted.');
      expect(goals.getGoal().goal).toMatchObject({
        status: 'blocked',
        wallClockMs: 3_983_870,
        budget: { wallClockBudgetMs: 600_000 },
        continuation: { state: 'idle' },
      });
    } finally {
      await ctx.dispose();
    }
  });

  it('aborts an in-flight LLM request when the wall-clock budget expires', async () => {
    const clock = new ManualGoalDeadlineScheduler();
    const llm = blockingGenerate();
    const ctx = createTestAgent(appService(IGoalDeadlineScheduler, clock), {
      generate: llm.generate,
    });
    try {
      ctx.configure();
      await ctx.rpc.createGoal({ objective: 'finish bounded work' });
      await ctx
        .get(IAgentGoalService)
        .setBudgetLimits({ budgetLimits: { wallClockBudgetMs: 1_000 } }, 'user');

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'start work' }] });
      await llm.started;
      clock.advanceBy(1_000);

      expect(llm.signal().aborted).toBe(true);
      const events = await ctx.untilTurnEnd();
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'cancelled' }),
        }),
      );
      expect((await ctx.rpc.getGoal({})).goal).toMatchObject({
        status: 'blocked',
        wallClockMs: 1_000,
        budget: { wallClockBudgetReached: true },
        terminalReason: 'Blocked after goal budget reached: wall-clock budget 1000ms',
      });
    } finally {
      await ctx.dispose();
    }
  });

  it('aborts an in-flight tool execution when the wall-clock budget expires', async () => {
    const clock = new ManualGoalDeadlineScheduler();
    const toolStarted = deferred();
    let toolSignal: AbortSignal | undefined;
    const tool: ExecutableTool = {
      name: 'SlowWork',
      description: 'Wait for cancellation.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      resolveExecution: () => ({
        approvalRule: 'SlowWork',
        accesses: [],
        execute: async ({ signal }) => {
          toolSignal = signal;
          toolStarted.resolve();
          return waitForAbort(signal);
        },
      }),
    };
    const ctx = createTestAgent(
      appService(IGoalDeadlineScheduler, clock),
      permissionModeServices('yolo'),
    );
    try {
      ctx.get(IAgentToolRegistryService).register(tool);
      ctx.configure({ tools: ['SlowWork'] });
      await ctx.rpc.createGoal({ objective: 'finish bounded work' });
      await ctx
        .get(IAgentGoalService)
        .setBudgetLimits({ budgetLimits: { wallClockBudgetMs: 1_000 } }, 'user');
      ctx.mockNextResponse({
        type: 'function',
        id: 'slow_work',
        name: 'SlowWork',
        arguments: '{}',
      });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'start work' }] });
      await toolStarted.promise;
      clock.advanceBy(1_000);

      expect(toolSignal?.aborted).toBe(true);
      const events = await ctx.untilTurnEnd();
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'cancelled' }),
        }),
      );
      expect((await ctx.rpc.getGoal({})).goal).toMatchObject({
        status: 'blocked',
        budget: { wallClockBudgetReached: true },
      });
    } finally {
      await ctx.dispose();
    }
  });

  it('keeps the goal-cancellation abort authoritative when it precedes the wall-clock deadline', async () => {
    const clock = new ManualGoalDeadlineScheduler();
    const llm = blockingGenerate();
    const ctx = createTestAgent(appService(IGoalDeadlineScheduler, clock), {
      generate: llm.generate,
    });
    try {
      ctx.configure();
      await ctx.rpc.createGoal({ objective: 'finish bounded work' });
      await ctx
        .get(IAgentGoalService)
        .setBudgetLimits({ budgetLimits: { wallClockBudgetMs: 1_000 } }, 'user');
      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'start work' }] });
      await llm.started;

      await ctx.rpc.cancelGoal({});
      expect(llm.signal()).toMatchObject({
        aborted: true,
        reason: expect.objectContaining({ message: 'Goal cancelled' }),
      });
      expect(isUserCancellation(llm.signal().reason)).toBe(false);
      clock.advanceBy(1_000);

      await ctx.untilTurnEnd();
      expect((await ctx.rpc.getGoal({})).goal).toBeNull();
    } finally {
      await ctx.dispose();
    }
  });
});

describe('AgentGoalService mid-turn budget stop', () => {
  it('grants one tool-free grace step when a token budget is reached mid-turn', async () => {
    const ctx = createTestAgent();
    try {
      ctx.configure({ tools: ['GetGoal'] });
      await ctx.rpc.createGoal({ objective: 'work' });
      const goals = ctx.get(IAgentGoalService);
      await goals.setBudgetLimits({ budgetLimits: { tokenBudget: 1 } }, 'model');

      ctx.mockNextResponse({
        type: 'function',
        id: 'g1',
        name: 'GetGoal',
        arguments: JSON.stringify({}),
      });
      ctx.mockNextResponse({ type: 'text', text: 'Final status: budget exhausted.' });
      ctx.mockNextResponse({ type: 'text', text: 'This step should never run.' });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'work' }] });
      const events = await ctx.untilTurnEnd();

      expect(ctx.llmCalls).toHaveLength(2);
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'completed' }),
        }),
      );
      expect(events).not.toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'failed' }),
        }),
      );

      const history = ctx.get(IAgentContextMemoryService).get();
      const toolResultIndex = history.findIndex((message) => message.role === 'tool');
      const reminderIndex = history.findIndex(
        (message) =>
          message.origin?.kind === 'injection' && message.origin.variant === 'goal_budget_stop',
      );
      expect(toolResultIndex).toBeGreaterThanOrEqual(0);
      expect(reminderIndex).toBeGreaterThan(toolResultIndex);
      expect(JSON.stringify(history)).toContain('Final status: budget exhausted.');
      expect(JSON.stringify(history)).not.toContain('This step should never run.');

      const goal = (await ctx.rpc.getGoal({})).goal;
      expect(goal?.status).toBe('blocked');
      expect(goal?.terminalReason).toMatch(/^Blocked after goal budget reached/);
      expect(goal?.tokensUsed).toBeGreaterThan(1);
    } finally {
      await ctx.dispose();
    }
  });

  it('lets an automatic continuation report final status after crossing its token budget', async () => {
    const ctx = createTestAgent();
    try {
      ctx.configure({ tools: ['GetGoal'] });
      const goals = ctx.get(IAgentGoalService);
      await goals.createGoal({ objective: 'work' });
      await goals.markBlocked({ reason: 'ready for a fresh continuation' });
      await goals.setBudgetLimits({ budgetLimits: { tokenBudget: 1 } }, 'model');

      ctx.mockNextResponse({
        type: 'function',
        id: 'g1',
        name: 'GetGoal',
        arguments: JSON.stringify({}),
      });
      ctx.mockNextResponse({ type: 'text', text: 'Final status: budget exhausted.' });
      ctx.mockNextResponse({ type: 'text', text: 'This step should never run.' });

      const turnEnd = ctx.untilTurnEnd();
      await goals.resumeGoal({ continueIfBlocked: true });
      const events = await turnEnd;

      expect(ctx.llmCalls).toHaveLength(2);
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'completed' }),
        }),
      );
      expect(events).not.toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'cancelled' }),
        }),
      );

      const history = ctx.get(IAgentContextMemoryService).get();
      expect(JSON.stringify(history)).toContain('Final status: budget exhausted.');
      expect(JSON.stringify(history)).not.toContain('This step should never run.');
      expect(goals.getGoal().goal).toMatchObject({
        status: 'blocked',
        budget: { tokenBudgetReached: true },
      });
    } finally {
      await ctx.dispose();
    }
  });

  it('rejects tool calls made during the budget grace step without executing them', async () => {
    const ctx = createTestAgent();
    try {
      ctx.configure({ tools: ['GetGoal', 'SetGoalBudget'] });
      await ctx.rpc.createGoal({ objective: 'work' });
      const goals = ctx.get(IAgentGoalService);
      await goals.setBudgetLimits({ budgetLimits: { tokenBudget: 1 } }, 'model');

      ctx.mockNextResponse({
        type: 'function',
        id: 'g1',
        name: 'GetGoal',
        arguments: JSON.stringify({}),
      });
      ctx.mockNextResponse({
        type: 'function',
        id: 'g2',
        name: 'SetGoalBudget',
        arguments: JSON.stringify({ value: 5, unit: 'turns' }),
      });
      ctx.mockNextResponse({ type: 'text', text: 'This step should never run.' });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'work' }] });
      const events = await ctx.untilTurnEnd();

      expect(ctx.llmCalls).toHaveLength(2);
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'completed' }),
        }),
      );

      const history = ctx.get(IAgentContextMemoryService).get();
      const toolResults = history.filter((message) => message.role === 'tool');
      expect(toolResults).toHaveLength(2);
      expect(JSON.stringify(toolResults.at(-1))).toContain(
        'Goal budget exhausted; tool calls are rejected. Write your final message.',
      );
      expect(JSON.stringify(history)).not.toContain('This step should never run.');

      const goal = (await ctx.rpc.getGoal({})).goal;
      expect(goal?.status).toBe('blocked');
      expect(goal?.budget.turnBudget).toBeNull();
    } finally {
      await ctx.dispose();
    }
  });

  it('rejects goal tool calls when an exhausted turn budget is resumed during a prompt', async () => {
    const ctx = createTestAgent();
    try {
      ctx.configure({ tools: ['UpdateGoal', 'SetGoalBudget'] });
      const goals = ctx.get(IAgentGoalService) as GoalServiceTestManager;
      await goals.createGoal({ objective: 'work' });
      await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');
      await goals.incrementTurn();
      await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');

      ctx.mockNextResponse({
        type: 'function',
        id: 'resume',
        name: 'UpdateGoal',
        arguments: JSON.stringify({ status: 'active' }),
      });
      ctx.mockNextResponse({
        type: 'function',
        id: 'raise-budget',
        name: 'SetGoalBudget',
        arguments: JSON.stringify({ value: 5, unit: 'turns' }),
      });
      ctx.mockNextResponse({ type: 'text', text: 'This step should never run.' });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'resume the goal' }] });
      await ctx.untilTurnEnd();

      expect(ctx.llmCalls).toHaveLength(2);
      const history = ctx.get(IAgentContextMemoryService).get();
      expect(JSON.stringify(history)).toContain(
        'Goal budget exhausted; tool calls are rejected. Write your final message.',
      );
      expect(JSON.stringify(history)).not.toContain('This step should never run.');
      await vi.waitFor(() => expect(goals.getGoal().goal?.status).toBe('blocked'));
      expect(goals.getGoal().goal?.budget.turnBudget).toBe(1);
    } finally {
      await ctx.dispose();
    }
  });

  it('keeps the budget guard after a rejected resume without replacing an earlier blocker', async () => {
    const ctx = createTestAgent();
    try {
      ctx.configure({ tools: ['UpdateGoal', 'SetGoalBudget'] });
      const goals = ctx.get(IAgentGoalService);
      await restoreGoalRecords(ctx, goals, [
        { type: 'goal.create', goalId: 'recovery-goal', objective: 'finish bounded work' },
        {
          type: 'goal.update',
          status: 'blocked',
          reason: 'Waiting for credentials',
          turnsUsed: 1,
          budgetLimits: { turnBudget: 1 },
        },
      ]);
      ctx.mockNextResponse({
        type: 'function', id: 'resume', name: 'UpdateGoal',
        arguments: JSON.stringify({ status: 'active' }),
      });
      ctx.mockNextResponse({
        type: 'function', id: 'raise-budget', name: 'SetGoalBudget',
        arguments: JSON.stringify({ value: 5, unit: 'turns' }),
      });
      ctx.mockNextResponse({ type: 'text', text: 'This step should never run.' });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'resume the goal' }] });
      await ctx.untilTurnEnd();

      expect(ctx.llmCalls).toHaveLength(2);
      const history = JSON.stringify(ctx.get(IAgentContextMemoryService).get());
      expect(history).toContain('Goal not resumed: the goal budget is exhausted.');
      expect(history).toContain('Goal budget exhausted; tool calls are rejected. Write your final message.');
      expect(history).not.toContain('This step should never run.');
      expect(goals.getGoal().goal).toMatchObject({
        status: 'blocked',
        terminalReason: 'Waiting for credentials',
        turnsUsed: 1,
        budget: { turnBudget: 1 },
      });
    } finally {
      await ctx.dispose();
    }
  });

  it("runs the prompt as a normal turn when the goal's turn budget was reached at launch", async () => {
    const telemetry: TelemetryRecord[] = [];
    const ctx = createTestAgent(telemetryServices(recordingTelemetry(telemetry)));
    try {
      ctx.configure();
      const goals = ctx.get(IAgentGoalService) as GoalServiceTestManager;
      await goals.createGoal({ objective: 'work' });
      await goals.setBudgetLimits({ budgetLimits: { turnBudget: 1 } }, 'model');
      await goals.incrementTurn();
      expect(goals.getGoal().goal?.status).toBe('active');
      const telemetryAfterResume = telemetry.length;

      ctx.mockNextResponse({ type: 'text', text: 'Answering the prompt normally.' });
      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'hello' }] });
      const events = await ctx.untilTurnEnd();
      await flushMicrotasks();

      expect(ctx.llmCalls).toHaveLength(1);
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'completed' }),
        }),
      );

      const goal = goals.getGoal().goal;
      expect(goal?.status).toBe('blocked');
      expect(goal?.terminalReason).toBe('Blocked after goal budget reached: turn budget 1');
      expect(goal?.turnsUsed).toBe(1);
      expect(
        telemetry.slice(telemetryAfterResume).map((record) => record.event),
      ).not.toContain('goal_continued');
      expect(
        ctx.allEvents.filter(
          (entry) => entry.type === '[rpc]' && entry.event === 'turn.started',
        ),
      ).toHaveLength(1);
    } finally {
      await ctx.dispose();
    }
  });
});

describe('AgentGoalService goal outcome tool result flow', () => {
  it('lets an automatic continuation explain the blocker after UpdateGoal blocks the goal', async () => {
    const ctx = createTestAgent();
    try {
      ctx.configure({ tools: ['UpdateGoal'] });
      const goals = ctx.get(IAgentGoalService);
      await goals.createGoal({ objective: 'work' });
      await goals.markBlocked({ reason: 'ready for a fresh continuation' });

      ctx.mockNextResponse({
        type: 'function',
        id: 'blocked',
        name: 'UpdateGoal',
        arguments: JSON.stringify({ status: 'blocked' }),
      });
      ctx.mockNextResponse({ type: 'text', text: 'Blocked because credentials are unavailable.' });

      const turnEnd = ctx.untilTurnEnd();
      await goals.resumeGoal({ continueIfBlocked: true });
      const events = await turnEnd;

      expect(ctx.llmCalls).toHaveLength(2);
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'completed' }),
        }),
      );
      const history = ctx.get(IAgentContextMemoryService).get();
      expect(JSON.stringify(history)).toContain('Blocked because credentials are unavailable.');
      expect(history.at(-1)?.role).toBe('assistant');
      expect(goals.getGoal().goal?.status).toBe('blocked');
    } finally {
      await ctx.dispose();
    }
  });

  it('does not force a goal outcome summary after maxStepsPerTurn is exhausted', async () => {
    const ctx = createTestAgent({
      initialConfig: { providers: {}, loopControl: { maxStepsPerTurn: 1 } },
    });
    try {
      ctx.configure({ tools: ['GetGoal', 'UpdateGoal'] });
      await ctx.rpc.createGoal({ objective: 'work' });

      ctx.mockNextResponse({
        type: 'function',
        id: 'complete',
        name: 'UpdateGoal',
        arguments: JSON.stringify({ status: 'complete' }),
      });
      ctx.mockNextResponse({ type: 'text', text: 'This summary should not run.' });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: 'work' }] });
      const events = await ctx.untilTurnEnd();

      expect(ctx.llmCalls).toHaveLength(1);
      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'completed' }),
        }),
      );
      expect(events).not.toContainEqual(
        expect.objectContaining({
          event: 'turn.ended',
          args: expect.objectContaining({ reason: 'failed' }),
        }),
      );
      expect((await ctx.rpc.getGoal({})).goal).toBeNull();
      const history = ctx.get(IAgentContextMemoryService).get();
      expect(JSON.stringify(history)).toContain('Write a concise final message');
      expect(JSON.stringify(history)).not.toContain('This summary should not run.');
      expect(history.at(-1)?.role).toBe('tool');
    } finally {
      await ctx.dispose();
    }
  });
});

describe('AgentGoalService fork boundaries', () => {
  let ctx: TestAgentContext;
  let context: IAgentContextMemoryService;
  let goals: IAgentGoalService;

  beforeEach(() => {
    ctx = createTestAgent(wireRecordPersistenceServices(new InMemoryWireRecordPersistence()));
    context = ctx.get(IAgentContextMemoryService);
    goals = ctx.get(IAgentGoalService);
  });

  afterEach(async () => {
    try {
      await ctx.expectResumeMatches();
    } finally {
      await ctx.dispose();
    }
  });

  it('appends a fork-cleared reminder when a fork clears a copied goal', async () => {
    await restoreGoalRecords(ctx, goals, [
      { type: 'goal.create', goalId: 'source-goal', objective: 'source work' },
      { type: 'forked' },
    ]);

    expect(goals.getGoal().goal).toBeNull();
    const reminder = context.get().at(-1);
    expect(reminder?.origin).toEqual({
      kind: 'injection',
      variant: 'goal_fork_cleared',
    });
    const text = JSON.stringify(reminder?.content);
    expect(text).toContain('This fork does not have a current goal.');
    expect(text).toContain('Ignore earlier active-goal reminders from the source session.');
    expect(text).toContain('Handle requests normally unless the user starts a new goal.');
  });

  it('does not re-deliver a fork-cleared reminder recorded with the legacy system_trigger origin', async () => {
    await restoreGoalRecords(ctx, goals, [
      { type: 'goal.create', goalId: 'source-goal', objective: 'source work' },
      { type: 'forked' },
      {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: '<system-reminder>\nlegacy fork cleared\n</system-reminder>' },
          ],
          toolCalls: [],
          origin: { kind: 'system_trigger', name: 'goal_fork_cleared' },
        },
      },
    ]);

    expect(context.get()).toHaveLength(1);
    expect(context.get()[0]?.origin).toEqual({ kind: 'system_trigger', name: 'goal_fork_cleared' });
  });

  it('does not append a fork-cleared reminder when the fork had no goal', async () => {
    await restoreGoalRecords(ctx, goals, [{ type: 'forked' }]);

    expect(goals.getGoal().goal).toBeNull();
    expect(context.get()).toEqual([]);
  });

  it('does not append a fork-cleared reminder when the goal was cleared before the fork', async () => {
    await restoreGoalRecords(ctx, goals, [
      { type: 'goal.create', goalId: 'source-goal', objective: 'source work' },
      { type: 'goal.clear' },
      { type: 'forked' },
    ]);

    expect(context.get()).toEqual([]);
  });
});

describe('AgentGoalService goal contribution seams', () => {
  interface GoalContributionProviderInput {
    readonly guards?: readonly ((input: {
      readonly goalId: string;
      readonly objective: string;
      readonly reason?: string;
      readonly actor: string;
    }) => GoalCompletionGuardResult | Promise<GoalCompletionGuardResult>)[];
    readonly participants?: readonly ((input: {
      readonly goalId: string;
      readonly objective: string;
      readonly turnsUsed: number;
    }) => GoalContinuationDecisionResult | Promise<GoalContinuationDecisionResult>)[];
    readonly retryEmitters?: readonly Emitter<string>[];
    readonly taskService?: IAgentTaskService;
  }

  class GoalContributionProvider extends Service {
    constructor(input: GoalContributionProviderInput = {}) {
      super();
      for (const guard of input.guards ?? []) {
        this.provide(GoalCompletionGuardContribution, { guard });
      }
      for (const [index, participant] of (input.participants ?? []).entries()) {
        this.provide(GoalContinuationParticipantContribution, {
          decide: participant,
          onDidRequestRetry: input.retryEmitters?.[index]?.event,
        });
      }
    }
  }

  const IGoalContributionProvider = createDecorator<GoalContributionProvider>(
    'test-goal-contribution-provider',
  );

  function contributionProviderServices(
    input: GoalContributionProviderInput,
  ): TestAgentServiceOverride {
    return agentService(
      IGoalContributionProvider,
      new SyncDescriptor(GoalContributionProvider, [input]),
    );
  }

  type WaitTaskStatus = 'running' | 'completed' | 'failed' | 'timed_out' | 'killed' | 'lost';

  function mutableTaskService(
    initial: Readonly<Record<string, { readonly status: WaitTaskStatus; readonly detached?: boolean }>>,
  ): { readonly service: IAgentTaskService; readonly setStatus: (taskId: string, status: WaitTaskStatus) => void } {
    const tasks = new Map(Object.entries(initial));
    return {
      service: {
        _serviceBrand: undefined,
        getTask: (taskId: string) => {
          const task = tasks.get(taskId);
          return task === undefined
            ? undefined
            : ({
                taskId,
                status: task.status,
                detached: task.detached ?? true,
                endedAt: task.status === 'running' ? null : 1,
              } as never);
        },
        list: () => [],
      } as unknown as IAgentTaskService,
      setStatus: (taskId, status) => {
        const task = tasks.get(taskId);
        if (task === undefined) throw new Error(`Unknown test task ${taskId}`);
        tasks.set(taskId, { ...task, status });
      },
    };
  }

  let ctx: TestAgentContext | undefined;

  afterEach(async () => {
    await ctx?.dispose();
  });

  async function createSeamedAgent(
    input: GoalContributionProviderInput,
  ): Promise<{
    ctx: TestAgentContext;
    goals: IAgentGoalService;
    loopService: StubLoop;
    clock: ManualGoalDeadlineScheduler;
  }> {
    const loopService = stubLoopWithHooks();
    const clock = new ManualGoalDeadlineScheduler();
    ctx = createTestAgent(
      contributionProviderServices(input),
      appService(IGoalDeadlineScheduler, clock),
      agentService(IAgentLoopService, loopService),
      ...(input.taskService === undefined ? [] : [agentService(IAgentTaskService, input.taskService)]),
      permissionModeServices('auto'),
    );
    // The provider is a plain seed (not in the scoped registry), so force its
    // construction to flush the contribution records before the goal service
    // reads the fold.
    ctx.get(IGoalContributionProvider);
    return { ctx, goals: ctx.get(IAgentGoalService), loopService, clock };
  }

  describe('completion guards', () => {
    it('completes without contributions with unchanged behavior', async () => {
      const { ctx, goals } = await createSeamedAgent({});
      await goals.createGoal({ objective: 'work' });

      const completed = await goals.markComplete({ reason: 'done' }, 'model');

      expect(completed).toMatchObject({ status: 'complete' });
      expect(goals.getGoal().goal).toBeNull();
      await ctx.dispose();
    });

    it('allows completion when a guard allows', async () => {
      const { goals } = await createSeamedAgent({
        guards: [() => ({ allow: true })],
      });
      await goals.createGoal({ objective: 'work' });

      const completed = await goals.markComplete({}, 'model');

      expect(completed).toMatchObject({ status: 'complete' });
      expect(goals.getGoal().goal).toBeNull();
    });

    it('supports async guards', async () => {
      const { goals } = await createSeamedAgent({
        guards: [async () => ({ allow: true })],
      });
      await goals.createGoal({ objective: 'work' });

      const completed = await goals.markComplete({}, 'model');

      expect(completed?.status).toBe('complete');
    });

    it('rejects completion with a structured deny and keeps the goal active', async () => {
      const seen: string[] = [];
      const { goals } = await createSeamedAgent({
        guards: [
          (input) => {
            seen.push(`guard:${input.goalId}:${input.actor}`);
            return {
              allow: false,
              reason: 'AITP research gate is pending',
              code: 'research.gate_pending',
              owner: 'aitp-research',
              nextStep: 'Resolve the research gate first',
            };
          },
        ],
      });
      await goals.createGoal({ objective: 'work' });
      const goalId = goals.getGoal().goal!.goalId;

      await expect(goals.markComplete({ reason: 'done' }, 'model')).rejects.toMatchObject({
        code: ErrorCodes.GOAL_STATUS_INVALID,
        message: 'AITP research gate is pending',
        details: {
          goalId,
          guard: 'GoalContributionProvider',
          code: 'research.gate_pending',
          owner: 'aitp-research',
          nextStep: 'Resolve the research gate first',
        },
      });

      expect(seen).toEqual([`guard:${goalId}:model`]);
      expect(goals.getGoal().goal).toMatchObject({ goalId, status: 'active' });
      expect(goals.getGoal().goal?.terminalReason).toBeUndefined();
    });

    it('stops at the first deny among multiple guards', async () => {
      const calls: string[] = [];
      const { goals } = await createSeamedAgent({
        guards: [
          () => {
            calls.push('first');
            return { allow: true };
          },
          () => {
            calls.push('second');
            return { allow: false, reason: 'blocked by second' };
          },
          () => {
            calls.push('third');
            return { allow: true };
          },
        ],
      });
      await goals.createGoal({ objective: 'work' });

      await expect(goals.markComplete({}, 'model')).rejects.toMatchObject({
        code: ErrorCodes.GOAL_STATUS_INVALID,
        message: 'blocked by second',
      });
      expect(calls).toEqual(['first', 'second']);
      expect(goals.getGoal().goal?.status).toBe('active');
    });

    it('allows completion when every guard allows', async () => {
      const calls: string[] = [];
      const { goals } = await createSeamedAgent({
        guards: [
          () => {
            calls.push('first');
            return { allow: true };
          },
          () => {
            calls.push('second');
            return { allow: true };
          },
        ],
      });
      await goals.createGoal({ objective: 'work' });

      const completed = await goals.markComplete({}, 'model');

      expect(completed?.status).toBe('complete');
      expect(calls).toEqual(['first', 'second']);
    });

    it('rejects completion through the UpdateGoal tool path too', async () => {
      const { goals } = await createSeamedAgent({
        guards: [() => ({ allow: false, reason: 'gate is closed' })],
      });
      await goals.createGoal({ objective: 'work' });
      const tool = new UpdateGoalTool(goals);
      const execution = tool.resolveExecution({ status: 'complete' });
      if (!('execute' in execution)) {
        throw new Error('expected a runnable UpdateGoal execution');
      }

      await expect(
        execution.execute({
          turnId: 1,
          toolCallId: 'call_guard_deny',
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.GOAL_STATUS_INVALID });

      expect(goals.getGoal().goal?.status).toBe('active');
    });
  });

  describe('continuation participants', () => {
    it('suspends on a running background task and wakes once on termination', async () => {
      const tasks = mutableTaskService({
        'task-1': { status: 'running' },
      });
      const { ctx: agent, goals, loopService } = await createSeamedAgent({
        taskService: tasks.service,
      });
      const eventBus = agent.get(IEventBus);
      await goals.createGoal({ objective: 'finish after the background task' });
      const turn = makeTurn(70);
      eventBus.publish({
        type: 'turn.started',
        turnId: turn.id,
        origin: USER_PROMPT_ORIGIN,
      });
      await loopService.hooks.onWillBeginStep.run({
        turnId: turn.id,
        step: 1,
        firstStepOfTurn: true,
        signal: turn.signal,
      });

      const waiting = await goals.waitForTasks({ taskIds: ['task-1'], policy: 'any' });
      expect(waiting.waitingFor).toEqual({ taskIds: ['task-1'], policy: 'any' });
      expect(waiting.continuation).toEqual({ state: 'waiting' });
      let clearCount = 0;
      eventBus.subscribe('goal.updated', (event) => {
        if (
          event.snapshot?.goalId === waiting.goalId &&
          event.snapshot.waitingFor === undefined &&
          event.change?.kind !== 'continuation'
        ) {
          clearCount += 1;
        }
      });
      endTurn(eventBus, turn);
      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);

      tasks.setStatus('task-1', 'completed');
      agent.wire.dispatch(taskTerminated({ info: { taskId: 'task-1' } as never }));
      await flushMicrotasks();
      expect(loopService.launches).toHaveLength(1);
      expect(goals.getGoal().goal?.waitingFor).toBeUndefined();

      eventBus.publish({
        type: 'task.terminated',
        info: { taskId: 'task-1' } as never,
      });
      await flushMicrotasks();
      expect(clearCount).toBe(1);
      expect(loopService.launches).toHaveLength(1);
    });

    it('pauses safely when a wait wake enqueue throws synchronously', async () => {
      const tasks = mutableTaskService({
        'task-1': { status: 'running' },
      });
      const { ctx: agent, goals, loopService } = await createSeamedAgent({
        taskService: tasks.service,
      });
      const eventBus = agent.get(IEventBus);
      await goals.createGoal({ objective: 'pause after a failed wait wake' });
      await goals.waitForTasks({ taskIds: ['task-1'] });
      const turn = makeTurn(73);
      eventBus.publish({
        type: 'turn.started',
        turnId: turn.id,
        origin: USER_PROMPT_ORIGIN,
      });
      await loopService.hooks.onWillBeginStep.run({
        turnId: turn.id,
        step: 1,
        firstStepOfTurn: true,
        signal: turn.signal,
      });
      endTurn(eventBus, turn);
      await flushMicrotasks();

      vi.spyOn(loopService, 'enqueue').mockImplementation(() => {
        throw new Error('wait wake enqueue exploded');
      });
      const unhandled: unknown[] = [];
      const onUnhandled = (error: unknown): void => {
        unhandled.push(error);
      };
      process.on('unhandledRejection', onUnhandled);
      try {
        tasks.setStatus('task-1', 'completed');
        eventBus.publish({
          type: 'task.terminated',
          info: { taskId: 'task-1' } as never,
        });
        await flushMicrotasks();
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }

      expect(goals.getGoal().goal).toMatchObject({
        status: 'paused',
        terminalReason: 'Paused after goal continuation failure: wait wake enqueue exploded',
      });
      expect(unhandled).toEqual([]);
    });

    it('pauses safely when a held continuation retry enqueue throws synchronously', async () => {
      const retry = new Emitter<string>();
      let decisions = 0;
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => {
          decisions += 1;
          return decisions === 1 ? { decision: 'hold', reason: 'wait' } : { decision: 'abstain' };
        }],
        retryEmitters: [retry],
      });
      const goalId = goals.getGoal().goal!.goalId;

      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);

      vi.spyOn(loopService, 'enqueue').mockImplementation(() => {
        throw new Error('held retry enqueue exploded');
      });
      const unhandled: unknown[] = [];
      const onUnhandled = (error: unknown): void => {
        unhandled.push(error);
      };
      process.on('unhandledRejection', onUnhandled);
      try {
        retry.fire(goalId);
        await flushMicrotasks();
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }

      expect(goals.getGoal().goal).toMatchObject({
        status: 'paused',
        terminalReason: 'Paused after goal continuation failure: held retry enqueue exploded',
      });
      expect(unhandled).toEqual([]);
    });

    it('waits for all selected tasks and ignores unrelated termination events', async () => {
      const tasks = mutableTaskService({
        'task-1': { status: 'running' },
        'task-2': { status: 'running' },
      });
      const { ctx: agent, goals, loopService } = await createSeamedAgent({
        taskService: tasks.service,
      });
      const eventBus = agent.get(IEventBus);
      await goals.createGoal({ objective: 'finish after every background task' });
      const waiting = await goals.waitForTasks({
        taskIds: ['task-1', 'task-2'],
        policy: 'all',
      });

      eventBus.publish({
        type: 'task.terminated',
        info: { taskId: 'unrelated-task' } as never,
      });
      await flushMicrotasks();
      expect(goals.getGoal().goal?.waitingFor).toEqual({
        taskIds: ['task-1', 'task-2'],
        policy: 'all',
      });

      tasks.setStatus('task-1', 'completed');
      eventBus.publish({
        type: 'task.terminated',
        info: { taskId: 'task-1' } as never,
      });
      await flushMicrotasks();
      expect(goals.getGoal().goal?.waitingFor).toEqual(waiting.waitingFor);
      expect(loopService.launches).toEqual([]);

      tasks.setStatus('task-2', 'failed');
      eventBus.publish({
        type: 'task.terminated',
        info: { taskId: 'task-2' } as never,
      });
      await flushMicrotasks();
      expect(goals.getGoal().goal?.waitingFor).toBeUndefined();
      expect(loopService.launches).toHaveLength(1);
    });

    it('rejects malformed, unknown, foreground, and oversized wait leases', async () => {
      const tasks = mutableTaskService({
        background: { status: 'running' },
        foreground: { status: 'running', detached: false },
      });
      const { goals } = await createSeamedAgent({ taskService: tasks.service });
      await goals.createGoal({ objective: 'validate waits' });

      const invalidInputs: readonly unknown[] = [
        { taskIds: [] },
        { taskIds: [''] },
        { taskIds: ['unknown'] },
        { taskIds: ['foreground'] },
        { taskIds: Array.from({ length: 33 }, (_, index) => `task-${index}`) },
        { taskIds: ['background'], policy: 'never' },
      ];
      for (const input of invalidInputs) {
        await expect(goals.waitForTasks(input as never)).rejects.toMatchObject({
          code: ErrorCodes.GOAL_STATUS_INVALID,
        });
      }
      expect(goals.getGoal().goal?.waitingFor).toBeUndefined();
    });

    it.each([
      { action: 'cancels', replace: false },
      { action: 'replaces', replace: true },
    ])('drops a queued wake when the goal $action before it runs', async ({ replace }) => {
      const tasks = mutableTaskService({ 'task-1': { status: 'running' } });
      const { ctx: agent, goals, loopService } = await createSeamedAgent({
        taskService: tasks.service,
      });
      const eventBus = agent.get(IEventBus);
      await goals.createGoal({ objective: 'old task' });
      await goals.waitForTasks({ taskIds: ['task-1'] });
      tasks.setStatus('task-1', 'completed');
      eventBus.publish({
        type: 'task.terminated',
        info: { taskId: 'task-1' } as never,
      });

      if (replace) {
        await goals.createGoal({ objective: 'new task', replace: true });
      } else {
        await goals.cancelGoal();
      }
      await flushMicrotasks();

      expect(loopService.launches).toEqual([]);
      expect(goals.getGoal().goal?.objective).toBe(replace ? 'new task' : undefined);
    });

    it('invalidates a pending continuation when a new wait lease is created', async () => {
      const tasks = mutableTaskService({ 'task-1': { status: 'running' } });
      let resolveDecision!: (decision: GoalContinuationDecisionResult) => void;
      const decision = new Promise<GoalContinuationDecisionResult>((resolve) => {
        resolveDecision = resolve;
      });
      const { goals, loopService, turn } = await startGoalWithTurn({
        taskService: tasks.service,
        participants: [() => decision],
      });
      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();

      const waiting = await goals.waitForTasks({ taskIds: ['task-1'] });
      resolveDecision({ decision: 'continue' });
      await flushMicrotasks();

      expect(waiting.waitingFor).toEqual({ taskIds: ['task-1'], policy: 'any' });
      expect(goals.getGoal().goal?.waitingFor).toEqual(waiting.waitingFor);
      expect(loopService.launches).toEqual([]);
    });

    it('invalidates a held continuation when a new wait lease is created', async () => {
      const tasks = mutableTaskService({ 'task-1': { status: 'running' } });
      const retry = new Emitter<string>();
      const { goals, loopService, turn } = await startGoalWithTurn({
        taskService: tasks.service,
        participants: [() => ({ decision: 'hold', reason: 'wait' })],
        retryEmitters: [retry],
      });
      const goalId = goals.getGoal().goal!.goalId;
      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);

      const waiting = await goals.waitForTasks({ taskIds: ['task-1'] });
      retry.fire(goalId);
      await flushMicrotasks();

      expect(waiting.waitingFor).toEqual({ taskIds: ['task-1'], policy: 'any' });
      expect(loopService.launches).toEqual([]);
    });

    it('does not charge wall-clock budget while waiting for a background task', async () => {
      const tasks = mutableTaskService({ 'task-1': { status: 'running' } });
      const { ctx: agent, goals, loopService, clock } = await createSeamedAgent({
        taskService: tasks.service,
      });
      const eventBus = agent.get(IEventBus);
      await goals.createGoal({ objective: 'wait without charging time' });
      await goals.setBudgetLimits({ budgetLimits: { wallClockBudgetMs: 100 } });
      clock.advanceBy(25);

      const waiting = await goals.waitForTasks({ taskIds: ['task-1'] });
      expect(waiting.wallClockMs).toBe(25);
      clock.advanceBy(1_000);
      expect(goals.getGoal().goal).toMatchObject({
        status: 'active',
        wallClockMs: 25,
        waitingFor: { taskIds: ['task-1'], policy: 'any' },
      });

      tasks.setStatus('task-1', 'completed');
      eventBus.publish({
        type: 'task.terminated',
        info: { taskId: 'task-1' } as never,
      });
      await flushMicrotasks();
      expect(loopService.launches).toHaveLength(1);
      clock.advanceBy(10);
      expect(goals.getGoal().goal?.wallClockMs).toBe(35);
    });

    async function startGoalWithTurn(
      input: GoalContributionProviderInput,
    ): Promise<{
      goals: IAgentGoalService;
      loopService: StubLoop;
      context: IAgentContextMemoryService;
      turn: Turn;
    }> {
      const { goals, loopService } = await createSeamedAgent(input);
      await goals.createGoal({ objective: 'finish the task' });
      const turn = makeTurn(71);
      ctx!.get(IEventBus).publish({
        type: 'turn.started',
        turnId: turn.id,
        origin: USER_PROMPT_ORIGIN,
      });
      await loopService.hooks.onWillBeginStep.run({
        turnId: turn.id,
        step: 1,
        firstStepOfTurn: true,
        signal: turn.signal,
      });
      return {
        goals,
        loopService,
        context: ctx!.get(IAgentContextMemoryService),
        turn,
      };
    }

    it('continues by default when every participant abstains', async () => {
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => ({ decision: 'abstain' })],
      });

      endTurn(ctx!.get(IEventBus), turn);

      await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
      expect(loopService.hasPendingRequests()).toBe(true);
      expect(goals.getGoal().goal).toMatchObject({
        status: 'active',
        continuation: { state: 'enqueued' },
      });
    });

    it('continues when a participant votes continue', async () => {
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => ({ decision: 'continue' })],
      });

      endTurn(ctx!.get(IEventBus), turn);

      await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
      expect(goals.getGoal().goal).toMatchObject({
        status: 'active',
        continuation: { state: 'enqueued' },
      });
    });

    it('holds the continuation when a participant votes hold', async () => {
      const seen: string[] = [];
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [
          (input) => {
            seen.push(`hold:${input.goalId}:${input.turnsUsed}`);
            return { decision: 'hold', reason: 'awaiting research gate', owner: 'aitp-research' };
          },
        ],
      });

      endTurn(ctx!.get(IEventBus), turn);

      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);
      expect(loopService.hasPendingRequests()).toBe(false);
      expect(goals.getGoal().goal).toMatchObject({
        status: 'active',
        continuation: {
          state: 'held',
          owner: 'aitp-research',
          reason: 'awaiting research gate',
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatch(/^hold:[0-9a-f-]+:1$/);
    });

    it('applies the first non-abstain participant decision', async () => {
      const calls: string[] = [];
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [
          () => {
            calls.push('first');
            return { decision: 'hold', reason: 'first holds' };
          },
          () => {
            calls.push('second');
            return { decision: 'continue' };
          },
          () => {
            calls.push('third');
            return { decision: 'abstain' };
          },
        ],
      });

      endTurn(ctx!.get(IEventBus), turn);

      await flushMicrotasks();
      expect(calls).toEqual(['first']);
      expect(loopService.launches).toEqual([]);
      expect(goals.getGoal().goal?.status).toBe('active');
    });

    it('reserves the async participant decision against a second turn-end trigger', async () => {
      let resolveDecision!: (decision: GoalContinuationDecisionResult) => void;
      const decision = new Promise<GoalContinuationDecisionResult>((resolve) => {
        resolveDecision = resolve;
      });
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => decision],
      });

      endTurn(ctx!.get(IEventBus), turn);
      expect(goals.getGoal().goal?.continuation).toEqual({ state: 'deciding' });
      const secondTurn = makeTurn(72);
      ctx!.get(IEventBus).publish({
        type: 'turn.started',
        turnId: secondTurn.id,
        origin: USER_PROMPT_ORIGIN,
      });
      await loopService.hooks.onWillBeginStep.run({
        turnId: secondTurn.id,
        step: 1,
        firstStepOfTurn: true,
        signal: secondTurn.signal,
      });
      endTurn(ctx!.get(IEventBus), secondTurn);

      resolveDecision({ decision: 'abstain' });
      await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    });

    it('retries when a participant releases during an asynchronous continuation decision', async () => {
      const retry = new Emitter<string>();
      let resolveDecision!: (decision: GoalContinuationDecisionResult) => void;
      const firstDecision = new Promise<GoalContinuationDecisionResult>((resolve) => {
        resolveDecision = resolve;
      });
      let decisions = 0;
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => {
          decisions += 1;
          return decisions === 1 ? firstDecision : { decision: 'abstain' };
        }],
        retryEmitters: [retry],
      });
      const goalId = goals.getGoal().goal!.goalId;
      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      retry.fire(goalId);
      resolveDecision({ decision: 'hold', reason: 'released while deciding' });

      await vi.waitFor(() => {
        expect(loopService.launches).toHaveLength(1);
      });
      expect(decisions).toBe(2);
    });

    it('clears a rejected initial async decision after a lifecycle transition', async () => {
      let rejectDecision!: (error: unknown) => void;
      const firstDecision = new Promise<GoalContinuationDecisionResult>((_resolve, reject) => {
        rejectDecision = reject;
      });
      let decisions = 0;
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => {
          decisions += 1;
          return decisions === 1 ? firstDecision : { decision: 'abstain' };
        }],
      });

      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      await goals.markBlocked({ reason: 'block while deciding' });
      rejectDecision(new Error('initial decision exploded'));
      await flushMicrotasks();

      await goals.resumeGoal({ continueIfBlocked: true });
      await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
      expect(decisions).toBe(2);
    });

    it.each([
      { action: 'cancels', replace: false },
      { action: 'replaces', replace: true },
    ])('does not enqueue after an async decision resolves late when the goal $action', async ({ replace }) => {
      let resolveDecision!: (decision: GoalContinuationDecisionResult) => void;
      const decision = new Promise<GoalContinuationDecisionResult>((resolve) => {
        resolveDecision = resolve;
      });
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => decision],
      });
      endTurn(ctx!.get(IEventBus), turn);
      await Promise.resolve();

      if (replace) {
        await goals.createGoal({ objective: 'replacement', replace: true });
      } else {
        await goals.cancelGoal();
      }
      resolveDecision({ decision: 'abstain' });
      await flushMicrotasks();

      expect(loopService.launches).toEqual([]);
      expect(goals.getGoal().goal?.objective).toBe(replace ? 'replacement' : undefined);
    });

    it('retries a held continuation through the participant notification without participant enqueue access', async () => {
      const retry = new Emitter<string>();
      let decisions = 0;
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => {
          decisions += 1;
          return decisions === 1 ? { decision: 'hold', reason: 'wait' } : { decision: 'abstain' };
        }],
        retryEmitters: [retry],
      });
      const goalId = goals.getGoal().goal!.goalId;
      const continuationStates: string[] = [];
      ctx!.get(IEventBus).subscribe('goal.updated', (event) => {
        if (event.change?.kind === 'continuation' && event.snapshot?.continuation !== undefined) {
          continuationStates.push(event.snapshot.continuation.state);
        }
      });

      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);

      retry.fire(goalId);
      await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
      expect(decisions).toBe(2);
      expect(continuationStates).toContain('enqueued');
    });

    it('re-evaluates a held continuation when an active Goal is explicitly resumed', async () => {
      let decisions = 0;
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => {
          decisions += 1;
          return decisions === 1
            ? { decision: 'hold', owner: 'research', reason: 'pending checkpoint' }
            : { decision: 'abstain' };
        }],
      });

      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      expect(goals.getGoal().goal?.continuation).toMatchObject({
        state: 'held',
        owner: 'research',
      });

      const resumed = await goals.resumeGoal({ continueIfBlocked: true });
      expect(resumed.continuation?.state).not.toBe('held');
      await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
      expect(decisions).toBe(2);
    });

    it('replaces a held projection with a new user turn and re-evaluates after it ends', async () => {
      let decisions = 0;
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => {
          decisions += 1;
          return {
            decision: 'hold',
            owner: decisions === 1 ? 'first-owner' : 'second-owner',
            reason: decisions === 1 ? 'first reason' : 'second reason',
          };
        }],
      });
      const eventBus = ctx!.get(IEventBus);
      endTurn(eventBus, turn);
      await flushMicrotasks();
      expect(goals.getGoal().goal?.continuation).toEqual({
        state: 'held',
        owner: 'first-owner',
        reason: 'first reason',
      });

      const userTurn = makeTurn(74);
      eventBus.publish({
        type: 'turn.started',
        turnId: userTurn.id,
        origin: USER_PROMPT_ORIGIN,
      });
      await loopService.hooks.onWillBeginStep.run({
        turnId: userTurn.id,
        step: 1,
        firstStepOfTurn: true,
        signal: userTurn.signal,
      });
      expect(goals.getGoal().goal?.continuation).toEqual({ state: 'running' });

      endTurn(eventBus, userTurn);
      await flushMicrotasks();
      expect(decisions).toBe(2);
      expect(goals.getGoal().goal?.continuation).toEqual({
        state: 'held',
        owner: 'second-owner',
        reason: 'second reason',
      });
    });

    it('re-evaluates every participant on retry and keeps a later hold', async () => {
      const firstRetry = new Emitter<string>();
      const secondRetry = new Emitter<string>();
      let firstDecisions = 0;
      let secondDecisions = 0;
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [
          () => {
            firstDecisions += 1;
            return firstDecisions === 1
              ? { decision: 'hold', reason: 'first participant waits' }
              : { decision: 'abstain' };
          },
          () => {
            secondDecisions += 1;
            return secondDecisions === 1
              ? { decision: 'hold', reason: 'second participant waits' }
              : { decision: 'abstain' };
          },
        ],
        retryEmitters: [firstRetry, secondRetry],
      });
      const goalId = goals.getGoal().goal!.goalId;

      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);
      expect(firstDecisions).toBe(1);
      expect(secondDecisions).toBe(0);

      firstRetry.fire(goalId);
      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);
      expect(firstDecisions).toBe(2);
      expect(secondDecisions).toBe(1);

      secondRetry.fire(goalId);
      await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
      expect(firstDecisions).toBe(3);
      expect(secondDecisions).toBe(2);
    });

    it('drops a held continuation when the goal is cancelled before a retry notification', async () => {
      const retry = new Emitter<string>();
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => ({ decision: 'hold', reason: 'wait' })],
        retryEmitters: [retry],
      });
      const goalId = goals.getGoal().goal!.goalId;

      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      await goals.cancelGoal();
      retry.fire(goalId);
      await flushMicrotasks();

      expect(loopService.launches).toEqual([]);
    });

    it('keeps the hold across an opted paused resume without auto-continuation', async () => {
      const { goals, loopService, turn } = await startGoalWithTurn({
        participants: [() => ({ decision: 'hold', reason: 'wait for user' })],
      });

      endTurn(ctx!.get(IEventBus), turn);
      await flushMicrotasks();
      expect(loopService.launches).toEqual([]);

      const resumed = await goals.resumeGoal({ continueIfPaused: true });
      expect(resumed.status).toBe('active');
      expect(loopService.launches).toEqual([]);
      expect(goals.getGoal().goal?.status).toBe('active');
    });
  });
});

/**
 * Container-level integration for the AITP Research feature's goal
 * contribution seams: the real `AgentResearchService` is resolved through
 * `TestInstantiationService` and its collection records are folded by the real
 * `AgentGoalService` — `GoalCompletionGuardContribution` gates `markComplete`,
 * and `GoalContinuationParticipantContribution` holds the automatic
 * continuation while the Research loop is paused, the mode is degraded, or a
 * human gate is unresolved, abstaining otherwise (the Goal default wins).
 */
describe('AITP Research goal contribution integration', () => {
  function mutablePermissionMode(initialMode: PermissionMode): IAgentPermissionModeService {
    let mode = initialMode;
    const changed = new Emitter<{
      readonly mode: PermissionMode;
      readonly previousMode: PermissionMode;
    }>();
    const service: IAgentPermissionModeService = {
      _serviceBrand: undefined,
      get mode() {
        return mode;
      },
      setMode: (nextMode) => {
        const previousMode = mode;
        if (nextMode === previousMode) return;
        mode = nextMode;
        changed.fire({ mode: nextMode, previousMode });
      },
      setModeAndBroadcast: (nextMode) => service.setMode(nextMode),
      onDidChangeMode: changed.event,
    };
    return service;
  }

  function makeReadyAdapter(): ISessionAitpAdapter {
    return {
      _serviceBrand: undefined,
      health: { phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' },
      probe: async () => ({ phase: 'ready', contractVersion: '0.1', pluginVersion: '0.8.0' }),
      enter: async () => ({
        schema: 'aitp/enter-0.2', memory_status: 'available', root: '/w',
        topic: { id: 't', title: 'T', goal: { text: 'g', source: 's' } },
        recent_entries: [], unresolved_failures: [],
        next_action: { status: 'not_established', source: null },
        latest_working_note: null, recent_notes: [],
        counts: { active: 0, superseded: 0, unresolved_failures: 0, malformed: 0, omitted_active: 0, active_newer_than_latest_working_note: null },
        warnings: [],
      }),
      list: async () => ({ schema: 'aitp/list-0.1', root: '/w', count: 0, entries: [], warnings: [] }),
      show: async () => ({ schema: 'aitp/show-0.1', root: '/w', id: 'e1', status: 'active', source: 's', legacy_derived: false, frontmatter: {}, body: '' }),
      check: async () => ({ schema: 'aitp/check-report-0.1', root: '/w', status: 'clean', counts: { entries: 0, notes: 0, errors: 0, warnings: 0 }, findings: [] }),
      recordPrepare: async () => ({ status: 'prepared', id: 'e', path: 'p', save_command: 'c' }),
      recordSave: async () => ({ status: 'saved', path: 'p' }),
      notePrepare: async () => ({ status: 'prepared', id: 'n', path: 'p', save_command: 'c' }),
      noteSave: async () => ({ status: 'saved', path: 'p' }),
      resolveContractIdentity: () => null,
      isReady: () => true,
      isDegraded: () => false,
      reset: () => {},
    };
  }

  function researchResearchAgent(
    enabled: boolean,
    useRealPlanService = false,
  ): readonly TestAgentServiceOverride[] {
    return [
      appService(IFlagService, { enabled: () => enabled } as never),
      sessionService(ISessionAitpAdapter, makeReadyAdapter()),
      sessionService(ISessionAitpLifecycleCoordinator, {
        _serviceBrand: undefined,
        snapshot: () => undefined,
        onDidUpdate: () => ({ dispose: () => {} }),
        refresh: async (options?: { readonly workstream?: string }) => ({
          status: 'ready',
          refreshedAt: 1,
          memoryStatus: 'available',
          workstream: options?.workstream,
          topic: { id: 't', title: 'T', goalText: 'g', goalSource: 's' },
          activeNewerThanWorkingNote: false,
          unresolvedFailureCount: 0,
          unresolvedFailures: [],
          warningSummaries: [],
          check: { status: 'clean', errors: 0, warnings: 0, findingCodes: [] },
        }),
        reset: () => {},
      } as never),
      agentService(IEventBus, new EventBusService()),
      agentService(IAgentAgentsMdReminderService, {
        _serviceBrand: undefined,
        seedInjected: () => {},
      }),
      agentService(IAgentStateService, new AgentStateService()),
      agentService(IAgentProfileService, {
        _serviceBrand: undefined,
        data: () => ({
          modelCapabilities: {},
          thinkingLevel: 'off',
          systemPrompt: '',
          activeToolNames: [],
          disallowedTools: [],
        }),
        update: () => {},
        addActiveTool: () => {},
        removeActiveTool: () => {},
        getActiveToolNames: () => [],
        getModelCapabilities: () => ({}),
        resolveModelContext: () => ({
          modelAlias: 'test-model',
          modelCapabilities: {},
          maxOutputSize: undefined,
          alwaysThinking: undefined,
          thinkingLevel: 'off',
          reservedContextSize: undefined,
          compactionTriggerRatio: undefined,
        }),
        getSystemPrompt: () => '',
        hasProvider: () => true,
        hasModel: () => true,
        isRunnable: () => true,
        refreshSystemPrompt: async () => {},
        getEffectiveThinkingLevel: () => 'off',
        resolveRequestParams: () => ({}),
        getModel: () => 'test-model',
      } as never),
      ...(useRealPlanService ? [] : [agentService(IAgentPlanService, { status: async () => null } as never)]),
    ];
  }

  let ctx: TestAgentContext | undefined;

  afterEach(async () => {
    await ctx?.dispose();
  });

  async function createResearchGoalAgent(
    enabled: boolean,
    loopService?: StubLoop,
    useRealPlanService = false,
    permissionMode: PermissionMode | IAgentPermissionModeService = 'auto',
  ): Promise<{
    goals: IAgentGoalService;
    mode: IAgentAitpModeService;
    research: IAgentResearchService;
  }> {
    ctx = createTestAgent(
      ...researchResearchAgent(enabled, useRealPlanService),
      ...(loopService === undefined ? [] : [agentService(IAgentLoopService, loopService)]),
      typeof permissionMode === 'string'
        ? permissionModeServices(permissionMode)
        : agentService(IAgentPermissionModeService, permissionMode),
    );
    const goals = ctx.get(IAgentGoalService);
    const mode = ctx.get(IAgentAitpModeService);
    const research = ctx.get(IAgentResearchService);
    return { goals, mode, research };
  }

  function observeResearchProgram(): void {
    ctx!.wire.dispatch(researchSetProgram({
      topicId: 't',
      title: 'T',
      goalText: 'g',
      goalSource: 's',
      establishedAt: 1,
    }));
  }

  function confirmResearchGoalAlignment(
    research: IAgentResearchService,
    goals: IAgentGoalService,
  ): void {
    const goal = goals.getGoal().goal;
    const program = research.getProgram();
    if (goal === null || program === null) throw new Error('expected a Goal and Research Program');
    research.confirmGoalAlignment({
      relation: 'same_program_goal',
      expectedRevision: research.getSnapshot().revision,
      goalId: goal.goalId,
      topicId: program.topicId,
      observedRevision: program.observedRevision,
    });
  }

  async function confirmResearchWorkstreamBinding(
    research: IAgentResearchService,
  ): Promise<void> {
    research.createLine({ slug: 'main', title: 'Main' });
    research.switchLine('main');
    await research.confirmLineWorkstreamBinding({
      lineSlug: 'main',
      workstream: 'main',
      expectedRevision: research.getSnapshot().revision,
      confirmedBy: 'main_agent',
    });
  }

  it('denies markComplete when the mode is active with an unresolved human gate', async () => {
    const { goals, mode, research } = await createResearchGoalAgent(true);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'work' });
    confirmResearchGoalAlignment(research, goals);
    await confirmResearchWorkstreamBinding(research);
    const gate = research.requestHumanDecision({ kind: 'decision', prompt: 'Choose' });

    await expect(goals.markComplete({}, 'model')).rejects.toMatchObject({
      code: ErrorCodes.GOAL_STATUS_INVALID,
      message: 'Goal completion is blocked: a Research human gate is unresolved. Resolve the gate before completing the goal.',
      details: {
        code: 'research.human-gate.unresolved',
        owner: 'aitpResearch',
        guard: 'AgentResearchService',
        nextStep: 'ResolveResearchDecision',
      },
    });
    expect(goals.getGoal().goal?.status).toBe('active');

    research.resolveHumanDecision({ gateId: gate.gateId, resolution: 'ok', nextPhase: 'gap_analysis' });
    const completed = await goals.markComplete({}, 'model');
    expect(completed?.status).toBe('complete');
  });

  it('rejects markComplete through the UpdateGoal tool path too', async () => {
    const { goals, mode, research } = await createResearchGoalAgent(true);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'work' });
    confirmResearchGoalAlignment(research, goals);
    research.requestHumanDecision({ kind: 'decision', prompt: 'Choose' });

    const tool = new UpdateGoalTool(goals);
    const execution = tool.resolveExecution({ status: 'complete' });
    if (!('execute' in execution)) {
      throw new Error('expected a runnable UpdateGoal execution');
    }

    await expect(
      execution.execute({
        turnId: 1,
        toolCallId: 'call_guard_deny',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.GOAL_STATUS_INVALID });

    expect(goals.getGoal().goal?.status).toBe('active');
  });

  it('allows markComplete when the mode is inactive or the flag is off', async () => {
    const { goals } = await createResearchGoalAgent(false);
    await goals.createGoal({ objective: 'work' });

    const completed = await goals.markComplete({}, 'model');

    expect(completed?.status).toBe('complete');
    expect(goals.getGoal().goal).toBeNull();
  });

  it('denies completion and holds continuation when an active Goal has no Research Program', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    ctx!.wire.dispatch(researchSetProgram({ clear: true }));
    await goals.createGoal({ objective: 'finish the task' });

    await expect(goals.markComplete({}, 'model')).rejects.toMatchObject({
      code: ErrorCodes.GOAL_STATUS_INVALID,
      message: 'Goal completion is blocked: AITP Research Goal has not been observed.',
      details: {
        code: 'research.goal-alignment.unavailable',
        owner: 'aitpResearch',
        nextStep: 'ConfirmGoalAlignment',
      },
    });

    const turn = makeTurn(78);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    endTurn(ctx!.get(IEventBus), turn);
    await flushMicrotasks();

    expect(loopService.launches).toEqual([]);
    expect(research.getSnapshot().goalAlignment).toMatchObject({ status: 'unavailable' });
    expect(research.getSnapshot().effectiveNextStep).toMatchObject({
      source: 'aitp_maintenance',
      freshness: 'blocked',
    });
    expect(research.getSnapshot().status).toMatchObject({
      health: 'blocked',
      attention: [expect.stringContaining('No current AITP Research Goal')],
    });
  });

  it('allows direct Plan entry while Research Mode is active and keeps Research state intact', async () => {
    const { mode } = await createResearchGoalAgent(true, undefined, true);
    await mode.enter({ actor: 'user' });
    const plan = ctx!.get(IAgentPlanService);

    await plan.enter('research-plan', false);

    expect(await plan.status()).not.toBeNull();
    expect(mode.isActive).toBe(true);
    expect(mode.phase).not.toBe('inactive');
  });

  it('holds the goal continuation while the research loop is paused and keeps the goal active', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);
    const turn = makeTurn(71);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });

    research.steer({ kind: 'pause_loop', expectedRevision: 0 });
    expect(mode.loopStatus).toBe('paused');
    endTurn(ctx!.get(IEventBus), turn);

    await flushMicrotasks();
    expect(loopService.launches).toEqual([]);
    expect(loopService.hasPendingRequests()).toBe(false);
    expect(goals.getGoal().goal).toMatchObject({
      status: 'active',
      continuation: {
        state: 'held',
        owner: 'aitpResearch',
        reason: expect.stringContaining('research loop is paused'),
      },
    });
  });

  it('resumes the goal continuation when the research loop is active and no gate is pending', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);
    const turn = makeTurn(72);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    expect(mode.loopStatus).toBe('active');

    endTurn(ctx!.get(IEventBus), turn);

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(loopService.hasPendingRequests()).toBe(true);
    expect(goals.getGoal().goal).toMatchObject({ status: 'active' });
  });

  it('holds the goal continuation while an active Plan nests under Research Mode', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService, true);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);
    const plan = ctx!.get(IAgentPlanService);
    const turn = makeTurn(75);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });

    await plan.enter('plan-under-research', false);
    expect(mode.isActive).toBe(true);
    endTurn(ctx!.get(IEventBus), turn);

    await flushMicrotasks();
    expect(loopService.launches).toEqual([]);
    expect(loopService.hasPendingRequests()).toBe(false);
    expect(goals.getGoal().goal).toMatchObject({ status: 'active' });

    plan.exit();
    const nextTurn = makeTurn(76);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: nextTurn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: nextTurn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: nextTurn.signal,
    });
    endTurn(ctx!.get(IEventBus), nextTurn);

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal).toMatchObject({ status: 'active' });
  });

  it('holds the goal continuation while a research human gate is unresolved', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);
    const turn = makeTurn(73);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    const gate = research.requestHumanDecision({ kind: 'decision', prompt: 'Choose' });
    expect(gate.gateId).toBeDefined();

    endTurn(ctx!.get(IEventBus), turn);

    await flushMicrotasks();
    expect(loopService.launches).toEqual([]);
    expect(loopService.hasPendingRequests()).toBe(false);
    expect(goals.getGoal().goal).toMatchObject({ status: 'active' });
  });

  it('releases a held goal continuation when the research loop resumes', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);

    const heldTurn = makeTurn(74);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: heldTurn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: heldTurn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: heldTurn.signal,
    });
    research.steer({ kind: 'pause_loop', expectedRevision: 0 });
    endTurn(ctx!.get(IEventBus), heldTurn);
    await flushMicrotasks();
    expect(loopService.launches).toEqual([]);
    expect(goals.getGoal().goal?.status).toBe('active');

    research.steer({ kind: 'resume_loop', expectedRevision: 0 });

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal?.status).toBe('active');
  });

  it('abstains from the goal continuation decision when the flag is off or the mode is inactive', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode } = await createResearchGoalAgent(false, loopService);
    await goals.createGoal({ objective: 'finish the task' });
    expect(mode.isActive).toBe(false);

    const turn = makeTurn(76);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    endTurn(ctx!.get(IEventBus), turn);

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal?.status).toBe('active');
  });

  it('resolves a pending human gate and then continues the goal automatically', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);

    const heldTurn = makeTurn(77);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: heldTurn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: heldTurn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: heldTurn.signal,
    });
    const gate = research.requestHumanDecision({ kind: 'decision', prompt: 'Choose' });
    endTurn(ctx!.get(IEventBus), heldTurn);
    await flushMicrotasks();
    expect(loopService.launches).toEqual([]);

    research.resolveHumanDecision({
      gateId: gate.gateId,
      resolution: 'proceed',
      nextPhase: 'gap_analysis',
    });

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal?.status).toBe('active');
  });

  it('releases exactly one held continuation when auto adopts a matching action approval', async () => {
    const loopService = stubLoopWithHooks();
    const permissionMode = mutablePermissionMode('manual');
    const { goals, mode, research } = await createResearchGoalAgent(
      true,
      loopService,
      false,
      permissionMode,
    );
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);

    const heldTurn = makeTurn(81);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: heldTurn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: heldTurn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: heldTurn.signal,
    });
    const action = research.planAction({
      kind: 'simulation',
      purpose: 'run the bounded remote diagnostic',
      stopCondition: 'the diagnostic artifact is available',
      requiresHumanApproval: true,
    });
    research.requestHumanDecision({
      kind: 'approval',
      actionId: action.actionId,
      prompt: 'Approve the bounded remote diagnostic',
    });
    endTurn(ctx!.get(IEventBus), heldTurn);
    await flushMicrotasks();
    expect(loopService.launches).toEqual([]);

    permissionMode.setMode('auto');

    expect(research.getSnapshot()).toMatchObject({
      phase: 'action_executing',
      currentAction: { actionId: action.actionId, status: 'in_progress' },
      humanGate: {
        actionId: action.actionId,
        resolution: expect.stringContaining('Standing auto permission applied'),
        resolvedAt: expect.any(Number),
      },
    });
    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    await flushMicrotasks();
    expect(loopService.launches).toHaveLength(1);
    expect(goals.getGoal().goal?.status).toBe('active');
  });

  it('releases a held goal continuation when Research recovers from degraded mode', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);
    const turn = makeTurn(80);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    mode.setPhase('degraded');
    endTurn(ctx!.get(IEventBus), turn);
    await flushMicrotasks();
    expect(loopService.launches).toEqual([]);

    mode.setPhase('ready');

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal?.status).toBe('active');
  });

  it('resumes the loop with a matching research revision and rejects a stale one', async () => {
    const loopService = stubLoopWithHooks();
    const { goals, mode, research } = await createResearchGoalAgent(true, loopService);
    await mode.enter({ actor: 'user' });
    observeResearchProgram();
    await goals.createGoal({ objective: 'finish the task' });
    confirmResearchGoalAlignment(research, goals);
    const turn = makeTurn(79);
    ctx!.get(IEventBus).publish({
      type: 'turn.started',
      turnId: turn.id,
      origin: USER_PROMPT_ORIGIN,
    });
    await loopService.hooks.onWillBeginStep.run({
      turnId: turn.id,
      step: 1,
      firstStepOfTurn: true,
      signal: turn.signal,
    });
    const researchRevision = research.getSnapshot().revision;
    research.steer({ kind: 'pause_loop', expectedRevision: researchRevision });
    expect(mode.loopStatus).toBe('paused');

    expect(() =>
      research.steer({ kind: 'resume_loop', expectedRevision: researchRevision - 1 }),
    ).toThrow(
      expect.objectContaining({ code: AitpResearchErrors.codes.RESEARCH_REVISION_STALE }),
    );
    expect(mode.loopStatus).toBe('paused');

    research.steer({
      kind: 'resume_loop',
      expectedRevision: research.getSnapshot().revision,
    });
    expect(mode.loopStatus).toBe('active');
    endTurn(ctx!.get(IEventBus), turn);

    await vi.waitFor(() => expect(loopService.launches).toHaveLength(1));
    expect(goals.getGoal().goal?.status).toBe('active');
  });
});
