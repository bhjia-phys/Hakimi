import { describe, expect, it } from 'vitest';
import {
  RESEARCH_DECISION_NEXT_PHASES,
  researchCheckpointDraftTargetKey,
  researchEvidenceDraftTargetKey,
  researchManagerAckMatchesDraft,
  researchManagerCheckpointDraftIsStale,
  researchManagerDraftTarget,
  researchManagerDraftTargetMatches,
  researchManagerHistoricalCheckpointCanBeDiscarded,
  researchManagerLineDraftIsStale,
  researchManagerMutationAllowed,
  researchManagerQuestionDraftIsStale,
  researchManagerScienceDraftIsStale,
  researchManagerSessionIsCurrent,
  researchRunTerminalStateIsConsistent,
  type ResearchManagerDraftContext,
} from '../src/lib/researchManagerCommand';
import {
  isResearchIdleOnlyBusy,
  researchLineWorkstreamBindingCommand,
} from '../src/lib/researchCommand';
import type { ResearchStatusSnapshot } from '../src/api/types';

const evidenceTargetKey = researchEvidenceDraftTargetKey({
  questionId: 'q_1',
  lineSlug: 'line-a',
  actionId: 'action_1',
});
const context: ResearchManagerDraftContext = {
  lineEditorMode: 'edit',
  lineSlug: '',
  selectedLineSlug: 'line-a',
  questionEditorMode: 'edit',
  selectedQuestionId: 'q_1',
  decisionGateId: 'gate_1',
  evidenceTargetKey,
  runActionId: 'action_1',
  checkpointEntryId: 'entry-1',
};

function bindingSnapshot(
  overrides: Partial<ResearchStatusSnapshot> = {},
): ResearchStatusSnapshot {
  return {
    mode: 'ready',
    loopStatus: 'active',
    currentLineSlug: 'line-a',
    lineWorkstreamBindings: [],
    questions: [],
    lines: [{
      slug: 'line-a',
      title: 'Line A',
      status: 'active',
      createdAt: 1,
      revision: 1,
    }],
    openQuestionCount: 0,
    activeQuestionCount: 0,
    blockedQuestionCount: 0,
    alerts: [],
    aitpHealth: { phase: 'ready' },
    program: {
      topicId: 'topic-a',
      title: 'Topic A',
      goalText: 'Establish the result',
      goalSource: 'TOPIC.md',
      establishedAt: 1,
      observedRevision: 4,
    },
    phase: 'idle',
    planningPolicy: 'collaborative',
    revision: 7,
    ...overrides,
  };
}

describe('Research Manager command acknowledgements', () => {
  it('offers historical checkpoint discard for every server-supported stale context only', () => {
    const captured = {
      confirmationId: 'confirmation-old',
      lineSlug: 'line-a',
      workstream: 'workstream-a',
      topicId: 'topic-a',
      observedRevision: 4,
      confirmedBy: 'user' as const,
      confirmedAt: 2,
    };
    const checkpoint = {
      checkpointId: 'checkpoint-old',
      questionId: 'q-1',
      questionRevision: 1,
      lineSlug: 'line-a',
      workstreamBinding: captured,
      idempotencyKey: 'checkpoint-key',
      persistence: 'pending_commit' as const,
      createdAt: 3,
    };
    const question = {
      id: 'q-1',
      lineSlug: 'line-a',
      wording: 'Which result survives?',
      state: 'active' as const,
      epistemicStatus: 'candidate' as const,
      persistence: 'pending_commit' as const,
      priority: 0,
      neededEvidence: [],
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 2,
      revision: 2,
    };
    const base = bindingSnapshot({
      questions: [question],
      pendingCheckpoint: checkpoint,
      lineWorkstreamBindings: [captured],
    });
    expect(researchManagerHistoricalCheckpointCanBeDiscarded(base)).toBe(true);

    const currentQuestion = { ...question, revision: 1 };
    const changedBinding = { ...captured, confirmationId: 'confirmation-new', confirmedAt: 4 };
    expect(researchManagerHistoricalCheckpointCanBeDiscarded({
      ...base,
      questions: [currentQuestion],
      lineWorkstreamBindings: [changedBinding],
    })).toBe(true);
    expect(researchManagerHistoricalCheckpointCanBeDiscarded({
      ...base,
      questions: [currentQuestion],
      program: { ...base.program!, observedRevision: 5 },
    })).toBe(true);
    expect(researchManagerHistoricalCheckpointCanBeDiscarded({
      ...base,
      questions: [currentQuestion],
    })).toBe(false);
    expect(researchManagerHistoricalCheckpointCanBeDiscarded({
      ...base,
      latestCommittedCheckpoint: {
        checkpointId: checkpoint.checkpointId,
        entryId: 'entry-old',
        committedAt: 5,
      },
    })).toBe(false);
  });

  it('maps draft-saving commands to their precise form and target', () => {
    expect(researchManagerDraftTarget({
      kind: 'update_line',
      lineSlug: 'line-a',
      expectedRevision: 1,
    })).toEqual({ form: 'line', mode: 'edit', key: 'line-a' });
    expect(researchManagerDraftTarget({
      kind: 'create_question',
      lineSlug: 'line-a',
      wording: 'Question',
    })).toEqual({ form: 'question', mode: 'create', key: 'line-a' });
    expect(researchManagerDraftTarget({
      kind: 'resolve_decision',
      gateId: 'gate_1',
      resolution: 'continue',
      nextPhase: 'idle',
    })).toEqual({ form: 'decision', mode: 'resolve', key: 'gate_1' });
    expect(researchManagerDraftTarget({
      kind: 'review_evidence',
      expectedRevision: 1,
      packet: {
        packet_id: 'packet_1',
        kind: 'observation',
        claim: 'claim',
        evidence: 'evidence',
        question_id: 'q_1',
        line_slug: 'line-a',
        action_id: 'action_1',
        assumptions: [],
        tests: [],
        artifact_refs: [],
        source_refs: [],
        limitations: [],
        confidence: 'medium',
      },
    })).toEqual({ form: 'evidence', mode: 'review', key: evidenceTargetKey });
    expect(researchManagerDraftTarget({
      kind: 'observe_run',
      actionId: 'action_1',
      expectedRevision: 1,
      campaign: 'campaign_1',
      jobId: 'job_1',
      stage: 'running',
      schedulerState: 'running',
      artifactRefs: [],
    })).toEqual({ form: 'run', mode: 'observe', key: 'action_1' });
    expect(researchManagerDraftTarget({
      kind: 'propose_checkpoint',
      expectedRevision: 1,
      questionId: 'q_1',
    })).toEqual({ form: 'checkpoint', mode: 'propose', key: 'question:q_1' });
    expect(researchManagerDraftTarget({
      kind: 'commit_checkpoint',
      checkpointId: 'checkpoint-1',
      entryId: 'entry-1',
    })).toEqual({ form: 'checkpoint', mode: 'commit', key: 'entry-1' });
  });

  it.each([
    { kind: 'pause_loop', expectedRevision: 1 } as const,
    { kind: 'resume_loop', expectedRevision: 1 } as const,
    { kind: 'set_focus', questionId: 'q_1', expectedRevision: 1 } as const,
    { kind: 'defer_question', questionId: 'q_1', expectedRevision: 1 } as const,
    { kind: 'switch_line', lineSlug: 'line-a', expectedRevision: 1 } as const,
    { kind: 'acknowledge_alert', fingerprint: 'alert_1' } as const,
    { kind: 'activate_plan_v2', planId: 'plan_1', expectedRevision: 2 } as const,
    { kind: 'complete_plan_v2', planId: 'plan_1', expectedRevision: 2 } as const,
    { kind: 'discard_plan_v2', planId: 'plan_1', expectedRevision: 2 } as const,
    { kind: 'set_planning_policy', policy: 'dreaming', expectedRevision: 3 } as const,
    { kind: 'confirm_line_workstream_binding', lineSlug: 'line-a', workstream: 'aitp-a', expectedRevision: 3 } as const,
    {
      kind: 'clear_line_workstream_binding',
      lineSlug: 'line-a',
      expectedConfirmationId: 'confirmation-a-1',
      expectedRevision: 3,
    } as const,
  ])('does not associate $kind with any dirty form', (command) => {
    expect(researchManagerDraftTarget(command)).toBeNull();
  });

  it('maps explicit workstream confirmation and clearing without client-owned provenance', () => {
    const snapshot = bindingSnapshot();
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'line-a',
      workstream: '  aitp-a  ',
    }, snapshot)).toEqual({
      kind: 'confirm_line_workstream_binding',
      lineSlug: 'line-a',
      workstream: 'aitp-a',
      expectedRevision: 7,
    });

    const binding = {
      confirmationId: 'confirmation-a-1',
      lineSlug: 'line-a',
      workstream: 'aitp-a',
      topicId: 'topic-a',
      observedRevision: 4,
      confirmedBy: 'user' as const,
      confirmedAt: 2,
    };
    expect(researchLineWorkstreamBindingCommand({
      kind: 'clear',
      lineSlug: 'line-a',
    }, bindingSnapshot({ lineWorkstreamBindings: [binding] }))).toEqual({
      kind: 'clear_line_workstream_binding',
      lineSlug: 'line-a',
      expectedConfirmationId: 'confirmation-a-1',
      expectedRevision: 7,
    });
  });

  it('clears a current conflict binding exposed only by the alignment recovery surface', () => {
    const malformed = {
      confirmationId: 'confirmation-legacy-1',
      lineSlug: 'line-b',
      workstream: 'legacy-workstream',
      topicId: 'topic-a',
      observedRevision: 4,
      confirmedBy: 'user' as const,
      confirmedAt: 2,
    };
    const snapshot = bindingSnapshot({
      lineWorkstreamBindings: [],
      currentWorkstreamBinding: {
        lineSlug: 'line-a',
        status: 'conflict',
        reason: 'Persisted map key and embedded Line disagree.',
        binding: malformed,
      },
    });

    expect(researchLineWorkstreamBindingCommand({
      kind: 'clear',
      lineSlug: 'line-a',
    }, snapshot)).toEqual({
      kind: 'clear_line_workstream_binding',
      lineSlug: 'line-a',
      expectedConfirmationId: malformed.confirmationId,
      expectedRevision: 7,
    });
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'line-a',
      workstream: 'replacement',
    }, snapshot)).toBeNull();
  });

  it('never infers a binding from matching slugs and requires clear before replacement', () => {
    const matchingSlugs = bindingSnapshot({
      currentLineSlug: 'same-slug',
      lines: [{
        slug: 'same-slug',
        title: 'Same slug',
        status: 'active',
        createdAt: 1,
        revision: 1,
      }],
    });
    expect(researchLineWorkstreamBindingCommand({
      kind: 'clear',
      lineSlug: 'same-slug',
    }, matchingSlugs)).toBeNull();
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'same-slug',
      workstream: 'same-slug',
    }, matchingSlugs)).toEqual({
      kind: 'confirm_line_workstream_binding',
      lineSlug: 'same-slug',
      workstream: 'same-slug',
      expectedRevision: 7,
    });

    const existing = {
      confirmationId: 'confirmation-old-1',
      lineSlug: 'same-slug',
      workstream: 'old-workstream',
      topicId: 'topic-a',
      observedRevision: 4,
      confirmedBy: 'user' as const,
      confirmedAt: 2,
    };
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'same-slug',
      workstream: 'replacement',
    }, { ...matchingSlugs, lineWorkstreamBindings: [existing] })).toBeNull();
  });

  it('rejects invalid workstream commands before transport', () => {
    const snapshot = bindingSnapshot();
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'line-a',
      workstream: 'INVALID_WORKSTREAM',
    }, snapshot)).toBeNull();
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'line-a',
      workstream: 'valid-workstream',
    }, { ...snapshot, program: undefined })).toBeNull();
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'line-a',
      workstream: 'valid-workstream',
    }, { ...snapshot, aitpHealth: { phase: 'degraded' } })).toBeNull();
    expect(researchLineWorkstreamBindingCommand({
      kind: 'confirm',
      lineSlug: 'missing-line',
      workstream: 'valid-workstream',
    }, snapshot)).toBeNull();
  });

  it('matches acknowledgements only to the currently edited target', () => {
    const lineTarget = researchManagerDraftTarget({
      kind: 'update_line',
      lineSlug: 'line-a',
      expectedRevision: 1,
    });
    const questionTarget = researchManagerDraftTarget({
      kind: 'update_question',
      questionId: 'q_1',
      expectedRevision: 1,
    });

    expect(lineTarget && researchManagerDraftTargetMatches(lineTarget, context)).toBe(true);
    expect(questionTarget && researchManagerDraftTargetMatches(questionTarget, context)).toBe(true);
    expect(lineTarget && researchManagerDraftTargetMatches(lineTarget, {
      ...context,
      selectedLineSlug: 'line-b',
    })).toBe(false);
    expect(questionTarget && researchManagerDraftTargetMatches(questionTarget, {
      ...context,
      selectedQuestionId: 'q_2',
    })).toBe(false);
  });

  it('matches science acknowledgements against their captured base target', () => {
    const decisionTarget = { form: 'decision', mode: 'resolve', key: 'gate_1' } as const;
    const evidenceTarget = { form: 'evidence', mode: 'review', key: evidenceTargetKey } as const;
    const runTarget = { form: 'run', mode: 'observe', key: 'action_1' } as const;

    expect(researchManagerDraftTargetMatches(decisionTarget, context)).toBe(true);
    expect(researchManagerDraftTargetMatches(evidenceTarget, context)).toBe(true);
    expect(researchManagerDraftTargetMatches(runTarget, context)).toBe(true);
    expect(researchManagerDraftTargetMatches(decisionTarget, {
      ...context,
      decisionGateId: 'gate_2',
    })).toBe(false);
    expect(researchManagerDraftTargetMatches(evidenceTarget, {
      ...context,
      evidenceTargetKey: researchEvidenceDraftTargetKey({ lineSlug: 'line-b' }),
    })).toBe(false);
    expect(researchManagerDraftTargetMatches(runTarget, {
      ...context,
      runActionId: 'action_2',
    })).toBe(false);
  });

  it('only offers valid post-decision science phases', () => {
    expect(RESEARCH_DECISION_NEXT_PHASES).toEqual([
      'idle',
      'gap_analysis',
      'action_planned',
      'action_executing',
      'evaluating',
    ]);
  });

  it('marks dirty science drafts stale when their revision or target changes', () => {
    expect(researchManagerScienceDraftIsStale(false, 4, 5, 'target-a', 'target-b')).toBe(false);
    expect(researchManagerScienceDraftIsStale(true, 4, 4, 'target-a', 'target-a')).toBe(false);
    expect(researchManagerScienceDraftIsStale(true, 4, 5, 'target-a', 'target-a')).toBe(true);
    expect(researchManagerScienceDraftIsStale(true, 4, 4, 'target-a', 'target-b')).toBe(true);
    expect(researchManagerScienceDraftIsStale(true, null, 4, 'target-a', 'target-a')).toBe(true);
  });

  it('marks only dirty edit line drafts stale when the line revision changes', () => {
    expect(researchManagerLineDraftIsStale(false, true, 4, 5)).toBe(false);
    expect(researchManagerLineDraftIsStale(true, false, null, 5)).toBe(false);
    expect(researchManagerLineDraftIsStale(true, true, 4, 4)).toBe(false);
    expect(researchManagerLineDraftIsStale(true, true, 4, 5)).toBe(true);
    expect(researchManagerLineDraftIsStale(true, true, null, 4)).toBe(true);
  });

  it('marks dirty question drafts stale from either snapshot or question revision', () => {
    expect(researchManagerQuestionDraftIsStale(false, true, 10, 11, 4, 5)).toBe(false);
    expect(researchManagerQuestionDraftIsStale(true, false, 10, 11, 4, 5)).toBe(false);
    expect(researchManagerQuestionDraftIsStale(true, true, 10, 10, 4, 4)).toBe(false);
    expect(researchManagerQuestionDraftIsStale(true, true, 10, 11, 4, 4)).toBe(true);
    expect(researchManagerQuestionDraftIsStale(true, true, 10, 10, 4, 5)).toBe(true);
  });

  it('binds checkpoint drafts to revision, target, and pending checkpoint identity', () => {
    const questionTarget = researchCheckpointDraftTargetKey({ questionId: 'q_1' });
    const lineTarget = researchCheckpointDraftTargetKey({ lineSlug: 'line-a' });

    expect(researchManagerCheckpointDraftIsStale(
      false, 4, 5, questionTarget, lineTarget, 'checkpoint-1', 'checkpoint-2',
    )).toBe(false);
    expect(researchManagerCheckpointDraftIsStale(
      true, 4, 4, questionTarget, questionTarget, 'checkpoint-1', 'checkpoint-1',
    )).toBe(false);
    expect(researchManagerCheckpointDraftIsStale(
      true, 4, 5, questionTarget, questionTarget, 'checkpoint-1', 'checkpoint-1',
    )).toBe(true);
    expect(researchManagerCheckpointDraftIsStale(
      true, 4, 4, questionTarget, lineTarget, 'checkpoint-1', 'checkpoint-1',
    )).toBe(true);
    expect(researchManagerCheckpointDraftIsStale(
      true, 4, 4, questionTarget, questionTarget, 'checkpoint-1', 'checkpoint-2',
    )).toBe(true);
  });

  it('requires terminal state to exactly match terminal scheduler states', () => {
    expect(researchRunTerminalStateIsConsistent('completed', '')).toBe(false);
    expect(researchRunTerminalStateIsConsistent('completed', 'completed')).toBe(true);
    expect(researchRunTerminalStateIsConsistent('completed', 'failed')).toBe(false);
    expect(researchRunTerminalStateIsConsistent('running', 'completed')).toBe(false);
    expect(researchRunTerminalStateIsConsistent('running', '')).toBe(true);
  });

  it('rejects every Manager mutation during a main turn or compaction', () => {
    expect(researchManagerMutationAllowed(isResearchIdleOnlyBusy(false, false))).toBe(true);
    expect(researchManagerMutationAllowed(isResearchIdleOnlyBusy(true, false))).toBe(false);
    expect(researchManagerMutationAllowed(isResearchIdleOnlyBusy(false, true))).toBe(false);
  });

  it('binds manager work to the captured and currently active session', () => {
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-a', 'sess-a')).toBe(true);
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-b', 'sess-b')).toBe(false);
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-a', 'sess-b')).toBe(false);
    expect(researchManagerSessionIsCurrent(null, null, 'sess-a')).toBe(false);
    expect(researchManagerSessionIsCurrent('sess-a', 'sess-a', undefined)).toBe(false);
  });

  it('rejects a late acknowledgement after the matching draft changes again', () => {
    const target = researchManagerDraftTarget({
      kind: 'update_question',
      questionId: 'q_1',
      expectedRevision: 1,
    });
    expect(target).not.toBeNull();
    if (target === null) return;
    const draft = { target, version: 4 };

    expect(researchManagerAckMatchesDraft(draft, 4, context)).toBe(true);
    expect(researchManagerAckMatchesDraft(draft, 5, context)).toBe(false);
  });
});
