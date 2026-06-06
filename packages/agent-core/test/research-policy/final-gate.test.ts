import { describe, expect, it } from 'vitest';

import {
  evaluateFinalGate,
  renderFinalGateContinuation,
  type ResearchObligation,
  type WorkFrame,
} from '../../src';

describe('research final gate', () => {
  it('downgrades validated final status when blocking obligations remain open', () => {
    const decision = evaluateFinalGate({
      requestedStatus: 'validated',
      obligations: [blockingObligation()],
      evidenceRefs: ['ledger:event.fqhe.check'],
    });

    expect(decision).toEqual({
      outcome: 'downgrade',
      allowedStatus: 'provisional',
      reasons: ['Open blocking obligations prevent validated final claims.'],
      openBlockingObligationIds: ['obl.flux-convention'],
      openAitpCallObligationIds: [],
      aitpLifecycleTriggerLines: [],
      requiredActionIds: ['validate.check_convention'],
    });
  });

  it('blocks when the caller explicitly requires validated status but the gate fails', () => {
    const decision = evaluateFinalGate({
      requestedStatus: 'validated',
      mustBeValidated: true,
      obligations: [blockingObligation()],
      evidenceRefs: ['ledger:event.fqhe.check'],
    });

    expect(decision.outcome).toBe('block');
    expect(decision.allowedStatus).toBe('provisional');
  });

  it('allows validated status when blocking obligations are closed and evidence exists', () => {
    const decision = evaluateFinalGate({
      requestedStatus: 'validated',
      obligations: [{ ...blockingObligation(), status: 'passed' }],
      workFrame: workFrame('checking'),
      sourceRefs: ['paper:laughlin-1983'],
    });

    expect(decision).toEqual({
      outcome: 'allow',
      allowedStatus: 'validated',
      reasons: [],
      openBlockingObligationIds: [],
      openAitpCallObligationIds: [],
      aitpLifecycleTriggerLines: [],
      requiredActionIds: [],
    });
  });

  it('downgrades validated status when evidence refs are missing', () => {
    const decision = evaluateFinalGate({
      requestedStatus: 'validated',
      obligations: [],
      workFrame: workFrame('checking'),
    });

    expect(decision.outcome).toBe('downgrade');
    expect(decision.allowedStatus).toBe('checked');
    expect(decision.requiredActionIds).toEqual(['validate.check_source_support']);
  });

  it('downgrades when AITP required-now call obligations are still open', () => {
    const decision = evaluateFinalGate({
      requestedStatus: 'checked',
      obligations: [],
      workFrame: workFrame('checking'),
      aitpCallObligations: [
        {
          id: 'aitp.policy.1.aitp-record-validation-result',
          actionId: 'aitp.record_validation_result',
          reason: 'open proof obligation requires typed evidence or validation',
          requiredNow: true,
          trustBoundary: true,
          satisfied: false,
          blockerRecorded: false,
        },
      ],
    });

    expect(decision).toMatchObject({
      outcome: 'downgrade',
      allowedStatus: 'exploratory',
      reasons: expect.arrayContaining(['AITP required-now call obligations are still open.']),
      openAitpCallObligationIds: ['aitp.policy.1.aitp-record-validation-result'],
      requiredActionIds: ['aitp.record_validation_result'],
    });
  });

  it('allows AITP call obligations that were satisfied or explicitly blocked', () => {
    const decision = evaluateFinalGate({
      requestedStatus: 'checked',
      obligations: [],
      workFrame: workFrame('checking'),
      aitpCallObligations: [
        {
          id: 'aitp.policy.1.aitp-record-validation-result',
          actionId: 'aitp.record_validation_result',
          reason: 'validation was recorded',
          requiredNow: true,
          trustBoundary: true,
          satisfied: true,
          blockerRecorded: false,
        },
        {
          id: 'aitp.policy.2.trace-open-backtrace',
          actionId: 'trace.open_backtrace',
          reason: 'source was unavailable',
          requiredNow: true,
          trustBoundary: true,
          satisfied: false,
          blockerRecorded: true,
        },
      ],
    });

    expect(decision.outcome).toBe('allow');
    expect(decision.openAitpCallObligationIds).toEqual([]);
  });

  it('renders lifecycle trigger context for open AITP call obligations', () => {
    const decision = evaluateFinalGate({
      requestedStatus: 'checked',
      obligations: [],
      workFrame: workFrame('checking'),
      aitpCallObligations: [
        {
          id: 'aitp.policy.1.aitp-record-evidence',
          actionId: 'aitp.record_evidence',
          reason: 'pre-final evidence should be typed before answering',
          requiredNow: true,
          trustBoundary: true,
          lifecycleTrigger: {
            lifecyclePhases: ['pre_final'],
            triggerConditions: ['claim will be summarized as checked'],
            recordingThreshold: 'before final answer cites the claim as supported',
            trustBoundaryInputs: {
              targetRefs: ['claim:claim-fqhe'],
              claimId: 'claim-fqhe',
              entrypoints: ['aitp_v5_record_evidence', 'aitp_v5_preflight_trust_update'],
              requiredBeforeTrustChange: ['record typed evidence before final answer'],
              requiresPreflight: true,
              finalGateRequired: true,
            },
            recommendedHostBehavior: [
              'surface as blocking ResearchAction before final response',
            ],
          },
          satisfied: false,
          blockerRecorded: false,
        },
      ],
    });

    expect(decision.aitpLifecycleTriggerLines).toEqual([
      'aitp.record_evidence@phase=pre_final when=claim will be summarized as checked threshold=before final answer cites the claim as supported trust_inputs=targets=claim:claim-fqhe|claim=claim-fqhe|entrypoints=aitp_v5_record_evidence,aitp_v5_preflight_trust_update|requires_preflight=true|final_gate_required=true host=surface as blocking ResearchAction before final response',
    ]);
    expect(renderFinalGateContinuation(decision)).toContain(
      'AITP lifecycle triggers: aitp.record_evidence@phase=pre_final',
    );
  });
});

function blockingObligation(): ResearchObligation {
  return {
    id: 'obl.flux-convention',
    kind: 'convention_check',
    domain: 'topological-order',
    topic: 'fqhe-cs-effective-theory',
    targetObjectId: 'formula.fqhe.flux-quantization',
    severity: 'blocking',
    reason: 'Flux convention must be checked.',
    requiredActionId: 'validate.check_convention',
    status: 'open',
  };
}

function workFrame(trustState: WorkFrame['trustState']): WorkFrame {
  return {
    id: 'frame.fqhe',
    domain: 'topological-order',
    topic: 'fqhe-cs-effective-theory',
    goal: 'Check charge-flux convention.',
    activeObjectIds: [],
    assumptionIds: [],
    conventionIds: [],
    sourceRefs: [],
    openObligationIds: [],
    trustState,
  };
}
