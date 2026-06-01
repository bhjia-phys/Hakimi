import { describe, expect, it } from 'vitest';

import {
  harnessCandidateFromActionRecord,
  type ResearchActionRecord,
} from '../../src/research-action';

describe('research action harness candidates', () => {
  it('converts failed and inconclusive records into harness candidates', () => {
    const record = actionRecord('fail');

    expect(harnessCandidateFromActionRecord(record)).toEqual({
      id: 'harness.candidate.code.map_formula_to_code.call-1',
      title: 'Harness candidate from code.map_formula_to_code',
      sourceActionId: 'code.map_formula_to_code',
      sourceCallId: 'call-1',
      outcome: 'fail',
      evidenceRefs: ['ledger:event.librpa.mapping-failure'],
      capsuleRefs: ['formula.librpa.head-wing'],
      graphRefIds: ['graph.librpa.formula.head-wing'],
      suggestedValidations: [
        {
          type: 'action_outcome',
          actionId: 'code.map_formula_to_code',
          outcome: 'fail',
        },
        {
          type: 'evidence_ref',
          pattern: 'ledger:event.librpa.mapping-failure',
        },
      ],
    });
  });

  it('does not create harness candidates for passing records', () => {
    expect(harnessCandidateFromActionRecord(actionRecord('pass'))).toBeUndefined();
  });
});

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
    evidenceRefs: ['ledger:event.librpa.mapping-failure'],
    outcome,
    nextSuggestedActions: ['benchmark.run_minimal_case'],
  };
}
