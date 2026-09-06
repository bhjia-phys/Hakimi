/**
 * Scenario: AITP Research Mode REST routes (`/sessions/{id}/research` and
 * `/sessions/{id}/research/command`).
 * Responsibilities: verify GET returns an inactive snapshot without AITP I/O,
 * invalid body rejection, stale-revision POST mapping, enter_mode availability,
 * and session-not-found.
 * Wiring: real kap-server on a temp home; inactive hydration remains free of
 * AITP I/O, while explicit enter_mode performs the activation path.
 * Run: `pnpm --filter @moonshot-ai/kap-server exec vitest run test/research.test.ts`.
 */
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import {
  IAgentResearchService,
  ensureMainAgent,
  resumeSessionById,
} from '@moonshot-ai/agent-core-v2';

import { type RunningServer, startServer } from '../src/start';
import { agentEventSchema } from '../src/protocol/events-zod';
import { researchCommandSchema } from '../src/protocol/research';
import { TEST_HOST_IDENTITY } from './helpers/hostIdentity';
import { authHeaders } from './helpers/auth';

interface Envelope<T> {
  code: number;
  msg: string;
  data: T;
  request_id: string;
  details?: { path: string; message: string }[];
  stack?: string;
}

interface ResearchAlert {
  fingerprint: string;
  acknowledgedAt?: number;
}

interface ResearchSnapshot {
  mode: string;
  loopStatus: string;
  planningPolicy: 'collaborative' | 'dreaming';
  lineWorkstreamBindings: Array<{ lineSlug: string; workstream: string }>;
  questions: Array<{ id: string }>;
  lines: Array<{ slug: string }>;
  openQuestionCount: number;
  activeQuestionCount: number;
  blockedQuestionCount: number;
  alerts: ResearchAlert[];
  aitpHealth: { phase: string };
  phase: string;
  currentAction?: { actionId: string; status: string; observedRunActionId?: string };
  latestProgress?: { result: string; mainlineImpact: string };
  researchPlan?: {
    status: string;
    objective: string;
    steps: string[];
    expectedEvidence: string[];
    stopCondition: string;
  };
  currentRun?: {
    actionId: string;
    campaign: string;
    jobId: string;
    stage: string;
    schedulerState: string;
    lastObservedAt: number;
    nextCheckAt?: number;
    terminalState?: 'completed' | 'failed' | 'cancelled';
    artifactRefs: string[];
  };
  humanGate?: {
    gateId: string;
    resolvedAt?: number;
    resolution?: string;
  };
  revision: number;
}

const RESEARCH_EVENT_SNAPSHOT = {
  mode: 'ready',
  loopStatus: 'active',
  planningPolicy: 'collaborative',
  currentLineSlug: 'main',
  currentWorkstreamBinding: {
    lineSlug: 'main',
    status: 'bound',
    reason: 'Explicitly confirmed.',
    binding: {
      confirmationId: 'confirmation-main-1',
      lineSlug: 'main',
      workstream: 'verified-inputs',
      topicId: 'topic-example',
      observedRevision: 1,
      confirmedBy: 'user',
      confirmedAt: 1_700_000_000_000,
    },
  },
  lineWorkstreamBindings: [{
    confirmationId: 'confirmation-main-1',
    lineSlug: 'main',
    workstream: 'verified-inputs',
    topicId: 'topic-example',
    observedRevision: 1,
    confirmedBy: 'user',
    confirmedAt: 1_700_000_000_000,
  }],
  questions: [],
  lines: [{
    slug: 'main',
    title: 'Main line',
    status: 'active',
    createdAt: 1_700_000_000_000,
    revision: 1,
  }],
  openQuestionCount: 0,
  activeQuestionCount: 0,
  blockedQuestionCount: 0,
  alerts: [],
  aitpHealth: { phase: 'ready' },
  phase: 'idle',
  program: {
    topicId: 'topic-example',
    title: 'Example research program',
    goalText: 'Establish the bounded research result.',
    goalSource: 'aitp-enter',
    establishedAt: 1_700_000_000_000,
    observedRevision: 1,
  },
  researchGoal: {
    schema: 'hakimi/research-goal-0.1',
    goalId: 'goal-example',
    objective: 'Validate the current bounded stage.',
    completionCriterion: 'The stage passes its declared checks.',
    scope: {
      programTopicId: 'topic-example',
      lineSlug: 'main',
      questionId: 'q1',
    },
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
    stopConditions: [{
      code: 'goal.budget.turns',
      reached: false,
      reason: 'The Goal turn budget remains available.',
    }],
    status: 'active',
    continuation: {
      state: 'held',
      owner: 'aitpResearch',
      reason: 'A recovered Research action requires evidence-based resolution.',
    },
    programRelation: {
      status: 'aligned',
      reason: 'Confirmed as goal_parent_of_program.',
    },
    humanGates: [],
    persistenceGuards: [{
      code: 'research.mode.ready',
      status: 'clear',
      reason: 'Research Mode is ready.',
    }],
    researchRevision: 1,
  },
  latestCommittedCheckpoint: {
    checkpointId: 'cp-distill',
    entryId: 'entry-distill',
    committedAt: 1_700_000_000_001,
  },
  distillationAttention: {
    schema: 'hakimi/research-distillation-attention-0.1',
    status: 'review_requested',
    checkpointId: 'cp-distill',
    entryId: 'entry-distill',
    recordedAt: 1_700_000_000_002,
  },
  revision: 1,
};

describe('Research agent event schemas', () => {
  it('parses a research.updated snapshot including its Research program', () => {
    const event = { type: 'research.updated', snapshot: RESEARCH_EVENT_SNAPSHOT };
    expect(agentEventSchema.parse(event)).toEqual(event);
    expect(agentEventSchema.parse(event)).toMatchObject({
      snapshot: {
        currentWorkstreamBinding: { status: 'bound' },
        lineWorkstreamBindings: [{ workstream: 'verified-inputs' }],
        researchGoal: {
          continuation: {
            state: 'held',
            owner: 'aitpResearch',
          },
        },
        distillationAttention: {
          status: 'review_requested',
          entryId: 'entry-distill',
        },
      },
    });
  });

  it('accepts an old snapshot without continuation and rejects an unknown future state', () => {
    const { continuation: _continuation, ...legacyResearchGoal } =
      RESEARCH_EVENT_SNAPSHOT.researchGoal;
    expect(_continuation.state).toBe('held');
    expect(agentEventSchema.safeParse({
      type: 'research.updated',
      snapshot: { ...RESEARCH_EVENT_SNAPSHOT, researchGoal: legacyResearchGoal },
    }).success).toBe(true);
    expect(agentEventSchema.safeParse({
      type: 'research.updated',
      snapshot: {
        ...RESEARCH_EVENT_SNAPSHOT,
        researchGoal: {
          ...RESEARCH_EVENT_SNAPSHOT.researchGoal,
          continuation: { state: 'future_continuation_state' },
        },
      },
    }).success).toBe(false);
  });

  it('rejects malformed current Line-workstream alignment invariants', () => {
    const binding = RESEARCH_EVENT_SNAPSHOT.currentWorkstreamBinding.binding;
    const { confirmationId: _confirmationId, ...identitylessBinding } = binding;
    expect(_confirmationId).toBe('confirmation-main-1');
    const missingBindingStatuses = ['unavailable', 'bound', 'stale', 'conflict'] as const;
    const invalidAlignments = [
      ...missingBindingStatuses.map((status) => ({
        lineSlug: 'main',
        status,
        reason: 'Malformed missing binding.',
      })),
      {
        lineSlug: 'main',
        status: 'unbound',
        reason: 'Malformed unexpected binding.',
        binding,
      },
      {
        lineSlug: 'main',
        status: 'bound',
        reason: 'Malformed non-conflicting binding Line mismatch.',
        binding: { ...binding, lineSlug: 'other' },
      },
      {
        lineSlug: 'other',
        status: 'unbound',
        reason: 'Malformed current Line mismatch.',
      },
    ];

    for (const currentWorkstreamBinding of invalidAlignments) {
      expect(agentEventSchema.safeParse({
        type: 'research.updated',
        snapshot: { ...RESEARCH_EVENT_SNAPSHOT, currentWorkstreamBinding },
      }).success).toBe(false);
    }
    expect(agentEventSchema.safeParse({
      type: 'research.updated',
      snapshot: {
        ...RESEARCH_EVENT_SNAPSHOT,
        currentWorkstreamBinding: {
          ...RESEARCH_EVENT_SNAPSHOT.currentWorkstreamBinding,
          binding: identitylessBinding,
        },
        lineWorkstreamBindings: [identitylessBinding],
      },
    }).success).toBe(false);
    expect(agentEventSchema.safeParse({
      type: 'research.updated',
      snapshot: {
        ...RESEARCH_EVENT_SNAPSHOT,
        currentWorkstreamBinding: {
          lineSlug: 'main',
          status: 'conflict',
          reason: 'The stored binding identifies another Line.',
          binding: { ...binding, lineSlug: 'other' },
        },
      },
    }).success).toBe(true);
  });

  it('parses an aitp_mode.updated invalidation event', () => {
    const event = { type: 'aitp_mode.updated' };
    expect(agentEventSchema.parse(event)).toEqual(event);
  });

  it('parses Research Plan v2 and exact action-plan bindings in the event snapshot', () => {
    const researchPlanV2 = {
      schema: 'hakimi/research-plan-0.2',
      planId: 'research-plan-1',
      revision: 2,
      goalId: 'goal-example',
      programId: 'topic-example',
      programObservedRevision: 1,
      goalRelation: 'goal_milestone_in_program',
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
      status: 'active',
      createdAt: 1,
      updatedAt: 2,
    };
    const event = {
      type: 'research.updated',
      snapshot: {
        ...RESEARCH_EVENT_SNAPSHOT,
        researchPlanV2,
        currentAction: {
          actionId: 'action-1',
          kind: 'simulation',
          purpose: 'Run the reviewed calculation.',
          expectedEvidence: ['Output and log'],
          stopCondition: 'Stop after validation.',
          allowedToolKinds: [],
          status: 'planned',
          createdAt: 3,
          requiresHumanApproval: false,
          researchPlanBinding: {
            planId: 'research-plan-1',
            planRevision: 2,
            milestoneId: 'm1',
          },
          actionPlanBinding: {
            schema: 'hakimi/action-plan-binding-0.1',
            kind: 'reviewed_plan',
            planId: 'action-plan-1',
            planRevision: 1,
          },
        },
      },
    };
    expect(agentEventSchema.parse(event)).toEqual(event);
  });
});

describe('research command protocol', () => {
  it('preserves a reviewed local-only Action Plan on the command boundary', () => {
    const input = {
      kind: 'begin_action', actionKind: 'derivation', purpose: 'Compare two conventions.',
      stopCondition: 'Stop after one limiting-case comparison.', planningLevel: 'planned',
      actionPlanId: 'local-plan', actionPlanRevision: 1,
    };
    expect(researchCommandSchema.parse(input)).toEqual(input);
  });
  it('accepts only the five legal awaiting_human exit targets', () => {
    for (const nextPhase of ['idle', 'gap_analysis', 'action_planned', 'action_executing', 'evaluating']) {
      expect(researchCommandSchema.parse({
        kind: 'resolve_decision', gateId: 'gate-1', resolution: 'Continue.', nextPhase,
      })).toMatchObject({ nextPhase });
    }
    for (const nextPhase of ['orienting', 'state_updated', 'checkpoint_pending', 'awaiting_human']) {
      expect(() => researchCommandSchema.parse({
        kind: 'resolve_decision', gateId: 'gate-1', resolution: 'Reject.', nextPhase,
      })).toThrow();
    }
  });
});

describe('server-v2 /api/v1/sessions/{sid}/research', () => {
  const connections: WebSocket[] = [];
  let server: RunningServer | undefined;
  let home: string | undefined;
  let workDir: string | undefined;
  let base: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'kimi-server-v2-research-'));
    workDir = await mkdtemp(join(tmpdir(), 'kimi-server-v2-research-work-'));
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterEach(async () => {
    for (const connection of connections.splice(0)) {
      if (connection.readyState === WebSocket.CLOSED) continue;
      const closed = once(connection, 'close');
      connection.terminate();
      await closed;
    }
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    if (home !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 } as never);
      home = undefined;
    }
    if (workDir !== undefined) {
      await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 } as never);
      workDir = undefined;
    }
    vi.unstubAllEnvs();
  });

  async function createSession(): Promise<string> {
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: authHeaders(server as RunningServer, { 'content-type': 'application/json' }),
      body: JSON.stringify({ metadata: { cwd: home as string } }),
    } as never);
    const body = (await res.json()) as Envelope<{ id: string }>;
    if (body.code !== 0) {
      throw new Error(`session create failed: code=${body.code} msg=${body.msg}`);
    }
    return body.data.id;
  }

  async function getJson<T>(path: string): Promise<{ status: number; body: Envelope<T> }> {
    const res = await fetch(`${base}${path}`, {
      headers: authHeaders(server as RunningServer),
    } as never);
    return { status: res.status, body: (await res.json()) as Envelope<T> };
  }

  async function postJson<T>(
    path: string,
    body: unknown,
  ): Promise<{ status: number; body: Envelope<T> }> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: authHeaders(server as RunningServer, { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    } as never);
    return { status: res.status, body: (await res.json()) as Envelope<T> };
  }

  it('GET returns an inactive research snapshot without triggering AITP I/O', async () => {
    const sessionId = await createSession();
    const { status, body } = await getJson<ResearchSnapshot>(
      `/api/v1/sessions/${sessionId}/research`,
    );
    expect(status).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.mode).toBe('inactive');
    expect(body.data.loopStatus).toBe('active');
    expect(body.data.revision).toBe(0);
    expect(body.data.questions).toHaveLength(0);
    expect(body.data.aitpHealth.phase).toBe('inactive');
  });

  it('GET returns SESSION_NOT_FOUND for a non-existent session', async () => {
    const { status, body } = await getJson<ResearchSnapshot>(
      '/api/v1/sessions/nonexistent/research',
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40401);
  });

  it('POST rejects an invalid command body with VALIDATION_FAILED', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'unknown_kind' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
    expect(body.details).toBeDefined();
  });

  it('POST rejects oversized Research Action and prepare_plan payloads at the route boundary', async () => {
    const sessionId = await createSession();
    const oversizedPlan = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'prepare_plan',
          objective: '',
          steps: ['step'],
          expectedEvidence: ['evidence'],
          stopCondition: 'stop',
        },
      },
    );
    expect(oversizedPlan.body.code).toBe(40001);
    expect(oversizedPlan.body.details).toBeDefined();

    const oversizedAction = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'begin_action',
          actionKind: 'experiment',
          purpose: 'purpose',
          stopCondition: 'stop',
          expectedEvidence: Array.from({ length: 51 }, () => 'evidence'),
          unexpected: true,
        },
      },
    );
    expect(oversizedAction.body.code).toBe(40001);
    expect(oversizedAction.body.details).toBeDefined();
  });

  it('POST validates Research Plan v2 references before dispatch', async () => {
    const sessionId = await createSession();
    const invalid = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'prepare_plan_v2',
          objective: 'Validate one milestone.',
          milestones: [{
            milestoneId: 'm1',
            title: 'Milestone',
            objective: 'Run one calculation.',
            completionCriterion: 'Validation passes.',
            evidenceRequirements: [],
          }],
          evidenceRequirements: [],
          decisionPoints: [],
          assumptions: [],
          currentMilestoneId: 'missing',
          stopConditions: ['Stop on failure.'],
          replanConditions: ['Replan on drift.'],
        },
      },
    );
    expect(invalid.body.code).toBe(40001);
    expect(invalid.body.details).toBeDefined();
  });

  it('POST dispatches Research Plan v2 transitions to the engine', async () => {
    const sessionId = await createSession();
    const entered = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(entered.body.code).toBe(0);
    const transitioned = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'activate_plan_v2',
          planId: 'missing-plan',
          expectedRevision: 1,
        },
      },
    );
    expect(transitioned.body.code).toBe(40001);
    expect(transitioned.body.msg).toMatch(/stale or unavailable/i);
  });

  it('POST changes the planning policy with snapshot revision concurrency', async () => {
    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    const changed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'set_planning_policy',
          policy: 'dreaming',
          expectedRevision: entered.body.data!.snapshot.revision,
        },
      },
    );
    expect(changed.body.code).toBe(0);
    expect(changed.body.data?.snapshot.planningPolicy).toBe('dreaming');

    const stale = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'set_planning_policy',
          policy: 'collaborative',
          expectedRevision: entered.body.data!.snapshot.revision,
        },
      },
    );
    expect(stale.body.code).toBe(40001);
  });

  it('POST binds and clears a Line workstream with fixed user provenance', async () => {
    const sessionId = await createSession();
    const liveSession = await resumeSessionById(server!.core.accessor, sessionId);
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    const binding = {
      confirmationId: 'confirmation-main-1',
      lineSlug: 'main',
      workstream: 'verified-inputs',
      topicId: 'topic-1',
      observedRevision: 1,
      confirmedBy: 'user' as const,
      confirmedAt: 1,
    };
    const confirm = vi.spyOn(research, 'confirmLineWorkstreamBinding').mockResolvedValue(binding);
    const clear = vi.spyOn(research, 'clearLineWorkstreamBinding').mockReturnValue(undefined);

    const forged = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'confirm_line_workstream_binding',
          lineSlug: 'main',
          workstream: 'verified-inputs',
          expectedRevision: 0,
          confirmedBy: 'main_agent',
        },
      },
    );
    expect(forged.body.code).toBe(40001);
    expect(confirm).not.toHaveBeenCalled();

    const confirmed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'confirm_line_workstream_binding',
          lineSlug: 'main',
          workstream: 'verified-inputs',
          expectedRevision: 0,
        },
      },
    );
    expect(confirmed.body.code).toBe(0);
    expect(confirm).toHaveBeenCalledWith({
      lineSlug: 'main',
      workstream: 'verified-inputs',
      expectedRevision: 0,
      confirmedBy: 'user',
    });

    const missingConfirmation = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'clear_line_workstream_binding',
          lineSlug: 'main',
          expectedRevision: 0,
        },
      },
    );
    expect(missingConfirmation.body.code).toBe(40001);
    expect(clear).not.toHaveBeenCalled();

    const forgedClear = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'clear_line_workstream_binding',
          lineSlug: 'main',
          expectedConfirmationId: binding.confirmationId,
          expectedRevision: 0,
          topicId: 'topic-forged',
        },
      },
    );
    expect(forgedClear.body.code).toBe(40001);
    expect(clear).not.toHaveBeenCalled();

    const cleared = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'clear_line_workstream_binding',
          lineSlug: 'main',
          expectedConfirmationId: binding.confirmationId,
          expectedRevision: 0,
        },
      },
    );
    expect(cleared.body.code).toBe(0);
    expect(clear).toHaveBeenCalledWith({
      lineSlug: 'main',
      expectedConfirmationId: binding.confirmationId,
      expectedRevision: 0,
    });
  });

  it('POST rejects update_line without its expected revision', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'update_line', lineSlug: 'main', assessment: 'new' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
    expect(body.details).toBeDefined();
  });

  it('POST rejects propose_checkpoint without its expected revision', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'propose_checkpoint', lineSlug: 'main' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
    expect(body.details).toBeDefined();
  });

  it('POST validates and dispatches historical checkpoint discard', async () => {
    const sessionId = await createSession();
    const liveSession = await resumeSessionById(server!.core.accessor, sessionId);
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    const discard = vi.spyOn(research, 'discardHistoricalCheckpoint').mockReturnValue({
      checkpointId: 'checkpoint-old',
      questionId: 'question-1',
      questionRevision: 2,
      lineSlug: 'main',
      idempotencyKey: 'checkpoint-old-key',
      persistence: 'pending_commit',
      createdAt: 1,
    });

    const missingRevision = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'discard_historical_checkpoint', checkpointId: 'checkpoint-old' } },
    );
    expect(missingRevision.body.code).toBe(40001);
    expect(discard).not.toHaveBeenCalled();

    const discarded = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'discard_historical_checkpoint',
          checkpointId: 'checkpoint-old',
          expectedRevision: 7,
        },
      },
    );
    expect(discarded.body.code).toBe(0);
    expect(discard).toHaveBeenCalledWith({
      checkpointId: 'checkpoint-old',
      expectedRevision: 7,
    });
  });

  it('POST rejects a body missing the command field', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {},
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
  });

  it('POST enter_mode is available without an experimental flag', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.snapshot.mode).not.toBe('inactive');
  });

  it('POST resolves human decisions, acknowledges alerts, and maps attention errors', async () => {
    await server!.close();
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(entered.body.code).toBe(0);

    const liveSession = await resumeSessionById(server.core.accessor, sessionId);
    expect(liveSession).toBeDefined();
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    const gate = research.requestHumanDecision({
      kind: 'decision',
      prompt: 'Choose the next research direction.',
    });

    const missingGate = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: 'missing-gate',
          resolution: 'ignored',
          nextPhase: 'idle',
        },
      },
    );
    expect(missingGate.body.code).toBe(40001);

    const invalidPhase = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: gate.gateId,
          resolution: 'not yet',
          nextPhase: 'orienting',
        },
      },
    );
    expect(invalidPhase.body.code).toBe(40001);

    const resolved = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: gate.gateId,
          resolution: 'Continue with the measured path.',
          nextPhase: 'idle',
        },
      },
    );
    expect(resolved.body.code).toBe(0);
    expect(resolved.body.data.snapshot.phase).toBe('idle');
    expect(resolved.body.data.snapshot.humanGate).toMatchObject({
      gateId: gate.gateId,
      resolution: 'Continue with the measured path.',
      resolvedAt: expect.any(Number),
    });

    const repeated = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resolve_decision',
          gateId: gate.gateId,
          resolution: 'again',
          nextPhase: 'idle',
        },
      },
    );
    expect(repeated.body.code).toBe(40001);

    const createdLine = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'create_line', slug: 'main', title: 'Main line' } },
    );
    expect(createdLine.body.data.snapshot.lines[0]?.slug).toBe('main');
    const createdQuestion = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'create_question',
          lineSlug: 'main',
          wording: 'Why?',
        },
      },
    );
    const questionId = createdQuestion.body.data.snapshot.questions[0]!.id;
    const closed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'close_question',
          questionId,
          expectedRevision: createdQuestion.body.data.snapshot.revision,
        },
      },
    );
    const reopened = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'reopen_question',
          questionId,
          expectedRevision: closed.body.data.snapshot.revision,
        },
      },
    );
    const alert = reopened.body.data.snapshot.alerts.find(
      (candidate) => candidate.fingerprint === `research.alert.reopened.question.${questionId}`,
    );
    expect(alert).toBeDefined();

    const acknowledged = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'acknowledge_alert', fingerprint: alert!.fingerprint } },
    );
    expect(acknowledged.body.code).toBe(0);
    expect(acknowledged.body.data.snapshot.alerts.find(
      (candidate) => candidate.fingerprint === alert!.fingerprint,
    )).toMatchObject({ acknowledgedAt: expect.any(Number) });
  });

  it('POST pause_loop and resume_loop return the real loopStatus snapshot', async () => {
    await server!.close();
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(entered.body.code).toBe(0);
    expect(entered.body.data.snapshot.mode).not.toBe('inactive');

    const revision = entered.body.data.snapshot.revision;
    const paused = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'pause_loop', expectedRevision: revision } },
    );
    expect(paused.body.code).toBe(0);
    expect(paused.body.data.snapshot.loopStatus).toBe('paused');
    expect(paused.body.data.snapshot.revision).toBeGreaterThan(revision);

    const stale = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'resume_loop', expectedRevision: revision } },
    );
    expect(stale.body.code).toBe(40001);

    const resumed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'resume_loop',
          expectedRevision: paused.body.data.snapshot.revision,
        },
      },
    );
    expect(resumed.body.code).toBe(0);
    expect(resumed.body.data.snapshot.loopStatus).toBe('active');
    expect(resumed.body.data.snapshot.revision).toBeGreaterThan(
      paused.body.data.snapshot.revision,
    );
  });

  it('POST pause_loop with stale revision maps to VALIDATION_FAILED', async () => {
    const sessionId = await createSession();
    // The research model starts at revision 0 (inactive mode). A pause_loop
    // with expectedRevision=999 is stale, so the dedicated mode service throws
    // research.revision_stale — mapped to VALIDATION_FAILED.
    const { status, body } = await postJson<ResearchSnapshot>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'pause_loop', expectedRevision: 999 } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
  });

  it('POST rejects a stale checkpoint proposal without creating pending state', async () => {
    await server!.close();
    vi.stubEnv('KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE', '1');
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    const expectedRevision = entered.body.data.snapshot.revision;
    const advanced = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'create_line', slug: 'main', title: 'Main line' } },
    );
    expect(advanced.body.data.snapshot.revision).toBeGreaterThan(expectedRevision);

    const stale = await postJson<unknown>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'propose_checkpoint',
          expectedRevision,
          lineSlug: 'main',
        },
      },
    );
    expect(stale.status).toBe(200);
    expect(stale.body.code).toBe(40001);
    expect(stale.body.msg).toMatch(/revision is stale/i);

    const current = await getJson<ResearchSnapshot & { pendingCheckpoint?: unknown }>(
      `/api/v1/sessions/${sessionId}/research`,
    );
    expect(current.body.data.pendingCheckpoint).toBeUndefined();
  });

  it('POST set_focus with stale revision maps to VALIDATION_FAILED', async () => {
    const sessionId = await createSession();
    const { status, body } = await postJson<ResearchSnapshot>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'set_focus',
          questionId: 'q-nonexistent',
          expectedRevision: 999,
        },
      },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40001);
  });

  it('POST dispatches an action-bound run observation to the research service', async () => {
    await server!.close();
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(entered.body.code).toBe(0);

    const liveSession = await resumeSessionById(server.core.accessor, sessionId);
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    research.setPhase('gap_analysis');
    const action = research.planAction({
      kind: 'simulation',
      purpose: 'Run the bounded HPC calculation.',
      stopCondition: 'Stop after the declared analyzer evidence exists.',
    });
    research.startAction(action.actionId);
    const before = research.getSnapshot();

    const observed = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'observe_run',
          actionId: action.actionId,
          expectedRevision: before.revision,
          campaign: 'bi2se3-r2',
          jobId: '3128781',
          stage: 'scf',
          schedulerState: 'running',
          artifactRefs: ['scf.log'],
        },
      },
    );
    expect(observed.body.code).toBe(0);
    expect(observed.body.data.snapshot.currentRun).toMatchObject({
      actionId: action.actionId,
      campaign: 'bi2se3-r2',
      jobId: '3128781',
      stage: 'scf',
      schedulerState: 'running',
      artifactRefs: ['scf.log'],
    });
  });

  it('recovers a concluded run through REST after server restart and publishes the same terminal state over WS', async () => {
    const sessionId = await createSession();
    const route = `/api/v1/sessions/${sessionId}/research/command`;
    const send = async (command: Record<string, unknown>) => {
      const result = await postJson<{ snapshot: ResearchSnapshot }>(route, { command });
      expect(result.body.code).toBe(0);
      return result.body.data.snapshot;
    };
    await send({ kind: 'enter_mode', actor: 'user' });
    const begun = await send({
      kind: 'begin_action', actionKind: 'simulation', purpose: 'Inspect an already running fixture job.',
      stopCondition: 'Inspect only; never submit external work.',
    });
    const actionId = begun.currentAction!.actionId;
    const observation = {
      kind: 'observe_run', actionId, campaign: 'fixture-campaign', jobId: 'fixture-job',
      sourcePin: 'source-a', binaryPin: 'binary-a', stage: 'running', schedulerState: 'running', artifactRefs: [],
    };
    await send({ ...observation, expectedRevision: begun.revision });
    const concluded = await send({
      kind: 'conclude_action', actionId, status: 'completed', headline: 'Inspection ended; job remains running',
      motivation: 'The external job outlives one inspection.', workPerformed: 'Re-read a fixture observation.',
      result: 'No terminal result is known.', mainlineImpact: 'Retain the existing job for subsequent observation.',
      durability: { status: 'no_durable_delta', rationale: 'Fixture-only observation of existing state.' },
    });
    await server!.close();
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY, host: '127.0.0.1', port: 0, homeDir: home!, logLevel: 'silent',
    });
    base = `http://127.0.0.1:${server.port}`;
    const restored = await getJson<ResearchSnapshot>(`/api/v1/sessions/${sessionId}/research`);
    expect(restored.body.code).toBe(0);
    expect(restored.body.data.currentAction?.status).toBe('completed');
    expect(restored.body.data.currentRun).toEqual(concluded.currentRun);
    const frames: Array<{ type: string; id?: string; payload?: {
      accepted_subscriptions?: string[]; snapshot?: ResearchSnapshot;
    } }> = [];
    const token = server.authTokenService.getToken();
    const connection = new WebSocket(`${base.replace('http:', 'ws:')}/api/v1/ws`, [`kimi-code.bearer.${token}`]);
    connections.push(connection);
    connection.on('message', (data) => frames.push(JSON.parse((data as Buffer).toString()) as (typeof frames)[number]));
    await once(connection, 'open');
    connection.send(JSON.stringify({ type: 'client_hello', id: 'run-recovery-subscription',
      payload: { token, client_id: 'cli', subscriptions: [sessionId] } }));
    await expect.poll(() => frames.find((frame) => frame.type === 'ack' && frame.id === 'run-recovery-subscription'))
      .toMatchObject({ payload: { accepted_subscriptions: [sessionId] } });
    const observing = await send({
      kind: 'begin_action', actionKind: 'simulation', purpose: 'Observe the retained fixture job once.',
      observedRunActionId: actionId, stopCondition: 'One status observation; no submission.',
    });
    expect(observing.currentAction?.observedRunActionId).toBe(actionId);
    expect(observing.currentRun).toEqual(concluded.currentRun);
    const terminal = await send({
      ...observation, actionId: observing.currentAction!.actionId, expectedRevision: observing.revision,
      stage: 'completed', schedulerState: 'completed', terminalState: 'completed',
    });
    expect(terminal.currentRun).toMatchObject({ actionId, jobId: 'fixture-job', terminalState: 'completed' });
    expect(terminal.currentAction?.status).toBe('in_progress');
    expect(terminal.latestProgress).toEqual(concluded.latestProgress);
    await expect.poll(() => frames.find((frame) => frame.type === 'research.updated'
      && frame.payload?.snapshot?.currentRun?.terminalState === 'completed'))
      .toMatchObject({ payload: { snapshot: {
        revision: terminal.revision, currentRun: terminal.currentRun, currentAction: terminal.currentAction,
      } } });
    await send({
      kind: 'conclude_action', actionId: observing.currentAction!.actionId, status: 'completed',
      headline: 'Fixture observation ended', motivation: 'Re-read terminal evidence.', workPerformed: 'Observed fixture only.',
      result: 'Fixture is terminal.', mainlineImpact: 'No physical conclusion.',
      durability: { status: 'no_durable_delta', rationale: 'Test fixture only.' },
    });
    const next = await send({
      kind: 'begin_action', actionKind: 'data_analysis', purpose: 'Evaluate the observed result.',
      stopCondition: 'One bounded analysis.',
    });
    expect(next.currentAction?.status).toBe('in_progress');
    expect(next.currentAction?.actionId).not.toBe(actionId);
  }, 30_000);

  it('POST runs a bounded action lifecycle and switches Lines from its settled state', async () => {
    await server!.close();
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user', lineSlug: 'main' } },
    );
    expect(entered.body.code).toBe(0);

    const liveSession = await resumeSessionById(server.core.accessor, sessionId);
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    research.setPhase('orienting');

    const begun = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'begin_action',
          actionKind: 'derivation',
          purpose: 'Derive the symmetry constraint for the current question.',
          expectedEvidence: ['A checked algebraic identity'],
          stopCondition: 'Stop after the identity is checked.',
        },
      },
    );
    expect(begun.body.code).toBe(0);
    const actionId = (begun.body.data.snapshot as ResearchSnapshot & {
      currentAction?: { actionId: string; status: string };
    }).currentAction?.actionId;
    expect(actionId).toBeDefined();
    expect(begun.body.data.snapshot.phase).toBe('action_executing');

    const concluded = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'conclude_action',
          actionId,
          status: 'completed',
          headline: 'Symmetry constraint derived',
          motivation: 'The question requires an algebraic constraint.',
          workPerformed: 'Derived and checked the constraint term by term.',
          result: 'The identity holds for the chosen representation.',
          mainlineImpact: 'The result supports the current symmetry hypothesis.',
          nextAction: 'Compare the identity with the numerical evidence.',
          durability: {
            status: 'no_durable_delta',
            rationale: 'This public-route regression does not exercise AITP persistence.',
          },
        },
      },
    );
    expect(concluded.body.code).toBe(0);
    expect(concluded.body.data.snapshot.phase).toBe('state_updated');
    expect(concluded.body.data.snapshot.latestProgress).toMatchObject({
      result: 'The identity holds for the chosen representation.',
      mainlineImpact: 'The result supports the current symmetry hypothesis.',
    });
    const route = `/api/v1/sessions/${sessionId}/research/command`;
    const created = await postJson<{ snapshot: ResearchSnapshot }>(route, {
      command: { kind: 'create_line', slug: 'symmetry-operator-search', title: 'Symmetry operators' },
    });
    expect(created.body.code).toBe(0);
    expect(created.body.data.snapshot.phase).toBe('state_updated');
    const stale = await postJson<unknown>(route, {
      command: {
        kind: 'switch_line', lineSlug: 'symmetry-operator-search',
        expectedRevision: concluded.body.data.snapshot.revision,
      },
    });
    expect(stale.body.code).toBe(40001);
    expect(research.getSnapshot().phase).toBe('state_updated');
    const switched = await postJson<{ snapshot: ResearchSnapshot }>(route, {
      command: {
        kind: 'switch_line', lineSlug: 'symmetry-operator-search',
        expectedRevision: created.body.data.snapshot.revision,
      },
    });
    expect(switched.body.code).toBe(0);
    expect(switched.body.data.snapshot).toMatchObject({
      currentLineSlug: 'symmetry-operator-search', phase: 'idle',
    });
    expect(switched.body.data.snapshot.currentAction).toBeUndefined();
    expect(switched.body.data.snapshot.latestProgress).toBeUndefined();
    expect((await getJson<ResearchSnapshot>(`/api/v1/sessions/${sessionId}/research`)).body.data)
      .toEqual(switched.body.data.snapshot);
  });

  it('POST retains an unscoped durable conclusion and forwards explicit ownership adoption', async () => {
    const sessionId = await createSession();
    const route = `/api/v1/sessions/${sessionId}/research/command`;
    const entered = await postJson<{ snapshot: ResearchSnapshot }>(route, {
      command: { kind: 'enter_mode', actor: 'user' },
    });
    expect(entered.body.code).toBe(0);
    const begun = await postJson<{ snapshot: ResearchSnapshot }>(route, {
      command: {
        kind: 'begin_action', actionKind: 'derivation', purpose: 'Check a primitive identity',
        expectedEvidence: ['An exact identity or counterexample'], stopCondition: 'Stop after the local check',
      },
    });
    expect(begun.body.code).toBe(0);
    const actionId = begun.body.data.snapshot.currentAction!.actionId;
    const command = {
      kind: 'conclude_action', actionId, status: 'completed', headline: 'Primitive counterexample',
      motivation: 'Check the representation', workPerformed: 'Compared exact basis-state actions',
      result: 'Squared identity fails', mainlineImpact: 'Revalidate affected calculations',
      nextAction: 'Check a bounded correction',
      durability: {
        status: 'durable_delta', entryKind: 'failure', authority: 'agent',
        provenance: 'agent_verification', rationale: 'Exact counterexample',
      },
    };
    type LocalSnapshot = ResearchSnapshot & {
      localConclusion?: { candidate: { sourceActionId: string }; progress: { result: string } };
      pendingCheckpoint?: unknown;
    };
    const frames: Array<{ type: string; id?: string; session_id?: string;
      payload?: { accepted_subscriptions?: string[]; snapshot?: LocalSnapshot } }> = [];
    const token = server!.authTokenService.getToken();
    const connection = new WebSocket(`${base.replace('http:', 'ws:')}/api/v1/ws`, [`kimi-code.bearer.${token}`]);
    connections.push(connection);
    connection.on('message', (data) => {
      frames.push(JSON.parse((data as Buffer).toString()) as (typeof frames)[number]);
    });
    await once(connection, 'open');
    connection.send(JSON.stringify({ type: 'client_hello', id: 'local-result-subscription',
      payload: { token, client_id: 'cli', subscriptions: [sessionId] } }));
    await expect.poll(() => frames.find((frame) => frame.type === 'ack' && frame.id === 'local-result-subscription'))
      .toMatchObject({ payload: { accepted_subscriptions: [sessionId] } });
    const concluded = await postJson<{ snapshot: LocalSnapshot }>(route, { command });
    expect(concluded.body.code).toBe(0);
    const snapshot = concluded.body.data.snapshot;
    expect(snapshot.currentAction?.status).toBe('completed');
    expect(snapshot.phase).toBe('state_updated');
    expect(snapshot.localConclusion).toMatchObject({
      candidate: { sourceActionId: actionId }, progress: { result: command.result },
    });
    expect(snapshot.pendingCheckpoint).toBeUndefined();
    const event = { type: 'research.updated', snapshot };
    expect(agentEventSchema.parse(event)).toEqual(event);
    await expect.poll(() => frames.find((frame) => frame.type === 'research.updated'
      && frame.payload?.snapshot?.localConclusion?.candidate.sourceActionId === actionId))
      .toMatchObject({ session_id: sessionId, payload: { snapshot: {
        revision: snapshot.revision, phase: 'state_updated',
        localConclusion: snapshot.localConclusion, currentAction: snapshot.currentAction,
      } } });
    const read = await getJson<LocalSnapshot>(`/api/v1/sessions/${sessionId}/research`);
    expect(read.body.data.localConclusion).toEqual(snapshot.localConclusion);

    const liveSession = await resumeSessionById(server!.core.accessor, sessionId);
    const agent = await ensureMainAgent(liveSession!);
    const research = agent.accessor.get(IAgentResearchService);
    const propose = vi.spyOn(research, 'proposeCheckpoint');
    const rejected = await postJson<unknown>(route, { command: {
      kind: 'propose_checkpoint', expectedRevision: snapshot.revision,
      localConclusionId: actionId, confirmedBy: 'user', lineSlug: 'missing-line',
    } });
    expect(propose).toHaveBeenCalledOnce();
    expect(propose.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: snapshot.revision, localConclusionId: actionId,
      confirmedBy: 'user', lineSlug: 'missing-line',
    });
    expect(rejected.body.code).not.toBe(0);
    expect((await getJson<LocalSnapshot>(`/api/v1/sessions/${sessionId}/research`)).body.data.localConclusion)
      .toEqual(snapshot.localConclusion);
  });

  it('POST prepares and discards a ResearchPlan through the public command surface', async () => {
    await server!.close();
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const sessionId = await createSession();
    await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user', lineSlug: 'main' } },
    );
    const prepared = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      {
        command: {
          kind: 'prepare_plan',
          objective: 'Compare two symmetry-preserving calculation paths.',
          steps: ['Run the two paths', 'Compare invariant observables'],
          expectedEvidence: ['Matching invariant observables'],
          stopCondition: 'Stop after both paths converge.',
        },
      },
    );
    expect(prepared.body.code).toBe(0);
    expect(prepared.body.data.snapshot.researchPlan).toMatchObject({
      status: 'draft',
      objective: 'Compare two symmetry-preserving calculation paths.',
    });

    const discarded = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${sessionId}/research/command`,
      { command: { kind: 'discard_plan' } },
    );
    expect(discarded.body.code).toBe(0);
    expect(discarded.body.data.snapshot.researchPlan?.status).toBe('discarded');
  });

  it('POST maps pending gates and missing human approval to VALIDATION_FAILED envelopes', async () => {
    await server!.close();
    server = await startServer({
      hostIdentity: TEST_HOST_IDENTITY,
      host: '127.0.0.1',
      port: 0,
      homeDir: home as string,
      logLevel: 'silent',
      debugEndpoints: true,
    });
    base = `http://127.0.0.1:${server.port}`;

    const pendingSessionId = await createSession();
    const pendingEntered = await postJson<unknown>(
      `/api/v1/sessions/${pendingSessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(pendingEntered.body.code).toBe(0);
    const pendingSession = await resumeSessionById(server.core.accessor, pendingSessionId);
    const pendingAgent = await ensureMainAgent(pendingSession!);
    pendingAgent.accessor.get(IAgentResearchService).requestHumanDecision({
      kind: 'decision',
      prompt: 'Choose the next bounded phase.',
    });
    const gatePending = await postJson<unknown>(
      `/api/v1/sessions/${pendingSessionId}/research/command`,
      {
        command: {
          kind: 'begin_action',
          actionKind: 'experiment',
          purpose: 'Run the bounded experiment.',
          stopCondition: 'Stop at convergence.',
          requiresHumanApproval: true,
        },
      },
    );
    expect(gatePending.status).toBe(200);
    expect(gatePending.body).toMatchObject({
      code: 40001,
      data: null,
      request_id: expect.any(String),
    });
    expect(gatePending.body.code).not.toBe(50001);

    const approvalSessionId = await createSession();
    const approvalEntered = await postJson<unknown>(
      `/api/v1/sessions/${approvalSessionId}/research/command`,
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(approvalEntered.body.code).toBe(0);
    const approvalSession = await resumeSessionById(server.core.accessor, approvalSessionId);
    const approvalAgent = await ensureMainAgent(approvalSession!);
    const approvalResearch = approvalAgent.accessor.get(IAgentResearchService);
    approvalResearch.setPhase('orienting');
    const begun = await postJson<{ snapshot: ResearchSnapshot }>(
      `/api/v1/sessions/${approvalSessionId}/research/command`,
      {
        command: {
          kind: 'begin_action',
          actionKind: 'experiment',
          purpose: 'Run the bounded experiment.',
          stopCondition: 'Stop at convergence.',
          requiresHumanApproval: true,
        },
      },
    );
    expect(begun.body.code).toBe(0);
    const actionId = begun.body.data.snapshot.currentAction?.actionId;
    expect(actionId).toBeDefined();
    const approvalRequired = await postJson<unknown>(
      `/api/v1/sessions/${approvalSessionId}/research/command`,
      { command: { kind: 'start_action', actionId } },
    );
    expect(approvalRequired.status).toBe(200);
    expect(approvalRequired.body).toMatchObject({
      code: 40001,
      data: null,
      request_id: expect.any(String),
    });
    expect(approvalRequired.body.code).not.toBe(50001);
  });

  it('POST on a non-existent session returns SESSION_NOT_FOUND', async () => {
    const { status, body } = await postJson<unknown>(
      '/api/v1/sessions/nonexistent/research/command',
      { command: { kind: 'enter_mode', actor: 'user' } },
    );
    expect(status).toBe(200);
    expect(body.code).toBe(40401);
  });
});
