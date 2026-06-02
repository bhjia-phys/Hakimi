import { describe, expect, it } from 'vitest';

import {
  harnessCandidateFromActionRecord,
  promoteHarnessCandidateToEvalCase,
  runResearchEvalCase,
  type ResearchActionRecord,
  type ResearchEvalCase,
} from '../../src';

describe('research harness eval runner', () => {
  it('promotes failed action candidates into deterministic eval cases', () => {
    const candidate = harnessCandidateFromActionRecord(actionRecord('fail'))!;

    const evalCase = promoteHarnessCandidateToEvalCase({
      candidate,
      task: 'Reproduce the LibRPA head-wing formula-code mapping failure.',
      actionSequence: ['code.map_formula_to_code', 'benchmark.run_minimal_case'],
      additionalValidations: [
        {
          type: 'required_check',
          check: {
            id: 'check.librpa-head-wing.code-mapping',
            kind: 'code_mapping',
            severity: 'blocking',
          },
        },
      ],
    });

    expect(evalCase).toMatchObject({
      id: 'harness.eval.code.map_formula_to_code.call-1',
      title: 'Harness eval from code.map_formula_to_code',
      task: 'Reproduce the LibRPA head-wing formula-code mapping failure.',
      capsuleRefs: ['formula.librpa.head-wing'],
      actionSequence: ['code.map_formula_to_code', 'benchmark.run_minimal_case'],
    });
    expect(evalCase.validations.map((validation) => validation.type)).toEqual([
      'action_outcome',
      'evidence_ref',
      'required_check',
    ]);
  });

  it('passes when action sequence, outcome, evidence, and required checks match', () => {
    const evalCase = promoteHarnessCandidateToEvalCase({
      candidate: harnessCandidateFromActionRecord(actionRecord('fail'))!,
      task: 'Reproduce the LibRPA head-wing formula-code mapping failure.',
      actionSequence: ['code.map_formula_to_code', 'benchmark.run_minimal_case'],
      additionalValidations: [
        {
          type: 'required_check',
          check: {
            id: 'check.librpa-head-wing.code-mapping',
            kind: 'code_mapping',
            severity: 'blocking',
          },
        },
      ],
    });

    const result = runResearchEvalCase({
      evalCase,
      actionRecords: [actionRecord('fail'), benchmarkRecord()],
      checkResults: [
        {
          checkId: 'check.librpa-head-wing.code-mapping',
          kind: 'code_mapping',
          status: 'passed',
          evidenceRefs: ['ledger:event.librpa.mapping-failure'],
        },
      ],
    });

    expect(result.outcome).toBe('pass');
    expect(result.diagnostics).toEqual([]);
  });

  it('fails when an expected action is missing', () => {
    const result = runResearchEvalCase({
      evalCase: fqheChargeFluxEvalCase(),
      actionRecords: [
        {
          ...actionRecord('pass'),
          actionId: 'physics.apply_direction_lens',
          evidenceRefs: ['ledger:event.fqhe.charge-flux-lens'],
        },
      ],
      checkResults: [
        {
          checkId: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          status: 'passed',
          evidenceRefs: ['ledger:event.fqhe.flux-convention'],
        },
      ],
    });

    expect(result.outcome).toBe('fail');
    expect(result.sequence.reason).toBe(
      'Missing expected action validate.check_convention in order.',
    );
  });

  it('can run a FQHE charge-flux convention eval case', () => {
    const result = runResearchEvalCase({
      evalCase: fqheChargeFluxEvalCase(),
      actionRecords: [
        {
          ...actionRecord('pass'),
          actionId: 'physics.apply_direction_lens',
          evidenceRefs: ['ledger:event.fqhe.charge-flux-lens'],
        },
        {
          ...actionRecord('pass'),
          actionId: 'validate.check_convention',
          evidenceRefs: ['ledger:event.fqhe.flux-convention'],
        },
      ],
      checkResults: [
        {
          checkId: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          status: 'passed',
          evidenceRefs: ['ledger:event.fqhe.flux-convention'],
        },
      ],
    });

    expect(result.outcome).toBe('pass');
    expect(result.validations.map((validation) => validation.outcome)).toEqual(['pass', 'pass']);
  });
});

function fqheChargeFluxEvalCase(): ResearchEvalCase {
  return {
    id: 'eval.fqhe.charge-flux-convention',
    title: 'FQHE charge-flux convention eval',
    task: 'Explain inverse fractional charge and flux period without conflating flux identities.',
    domain: 'topological-order/fqhe-cs',
    capsuleRefs: ['capsule.candidate.fqhe.flux-insertion-charge'],
    actionSequence: [
      'physics.apply_direction_lens',
      {
        id: 'binding.fqhe-cs.charge-flux-convention',
        actionId: 'validate.check_convention',
        domainId: 'topological-order/fqhe-cs',
        lensId: 'charge_flux_quantization',
        checkId: 'check.charge-flux-quantization.convention',
        priority: 'blocking',
      },
    ],
    validations: [
      {
        type: 'action_outcome',
        actionId: 'validate.check_convention',
        outcome: 'pass',
      },
      {
        type: 'required_check',
        check: {
          id: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          severity: 'blocking',
        },
      },
    ],
  };
}

function actionRecord(outcome: ResearchActionRecord['outcome']): ResearchActionRecord {
  return {
    actionId: 'code.map_formula_to_code',
    callId: 'call-1',
    source: 'model',
    input: {},
    output: {},
    graphRefs: [
      {
        kind: 'Formula',
        id: 'graph.librpa.formula.head-wing',
      },
    ],
    capsuleRefs: ['formula.librpa.head-wing'],
    ledgerEventIds: ['event.librpa.mapping-failure'],
    evidenceRefs: ['ledger:event.librpa.mapping-failure'],
    outcome,
    nextSuggestedActions: ['benchmark.run_minimal_case'],
  };
}

function benchmarkRecord(): ResearchActionRecord {
  return {
    ...actionRecord('pass'),
    actionId: 'benchmark.run_minimal_case',
    callId: 'call-2',
    evidenceRefs: ['ledger:event.librpa.mapping-failure', 'ledger:event.librpa.smoke'],
  };
}
