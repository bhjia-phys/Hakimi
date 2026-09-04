import { describe, expect, it, vi } from 'vitest';

import type {
  EventSourceRef,
  IDisposable,
  KlientChannel,
  ScopeRef,
} from '../src/core/channel.js';
import {
  researchStatusSnapshotSchema,
  resolveHumanDecisionInputSchema,
} from '../src/contract/agent/researchSchemas.js';
import { createKlientFromChannel } from '../src/core/klient.js';
import { KlientValidationError } from '../src/core/validation.js';

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Records calls, replays scripted results, and captures listen subscriptions. */
class FakeChannel implements KlientChannel {
  readonly calls: Array<{ scope: ScopeRef; service: string; method: string; args: unknown[] }> = [];
  readonly subscriptions: Array<{
    scope: ScopeRef;
    source: EventSourceRef;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  result: unknown;
  /** Keyed `${service}.${method}` result overrides. */
  readonly results = new Map<string, unknown>();
  private readonly handlers = new Map<number, (data: unknown) => void>();
  private nextSub = 0;

  call(scope: ScopeRef, service: string, method: string, args: unknown[]): Promise<unknown> {
    this.calls.push({ scope, service, method, args });
    const key = `${service}.${method}`;
    return Promise.resolve(this.results.has(key) ? this.results.get(key) : this.result);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async *stream(_scope: ScopeRef, _service: string, _method: string, _args: unknown[]): AsyncIterableIterator<unknown> {
    // stub — streaming is not exercised in facade tests
  }

  listen(scope: ScopeRef, source: EventSourceRef, handler: (data: unknown) => void): IDisposable {
    const id = this.nextSub;
    this.nextSub += 1;
    this.handlers.set(id, handler);
    const dispose = vi.fn(() => {
      this.handlers.delete(id);
    });
    this.subscriptions.push({ scope, source, dispose });
    return { dispose };
  }

  /** Push a raw payload into the Nth subscription (0-based). */
  emit(index: number, data: unknown): void {
    this.handlers.get(index)?.(data);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

const SUMMARY = {
  id: 's1',
  workspaceId: 'w1',
  createdAt: 1,
  updatedAt: 2,
  archived: false,
};

describe('research contract validation', () => {
  const baseSnapshot = {
    mode: 'ready',
    loopStatus: 'active',
    planningPolicy: 'collaborative',
    lineWorkstreamBindings: [],
    questions: [],
    lines: [],
    openQuestionCount: 0,
    activeQuestionCount: 0,
    blockedQuestionCount: 0,
    alerts: [],
    aitpHealth: { phase: 'ready' },
    phase: 'idle',
    revision: 1,
  };

  it('accepts legacy missing continuation, preserves current state, and rejects unknown state', () => {
    const goalSummary = {
      goalId: 'goal-1',
      objective: 'Validate one bounded result.',
      status: 'active' as const,
    };
    expect(researchStatusSnapshotSchema.parse({
      ...baseSnapshot,
      goalSummary,
    }).goalSummary?.continuation).toBeUndefined();
    expect(researchStatusSnapshotSchema.parse({
      ...baseSnapshot,
      goalSummary: {
        ...goalSummary,
        continuation: {
          state: 'held',
          owner: 'aitpResearch',
          reason: 'Resolve the recovered action from evidence.',
        },
      },
    }).goalSummary?.continuation).toEqual({
      state: 'held',
      owner: 'aitpResearch',
      reason: 'Resolve the recovered action from evidence.',
    });
    expect(researchStatusSnapshotSchema.safeParse({
      ...baseSnapshot,
      goalSummary: { ...goalSummary, continuation: { state: 'future_state' } },
    }).success).toBe(false);
  });

  it('rejects malformed current Line-workstream alignment invariants', () => {
    const binding = {
      confirmationId: 'confirmation-main-1',
      lineSlug: 'main',
      workstream: 'verified-inputs',
      topicId: 'topic-1',
      observedRevision: 1,
      confirmedBy: 'user' as const,
      confirmedAt: 1,
    };
    const { confirmationId, ...identitylessBinding } = binding;
    expect(confirmationId).toBe('confirmation-main-1');
    const missingBindingStatuses = ['unavailable', 'bound', 'stale', 'conflict'] as const;
    const invalidSnapshots = [
      ...missingBindingStatuses.map((status) => ({
        ...baseSnapshot,
        currentLineSlug: 'main',
        currentWorkstreamBinding: {
          lineSlug: 'main',
          status,
          reason: 'Malformed missing binding.',
        },
      })),
      {
        ...baseSnapshot,
        currentLineSlug: 'main',
        currentWorkstreamBinding: {
          lineSlug: 'main',
          status: 'unbound',
          reason: 'Malformed unexpected binding.',
          binding,
        },
      },
      {
        ...baseSnapshot,
        currentLineSlug: 'main',
        currentWorkstreamBinding: {
          lineSlug: 'main',
          status: 'bound',
          reason: 'Malformed non-conflicting binding Line mismatch.',
          binding: { ...binding, lineSlug: 'other' },
        },
      },
      {
        ...baseSnapshot,
        currentLineSlug: 'main',
        currentWorkstreamBinding: {
          lineSlug: 'other',
          status: 'unbound',
          reason: 'Malformed current Line mismatch.',
        },
      },
    ];

    for (const snapshot of invalidSnapshots) {
      expect(researchStatusSnapshotSchema.safeParse(snapshot).success).toBe(false);
    }
    expect(researchStatusSnapshotSchema.safeParse({
      ...baseSnapshot,
      currentLineSlug: 'main',
      currentWorkstreamBinding: {
        lineSlug: 'main',
        status: 'bound',
        reason: 'Identity-less binding.',
        binding: identitylessBinding,
      },
      lineWorkstreamBindings: [identitylessBinding],
    }).success).toBe(false);
    expect(researchStatusSnapshotSchema.safeParse({
      ...baseSnapshot,
      currentLineSlug: 'main',
      currentWorkstreamBinding: {
        lineSlug: 'main',
        status: 'conflict',
        reason: 'The stored binding identifies another Line.',
        binding: { ...binding, lineSlug: 'other' },
      },
    }).success).toBe(true);
  });
});

describe('facade routing', () => {
  it('reshapes single-object params into positional wire args', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);

    channel.result = { id: 'w1', root: '/x', name: 'n', createdAt: 1, lastOpenedAt: 2 };
    await klient.global.workspaces.createOrTouch({ root: '/x', name: 'n' });
    expect(channel.calls[0]).toMatchObject({
      service: 'workspaceService',
      method: 'createOrTouch',
      args: ['/x', 'n'],
    });

    channel.result = undefined; // void output
    await klient.global.plugins.setMcpServerEnabled({ id: 'p', server: 's', enabled: true });
    expect(channel.calls[1]).toMatchObject({
      service: 'pluginService',
      method: 'setPluginMcpServerEnabled',
      args: [{ id: 'p', server: 's', enabled: true }],
    });

    channel.results.set('oauthService.status', { loggedIn: false });
    await klient.global.auth.status();
    expect(channel.calls[2]).toMatchObject({
      service: 'oauthService',
      method: 'status',
      args: [undefined],
    });
  });

  it('routes capability calls through the registered app service contract', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const status = {
      id: 'kimi-cu',
      displayName: 'Kimi Computer Use',
      description: 'Background GUI automation',
      supported: true,
      state: 'partial',
      steps: [{ id: 'permissions', state: 'missing' }],
      // The completed-install note survives the contract parse (not stripped).
      install: { running: false, note: 'user-skill-migrated' },
    };
    channel.result = [status];

    await expect(klient.global.capabilities.list()).resolves.toEqual([status]);
    channel.result = status;
    await expect(klient.global.capabilities.get('kimi-cu')).resolves.toEqual(status);
    await expect(klient.global.capabilities.install('kimi-cu')).resolves.toEqual(status);

    expect(channel.calls).toEqual([
      { scope: {}, service: 'capabilityService', method: 'listCapabilities', args: [] },
      { scope: {}, service: 'capabilityService', method: 'getCapability', args: ['kimi-cu'] },
      { scope: {}, service: 'capabilityService', method: 'installCapability', args: ['kimi-cu'] },
    ]);
  });

  it('env() fans out property reads and merges them', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = 'v';
    channel.results.set('bootstrapService.clientIdentity', {
      productName: 'v',
      version: 'v',
      platform: 'v',
    });
    const env = await klient.global.env();
    expect(env.platform).toBe('v');
    expect(env.logsDir).toBe('v');
    expect(env.clientVersion).toBe('v');
    expect(channel.calls).toHaveLength(12);
    expect(channel.calls.every((call) => call.service === 'bootstrapService')).toBe(true);
  });

  it('env() resolves once and serves repeats from the cache', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = 'v';
    channel.results.set('bootstrapService.clientIdentity', {
      productName: 'v',
      version: 'v',
      platform: 'v',
    });
    await klient.global.env();
    expect(channel.calls).toHaveLength(12);

    const again = await klient.global.env();
    expect(again.platform).toBe('v');
    expect(channel.calls).toHaveLength(12);
  });
});

describe('agent profile routing', () => {
  it('thinking calls route to agentProfileService with the agent scope', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    channel.result = undefined; // void output
    await agent.setThinking('on');
    expect(channel.calls[0]).toEqual({
      scope: { sessionId: 's1', agentId: 'main' },
      service: 'agentProfileService',
      method: 'setThinking',
      args: ['on'],
    });

    channel.result = 'high';
    await expect(agent.getThinking()).resolves.toBe('high');
    expect(channel.calls[1]).toEqual({
      scope: { sessionId: 's1', agentId: 'main' },
      service: 'agentProfileService',
      method: 'getEffectiveThinkingLevel',
      args: [],
    });
  });
});

describe('agent skill routing', () => {
  it('promptWithSkills routes to agentSkillService.promptWithSkills with the agent scope', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    channel.result = { turn_id: 7 };
    await expect(
      agent.promptWithSkills({
        input: [{ type: 'text', text: 'Review this change.' }],
        skills: [{ name: 'review' }, { name: 'security', args: 'src/app.ts' }],
      }),
    ).resolves.toEqual({ turn_id: 7 });
    expect(channel.calls[0]).toEqual({
      scope: { sessionId: 's1', agentId: 'main' },
      service: 'agentSkillService',
      method: 'promptWithSkills',
      args: [
        {
          input: [{ type: 'text', text: 'Review this change.' }],
          skills: [{ name: 'review' }, { name: 'security', args: 'src/app.ts' }],
        },
      ],
    });
  });
});

describe('session skills routing', () => {
  it('skills.list routes to sessionSkillCatalog.list with the session scope', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);

    const summaries = [
      {
        name: 'review',
        description: 'review changes',
        path: '/skills/review/SKILL.md',
        source: 'project',
      },
    ];
    channel.result = summaries;
    await expect(klient.session('s1').skills.list()).resolves.toEqual(summaries);
    expect(channel.calls[0]).toEqual({
      scope: { sessionId: 's1' },
      service: 'sessionSkillCatalog',
      method: 'list',
      args: [],
    });
  });

  it('skills.changed maps to the sessionSkillCatalog emitter', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const seen: unknown[] = [];

    klient.session('s1').events.on('skills.changed', (event) => seen.push(event));
    expect(channel.subscriptions[0]?.source).toEqual({
      kind: 'emitter',
      service: 'sessionSkillCatalog',
      event: 'onDidChange',
    });

    channel.emit(0, 'workspace');
    await tick();
    expect(seen).toEqual(['workspace']);
  });

  it('activateSkill routes to agentSkillService with the agent scope', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    channel.result = { turn_id: 3 };
    await expect(agent.activateSkill({ name: 'review', args: 'src/app.ts' })).resolves.toEqual({
      turn_id: 3,
    });
    expect(channel.calls[0]).toEqual({
      scope: { sessionId: 's1', agentId: 'main' },
      service: 'agentSkillService',
      method: 'activate',
      args: [{ name: 'review', args: 'src/app.ts' }],
    });
  });

  it('turn-driving calls route to their domain services with the agent scope', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const scope = { sessionId: 's1', agentId: 'main' };

    channel.results.set('agentPromptService.submit', { turn_id: 1 });
    channel.results.set('agentPromptService.submitSteer', { turn_id: 1 });
    channel.results.set('agentCommandService.list', []);
    await agent.prompt({ input: [{ type: 'text', text: 'hi' }] });
    await agent.steer({ input: [{ type: 'text', text: 'steer' }] });
    await agent.cancel({ turnId: 2 });
    await agent.cancel();
    await agent.setPermission('yolo');
    await agent.listCommands();
    await agent.runCommand({ name: 'cmd', args: 'a b' });
    await agent.runCommand({ name: 'plain' });

    expect(channel.calls).toEqual([
      {
        scope,
        service: 'agentPromptService',
        method: 'submit',
        args: [{ input: [{ type: 'text', text: 'hi' }] }],
      },
      {
        scope,
        service: 'agentPromptService',
        method: 'submitSteer',
        args: [{ input: [{ type: 'text', text: 'steer' }] }],
      },
      { scope, service: 'agentLoopService', method: 'cancelFromUser', args: [2] },
      { scope, service: 'agentLoopService', method: 'cancelFromUser', args: [] },
      { scope, service: 'agentPermissionModeService', method: 'setModeAndBroadcast', args: ['yolo'] },
      { scope, service: 'agentCommandService', method: 'list', args: [] },
      { scope, service: 'agentCommandService', method: 'run', args: ['cmd', 'a b'] },
      { scope, service: 'agentCommandService', method: 'run', args: ['plain'] },
    ]);
  });

  it('cancelPlan omits an absent id and preserves an explicit id', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const scope = { sessionId: 's1', agentId: 'main' };

    await agent.cancelPlan();
    await agent.cancelPlan({ id: 'plan-1' });

    expect(channel.calls).toEqual([
      { scope, service: 'agentPlanService', method: 'cancel', args: [] },
      { scope, service: 'agentPlanService', method: 'cancel', args: ['plan-1'] },
    ]);
  });

  it('getContext merges the contextMemory and tokenCounting reads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const scope = { sessionId: 's1', agentId: 'main' };

    channel.results.set('agentContextMemoryService.get', [{ role: 'user' }]);
    channel.results.set('agentTokenCountingService.statusSize', 42);
    await expect(agent.getContext()).resolves.toEqual({
      history: [{ role: 'user' }],
      tokenCount: 42,
    });
    expect(channel.calls).toEqual([
      { scope, service: 'agentContextMemoryService', method: 'get', args: [] },
      { scope, service: 'agentTokenCountingService', method: 'statusSize', args: [] },
    ]);
  });
});

describe('agent mcp / compaction routing', () => {
  it('getMcpServers returns the live snapshot with the agent scope', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    const entries = [
      { name: 'mock', transport: 'stdio', status: 'pending', toolCount: 0 },
    ];
    channel.results.set('agentMcpService.list', entries);
    await expect(agent.getMcpServers()).resolves.toEqual(entries);
    expect(channel.calls[0]).toEqual({
      scope: { sessionId: 's1', agentId: 'main' },
      service: 'agentMcpService',
      method: 'list',
      args: [],
    });
    expect(channel.calls).toHaveLength(1);
  });

  it('compact issues a manual begin with the optional instruction', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    channel.result = true;
    await expect(agent.compact()).resolves.toBe(true);
    expect(channel.calls[0]).toEqual({
      scope: { sessionId: 's1', agentId: 'main' },
      service: 'agentFullCompactionService',
      method: 'begin',
      args: [{ source: 'manual', instruction: undefined }],
    });

    channel.result = false;
    await expect(agent.compact({ instruction: 'keep the plan' })).resolves.toBe(false);
    expect(channel.calls[1]).toEqual({
      scope: { sessionId: 's1', agentId: 'main' },
      service: 'agentFullCompactionService',
      method: 'begin',
      args: [{ source: 'manual', instruction: 'keep the plan' }],
    });
  });
});

describe('agent goal routing', () => {
  const GOAL_SNAPSHOT = {
    goalId: 'g1',
    objective: 'ship it',
    completionCriterion: 'tests pass',
    status: 'active',
    turnsUsed: 0,
    tokensUsed: 0,
    wallClockMs: 0,
    budget: {
      tokenBudget: null,
      turnBudget: null,
      wallClockBudgetMs: null,
      remainingTokens: null,
      remainingTurns: null,
      remainingWallClockMs: null,
      tokenBudgetReached: false,
      turnBudgetReached: false,
      wallClockBudgetReached: false,
      overBudget: false,
    },
  };

  it('maps goal methods to agentGoalService with positional wire args', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const scope = { sessionId: 's1', agentId: 'main' };

    channel.results.set('agentGoalService.createGoal', GOAL_SNAPSHOT);
    await expect(
      agent.goal.create({ objective: 'ship it', completionCriterion: 'tests pass' }),
    ).resolves.toEqual(GOAL_SNAPSHOT);
    expect(channel.calls[0]).toEqual({
      scope,
      service: 'agentGoalService',
      method: 'createGoal',
      args: [{ objective: 'ship it', completionCriterion: 'tests pass' }],
    });

    // get unwraps the engine's `{ goal }` tool result.
    channel.results.set('agentGoalService.getGoal', { goal: GOAL_SNAPSHOT });
    await expect(agent.goal.get()).resolves.toEqual(GOAL_SNAPSHOT);
    expect(channel.calls[1]).toEqual({
      scope,
      service: 'agentGoalService',
      method: 'getGoal',
      args: [],
    });

    channel.results.set('agentGoalService.getGoal', { goal: null });
    await expect(agent.goal.get()).resolves.toBeNull();

    // Omitted inputs cross the wire as `{}`; the engine's actor is never sent.
    channel.results.set('agentGoalService.pauseGoal', { ...GOAL_SNAPSHOT, status: 'paused' });
    await agent.goal.pause();
    expect(channel.calls[3]).toEqual({
      scope,
      service: 'agentGoalService',
      method: 'pauseGoal',
      args: [{}],
    });

    channel.results.set('agentGoalService.resumeGoal', GOAL_SNAPSHOT);
    await agent.goal.resume();
    expect(channel.calls[4]).toEqual({
      scope,
      service: 'agentGoalService',
      method: 'resumeGoal',
      args: [{}],
    });

    channel.results.set('agentGoalService.cancelGoal', GOAL_SNAPSHOT);
    await agent.goal.cancel();
    expect(channel.calls[5]).toEqual({
      scope,
      service: 'agentGoalService',
      method: 'cancelGoal',
      args: [{}],
    });

    channel.results.set('agentGoalService.setBudgetLimits', GOAL_SNAPSHOT);
    await agent.goal.setBudgetLimits({ tokenBudget: 100, turnBudget: 3 });
    expect(channel.calls[6]).toEqual({
      scope,
      service: 'agentGoalService',
      method: 'setBudgetLimits',
      args: [{ budgetLimits: { tokenBudget: 100, turnBudget: 3 } }],
    });

    // Reasons and resume flags pass through; still no actor.
    await agent.goal.pause({ reason: 'hold' });
    expect(channel.calls[7]?.args).toEqual([{ reason: 'hold' }]);
    await agent.goal.resume({ continueIfBlocked: true });
    expect(channel.calls[8]?.args).toEqual([{ continueIfBlocked: true }]);
    expect(channel.calls.every((call) => call.args.length <= 1)).toBe(true);
  });

  it('rejects invalid goal input before the call leaves the client', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    await expect(
      agent.goal.create({ objective: 42 as unknown as string }),
    ).rejects.toBeInstanceOf(KlientValidationError);
    await expect(
      agent.goal.setBudgetLimits({ tokenBudget: '100' as unknown as number }),
    ).rejects.toBeInstanceOf(KlientValidationError);
    await expect(
      agent.goal.resume({ continueIfPaused: 'yes' as unknown as boolean }),
    ).rejects.toBeInstanceOf(KlientValidationError);
    expect(channel.calls).toHaveLength(0);
  });

  it('rejects out-of-domain budget limits before the call leaves the client', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    // Negative, infinite, and NaN limits are all off the wire domain.
    await expect(agent.goal.setBudgetLimits({ tokenBudget: -1 })).rejects.toBeInstanceOf(
      KlientValidationError,
    );
    await expect(
      agent.goal.setBudgetLimits({ turnBudget: Number.POSITIVE_INFINITY }),
    ).rejects.toBeInstanceOf(KlientValidationError);
    await expect(
      agent.goal.setBudgetLimits({ wallClockBudgetMs: Number.NaN }),
    ).rejects.toBeInstanceOf(KlientValidationError);
    // The budget object is strict: unknown keys are rejected.
    await expect(
      agent.goal.setBudgetLimits({ tokenBudget: 1, memoryBudget: 2 } as unknown as Parameters<
        typeof agent.goal.setBudgetLimits
      >[0]),
    ).rejects.toBeInstanceOf(KlientValidationError);
    expect(channel.calls).toHaveLength(0);
  });

  it('rejects drifted goal output payloads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    channel.results.set('agentGoalService.pauseGoal', { goalId: 'g1' }); // missing fields
    await expect(agent.goal.pause()).rejects.toBeInstanceOf(KlientValidationError);

    channel.results.set('agentGoalService.getGoal', { goal: { status: 'active' } });
    await expect(agent.goal.get()).rejects.toBeInstanceOf(KlientValidationError);
  });

  it('validates bounded strict wait leases in goal output payloads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const waiting = { ...GOAL_SNAPSHOT, waitingFor: { taskIds: ['task-1'], policy: 'all' as const } };

    channel.results.set('agentGoalService.getGoal', { goal: waiting });
    await expect(agent.goal.get()).resolves.toEqual(waiting);

    for (const waitFor of [
      { taskIds: [], policy: 'any' },
      { taskIds: [''], policy: 'any' },
      { taskIds: Array.from({ length: 33 }, (_, index) => `task-${index}`), policy: 'all' },
      { taskIds: ['task-1'], policy: 'any', extra: true },
    ]) {
      channel.results.set('agentGoalService.getGoal', {
        goal: { ...GOAL_SNAPSHOT, waitingFor: waitFor },
      });
      await expect(agent.goal.get()).rejects.toBeInstanceOf(KlientValidationError);
    }
  });

  it('forwards goal.updated stream events and validates payloads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const seen: unknown[] = [];
    const errors: Error[] = [];
    agent.events.onError((error) => {
      errors.push(error);
    });

    agent.events.on('goal.updated', (event) => seen.push(event));
    expect(channel.subscriptions).toHaveLength(1);
    expect(channel.subscriptions[0]?.scope).toEqual({ sessionId: 's1', agentId: 'main' });
    expect(channel.subscriptions[0]?.source).toEqual({ kind: 'stream', name: 'events' });

    const updated = {
      type: 'goal.updated',
      snapshot: {
        ...GOAL_SNAPSHOT,
        continuation: {
          state: 'held',
          owner: 'research',
          reason: 'A research checkpoint is pending commit.',
        },
      },
      change: { kind: 'continuation' },
      mutation: { id: 'm1', at: 1, kind: 'create', goalId: 'g1', status: 'active' },
    };
    const cleared = {
      type: 'goal.updated',
      snapshot: null,
      mutation: { id: 'm2', at: 2, kind: 'clear', goalId: 'g1' },
    };
    channel.emit(0, updated);
    channel.emit(0, cleared);
    // `at` beyond the valid Date ceiling fails validation.
    channel.emit(0, {
      type: 'goal.updated',
      snapshot: null,
      mutation: { id: 'm3', at: 9e30, kind: 'clear', goalId: 'g1' },
    });
    // `snapshot` is required (nullable, not optional).
    channel.emit(0, { type: 'goal.updated' });
    await tick();

    expect(seen).toEqual([updated, cleared]);
    expect(errors).toHaveLength(2);
    expect(errors.every((error) => error instanceof KlientValidationError)).toBe(true);
  });
});

describe('session lifecycle routing', () => {
  it('delete calls the App session manager', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.results.set('sessionManager.delete', undefined);

    await klient.session('s1').delete();

    expect(channel.calls).toEqual([
      { scope: {}, service: 'sessionManager', method: 'delete', args: ['s1'] },
    ]);
  });

  it('restore forwards resume options to the App session manager', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.results.set('sessionManager.restore', { id: 's1', kind: 'session' });

    const opts = {
      mcpServers: { example: { transport: 'stdio' as const, command: 'node' } },
    };
    await expect(klient.session('s1').restore(opts)).resolves.toBe(true);

    expect(channel.calls[0]).toEqual({
      scope: {},
      service: 'sessionManager',
      method: 'restore',
      args: ['s1', opts],
    });
  });

  it('sessions.create forwards mcpServers to the App session manager', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.results.set('sessionManager.create', { id: 's1', kind: 'session' });
    channel.results.set('sessionMetadata.read', {
      id: 's1',
      createdAt: 1,
      updatedAt: 2,
      archived: false,
    });

    const mcpServers = {
      example: { transport: 'stdio' as const, command: 'node', args: ['server.mjs'] },
    };
    await klient.global.sessions.create({ workDir: '/x', mcpServers });

    expect(channel.calls[0]).toMatchObject({
      scope: {},
      service: 'sessionManager',
      method: 'create',
      args: [{ workDir: '/x', mcpServers }],
    });
  });

  it('sessions.create rejects malformed mcpServers before the call leaves the client', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    await expect(
      klient.global.sessions.create({
        workDir: '/x',
        mcpServers: { bad: { transport: 'http', url: 'not-a-url' } },
      }),
    ).rejects.toBeInstanceOf(KlientValidationError);
    expect(channel.calls.some((call) => call.method === 'create')).toBe(false);
  });
});

describe('contract validation', () => {
  it('rejects invalid input before the call leaves the client', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    await expect(
      klient.global.sessions.list({ limit: '20' as unknown as number }),
    ).rejects.toBeInstanceOf(KlientValidationError);
    expect(channel.calls).toHaveLength(0);
  });

  it('rejects drifted output payloads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = { id: 's1' }; // missing required SessionSummary fields
    await expect(klient.global.sessions.get('s1')).rejects.toBeInstanceOf(KlientValidationError);
  });

  it('passes valid payloads through and returns parsed output', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = SUMMARY;
    await expect(klient.global.sessions.get('s1')).resolves.toEqual(SUMMARY);
  });

  it('validate:false skips both directions', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel, { validate: false });
    channel.result = { anything: true };
    await expect(
      klient.global.sessions.list({ limit: '20' as unknown as number }),
    ).resolves.toEqual({ anything: true });
  });
});

describe('event hub', () => {
  it('maps public names to emitter sources and validates payloads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const seen: unknown[] = [];
    const errors: Error[] = [];
    klient.events.onError((error) => {
        errors.push(error);
      });

    klient.events.on('kosong.providers.changed', (event) => seen.push(event));
    expect(channel.subscriptions[0]?.source).toEqual({
      kind: 'emitter',
      service: 'providerService',
      event: 'onDidChangeProviders',
    });

    channel.emit(0, { added: ['p1'], removed: [], changed: [] });
    channel.emit(0, { added: 'not-an-array' });
    await tick();
    expect(seen).toEqual([{ added: ['p1'], removed: [], changed: [] }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(KlientValidationError);
  });

  it('shares one bus subscription across bus-derived events and filters by type', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const archived: unknown[] = [];
    const catalog: unknown[] = [];

    const subA = klient.events.on('session.archived', (event) => archived.push(event));
    const subB = klient.events.on('kosong.changed', (event) => catalog.push(event));
    expect(channel.subscriptions).toHaveLength(1);
    expect(channel.subscriptions[0]?.source).toEqual({ kind: 'stream', name: 'events' });

    channel.emit(0, { type: 'event.session.archived', payload: { sessionId: 's1' } });
    channel.emit(0, { type: 'event.model_catalog.changed', payload: { changed: [], unchanged: [], failed: [] } });
    channel.emit(0, { type: 'unrelated.type', payload: {} });
    await tick();
    expect(archived).toEqual([{ sessionId: 's1' }]);
    expect(catalog).toEqual([{ changed: [], unchanged: [], failed: [] }]);

    subA.dispose();
    expect(channel.subscriptions[0]?.dispose).not.toHaveBeenCalled();
    subB.dispose();
    expect(channel.subscriptions[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('delivers session.metaUpdated when the patch carries no lastPrompt', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const seen: unknown[] = [];
    const errors: Error[] = [];
    klient.events.onError((error) => {
      errors.push(error);
    });

    klient.events.on('session.metaUpdated', (event) => seen.push(event));
    channel.emit(0, {
      type: 'session.meta.updated',
      payload: {
        agentId: 'main',
        sessionId: 's1',
        title: 'generated title',
        patch: { title: 'generated title', isCustomTitle: false },
      },
    });
    await tick();
    expect(seen).toEqual([
      {
        agentId: 'main',
        sessionId: 's1',
        title: 'generated title',
        patch: { title: 'generated title', isCustomTitle: false },
      },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('disposes the emitter subscription when the last listener detaches', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const a = klient.events.on('config.changed', () => undefined);
    const b = klient.events.on('config.changed', () => undefined);
    expect(channel.subscriptions).toHaveLength(1);
    a.dispose();
    expect(channel.subscriptions[0]?.dispose).not.toHaveBeenCalled();
    b.dispose();
    expect(channel.subscriptions[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('forwards the newly registered agent stream events and validates payloads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const seen = {
      delta: [] as unknown[],
      progress: [] as unknown[],
      started: [] as unknown[],
      blocked: [] as unknown[],
      cancelled: [] as unknown[],
      completed: [] as unknown[],
    };
    const errors: Error[] = [];
    agent.events.onError((error) => {
      errors.push(error);
    });

    agent.events.on('tool.call.delta', (event) => seen.delta.push(event));
    agent.events.on('tool.progress', (event) => seen.progress.push(event));
    agent.events.on('compaction.started', (event) => seen.started.push(event));
    agent.events.on('compaction.blocked', (event) => seen.blocked.push(event));
    agent.events.on('compaction.cancelled', (event) => seen.cancelled.push(event));
    agent.events.on('compaction.completed', (event) => seen.completed.push(event));

    // All six registrations share one `events` stream subscription bound to
    // the agent scope.
    expect(channel.subscriptions).toHaveLength(1);
    expect(channel.subscriptions[0]?.scope).toEqual({ sessionId: 's1', agentId: 'main' });
    expect(channel.subscriptions[0]?.source).toEqual({ kind: 'stream', name: 'events' });

    const delta = { type: 'tool.call.delta', turnId: 1, toolCallId: 'tc1', name: 'Bash', argumentsPart: '{"command":' };
    const progress = {
      type: 'tool.progress',
      turnId: 1,
      toolCallId: 'tc1',
      update: { kind: 'stdout', text: 'chunk' },
    };
    const started = { type: 'compaction.started', trigger: 'auto' };
    const blocked = { type: 'compaction.blocked', turnId: 2 };
    const cancelled = { type: 'compaction.cancelled' };
    const completed = {
      type: 'compaction.completed',
      result: { summary: 's', compactedCount: 3, tokensBefore: 100, tokensAfter: 40 },
    };
    channel.emit(0, delta);
    channel.emit(0, progress);
    channel.emit(0, started);
    channel.emit(0, blocked);
    channel.emit(0, cancelled);
    channel.emit(0, completed);
    channel.emit(0, { type: 'tool.progress', turnId: 1, toolCallId: 'tc1' }); // missing update
    channel.emit(0, { type: 'unregistered.type', turnId: 1 });
    await tick();

    expect(seen.delta).toEqual([delta]);
    expect(seen.progress).toEqual([progress]);
    expect(seen.started).toEqual([started]);
    expect(seen.blocked).toEqual([blocked]);
    expect(seen.cancelled).toEqual([cancelled]);
    expect(seen.completed).toEqual([completed]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(KlientValidationError);
  });
});

describe('research.updated event schema', () => {
  it('uses the complete ResearchStatusSnapshot contract for valid and malformed payloads', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');
    const seen: unknown[] = [];
    const errors: Error[] = [];
    agent.events.onError((error) => errors.push(error));
    agent.events.on('research.updated', (event) => seen.push(event));

    const question = {
      id: 'q1',
      lineSlug: 'main',
      wording: 'Question',
      priority: 0,
      neededEvidence: [],
      evidenceRefs: [],
      falsifierRefs: [],
      workflow: 'open' as const,
      epistemic: 'unknown' as const,
      persistence: 'working' as const,
      revision: 1,
    };
    const line = {
      slug: 'main',
      title: 'Main',
      status: 'active' as const,
      createdAt: 1,
      revision: 1,
    };
    const snapshot = {
      mode: 'ready' as const,
      loopStatus: 'active' as const,
      planningPolicy: 'collaborative' as const,
      currentLineSlug: 'main',
      currentWorkstreamBinding: {
        lineSlug: 'main',
        status: 'bound' as const,
        reason: 'Explicitly confirmed.',
        binding: {
          confirmationId: 'confirmation-main-1',
          lineSlug: 'main',
          workstream: 'verified-inputs',
          topicId: 'topic-1',
          observedRevision: 1,
          confirmedBy: 'user' as const,
          confirmedAt: 1,
        },
      },
      lineWorkstreamBindings: [{
        confirmationId: 'confirmation-main-1',
        lineSlug: 'main',
        workstream: 'verified-inputs',
        topicId: 'topic-1',
        observedRevision: 1,
        confirmedBy: 'user' as const,
        confirmedAt: 1,
      }],
      currentFocus: { questionId: 'q1', boundedAction: 'act', revision: 1 },
      currentQuestion: question,
      questions: [question],
      lines: [line],
      openQuestionCount: 1,
      activeQuestionCount: 0,
      blockedQuestionCount: 0,
      alerts: [],
      goalSummary: { objective: 'Test goal', status: 'active', remainingTurns: 3 },
      researchGoal: {
        schema: 'hakimi/research-goal-0.1' as const,
        goalId: 'goal-1',
        objective: 'Test the bounded Research Goal',
        scope: { programTopicId: 'topic-1', lineSlug: 'main', questionId: 'q1' },
        nonGoals: [],
        budget: {
          tokenBudget: null,
          turnBudget: 3,
          wallClockBudgetMs: null,
          remainingTokens: null,
          remainingTurns: 2,
          remainingWallClockMs: null,
          tokenBudgetReached: false,
          turnBudgetReached: false,
          wallClockBudgetReached: false,
          overBudget: false,
        },
        stopConditions: [],
        status: 'active' as const,
        programRelation: {
          status: 'unavailable' as const,
          reason: 'No observed AITP Research Goal.',
        },
        humanGates: [],
        persistenceGuards: [{
          code: 'research.mode.ready',
          status: 'clear' as const,
          reason: 'Research Mode is ready.',
        }],
        researchRevision: 2,
      },
      goalAlignment: { status: 'unavailable' as const, reason: 'No observed AITP Research Goal.' },
      aitpHealth: { phase: 'ready' as const, contractVersion: '0.1' },
      pendingCheckpoint: {
        checkpointId: 'cp1',
        questionId: 'q1',
        lineSlug: 'main',
        idempotencyKey: 'key1',
        persistence: 'pending_commit' as const,
        createdAt: 1,
      },
      latestCommittedCheckpoint: { checkpointId: 'cp0', entryId: 'e0', committedAt: 1 },
      phase: 'action_planned' as const,
      revision: 2,
    };

    channel.emit(0, { type: 'research.updated', snapshot });
    channel.emit(0, { type: 'research.updated', snapshot: { ...snapshot, currentFocus: { questionId: 'q1' } } });
    channel.emit(0, { type: 'research.updated', snapshot: { ...snapshot, currentQuestion: { id: 'q1' } } });
    channel.emit(0, { type: 'research.updated', snapshot: { ...snapshot, pendingCheckpoint: { checkpointId: 'cp1' } } });
    channel.emit(0, { type: 'research.updated', snapshot: { ...snapshot, aitpHealth: { contractVersion: '0.1' } } });
    await tick();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      snapshot: {
        currentWorkstreamBinding: {
          status: 'bound',
          binding: { workstream: 'verified-inputs' },
        },
        lineWorkstreamBindings: [{ workstream: 'verified-inputs' }],
        researchGoal: {
          schema: 'hakimi/research-goal-0.1',
          goalId: 'goal-1',
        },
      },
    });
    expect(errors).toHaveLength(4);
    expect(errors.every((error) => error instanceof KlientValidationError)).toBe(true);
  });
});

describe('human decision input validation', () => {
  it('accepts only the five awaiting_human transition targets', () => {
    for (const nextPhase of ['idle', 'gap_analysis', 'action_planned', 'action_executing', 'evaluating']) {
      expect(resolveHumanDecisionInputSchema.parse({
        gateId: 'gate-1', resolution: 'Continue.', nextPhase,
      })).toMatchObject({ nextPhase });
    }
    for (const nextPhase of ['orienting', 'state_updated', 'checkpoint_pending', 'awaiting_human']) {
      expect(resolveHumanDecisionInputSchema.safeParse({
        gateId: 'gate-1', resolution: 'Reject.', nextPhase,
      }).success).toBe(false);
    }
  });
});

describe('research facade routing', () => {
  const snapshot = {
    mode: 'inactive',
    loopStatus: 'active',
    planningPolicy: 'collaborative',
    lineWorkstreamBindings: [],
    questions: [],
    lines: [],
    openQuestionCount: 0,
    activeQuestionCount: 0,
    blockedQuestionCount: 0,
    alerts: [],
    aitpHealth: { phase: 'inactive' },
    phase: 'idle',
    revision: 0,
  };

  it('routes getSnapshot to agentResearchService.getSnapshot', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.results.set('agentResearchService.getSnapshot', snapshot);

    const agent = klient.session('s1').agent('main');
    const result = await agent.research.getSnapshot();

    expect(result).toEqual(snapshot);
    expect(channel.calls[0]).toMatchObject({
      service: 'agentResearchService',
      method: 'getSnapshot',
      args: [],
    });
  });

  it('routes planning-policy reads and revisioned writes through agentResearchService', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.results.set('agentResearchService.getPlanningPolicy', 'collaborative');
    channel.results.set('agentResearchService.setPlanningPolicy', undefined);

    const agent = klient.session('s1').agent('main');
    await expect(agent.research.getPlanningPolicy()).resolves.toBe('collaborative');
    await agent.research.setPlanningPolicy('dreaming', 4);

    expect(channel.calls).toEqual([
      expect.objectContaining({
        service: 'agentResearchService',
        method: 'getPlanningPolicy',
        args: [],
      }),
      expect.objectContaining({
        service: 'agentResearchService',
        method: 'setPlanningPolicy',
        args: ['dreaming', 4],
      }),
    ]);
  });

  it('routes steer to agentResearchService.steer with the command as positional arg', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = undefined;

    const agent = klient.session('s1').agent('main');
    await agent.research.steer({
      kind: 'pause_loop',
      expectedRevision: 5,
    });

    expect(channel.calls[0]).toMatchObject({
      service: 'agentResearchService',
      method: 'steer',
      args: [{ kind: 'pause_loop', expectedRevision: 5 }],
    });
  });

  it('routes historical checkpoint discard with both safety identities', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.results.set('agentResearchService.discardHistoricalCheckpoint', {
      checkpointId: 'checkpoint-old',
      questionId: 'question-1',
      questionRevision: 2,
      lineSlug: 'main',
      idempotencyKey: 'checkpoint-old-key',
      persistence: 'pending_commit',
      createdAt: 1,
    });

    const agent = klient.session('s1').agent('main');
    await expect(agent.research.discardHistoricalCheckpoint({
      checkpointId: 'checkpoint-old',
      expectedRevision: 7,
    })).resolves.toMatchObject({ checkpointId: 'checkpoint-old' });

    expect(channel.calls[0]).toMatchObject({
      service: 'agentResearchService',
      method: 'discardHistoricalCheckpoint',
      args: [{ checkpointId: 'checkpoint-old', expectedRevision: 7 }],
    });
  });

  it('routes setFocus with two positional args', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = undefined;

    const agent = klient.session('s1').agent('main');
    await agent.research.setFocus('q1', 'next step');

    expect(channel.calls[0]).toMatchObject({
      service: 'agentResearchService',
      method: 'setFocus',
      args: ['q1', 'next step'],
    });
  });

  it('omits optional tuple holes for focus, reopen, switch, and mode loop calls', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = undefined;

    const agent = klient.session('s1').agent('main');
    await agent.research.setFocus('q1', undefined, 7);
    await agent.research.setFocus('q1', 'bounded action');
    await agent.research.setFocus('q1', 'bounded action', 8);
    await agent.research.reopenQuestion('q1', undefined, 9);
    await agent.research.reopenQuestion('q1', 'new evidence');
    await agent.research.reopenQuestion('q1', 'new evidence', 10);
    await agent.research.switchLine('alt');
    await agent.research.switchLine('alt', 11);
    await agent.aitpMode.pauseLoop(12);
    await agent.aitpMode.resumeLoop(13);

    expect(channel.calls.map((call) => call.args)).toEqual([
      ['q1', 7],
      ['q1', 'bounded action'],
      ['q1', 'bounded action', 8],
      ['q1', 9],
      ['q1', 'new evidence'],
      ['q1', 'new evidence', 10],
      ['alt'],
      ['alt', 11],
      [12],
      [13],
    ]);
    expect(channel.calls.every((call) => !call.args.includes(null))).toBe(true);
  });

  it('routes updateLine with its structured input', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = { slug: 'main', title: 'Updated', status: 'paused', createdAt: 1, revision: 2 };

    const agent = klient.session('s1').agent('main');
    await agent.research.updateLine({
      slug: 'main',
      expectedRevision: 1,
      assessment: 'supported direction',
      status: 'paused',
      reason: 'new evidence',
    });

    expect(channel.calls[0]).toMatchObject({
      service: 'agentResearchService',
      method: 'updateLine',
      args: [{
        slug: 'main',
        expectedRevision: 1,
        assessment: 'supported direction',
        status: 'paused',
        reason: 'new evidence',
      }],
    });
  });

  it('routes switchLine with an optional expected revision', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = undefined;

    const agent = klient.session('s1').agent('main');
    await agent.research.switchLine('alt', 7);

    expect(channel.calls[0]).toMatchObject({
      service: 'agentResearchService',
      method: 'switchLine',
      args: ['alt', 7],
    });
  });

  it('routes explicit Goal alignment confirmation and clearing through the research service', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = undefined;

    const agent = klient.session('s1').agent('main');
    await agent.research.confirmGoalAlignment({
      relation: 'goal_parent_of_program',
      expectedRevision: 7,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 3,
    });
    await agent.research.clearGoalAlignment({
      expectedRevision: 8,
      goalId: 'goal-1',
      topicId: 'topic-1',
      observedRevision: 3,
    });

    expect(channel.calls.map((call) => ({ method: call.method, args: call.args }))).toEqual([
      {
        method: 'confirmGoalAlignment',
        args: [{
          relation: 'goal_parent_of_program',
          expectedRevision: 7,
          goalId: 'goal-1',
          topicId: 'topic-1',
          observedRevision: 3,
        }],
      },
      {
        method: 'clearGoalAlignment',
        args: [{
          expectedRevision: 8,
          goalId: 'goal-1',
          topicId: 'topic-1',
          observedRevision: 3,
        }],
      },
    ]);
  });

  it('routes Line-workstream binding with fixed user provenance and no spoofable fields', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const binding = {
      confirmationId: 'confirmation-main-1',
      lineSlug: 'main',
      workstream: 'verified-inputs',
      topicId: 'topic-1',
      observedRevision: 2,
      confirmedBy: 'user' as const,
      confirmedAt: 10,
    };
    channel.results.set('agentResearchService.confirmLineWorkstreamBinding', binding);
    channel.results.set('agentResearchService.clearLineWorkstreamBinding', undefined);

    const agent = klient.session('s1').agent('main');
    await expect(agent.research.clearLineWorkstreamBinding({
      lineSlug: 'main',
      expectedRevision: 8,
    } as never)).rejects.toMatchObject({
      phase: 'input',
      procedure: 'agentResearchService.clearLineWorkstreamBinding',
    });
    expect(channel.calls).toHaveLength(0);
    await expect(agent.research.confirmLineWorkstreamBinding({
      lineSlug: 'main',
      workstream: 'verified-inputs',
      expectedRevision: 7,
      confirmedBy: 'main_agent',
      topicId: 'topic-forged',
      observedRevision: 99,
      confirmationId: 'confirmation-forged',
      confirmedAt: 0,
    } as never)).resolves.toEqual(binding);
    await agent.research.clearLineWorkstreamBinding({
      lineSlug: 'main',
      expectedConfirmationId: binding.confirmationId,
      expectedRevision: 8,
      topicId: 'topic-forged',
    } as never);

    expect(channel.calls.map((call) => ({ method: call.method, args: call.args }))).toEqual([
      {
        method: 'confirmLineWorkstreamBinding',
        args: [{
          lineSlug: 'main',
          workstream: 'verified-inputs',
          expectedRevision: 7,
          confirmedBy: 'user',
        }],
      },
      {
        method: 'clearLineWorkstreamBinding',
        args: [{
          lineSlug: 'main',
          expectedConfirmationId: binding.confirmationId,
          expectedRevision: 8,
        }],
      },
    ]);
  });

  it('routes human gate resolution and alert acknowledgement through the research service', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.results.set('agentResearchService.resolveHumanDecision', {
      gateId: 'gate-1',
      kind: 'decision',
      prompt: 'Choose the next bounded phase.',
      resolution: 'Proceed with gap analysis.',
      resolvedAt: 10,
      createdAt: 1,
    });
    channel.results.set('agentResearchService.acknowledgeAlert', undefined);

    const agent = klient.session('s1').agent('main');
    await agent.research.resolveHumanDecision({
      gateId: 'gate-1',
      resolution: 'Proceed with gap analysis.',
      nextPhase: 'gap_analysis',
    });
    await agent.research.acknowledgeAlert('research.alert.blocked.question.q1');

    expect(channel.calls).toEqual([
      {
        scope: { sessionId: 's1', agentId: 'main' },
        service: 'agentResearchService',
        method: 'resolveHumanDecision',
        args: [{
          gateId: 'gate-1',
          resolution: 'Proceed with gap analysis.',
          nextPhase: 'gap_analysis',
        }],
      },
      {
        scope: { sessionId: 's1', agentId: 'main' },
        service: 'agentResearchService',
        method: 'acknowledgeAlert',
        args: ['research.alert.blocked.question.q1'],
      },
    ]);
  });

  it('routes strict Research Plan v2 lifecycle inputs through the research service', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const plan = {
      schema: 'hakimi/research-plan-0.2' as const,
      planId: 'research-plan-1',
      revision: 2,
      goalId: 'goal-1',
      programId: 'topic-1',
      programObservedRevision: 1,
      goalRelation: 'goal_milestone_in_program' as const,
      objective: 'Validate one milestone.',
      completionCriterion: 'The checks pass.',
      milestones: [{
        milestoneId: 'm1',
        title: 'Run and validate',
        objective: 'Run one calculation.',
        completionCriterion: 'Validation passes.',
        evidenceRequirements: ['Output and log'],
      }],
      evidenceRequirements: ['Reproducible result'],
      decisionPoints: [],
      assumptions: [],
      currentMilestoneId: 'm1',
      stopConditions: ['Stop on validation failure.'],
      replanConditions: ['Replan on Program drift.'],
      status: 'draft' as const,
      createdAt: 1,
      updatedAt: 2,
    };
    for (const method of [
      'agentResearchService.prepareResearchPlanV2',
      'agentResearchService.activateResearchPlanV2',
      'agentResearchService.completeResearchPlanV2',
      'agentResearchService.discardResearchPlanV2',
    ]) channel.results.set(method, plan);

    const agent = klient.session('s1').agent('main');
    const prepareInput = {
      objective: plan.objective,
      completionCriterion: plan.completionCriterion,
      milestones: plan.milestones,
      evidenceRequirements: plan.evidenceRequirements,
      decisionPoints: plan.decisionPoints,
      assumptions: plan.assumptions,
      currentMilestoneId: plan.currentMilestoneId,
      stopConditions: plan.stopConditions,
      replanConditions: plan.replanConditions,
    };
    await agent.research.prepareResearchPlanV2(prepareInput);
    await agent.research.activateResearchPlanV2({ planId: plan.planId, expectedRevision: 2 });
    await agent.research.completeResearchPlanV2({ planId: plan.planId, expectedRevision: 3 });
    await agent.research.discardResearchPlanV2({ planId: plan.planId, expectedRevision: 3 });

    expect(channel.calls.map((call) => ({ method: call.method, args: call.args }))).toEqual([
      { method: 'prepareResearchPlanV2', args: [prepareInput] },
      { method: 'activateResearchPlanV2', args: [{ planId: plan.planId, expectedRevision: 2 }] },
      { method: 'completeResearchPlanV2', args: [{ planId: plan.planId, expectedRevision: 3 }] },
      { method: 'discardResearchPlanV2', args: [{ planId: plan.planId, expectedRevision: 3 }] },
    ]);
  });

  it('routes aitpMode.enter through agentAitpModeService', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    channel.result = undefined;

    const agent = klient.session('s1').agent('main');
    await agent.aitpMode.enter({ actor: 'user' });

    expect(channel.calls[0]).toMatchObject({
      service: 'agentAitpModeService',
      method: 'enter',
      args: [{ actor: 'user' }],
    });
  });

  it('rejects Research Action and prepare_plan inputs before crossing the channel', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    await expect(agent.research.prepareResearchPlan({
      objective: '',
      steps: ['step'],
      expectedEvidence: ['evidence'],
      stopCondition: 'stop',
    })).rejects.toMatchObject({ phase: 'input' });
    await expect(agent.research.prepareResearchPlan({
      objective: 'objective',
      steps: ['step'],
      expectedEvidence: Array.from({ length: 101 }, () => 'evidence'),
      stopCondition: 'stop',
    })).rejects.toMatchObject({ phase: 'input' });
    await expect(agent.research.planAndStartAction({
      kind: 'experiment',
      purpose: 'x'.repeat(8001),
      stopCondition: 'stop',
    })).rejects.toMatchObject({ phase: 'input' });
    await expect(agent.research.planAndStartAction({
      kind: 'experiment',
      purpose: 'purpose',
      stopCondition: 'stop',
      allowedToolKinds: Array.from({ length: 51 }, () => 'shell'),
    })).rejects.toMatchObject({ phase: 'input' });
    await expect(agent.research.planAndStartAction({
      kind: 'experiment',
      purpose: 'purpose',
      stopCondition: 'stop',
      unexpected: true,
    } as never)).rejects.toMatchObject({ phase: 'input' });
    await expect(agent.research.prepareResearchPlanV2({
      objective: 'objective',
      milestones: [{
        milestoneId: 'm1',
        title: 'Milestone',
        objective: 'objective',
        completionCriterion: 'criterion',
        evidenceRequirements: [],
      }],
      evidenceRequirements: [],
      decisionPoints: [],
      assumptions: [],
      currentMilestoneId: 'missing',
      stopConditions: ['stop'],
      replanConditions: ['replan'],
    })).rejects.toMatchObject({ phase: 'input' });
    expect(channel.calls).toHaveLength(0);
  });

  it('rejects checkpoint proposals without expectedRevision before crossing the channel', async () => {
    const channel = new FakeChannel();
    const klient = createKlientFromChannel(channel);
    const agent = klient.session('s1').agent('main');

    await expect(agent.research.proposeCheckpoint({} as never)).rejects.toMatchObject({
      phase: 'input',
      procedure: 'agentResearchService.proposeCheckpoint',
    });
    expect(channel.calls).toHaveLength(0);
  });
});
