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

  it('accepts a full snapshot with questions and lines', () => {
    const full = {
      mode: 'ready',
      loopStatus: 'active',
      currentLineSlug: 'main-line',
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

  it('preserves both questionId and lineSlug on a related checkpoint command', () => {
    const parsed = researchCommandRequestSchema.parse({
      command: {
        kind: 'propose_checkpoint',
        questionId: 'q1',
        lineSlug: 'main',
        assessment: 'supported mechanism',
        nextAction: 'commit the result',
      },
    });
    expect(parsed.command).toMatchObject({
      questionId: 'q1',
      lineSlug: 'main',
      assessment: 'supported mechanism',
      nextAction: 'commit the result',
    });
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
});
