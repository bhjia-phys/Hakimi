import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESEARCH_ACTIONS,
  ResearchActionRegistry,
  harnessCandidateFromActionRecord,
  recommendResearchActions,
  runLibrpaHeadWingSmokeBenchmark,
  type ResearchActionRecord,
  type ResearchObligation,
} from '../../src/research-action';
import { buildResearchCaptureDecision } from '../../src/research-ledger';

describe('LibRPA head-wing micro vertical slice', () => {
  it('registers LibRPA-specific actions and schedules inspection before benchmark', () => {
    const registry = new ResearchActionRegistry();
    for (const action of DEFAULT_RESEARCH_ACTIONS) {
      registry.register(action);
    }

    expect(
      registry.listActions({ domain: 'librpa' }).map((action) => action.id),
    ).toEqual(
      expect.arrayContaining([
        'code.inspect_call_sites',
        'code.map_formula_to_code_region',
        'code.capture_git_diff_observation',
        'benchmark.run_minimal_librpa_case',
      ]),
    );

    const recommendations = recommendResearchActions({
      actions: registry.listActions(),
      obligations: [
        obligation('obl.inspect', 'dependency_closure', 'blocking', 'code.inspect_call_sites'),
        obligation('obl.map', 'code_mapping', 'blocking', 'code.map_formula_to_code_region'),
        obligation('obl.benchmark', 'benchmark', 'important', 'benchmark.run_minimal_librpa_case'),
      ],
    });

    expect(recommendations.map((item) => item.action.id)).toEqual([
      'code.inspect_call_sites',
      'code.map_formula_to_code_region',
      'benchmark.run_minimal_librpa_case',
    ]);
  });

  it('runs the deterministic smoke benchmark and converts a failure into ledger and harness material', () => {
    const benchmark = runLibrpaHeadWingSmokeBenchmark({
      expected: { head: 1, wing: 0.25 },
      observed: { head: 1, wing: 0.4 },
      tolerance: 1e-6,
    });
    expect(benchmark).toMatchObject({
      outcome: 'fail',
      failingKeys: ['wing'],
    });

    const capture = buildResearchCaptureDecision({
      captureClass: 'failure_observation',
      topic: 'librpa-head-wing',
      domain: 'librpa',
      title: 'Head-wing smoke benchmark failure',
      body: benchmark.observation,
      sourceRefs: ['benchmark:librpa-head-wing-smoke'],
      artifactRefs: ['artifact:librpa-head-wing-smoke.log'],
      relatedObjects: ['benchmark:librpa/head-wing-smoke'],
      openQuestions: ['Check whether wing update changed downstream normalization.'],
    });
    expect(capture.capture).toBe(true);
    expect(capture.writeInput?.metadata.type).toBe('failure_observation');
    expect(capture.writeInput?.body).toContain('## Artifact Refs');

    const harness = harnessCandidateFromActionRecord(actionRecord(benchmark.outcome));
    expect(harness).toMatchObject({
      id: 'harness.candidate.benchmark.run_minimal_librpa_case.call.librpa-benchmark',
      sourceActionId: 'benchmark.run_minimal_librpa_case',
      outcome: 'fail',
      evidenceRefs: ['ledger:event.librpa-head-wing.failure'],
    });
  });
});

function obligation(
  id: string,
  kind: ResearchObligation['kind'],
  severity: ResearchObligation['severity'],
  requiredActionId: string,
): ResearchObligation {
  return {
    id,
    kind,
    domain: 'librpa',
    topic: 'librpa-head-wing',
    targetObjectId: 'code:librpa/head-wing',
    severity,
    reason: `${kind} required for LibRPA head-wing change`,
    requiredActionId,
    status: 'open',
  };
}

function actionRecord(outcome: ResearchActionRecord['outcome']): ResearchActionRecord {
  return {
    actionId: 'benchmark.run_minimal_librpa_case',
    callId: 'call.librpa-benchmark',
    source: 'model',
    input: {},
    output: {},
    graphRefs: [{ kind: 'BenchmarkCase', id: 'graph:librpa/head-wing-smoke' }],
    capsuleRefs: ['benchmark.librpa.head-wing-smoke'],
    ledgerEventIds: ['event.librpa-head-wing.failure'],
    evidenceRefs: ['ledger:event.librpa-head-wing.failure'],
    outcome,
    nextSuggestedActions: ['harness.build_eval_from_failure'],
  };
}
