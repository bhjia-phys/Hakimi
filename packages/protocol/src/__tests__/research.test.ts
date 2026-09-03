import { describe, it, expect } from 'vitest';

import {
  researchAlertSchema,
  researchCommandRequestSchema,
  researchStatusSnapshotSchema,
} from '../research';
import {
  agentEventSchema,
  aitpModeUpdatedEventSchema,
  researchUpdatedEventSchema,
} from '../events';

const validSnapshot = {
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

const readyMaintenanceReceipt = {
  status: 'ready',
  refreshedAt: 1_700_000_000_000,
  memoryStatus: 'available',
  workstream: 'main-line',
  latestWorkingNoteAt: 1_699_999_000_000,
  activeNewerThanWorkingNote: true,
  unresolvedFailureCount: 0,
  unresolvedFailures: [],
  nextAction: 'review the latest working note',
  warningSummaries: [{ level: 'warning', code: 'legacy_entry' }],
  check: {
    status: 'clean',
    counts: { entries: 2, notes: 1, errors: 0, warnings: 0 },
    findingCodes: [],
  },
};

const degradedMaintenanceReceipt = {
  status: 'degraded',
  refreshedAt: 1_700_000_000_100,
  memoryStatus: 'unknown',
  activeNewerThanWorkingNote: null,
  unresolvedFailureCount: 0,
  warningSummaries: [],
  check: {
    status: 'unavailable',
    findingCodes: [],
  },
  degradedReason: 'check_unavailable',
};

describe('researchStatusSnapshotSchema', () => {
  it('accepts a minimal valid snapshot', () => {
    const parsed = researchStatusSnapshotSchema.parse(validSnapshot);
    expect(parsed.mode).toBe('inactive');
    expect(parsed.revision).toBe(0);
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
        ...validSnapshot,
        currentLineSlug: 'main',
        currentWorkstreamBinding: {
          lineSlug: 'main',
          status,
          reason: 'Malformed missing binding.',
        },
      })),
      {
        ...validSnapshot,
        currentLineSlug: 'main',
        currentWorkstreamBinding: {
          lineSlug: 'main',
          status: 'unbound',
          reason: 'Malformed unexpected binding.',
          binding,
        },
      },
      {
        ...validSnapshot,
        currentLineSlug: 'main',
        currentWorkstreamBinding: {
          lineSlug: 'main',
          status: 'bound',
          reason: 'Malformed non-conflicting binding Line mismatch.',
          binding: { ...binding, lineSlug: 'other' },
        },
      },
      {
        ...validSnapshot,
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
      ...validSnapshot,
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
      ...validSnapshot,
      currentLineSlug: 'main',
      currentWorkstreamBinding: {
        lineSlug: 'main',
        status: 'conflict',
        reason: 'The stored binding identifies another Line.',
        binding: { ...binding, lineSlug: 'other' },
      },
    }).success).toBe(true);
  });

  it('accepts the specialized Research Goal projection and rejects unknown fields', () => {
    const researchGoal = {
      schema: 'hakimi/research-goal-0.1' as const,
      goalId: 'goal-1',
      objective: 'Validate the bounded result',
      completionCriterion: 'The result passes its convergence checks',
      scope: {
        programTopicId: 'topic-1',
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
      status: 'active' as const,
      continuation: {
        state: 'held' as const,
        owner: 'research',
        reason: 'A research checkpoint is pending commit.',
      },
      programRelation: {
        status: 'aligned' as const,
        reason: 'Confirmed as goal_parent_of_program.',
      },
      humanGates: [],
      persistenceGuards: [{
        code: 'research.mode.ready',
        status: 'clear' as const,
        reason: 'Research Mode is ready.',
      }],
      researchRevision: 4,
    };
    expect(researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      researchGoal,
    }).researchGoal).toEqual(researchGoal);
    const { continuation: _continuation, ...legacyResearchGoal } = researchGoal;
    expect(_continuation.state).toBe('held');
    expect(researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      researchGoal: legacyResearchGoal,
    }).researchGoal?.continuation).toBeUndefined();
    expect(() => researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      researchGoal: {
        ...researchGoal,
        continuation: { state: 'future_continuation_state' },
      },
    })).toThrow();
    expect(() => researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      researchGoal: { ...researchGoal, unknown: true },
    })).toThrow();
  });

  it('accepts Research Plan v2, Action Plan alias, and action bindings after a JSON round-trip', () => {
    const actionPlan = {
      planId: 'action-plan-1',
      researchRevision: 8,
      programId: 'topic-1',
      lineSlug: 'main',
      questionId: 'q1',
      objective: 'Run one bounded calculation',
      steps: ['Run', 'Validate'],
      expectedEvidence: ['Output and validation log'],
      stopCondition: 'Stop after validation',
      status: 'finalized' as const,
      resolution: { planId: 'action-plan-1', planRevision: 1, outcome: 'approved' as const },
    };
    const researchPlanV2 = {
      schema: 'hakimi/research-plan-0.2' as const,
      planId: 'research-plan-1',
      revision: 2,
      goalId: 'goal-1',
      programId: 'topic-1',
      programObservedRevision: 1,
      goalRelation: 'goal_milestone_in_program' as const,
      objective: 'Validate one program milestone',
      completionCriterion: 'Validated evidence exists',
      milestones: [{
        milestoneId: 'm1',
        title: 'Validate calculation',
        objective: 'Run one calculation',
        completionCriterion: 'Checks pass',
        evidenceRequirements: ['Output and validation log'],
      }],
      evidenceRequirements: ['Reproducible result'],
      decisionPoints: [{
        decisionId: 'd1',
        milestoneId: 'm1',
        prompt: 'Is the result usable?',
        condition: 'Ask on ambiguity',
      }],
      assumptions: ['Fixture is representative'],
      currentMilestoneId: 'm1',
      stopConditions: ['Stop on failed validation'],
      replanConditions: ['Replan on Program drift'],
      status: 'active' as const,
      createdAt: 1,
      updatedAt: 2,
    };
    const currentAction = {
      actionId: 'action-1',
      questionId: 'q1',
      lineSlug: 'main',
      kind: 'simulation' as const,
      purpose: 'Run the reviewed calculation',
      expectedEvidence: ['Output and validation log'],
      stopCondition: 'Stop after validation',
      allowedToolKinds: [],
      status: 'in_progress' as const,
      createdAt: 3,
      requiresHumanApproval: false,
      researchPlanBinding: { planId: 'research-plan-1', planRevision: 2, milestoneId: 'm1' },
      actionPlanBinding: {
        schema: 'hakimi/action-plan-binding-0.1' as const,
        kind: 'reviewed_plan' as const,
        planId: 'action-plan-1',
        planRevision: 1,
      },
    };
    const parsed = researchStatusSnapshotSchema.parse(JSON.parse(JSON.stringify({
      ...validSnapshot,
      researchPlan: actionPlan,
      actionPlan,
      researchPlanV2,
      currentAction,
    })));
    expect(parsed.researchPlanV2).toEqual(researchPlanV2);
    expect(parsed.actionPlan).toEqual(actionPlan);
    expect(parsed.currentAction?.researchPlanBinding?.planRevision).toBe(2);
  });

  it('accepts active and acknowledged alert records', () => {
    const alerts = [
      {
        fingerprint: 'research.alert.blocked.question.q1',
        kind: 'blocked',
        message: 'Question q1 is blocked',
        questionId: 'q1',
        lineSlug: 'main-line',
        createdAt: 100,
      },
      {
        fingerprint: 'research.alert.stale.line.main-line',
        kind: 'stale',
        message: 'Evidence is stale',
        lineSlug: 'main-line',
        createdAt: 200,
        acknowledgedAt: 300,
      },
    ];
    const snapshot = { ...validSnapshot, alerts };
    const parsed = researchStatusSnapshotSchema.parse(
      JSON.parse(JSON.stringify(snapshot)),
    );
    expect(parsed.alerts).toEqual(alerts);
    expect(researchAlertSchema.parse(alerts[0]).acknowledgedAt).toBeUndefined();
    expect(researchAlertSchema.parse(alerts[1]).acknowledgedAt).toBe(300);
  });

  it('rejects incomplete, invalid, or unknown alert fields', () => {
    const alert = {
      fingerprint: 'research.alert.degraded.session',
      kind: 'degraded' as const,
      message: 'Research is degraded',
      createdAt: 400,
    };
    const { fingerprint: _fingerprint, ...missingFingerprint } = alert;
    void _fingerprint;
    const { createdAt: _createdAt, ...missingCreatedAt } = alert;
    void _createdAt;

    expect(() => researchAlertSchema.parse(missingFingerprint)).toThrow();
    expect(() => researchAlertSchema.parse(missingCreatedAt)).toThrow();
    expect(() =>
      researchAlertSchema.parse({ ...alert, acknowledgedAt: 'later' }),
    ).toThrow();
    expect(() =>
      researchAlertSchema.parse({ ...alert, fingerprint: '' }),
    ).toThrow();
    expect(() =>
      researchAlertSchema.parse({ ...alert, internalId: 'engineering-only' }),
    ).toThrow();
  });

  it('accepts a ready maintenance receipt after a JSON round-trip', () => {
    const snapshot = {
      ...validSnapshot,
      aitpMaintenance: JSON.parse(JSON.stringify(readyMaintenanceReceipt)),
    };
    const parsed = researchStatusSnapshotSchema.parse(snapshot);
    expect(parsed.aitpMaintenance).toEqual(readyMaintenanceReceipt);
  });

  it('accepts a degraded maintenance receipt without check counts', () => {
    const parsed = researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      aitpMaintenance: degradedMaintenanceReceipt,
    });
    expect(parsed.aitpMaintenance).toMatchObject({
      status: 'degraded',
      check: { status: 'unavailable', findingCodes: [] },
      degradedReason: 'check_unavailable',
    });
  });

  it('rejects an invalid maintenance enum value', () => {
    expect(() =>
      researchStatusSnapshotSchema.parse({
        ...validSnapshot,
        aitpMaintenance: { ...readyMaintenanceReceipt, status: 'unknown' },
      }),
    ).toThrow();
  });

  it('rejects invalid maintenance check counts', () => {
    expect(() =>
      researchStatusSnapshotSchema.parse({
        ...validSnapshot,
        aitpMaintenance: {
          ...readyMaintenanceReceipt,
          check: {
            ...readyMaintenanceReceipt.check,
            counts: { ...readyMaintenanceReceipt.check.counts, errors: -1 },
          },
        },
      }),
    ).toThrow();
  });

  it('accepts versioned distillation attention receipts and rejects incomplete unavailable receipts', () => {
    const requested = researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      distillationAttention: {
        schema: 'hakimi/research-distillation-attention-0.1',
        status: 'review_requested',
        checkpointId: 'cp-1',
        entryId: 'entry-1',
        recordedAt: 1000,
      },
    });
    expect(requested.distillationAttention?.status).toBe('review_requested');

    const unavailable = researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      distillationAttention: {
        schema: 'hakimi/research-distillation-attention-0.1',
        status: 'handoff_unavailable',
        checkpointId: 'cp-2',
        entryId: 'entry-2',
        reason: 'Skill hidden',
        recordedAt: 2000,
      },
    });
    expect(unavailable.distillationAttention).toMatchObject({
      status: 'handoff_unavailable',
      reason: 'Skill hidden',
    });

    expect(() => researchStatusSnapshotSchema.parse({
      ...validSnapshot,
      distillationAttention: {
        schema: 'hakimi/research-distillation-attention-0.1',
        status: 'handoff_unavailable',
        checkpointId: 'cp-3',
        entryId: 'entry-3',
        recordedAt: 3000,
      },
    })).toThrow();
  });

  it('accepts a full snapshot with questions and lines', () => {
    const full = {
      mode: 'ready',
      loopStatus: 'active',
      planningPolicy: 'dreaming',
      currentLineSlug: 'main-line',
      currentWorkstreamBinding: {
        lineSlug: 'main-line',
        status: 'bound',
        reason: 'Explicitly confirmed.',
        binding: {
          confirmationId: 'confirmation-main-1',
          lineSlug: 'main-line',
          workstream: 'verified-inputs',
          topicId: 'topic-1',
          observedRevision: 2,
          confirmedBy: 'user',
          confirmedAt: 1_700_000_000_000,
        },
      },
      lineWorkstreamBindings: [{
        confirmationId: 'confirmation-main-1',
        lineSlug: 'main-line',
        workstream: 'verified-inputs',
        topicId: 'topic-1',
        observedRevision: 2,
        confirmedBy: 'user',
        confirmedAt: 1_700_000_000_000,
      }],
      currentFocus: { questionId: 'q1', boundedAction: 'run exp-A', revision: 1 },
      currentQuestion: {
        id: 'q1',
        lineSlug: 'main-line',
        wording: 'What is the mechanism?',
        assessment: 'candidate mechanism',
        priority: 1,
        neededEvidence: ['exp-A'],
        evidenceRefs: [],
        falsifierRefs: [],
        workflow: 'active',
        epistemic: 'candidate',
        persistence: 'working',
        revision: 1,
      },
      questions: [
        {
          id: 'q1',
          lineSlug: 'main-line',
          wording: 'What is the mechanism?',
          assessment: 'candidate mechanism',
          priority: 1,
          neededEvidence: ['exp-A'],
          evidenceRefs: [],
          falsifierRefs: [],
          workflow: 'active',
          epistemic: 'candidate',
          persistence: 'working',
          revision: 1,
        },
      ],
      lines: [
        {
          slug: 'main-line',
          title: 'Main Line',
          assessment: 'primary line',
          status: 'active',
          createdAt: 1000,
          revision: 1,
        },
      ],
      openQuestionCount: 0,
      activeQuestionCount: 1,
      blockedQuestionCount: 0,
      alerts: [],
      aitpHealth: { phase: 'ready', contractVersion: '1.0' },
      pendingCheckpoint: {
        checkpointId: 'cp1',
        questionId: 'q1',
        lineSlug: 'main-line',
        workstreamBinding: {
          confirmationId: 'confirmation-main-1',
          lineSlug: 'main-line',
          workstream: 'verified-inputs',
          topicId: 'topic-1',
          observedRevision: 2,
          confirmedBy: 'user',
          confirmedAt: 1_700_000_000_000,
        },
        commitCandidate: {
          sourceActionId: 'act-1',
          progressRecordedAt: 2_500,
          entryKind: 'result',
          authority: 'agent',
          provenance: 'agent_verification',
          rationale: 'The checked experiment produced a durable result.',
        },
        assessment: 'persist candidate mechanism',
        nextAction: 'run exp-A',
        idempotencyKey: 'key-1',
        persistence: 'pending_commit',
        createdAt: 1000,
      },
      phase: 'action_planned',
      currentAction: {
        actionId: 'act-1',
        questionId: 'q1',
        lineSlug: 'main-line',
        kind: 'experiment',
        purpose: 'Test hypothesis H1',
        expectedEvidence: ['exp-A result'],
        stopCondition: 'p < 0.05',
        allowedToolKinds: ['shell'],
        status: 'planned',
        createdAt: 2000,
        requiresHumanApproval: false,
      },
      latestProgress: {
        headline: 'Ran exp-A',
        motivation: 'Need evidence for H1',
        workPerformed: 'Conducted experiment',
        result: 'p = 0.03',
        mainlineImpact: 'Supports candidate mechanism',
        uncertainties: ['small sample size'],
        recordedAt: 3000,
      },
      recentStateChange: {
        beforePhase: 'orienting',
        afterPhase: 'action_planned',
        summary: 'Planned experiment after gap analysis',
        changedAt: 2500,
      },
      humanGate: {
        gateId: 'gate-1',
        kind: 'approval',
        actionId: 'act-1',
        prompt: 'Approve experiment?',
        createdAt: 2100,
      },
      revision: 5,
    };
    const parsed = researchStatusSnapshotSchema.parse(full);
    expect(parsed.currentQuestion?.id).toBe('q1');
    expect(parsed.aitpHealth.contractVersion).toBe('1.0');
  });

  it('rejects an invalid mode enum', () => {
    expect(() =>
      researchStatusSnapshotSchema.parse({ ...validSnapshot, mode: 'unknown' }),
    ).toThrow();
  });

  it('rejects a missing aitpHealth field', () => {
    const { aitpHealth: _drop, ...rest } = validSnapshot;
    void _drop;
    expect(() => researchStatusSnapshotSchema.parse(rest)).toThrow();
  });

  it('rejects a missing phase field', () => {
    const { phase: _drop, ...rest } = validSnapshot;
    void _drop;
    expect(() => researchStatusSnapshotSchema.parse(rest)).toThrow();
  });

  it('accepts a snapshot with all scientific state fields populated', () => {
    const snapshot = {
      ...validSnapshot,
      phase: 'awaiting_human',
      currentAction: {
        actionId: 'act-1',
        kind: 'derivation',
        purpose: 'Derive prediction from theory',
        expectedEvidence: ['analytical result'],
        stopCondition: 'consistent with known bounds',
        allowedToolKinds: ['shell'],
        status: 'in_progress',
        createdAt: 1000,
        requiresHumanApproval: true,
      },
      currentRun: {
        actionId: 'act-1',
        campaign: 'bi2se3-r2',
        jobId: '3128781',
        stage: 'scf',
        schedulerState: 'running',
        lastObservedAt: 1_500,
        nextCheckAt: 2_000,
        artifactRefs: ['scf.log'],
      },
      latestProgress: {
        headline: 'Derived key identity',
        motivation: 'Connect theory to observable',
        workPerformed: 'Symbolic derivation',
        result: 'Closed-form expression obtained',
        mainlineImpact: 'Narrows parameter space',
        uncertainties: ['assumes continuity'],
        nextAction: 'Numerical verification',
        phaseChange: { from: 'action_executing', to: 'evaluating' },
        humanDecision: 'proceed to evaluation',
        detail: {
          derivation: 'step-by-step algebra',
          assumptions: ['smoothness'],
          artifactRefs: ['notebook-1'],
        },
        recordedAt: 2000,
      },
      recentStateChange: {
        beforePhase: 'action_executing',
        afterPhase: 'evaluating',
        actionId: 'act-1',
        summary: 'Action completed, entering evaluation',
        changedAt: 1500,
      },
      humanGate: {
        gateId: 'gate-1',
        kind: 'decision',
        actionId: 'act-1',
        prompt: 'Which branch to pursue?',
        resolvedAt: 2500,
        resolution: 'branch A',
        createdAt: 1200,
      },
    };
    const parsed = researchStatusSnapshotSchema.parse(snapshot);
    expect(parsed.phase).toBe('awaiting_human');
    expect(parsed.currentAction?.actionId).toBe('act-1');
    expect(parsed.currentRun).toMatchObject({ actionId: 'act-1', jobId: '3128781' });
    expect(parsed.latestProgress?.phaseChange?.to).toBe('evaluating');
    expect(parsed.recentStateChange?.actionId).toBe('act-1');
    expect(parsed.humanGate?.resolution).toBe('branch A');
  });

  it('rejects an invalid phase enum value', () => {
    expect(() =>
      researchStatusSnapshotSchema.parse({ ...validSnapshot, phase: 'unknown' }),
    ).toThrow();
  });
});

describe('researchUpdatedEventSchema', () => {
  it('accepts a valid research.updated event', () => {
    const event = { type: 'research.updated', snapshot: validSnapshot };
    const parsed = researchUpdatedEventSchema.parse(event);
    expect(parsed).toEqual(event);
    expect(parsed.type).toBe('research.updated');
    expect(parsed.snapshot.revision).toBe(0);
  });

  it('round-trips through JSON', () => {
    const event = { type: 'research.updated', snapshot: validSnapshot };
    const json = JSON.stringify(event);
    const parsed = researchUpdatedEventSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(event);
  });

  it('preserves the complete Line-workstream binding projection', () => {
    const binding = {
      confirmationId: 'confirmation-main-1',
      lineSlug: 'main-line',
      workstream: 'verified-inputs',
      topicId: 'topic-1',
      observedRevision: 2,
      confirmedBy: 'user' as const,
      confirmedAt: 1_700_000_000_000,
    };
    const event = {
      type: 'research.updated',
      snapshot: {
        ...validSnapshot,
        currentLineSlug: 'main-line',
        currentWorkstreamBinding: {
          lineSlug: 'main-line',
          status: 'bound',
          reason: 'Explicitly confirmed.',
          binding,
        },
        lineWorkstreamBindings: [binding],
      },
    };
    expect(researchUpdatedEventSchema.parse(event)).toEqual(event);
  });

  it('rejects a wrong event type', () => {
    expect(() =>
      researchUpdatedEventSchema.parse({ type: 'goal.updated', snapshot: validSnapshot }),
    ).toThrow();
  });

  it('is part of the agentEventSchema union', () => {
    const parsed = agentEventSchema.parse({
      type: 'research.updated',
      snapshot: validSnapshot,
    });
    expect(parsed.type).toBe('research.updated');
  });
});

describe('aitpModeUpdatedEventSchema', () => {
  it('accepts a valid aitp_mode.updated event', () => {
    const event = { type: 'aitp_mode.updated' };
    const parsed = aitpModeUpdatedEventSchema.parse(event);
    expect(parsed).toEqual(event);
    expect(parsed.type).toBe('aitp_mode.updated');
  });

  it('round-trips through JSON', () => {
    const event = { type: 'aitp_mode.updated' };
    const json = JSON.stringify(event);
    const parsed = aitpModeUpdatedEventSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(event);
  });

  it('is part of the agentEventSchema union', () => {
    const parsed = agentEventSchema.parse({ type: 'aitp_mode.updated' });
    expect(parsed.type).toBe('aitp_mode.updated');
  });
});

describe('researchCommandRequestSchema', () => {
  it('accepts an enter_mode command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: { kind: 'enter_mode', actor: 'user' },
    });
    expect(parsed.command.kind).toBe('enter_mode');
  });

  it('accepts a create_question command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'create_question',
        lineSlug: 'main',
        wording: 'Why?',
        assessment: 'candidate mechanism',
      },
    });
    expect(parsed.command.kind).toBe('create_question');
  });

  it('accepts an update_line command with assessment and optimistic revision', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'update_line',
        lineSlug: 'main',
        expectedRevision: 4,
        title: 'Updated line',
        assessment: 'supported direction',
        status: 'paused',
        reason: 'new evidence',
      },
    });
    expect(parsed.command.kind).toBe('update_line');
  });

  it('accepts a set_focus command with boundedAction and expectedRevision', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'set_focus',
        questionId: 'q1',
        boundedAction: 'run the next experiment',
        expectedRevision: 3,
      },
    });
    expect(parsed.command).toMatchObject({ boundedAction: 'run the next experiment', expectedRevision: 3 });
  });

  it('requires expectedRevision and preserves the checkpoint target', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'propose_checkpoint',
        expectedRevision: 5,
        questionId: 'q1',
        lineSlug: 'main',
        assessment: 'supported mechanism',
        nextAction: 'commit the result',
      },
    });
    expect(parsed.command).toMatchObject({
      expectedRevision: 5,
      questionId: 'q1',
      lineSlug: 'main',
      assessment: 'supported mechanism',
      nextAction: 'commit the result',
    });
    expect(() => researchCommandRequestSchema.parse({
      command: { kind: 'propose_checkpoint' },
    })).toThrow();
  });

  it('accepts a commit_checkpoint command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'commit_checkpoint',
        checkpointId: 'cp1',
        entryId: 'entry-1',
      },
    });
    expect(parsed.command.kind).toBe('commit_checkpoint');
  });

  it('accepts strict evidence-review and bounded run-observation commands', () => {
    const reviewed = researchCommandRequestSchema.parse({
      command: {
        kind: 'review_evidence',
        expectedRevision: 7,
        packet: {
          packet_id: 'packet-1',
          kind: 'result',
          claim: 'The two branches agree within tolerance.',
          evidence: 'The analyzer reports a maximum deviation below 1e-6.',
          action_id: 'act-1',
        },
      },
    });
    expect(reviewed.command).toMatchObject({
      kind: 'review_evidence',
      expectedRevision: 7,
      packet: { packet_id: 'packet-1', confidence: 'medium' },
    });

    const observed = researchCommandRequestSchema.parse({
      command: {
        kind: 'observe_run',
        actionId: 'act-1',
        expectedRevision: 7,
        campaign: 'bi2se3-r2',
        jobId: '3128781',
        stage: 'scf',
        schedulerState: 'running',
        nextCheckAt: 2_000,
      },
    });
    expect(observed.command).toMatchObject({
      kind: 'observe_run',
      actionId: 'act-1',
      jobId: '3128781',
      artifactRefs: [],
    });

    expect(() => researchCommandRequestSchema.parse({
      command: {
        kind: 'review_evidence',
        expectedRevision: 7,
        packet: {
          packet_id: 'packet-1',
          kind: 'result',
          claim: 'claim',
          evidence: 'evidence',
          unexpected: true,
        },
      },
    })).toThrow();
  });

  it('accepts human decision and alert acknowledgement commands', () => {
    const resolved = researchCommandRequestSchema.parse({
      command: {
        kind: 'resolve_decision',
        gateId: 'gate-1',
        resolution: 'Proceed with the bounded experiment.',
        nextPhase: 'action_planned',
      },
    });
    expect(resolved.command).toMatchObject({
      kind: 'resolve_decision',
      gateId: 'gate-1',
      resolution: 'Proceed with the bounded experiment.',
      nextPhase: 'action_planned',
    });

    const acknowledged = researchCommandRequestSchema.parse({
      command: {
        kind: 'acknowledge_alert',
        fingerprint: 'research.alert.blocked.question.q1',
      },
    });
    expect(acknowledged.command).toEqual({
      kind: 'acknowledge_alert',
      fingerprint: 'research.alert.blocked.question.q1',
    });
  });

  it('rejects incomplete human decision and acknowledgement commands', () => {
    expect(() =>
      researchCommandRequestSchema.parse({
        command: { kind: 'resolve_decision', gateId: 'gate-1', resolution: 'Proceed.' },
      }),
    ).toThrow();
    expect(() =>
      researchCommandRequestSchema.parse({
        command: { kind: 'acknowledge_alert' },
      }),
    ).toThrow();
  });

  it('accepts a pause_loop command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: { kind: 'pause_loop', expectedRevision: 3 },
    });
    expect(parsed.command.kind).toBe('pause_loop');
  });

  it('rejects an unknown command kind', () => {
    expect(() =>
      researchCommandRequestSchema.parse({ command: { kind: 'unknown' } }),
    ).toThrow();
  });

  it('rejects a missing command field', () => {
    expect(() => researchCommandRequestSchema.parse({})).toThrow();
  });

  it('rejects a create_question missing required lineSlug', () => {
    expect(() =>
      researchCommandRequestSchema.parse({
        command: { kind: 'create_question', wording: 'Why?' },
      }),
    ).toThrow();
  });

  it('fails closed at Research Action and prepare_plan wire limits', () => {
    const prepare = {
      kind: 'prepare_plan' as const,
      planId: 'plan-1',
      objective: 'Bound the next calculation.',
      steps: ['Run the calculation'],
      expectedEvidence: ['A reproducible result'],
      stopCondition: 'Stop after the result is checked.',
    };
    expect(researchCommandRequestSchema.parse({ command: prepare }).command).toEqual(prepare);
    expect(() => researchCommandRequestSchema.parse({
      command: { ...prepare, objective: '' },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { ...prepare, steps: Array.from({ length: 101 }, () => 'step') },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { ...prepare, expectedEvidence: [''] },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { ...prepare, unexpected: true },
    })).toThrow();

    const action = {
      kind: 'begin_action' as const,
      actionKind: 'experiment' as const,
      purpose: 'Run the bounded experiment.',
      expectedEvidence: ['The measured output'],
      stopCondition: 'Stop at convergence.',
      allowedToolKinds: ['shell'],
    };
    expect(researchCommandRequestSchema.parse({ command: action }).command).toMatchObject(action);
    expect(() => researchCommandRequestSchema.parse({
      command: { ...action, purpose: 'x'.repeat(8001) },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { ...action, expectedEvidence: Array.from({ length: 51 }, () => 'evidence') },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { ...action, allowedToolKinds: Array.from({ length: 51 }, () => 'tool') },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { ...action, unexpected: true },
    })).toThrow();
  });

  it('accepts strict Research Plan v2 lifecycle and planned-action bindings', () => {
    const prepare = {
      kind: 'prepare_plan_v2' as const,
      objective: 'Validate one program milestone.',
      completionCriterion: 'The declared checks pass.',
      milestones: [{
        milestoneId: 'm1',
        title: 'Run and validate',
        objective: 'Execute one bounded calculation.',
        completionCriterion: 'The output passes validation.',
        evidenceRequirements: ['Input, output, and validation log'],
      }],
      evidenceRequirements: ['A reproducible result'],
      decisionPoints: [{
        decisionId: 'd1',
        milestoneId: 'm1',
        prompt: 'Is the result physically usable?',
        condition: 'Ask when validation is ambiguous.',
      }],
      assumptions: ['The fixture is representative.'],
      currentMilestoneId: 'm1',
      stopConditions: ['Stop on validation failure.'],
      replanConditions: ['Replan on Program drift.'],
    };
    expect(researchCommandRequestSchema.parse({ command: prepare }).command).toEqual(prepare);
    expect(() => researchCommandRequestSchema.parse({
      command: { ...prepare, currentMilestoneId: 'missing' },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { ...prepare, unexpected: true },
    })).toThrow();

    for (const kind of ['activate_plan_v2', 'complete_plan_v2', 'discard_plan_v2'] as const) {
      expect(researchCommandRequestSchema.parse({
        command: { kind, planId: 'research-plan-1', expectedRevision: 2 },
      }).command.kind).toBe(kind);
    }
    expect(() => researchCommandRequestSchema.parse({
      command: { kind: 'activate_plan_v2', planId: 'research-plan-1' },
    })).toThrow();

    const plannedAction = {
      kind: 'begin_action' as const,
      actionKind: 'simulation' as const,
      purpose: 'Run the reviewed calculation.',
      expectedEvidence: ['Input, output, and validation log'],
      stopCondition: 'Stop after validation.',
      planningLevel: 'planned' as const,
      researchPlanId: 'research-plan-1',
      researchPlanRevision: 2,
      milestoneId: 'm1',
      actionPlanId: 'action-plan-1',
      actionPlanRevision: 1,
    };
    expect(researchCommandRequestSchema.parse({ command: plannedAction }).command)
      .toMatchObject(plannedAction);
  });

  it('accepts only revisioned collaborative or dreaming planning-policy commands', () => {
    expect(researchCommandRequestSchema.parse({
      command: {
        kind: 'set_planning_policy',
        policy: 'dreaming',
        expectedRevision: 3,
      },
    }).command).toEqual({
      kind: 'set_planning_policy',
      policy: 'dreaming',
      expectedRevision: 3,
    });
    expect(() => researchCommandRequestSchema.parse({
      command: { kind: 'set_planning_policy', policy: 'automatic', expectedRevision: 3 },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: { kind: 'set_planning_policy', policy: 'collaborative' },
    })).toThrow();
  });

  it('accepts only strict user-facing Line-to-workstream binding commands', () => {
    const confirm = {
      kind: 'confirm_line_workstream_binding' as const,
      lineSlug: 'main-line',
      workstream: 'verified-inputs',
      expectedRevision: 3,
    };
    expect(researchCommandRequestSchema.parse({ command: confirm }).command).toEqual(confirm);
    const clear = {
      kind: 'clear_line_workstream_binding' as const,
      lineSlug: 'main-line',
      expectedConfirmationId: 'confirmation-main-1',
      expectedRevision: 4,
    };
    expect(researchCommandRequestSchema.parse({ command: clear }).command).toEqual(clear);

    for (const forged of [
      { ...confirm, actor: 'model' },
      { ...confirm, confirmedBy: 'main_agent' },
      { ...confirm, topicId: 'topic-forged' },
      { ...confirm, observedRevision: 99 },
      { ...confirm, confirmedAt: 1 },
    ]) {
      expect(() => researchCommandRequestSchema.parse({ command: forged })).toThrow();
    }
    expect(() => researchCommandRequestSchema.parse({
      command: { ...confirm, workstream: 'Invalid Workstream' },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: {
        ...clear,
        topicId: 'topic-forged',
      },
    })).toThrow();
    expect(() => researchCommandRequestSchema.parse({
      command: {
        kind: 'clear_line_workstream_binding',
        lineSlug: 'main-line',
        expectedRevision: 4,
      },
    })).toThrow();
  });
});
