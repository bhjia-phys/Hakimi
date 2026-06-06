import { describe, expect, it } from 'vitest';

import {
  ResearchMomentDetector,
  compileAitpProcessGraphSlice,
  parseAitpProcessGraphSlice,
} from '../../src/aitp';

describe('AITP process graph slice adapter', () => {
  it('parses and compiles obligations, relation hypotheses, and source gaps into action recommendations', () => {
    const compiled = compileAitpProcessGraphSlice(fakeSlicePayload(), {
      prompt: 'Brainstorm the relation path and checkpoint the derivation.',
    });
    const actionIds = compiled.actionRecommendations.map((binding) => binding.actionId);

    expect(compiled.obligations.blocking.map((item) => item.id)).toEqual([
      'obl.source-support',
    ]);
    expect(compiled.obligations.recommended.map((item) => item.id)).toEqual([
      'obl.definition',
    ]);
    expect(actionIds).toEqual(
      expect.arrayContaining([
        'aitp.create_open_obligation',
        'aitp.record_derivation_checkpoint',
        'physics.brainstorm_relation_path',
        'trace.follow_source_dependency',
        'trace.open_backtrace',
        'trace.reconstruct_definition',
      ]),
    );
    expect(compiled.contextLines.join('\n')).toContain('Relation hypotheses: rel.hypothesis');
    expect(compiled.contextLines.join('\n')).toContain('Source gaps: bt.missing-paper');
    expect(compiled.actionRecommendations[0]?.adapterId).toBe('aitp.native.process-graph-slice');
  });

  it('does not infer trust without explicit trust flags', () => {
    const compiled = compileAitpProcessGraphSlice(fakeSlicePayload());

    expect(compiled.trust.truthSource).toBe('.aitp/process_graph');
    expect(compiled.trust.orientationOnly).toBe(true);
    expect(compiled.trust.trustedNodeIds).toEqual([]);
    expect(compiled.trust.trustedEdgeIds).toEqual([]);
  });

  it('normalizes AITP recommended moments for detector callers', () => {
    const slice = parseAitpProcessGraphSlice(fakeSlicePayload());
    const detector = new ResearchMomentDetector();
    const moments = detector.detect(slice, {
      activeContext: ['We need to record state after this derivation checkpoint.'],
    });

    expect(moments.map((moment) => moment.actionId)).toEqual(
      expect.arrayContaining([
        'aitp.record_research_state',
        'aitp.record_derivation_checkpoint',
      ]),
    );
  });

  it('accepts current AITP v5 snake-case process graph slices', () => {
    const compiled = compileAitpProcessGraphSlice(currentAitpSlicePayload(), {
      prompt: 'Audit original question drift while following this backtrace.',
    });
    const actionIds = compiled.actionRecommendations.map((binding) => binding.actionId);

    expect(compiled.obligations.recommended.map((item) => item.id)).toEqual([
      'obligation-finite-size',
    ]);
    expect(compiled.contextLines.join('\n')).toContain('Source gaps: claim-fqhe');
    expect(compiled.contextLines.join('\n')).toContain('Relation hypotheses: relation-counting-cft');
    expect(actionIds).toEqual(
      expect.arrayContaining([
        'aitp.create_open_obligation',
        'aitp.record_exploratory_record',
        'physics.brainstorm_relation_path',
        'trace.audit_original_question_drift',
        'trace.follow_source_dependency',
        'trace.open_backtrace',
      ]),
    );
    expect(compiled.contextLines.join('\n')).toContain('Exploration records: exploratory-question');
    expect(compiled.contextLines.join('\n')).toContain('Exploration unresolved points: finite-size aliasing');
    expect(compiled.contextLines.join('\n')).toContain('Source assets: source_asset:source-asset-edge-counting');
    expect(compiled.actionRecommendations.some((binding) =>
      (binding.objectRefs ?? []).includes('claim:claim-fqhe'),
    )).toBe(true);
  });
});

function fakeSlicePayload() {
  return {
    kind: 'process_graph_slice',
    nodes: [
      {
        id: 'formula.response',
        kind: 'Formula',
        title: 'Response formula',
        status: 'candidate',
        source_refs: ['paper:known'],
      },
      {
        id: 'definition.kernel',
        kind: 'Definition',
        title: 'Kernel definition',
        status: 'missing',
      },
    ],
    edges: [
      {
        source: 'definition.kernel',
        target: 'formula.response',
        relation: 'supports',
        status: 'candidate',
      },
    ],
    open_obligations: [
      {
        id: 'obl.source-support',
        kind: 'source_support',
        severity: 'blocking',
        reason: 'Missing citation for formula.response.',
        target_node_id: 'formula.response',
        suggested_moments: ['trace.open_backtrace'],
      },
      {
        id: 'obl.definition',
        kind: 'definition_gap',
        severity: 'recommended',
        reason: 'Reconstruct definition.kernel before using it.',
        target_node_id: 'definition.kernel',
      },
    ],
    source_backtrace: [
      {
        id: 'bt.missing-paper',
        target_node_id: 'formula.response',
        status: 'missing',
        gap: 'citation gap',
      },
    ],
    relation_neighborhood: [
      {
        id: 'rel.hypothesis',
        source: 'definition.kernel',
        target: 'formula.response',
        relation: 'hypothesized_support',
        status: 'hypothesis',
        reason: 'Possible relation path but no source yet.',
      },
    ],
    trust_boundary_reasons: [],
    recommended_moments: [
      {
        id: 'aitp.record_derivation_checkpoint',
        priority: 'high',
        reason: 'The derivation has reached a reusable checkpoint.',
        target_refs: ['formula.response'],
      },
    ],
    truth_source: '.aitp/process_graph',
    orientation_only: true,
  };
}

function currentAitpSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    can_update_kernel_state: false,
    can_update_claim_trust: false,
    nodes: [
      {
        id: 'claim:claim-fqhe',
        type: 'claim',
        record_id: 'claim-fqhe',
        label: 'Sector counting identifies the edge CFT.',
        status: 'hypothesis',
        record: {
          claim_id: 'claim-fqhe',
          topic_id: 'fqhe',
          statement: 'Sector counting identifies the edge CFT.',
          confidence_state: 'hypothesis',
        },
      },
      {
        id: 'source_asset:source-asset-edge-counting',
        type: 'source_asset',
        record_id: 'source-asset-edge-counting',
        label: 'Edge counting source asset',
        record: {
          asset_id: 'source-asset-edge-counting',
          topic_id: 'fqhe',
          claim_id: 'claim-fqhe',
          asset_type: 'paper',
          uri: 'arxiv:2601.00001',
          title: 'Edge counting source asset',
          source_kind: 'literature',
          orientation_only: true,
          can_update_claim_trust: false,
        },
      },
    ],
    edges: [
      {
        id: 'claim:claim-fqhe->has_object_relation->object_relation:relation-counting-cft',
        source: 'claim:claim-fqhe',
        target: 'object_relation:relation-counting-cft',
        type: 'has_object_relation',
      },
    ],
    open_obligations: [
      {
        obligation_id: 'obligation-finite-size',
        claim_id: 'claim-fqhe',
        status: 'open',
        obligation_type: 'proof_gap',
        statement: 'Prove the finite-size sector match is not an accidental alias.',
        next_action: 'derive sector matching constraints',
        required_evidence: ['analytic derivation'],
      },
    ],
    source_backtrace: [
      {
        claim_id: 'claim-fqhe',
        statement: 'Sector counting identifies the edge CFT.',
        reference_location_ids: [],
        evidence_ids: [],
        source_asset_ids: ['source-asset-edge-counting'],
        proof_obligation_ids: ['obligation-finite-size'],
        object_relation_ids: ['relation-counting-cft'],
        physics_object_ids: ['object-counting', 'object-cft'],
        missing_components: ['reference_location', 'evidence'],
        complete: false,
      },
    ],
    relation_neighborhood: [
      {
        relation_id: 'relation-counting-cft',
        claim_id: 'claim-fqhe',
        status: 'hypothesis',
        relation_type: 'diagnoses',
        subject_id: 'object-counting',
        object_id: 'object-cft',
        subject_name: 'counting sequence',
        object_name: 'edge CFT',
        failure_modes: ['wrong momentum sector'],
      },
    ],
    exploratory_records: [
      {
        record_id: 'exploratory-question',
        exploration_type: 'question_decomposition',
        title: 'Decompose counting to CFT question',
        focal_question: 'Which local definitions connect counting to the edge CFT?',
        original_question: 'Does sector counting identify the edge CFT?',
        local_question: 'Trace sector matching definitions.',
        status: 'open',
        object_ids: ['object-counting', 'object-cft'],
        relation_ids: ['relation-counting-cft'],
        source_refs: ['paper:edge-counting'],
        candidate_paths: ['counting sequence -> sector matching -> edge CFT'],
        unresolved_points: ['finite-size aliasing'],
        next_actions: ['open source backtrace'],
      },
    ],
    trust_boundary_reasons: ['this API cannot update claim trust'],
    recommended_moments: [
      {
        moment: 'backtrace_source_reconstruction',
        reason: 'missing source reconstruction components',
        target_type: 'claim',
        target_id: 'claim-fqhe',
        missing_components: ['reference_location', 'evidence'],
      },
      {
        moment: 'brainstorm_relation_path',
        reason: 'object relation is still a hypothesis',
        target_type: 'object_relation',
        target_id: 'relation-counting-cft',
      },
    ],
  };
}
