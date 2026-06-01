import { describe, expect, it } from 'vitest';

import { evaluateFinalGate, type ResearchObligation, type WorkFrame } from '../../src';

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
