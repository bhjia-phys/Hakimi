import { describe, expect, it } from 'vitest';

import { decideEscalationPolicy, type ResearchObligation } from '../../src';

describe('research escalation policy', () => {
  it('keeps simple conceptual physics questions scoped but lightweight', () => {
    const decision = decideEscalationPolicy({
      domain: 'topological-order/fqhe-cs',
      prompt:
        'In FQHE, why does a smaller fractional charge seem to correspond to a larger flux period?',
      contextTags: ['fqhe'],
    });

    expect(decision.tier).toBe('tier1_scoped');
    expect(decision.requirements).toMatchObject({
      workFrame: 'recommended',
      actionTrace: 'recommended',
      ledgerCapture: 'none',
    });
    expect(decision.lensCandidates.map((candidate) => candidate.lens.id)).toContain(
      'charge_flux_quantization',
    );
    expect(decision.recommendedActionIds).toContain('validate.check_convention');
    expect(decision.recommendedActionBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'validate.check_convention',
          checkId: 'check.charge-flux-quantization.convention',
        }),
      ]),
    );
  });

  it('escalates LibRPA head-wing edits into verified workflow requirements', () => {
    const decision = decideEscalationPolicy({
      domain: 'librpa/head-wing',
      prompt: 'Update LibRPA head-wing code and run a benchmark for the formula-code mapping.',
      willEditFiles: true,
      willRunBenchmark: true,
      activeObjectKinds: ['formula', 'code_region'],
      activeRelationKinds: ['formula_code_mapping'],
      contextTags: ['librpa', 'head_wing', 'code_change'],
    });

    expect(decision.tier).toBe('tier2_verified');
    expect(decision.requirements).toMatchObject({
      workFrame: 'required',
      actionTrace: 'required',
      finalGate: 'required',
    });
    expect(decision.recommendedActionIds).toEqual([
      'benchmark.run_minimal_case',
      'code.capture_git_diff_observation',
      'code.inspect_call_sites',
      'code.map_formula_to_code_region',
    ]);
    expect(decision.recommendedActionBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'benchmark.run_minimal_case',
          adapterId: 'adapter.librpa.head-wing-smoke',
        }),
      ]),
    );
  });

  it('promotes validated memory requests into the promotion tier', () => {
    const decision = decideEscalationPolicy({
      prompt: 'Promote this derivation block as validated memory.',
      requestedStatus: 'validated',
      willPromoteMemory: true,
      obligations: [blockingObligation()],
    });

    expect(decision.tier).toBe('tier3_promotion');
    expect(decision.requirements).toMatchObject({
      ledgerCapture: 'required',
      finalGate: 'required',
    });
    expect(decision.recommendedActionIds).toContain('memory.propose_capsule');
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
