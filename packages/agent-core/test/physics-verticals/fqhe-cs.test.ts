import { describe, expect, it } from 'vitest';

import {
  checkFqheChargeFluxConvention,
  compileFqheCsVerticalSlice,
  runResearchEvalCase,
  type ResearchActionRecord,
} from '../../src';

describe('FQHE/CS theory vertical slice', () => {
  it('compiles core FQHE/CS research blocks into candidate capsules', () => {
    const result = compileFqheCsVerticalSlice();

    expect(result.capsules.map((capsule) => capsule.metadata.id)).toEqual([
      'capsule.candidate.fqhe.laughlin.wavefunction',
      'capsule.candidate.fqhe.flux-insertion.charge-pump',
      'capsule.candidate.fqhe.cs.effective-action',
      'capsule.candidate.fqhe.kmatrix.response',
    ]);
    expect(result.capsules.map((capsule) => capsule.metadata.kind)).toEqual([
      'Definition',
      'DerivationStep',
      'Formula',
      'Formula',
    ]);
    expect(result.capsules[1]?.metadata.requiredChecks.map((check) => check.kind)).toEqual([
      'dimension',
      'symbol_closure',
      'convention',
      'assumption_scope',
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'open-questions-preserved',
    );
  });

  it('runs the charge-flux lens, convention check, eval case, and final gate as a loop', () => {
    const result = compileFqheCsVerticalSlice();
    const evalResult = runResearchEvalCase({
      evalCase: result.evalCase,
      actionRecords: [
        actionRecord('physics.apply_direction_lens', 'pass'),
        actionRecord('validate.check_convention', 'pass'),
      ],
      checkResults: [result.conventionCheck.checkResult],
    });

    expect(result.lensCandidates.map((candidate) => candidate.lens.id)).toContain(
      'charge_flux_quantization',
    );
    expect(result.conventionCheck.outcome).toBe('pass');
    expect(result.finalGate).toMatchObject({
      outcome: 'allow',
      allowedStatus: 'validated',
    });
    expect(evalResult.outcome).toBe('pass');
  });

  it('turns Berry-flux conflation into a blocking convention obligation', () => {
    const check = checkFqheChargeFluxConvention({
      chargeIdentity: 'laughlin_quasiparticle_charge',
      fluxIdentity: 'berry_curvature_flux',
      phaseInvariant: 'q_phi_over_hbar',
      fillingDenominator: 3,
    });
    const result = compileFqheCsVerticalSlice({
      chargeIdentity: 'laughlin_quasiparticle_charge',
      fluxIdentity: 'berry_curvature_flux',
      phaseInvariant: 'q_phi_over_hbar',
      fillingDenominator: 3,
    });

    expect(check.outcome).toBe('fail');
    expect(check.obligation).toMatchObject({
      kind: 'convention_check',
      severity: 'blocking',
      requiredActionId: 'validate.check_convention',
      status: 'open',
    });
    expect(result.finalGate).toMatchObject({
      outcome: 'downgrade',
      allowedStatus: 'provisional',
      openBlockingObligationIds: ['obl.fqhe.charge-flux-convention'],
    });
  });
});

function actionRecord(
  actionId: string,
  outcome: ResearchActionRecord['outcome'],
): ResearchActionRecord {
  return {
    actionId,
    callId: `call.${actionId}`,
    source: 'model',
    input: {},
    output: {},
    graphRefs: [],
    capsuleRefs: ['capsule.candidate.fqhe.flux-insertion.charge-pump'],
    ledgerEventIds: ['event.fqhe.charge-flux'],
    evidenceRefs: ['vertical:fqhe-cs.charge-flux-convention'],
    outcome,
    nextSuggestedActions: [],
  };
}
