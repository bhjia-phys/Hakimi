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
      'aitp.attach_artifact',
      'aitp.attach_artifact_auto',
      'aitp.capture_code_state_auto',
      'aitp.capture_source_asset_auto',
      'aitp.capture_tool_run_auto',
      'aitp.checkpoint_before_route_switch',
      'aitp.create_open_obligation',
      'aitp.create_validation_contract',
      'aitp.record_derivation_checkpoint',
      'aitp.record_evidence',
      'aitp.record_exploratory_record',
      'aitp.record_failed_route_lesson',
      'aitp.record_reference_location',
      'aitp.record_research_state',
      'aitp.record_route_choice',
      'aitp.record_source_reconstruction_review_result',
      'aitp.record_tool_run',
      'aitp.record_validation_result',
      'aitp.register_source_asset',
      'aitp.request_human_checkpoint',
      'aitp.run_trust_preflight',
      'benchmark.run_minimal_case',
      'benchmark.submit_external_job',
      'code.capture_git_diff_observation',
      'code.check_intermediate_observable',
      'code.inspect_call_sites',
      'code.inspect_git_history',
      'code.map_formula_to_code',
      'code.map_formula_to_code_region',
      'code.prepare_patch',
      'derive.compare_with_known_result',
      'derive.derive_step',
      'derive.propose_route',
      'derive.specialize_regime',
      'derive.transform_formula',
      'direction.brainstorm',
      'formalization.build_blueprint',
      'graph.compile_edges',
      'graph.query_dependency_closure',
      'harness.build_eval_from_failure',
      'memory.promote_capsule',
      'memory.propose_capsule',
      'memory.reject_or_downgrade',
      'physics.apply_direction_lens',
      'physics.brainstorm_relation_path',
      'scope.compile_context_pack',
      'scope.declare_convention_set',
      'scope.open_work_frame',
      'source.capture_source_excerpt',
      'source.extract_assumption',
      'source.extract_definition',
      'source.extract_formula',
      'source.search_literature',
      'trace.audit_original_question_drift',
      'trace.follow_source_dependency',
      'trace.open_backtrace',
      'trace.reconstruct_definition',
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
      'benchmark.submit_external_job',
      'benchmark.run_minimal_case',
      'formalization.build_blueprint',
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
