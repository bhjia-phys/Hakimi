import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESEARCH_ACTIONS,
  ResearchActionRegistry,
  asActionAlgebraDefinition,
  registerDefaultResearchActions,
} from '../../src/research-action';

describe('default research actions', () => {
  it('registers the planned initial action set', () => {
    const registry = new ResearchActionRegistry();
    registerDefaultResearchActions(registry);

    expect(registry.listActions().map((action) => action.id)).toEqual([
      'benchmark.run_minimal_case',
      'code.capture_git_diff_observation',
      'code.check_intermediate_observable',
      'code.inspect_call_sites',
      'code.inspect_git_history',
      'code.map_formula_to_code',
      'code.map_formula_to_code_region',
      'derive.compare_with_known_result',
      'derive.derive_step',
      'derive.propose_route',
      'derive.specialize_regime',
      'derive.transform_formula',
      'graph.compile_edges',
      'graph.query_dependency_closure',
      'harness.build_eval_from_failure',
      'memory.promote_capsule',
      'memory.propose_capsule',
      'memory.reject_or_downgrade',
      'physics.apply_direction_lens',
      'scope.compile_context_pack',
      'scope.declare_convention_set',
      'scope.open_work_frame',
      'source.capture_source_excerpt',
      'source.extract_assumption',
      'source.extract_definition',
      'source.extract_formula',
      'validate.check_convention',
      'validate.check_dependency_closure',
      'validate.check_dimension',
      'validate.check_known_limit',
      'validate.check_source_support',
      'validate.check_symbol_consistency',
    ]);
  });

  it('marks high-risk derivation and code actions with blocking obligations', () => {
    const deriveStep = asActionAlgebraDefinition(
      DEFAULT_RESEARCH_ACTIONS.find((action) => action.id === 'derive.derive_step')!,
    );
    const mapFormulaToCode = asActionAlgebraDefinition(
      DEFAULT_RESEARCH_ACTIONS.find((action) => action.id === 'code.map_formula_to_code')!,
    );

    expect(deriveStep.generatedObligations.map((obligation) => obligation.requiredActionId)).toEqual(
      ['validate.check_dimension', 'validate.check_convention', 'validate.check_known_limit'],
    );
    expect(
      mapFormulaToCode.generatedObligations.map((obligation) => obligation.requiredActionId),
    ).toEqual(['code.check_intermediate_observable']);
    expect(mapFormulaToCode.primitiveToolPolicy).toBe('read-only');
  });

  it('keeps costly benchmark and promotion actions deferred', () => {
    const deferred = DEFAULT_RESEARCH_ACTIONS.filter((action) => action.exposure === 'deferred').map(
      (action) => action.id,
    );

    expect(deferred).toEqual([
      'benchmark.run_minimal_case',
      'memory.promote_capsule',
      'harness.build_eval_from_failure',
    ]);
  });

  it('keeps universal action ids free of domain-specific topic nouns', () => {
    const forbiddenSegments = [
      'librpa',
      'fqhe',
      'chern',
      'cs',
      'laughlin',
      'head',
      'wing',
      'flux',
      'quantization',
    ];

    for (const action of DEFAULT_RESEARCH_ACTIONS) {
      const segments = action.id.split(/[._-]/);
      for (const token of forbiddenSegments) {
        expect(segments, `${action.id} should not contain domain segment ${token}`).not.toContain(
          token,
        );
      }
    }
  });
});
