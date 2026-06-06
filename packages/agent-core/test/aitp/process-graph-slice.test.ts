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
        'aitp.record_evidence',
        'aitp.record_derivation_checkpoint',
        'physics.brainstorm_relation_path',
        'trace.follow_source_dependency',
        'trace.open_backtrace',
        'trace.reconstruct_definition',
      ]),
    );
    expect(compiled.contextLines.join('\n')).toContain('Relation hypotheses: rel.hypothesis');
    expect(compiled.contextLines.join('\n')).toContain('Source gaps: bt.missing-paper');
    expect(compiled.contextLines.join('\n')).toContain(
      'aitp.record_derivation_checkpoint@after_local_conclusion priority=high boundary=derivation_checkpoint',
    );
    expect(compiled.contextLines.join('\n')).toContain('AITP required calls now: aitp.record_evidence');
    expect(compiled.contextLines.join('\n')).toContain(
      'AITP lifecycle triggers: aitp.record_evidence@phase=pre_final',
    );
    expect(compiled.callObligations.find((item) =>
      item.actionId === 'aitp.record_evidence',
    )).toMatchObject({
      requiredNow: true,
      decisionType: 'recording',
      entrypoints: expect.arrayContaining([
        'aitp_v5_record_evidence',
        'aitp_v5_record_validation_result',
        'aitp_v5_preflight_trust_update',
      ]),
      lifecycleTrigger: {
        lifecyclePhases: ['pre_final'],
        triggerConditions: ['open proof obligation will be cited as resolved'],
        recordingThreshold: 'before final response upgrades the obligation status',
        trustBoundaryInputs: {
          targetRefs: ['proof_obligation:obl.source-support'],
          entrypoints: expect.arrayContaining(['aitp_v5_record_evidence']),
          requiresPreflight: true,
          finalGateRequired: true,
        },
        recommendedHostBehavior: ['surface as a blocking action before final answer'],
      },
    });
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'aitp.record_evidence',
    )?.params).toMatchObject({
      lifecycleTrigger: {
        lifecyclePhases: ['pre_final'],
        triggerConditions: ['open proof obligation will be cited as resolved'],
      },
    });
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'aitp.record_derivation_checkpoint',
    )?.params).toMatchObject({
      lifecycleTrigger: {
        lifecyclePhases: ['pre_action'],
        triggerConditions: ['derivation reaches reusable checkpoint'],
        recommendedHostBehavior: ['offer checkpoint recording without auto-writing'],
      },
    });
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
        'aitp.record_evidence',
        'aitp.record_reference_location',
        'aitp.request_human_checkpoint',
        'physics.brainstorm_relation_path',
        'trace.audit_original_question_drift',
        'trace.follow_source_dependency',
        'trace.open_backtrace',
      ]),
    );
    expect(compiled.contextLines.join('\n')).toContain('Exploration records: exploratory-question');
    expect(compiled.contextLines.join('\n')).toContain('Exploration unresolved points: finite-size aliasing');
    expect(compiled.contextLines.join('\n')).toContain('Source assets: source_asset:source-asset-edge-counting');
    expect(compiled.contextLines.join('\n')).toContain(
      'aitp.record_reference_location@required_now priority=blocking boundary=policy_prerequisite:backtrace',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'trace.open_backtrace@before_using_as_support priority=high boundary=source_support',
    );
    expect(compiled.contextLines.join('\n')).toContain('AITP required calls now:');
    expect(compiled.contextLines.join('\n')).toContain('AITP lifecycle triggers:');
    expect(compiled.contextLines.join('\n')).toContain('AITP trust prerequisites:');
    expect(compiled.contextLines.join('\n')).toContain('Theory reasoning:');
    expect(compiled.contextLines.join('\n')).toContain('relation_path_brainstorming');
    expect(compiled.contextLines.join('\n')).toContain('original_question_continuity_guard');
    expect(compiled.callObligations.map((item) => item.actionId)).toEqual(
      expect.arrayContaining([
        'aitp.record_evidence',
        'aitp.record_reference_location',
        'physics.brainstorm_relation_path',
        'aitp.request_human_checkpoint',
      ]),
    );
    expect(compiled.callObligations.find((item) =>
      item.actionId === 'aitp.record_evidence',
    )?.payloadHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrypoint: 'aitp_v5_record_evidence',
          recordAction: 'record_evidence',
          draft: expect.objectContaining({ topic_id: 'fqhe' }),
        }),
      ]),
    );
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'aitp.record_evidence',
    )?.params).toMatchObject({
      callObligation: {
        requiredNow: true,
        decisionType: 'recording',
        entrypoints: expect.arrayContaining(['aitp_v5_record_evidence']),
        lifecycleTrigger: {
          lifecyclePhases: ['pre_final'],
          triggerConditions: ['open proof obligation must be recorded before checked final status'],
          recordingThreshold: 'before final answer treats source support as checked',
          trustBoundaryInputs: {
            targetRefs: ['proof_obligation:obligation-finite-size'],
            claimId: 'claim-fqhe',
            entrypoints: expect.arrayContaining(['aitp_v5_record_evidence']),
            requiresPreflight: true,
            finalGateRequired: true,
          },
          recommendedHostBehavior: [
            'surface evidence or validation write as a blocking ResearchAction',
          ],
        },
      },
      lifecycleTrigger: {
        lifecyclePhases: ['pre_final'],
        triggerConditions: ['open proof obligation must be recorded before checked final status'],
      },
      theoryReasoning: {
        moves: expect.arrayContaining([
          'relation_path_brainstorming',
          'source_dependency_backtrace',
          'original_question_continuity_guard',
        ]),
        relationPathQuestions: expect.arrayContaining([
          'Which intermediate definition connects counting to edge CFT labels?',
        ]),
        sourceDependencyQuestions: expect.arrayContaining([
          'Which source introduces the matching convention?',
        ]),
        originalQuestionGuard: expect.arrayContaining([
          'Keep sector matching tied to edge-CFT identification.',
        ]),
      },
      writeBridge: {
        operation: 'recordEvidence',
        payloadDraft: {
          topicId: 'fqhe',
          claimId: 'claim-fqhe',
          evidenceType: 'proof_obligation_resolution',
          status: 'supports',
          summary: '<source-grounded evidence summary>',
          supportsOutputs: ['analytic derivation'],
        },
        payloadHint: {
          entrypoint: 'aitp_v5_record_evidence',
          recordAction: 'record_evidence',
          orientationOnly: true,
          summaryInputsTrusted: false,
          canUpdateClaimTrust: false,
          lifecycleTrigger: {
            lifecyclePhases: ['pre_final'],
            triggerConditions: ['draft evidence would satisfy open obligation'],
          },
        },
      },
    });
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'aitp.record_reference_location',
    )?.params).toMatchObject({
      callObligation: {
        requiredNow: true,
        decisionType: 'backtrace',
        entrypoints: expect.arrayContaining(['aitp_v5_record_reference_location']),
        lifecycleTrigger: {
          lifecyclePhases: ['pre_action'],
          triggerConditions: ['source backtrace has missing reference location'],
        },
      },
      lifecycleTrigger: {
        lifecyclePhases: ['pre_action'],
        triggerConditions: ['source backtrace has missing reference location'],
      },
      writeBridge: {
        operation: 'recordReferenceLocation',
        cli: 'aitp-v5 reference location record',
        payloadDraft: {
          topicId: 'fqhe',
          claimId: 'claim-fqhe',
          connectorId: '<connector id>',
          locationType: 'paper_section',
          uri: '<source URI>',
          label: '<source label>',
          status: 'located',
        },
        payloadHint: {
          entrypoint: 'aitp_v5_record_reference_location',
          recordAction: 'record_reference_location',
          orientationOnly: true,
        },
      },
    });
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'trace.open_backtrace',
    )?.params).toMatchObject({
      timing: 'before_using_as_support',
      trustBoundary: 'source_support',
    });
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'trace.open_backtrace',
    )?.params?.['callObligation']).toBeUndefined();
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'aitp.create_open_obligation',
    )?.params).toMatchObject({
      writeBridge: {
        operation: 'createProofObligation',
        cli: 'aitp-v5 research-state create-proof-obligation',
        requiredFields: expect.arrayContaining(['topicId', 'claimId', 'statement']),
      },
    });
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'aitp.request_human_checkpoint',
    )?.params).toMatchObject({
      writeBridge: {
        operation: 'requestHumanCheckpoint',
        cli: 'aitp-v5 checkpoint request',
        requiredFields: expect.arrayContaining(['topicId', 'claimId', 'reason', 'options']),
      },
    });
    expect(compiled.actionRecommendations.some((binding) =>
      (binding.objectRefs ?? []).includes('claim:claim-fqhe'),
    )).toBe(true);
  });

  it('detects trust-boundary and Chinese prompt moments without AITP schema changes', () => {
    const compiled = compileAitpProcessGraphSlice(currentAitpSlicePayload(), {
      prompt:
        '\u9700\u8981\u8bb0\u5f55\u72b6\u6001\uff0c\u5934\u8111\u98ce\u66b4\u5173\u7cfb\u8def\u5f84\uff0c\u6253\u5f00\u6e90\u56de\u6eaf\uff0c\u5e76\u505a\u4eba\u5de5\u68c0\u67e5\u70b9\u3002',
    });
    const byActionId = new Map(
      compiled.suggestedNextMoments.map((moment) => [moment.actionId, moment]),
    );

    expect(byActionId.get('aitp.request_human_checkpoint')).toMatchObject({
      priority: 'blocking',
    });
    expect(compiled.actionRecommendations.map((binding) => binding.actionId)).toEqual(
      expect.arrayContaining([
        'aitp.record_research_state',
        'aitp.request_human_checkpoint',
        'direction.brainstorm',
        'physics.brainstorm_relation_path',
        'trace.open_backtrace',
      ]),
    );
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
        timing: 'after_local_conclusion',
        trust_boundary: 'derivation_checkpoint',
        lifecyclePhases: ['pre_action'],
        triggerConditions: ['derivation reaches reusable checkpoint'],
        recommendedHostBehavior: ['offer checkpoint recording without auto-writing'],
      },
    ],
    moment_policy: {
      ok: true,
      kind: 'host_agnostic_moment_policy',
      decisions: [
        {
          moment: 'record_or_validate_open_obligation',
          decision_type: 'recording',
          action_kind: 'record_evidence_or_validation',
          required_now: true,
          reason: 'open proof obligation requires typed evidence or validation',
          target_type: 'proof_obligation',
          target_id: 'obl.source-support',
          record_entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
          ],
          exploration_entrypoints: [],
          entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
            'aitp_v5_preflight_trust_update',
          ],
          payload_hints: [
            {
              entrypoint: 'aitp_v5_record_evidence',
              record_action: 'record_evidence',
              action_kind: 'record_evidence_or_validation',
              target_type: 'proof_obligation',
              target_id: 'obligation-finite-size',
              required_fields: ['topic_id', 'claim_id', 'evidence_type', 'status', 'summary'],
              draft: {
                topic_id: 'fqhe',
                claim_id: 'claim-fqhe',
                evidence_type: 'proof_obligation_resolution',
                status: 'supports',
                summary: '<source-grounded evidence summary>',
                supports_outputs: ['analytic derivation'],
              },
              orientation_only: true,
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
            },
            {
              entrypoint: 'aitp_v5_record_validation_result',
              record_action: 'record_validation_result',
              action_kind: 'record_evidence_or_validation',
              target_type: 'proof_obligation',
              target_id: 'obligation-finite-size',
              required_fields: ['topic_id', 'claim_id', 'contract_id', 'tool_run_id', 'status', 'summary'],
              draft: {
                topic_id: 'fqhe',
                claim_id: 'claim-fqhe',
                contract_id: '<validation contract id>',
                tool_run_id: '<tool run id>',
                status: 'partial',
                summary: '<validation result summary>',
                checked_outputs: ['analytic derivation'],
              },
              orientation_only: true,
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
            },
          ],
          required_before_trust_change: [
            'record typed evidence or validation for the open obligation',
            'run aitp_v5_preflight_trust_update',
          ],
          lifecycle_phases: ['pre_final'],
          trigger_conditions: ['open proof obligation will be cited as resolved'],
          recording_threshold: 'before final response upgrades the obligation status',
          trust_boundary_inputs: {
            target_refs: ['proof_obligation:obl.source-support'],
            claim_id: '',
            entrypoints: [
              'aitp_v5_record_evidence',
              'aitp_v5_record_validation_result',
              'aitp_v5_preflight_trust_update',
            ],
            required_before_trust_change: [
              'record typed evidence or validation for the open obligation',
              'run aitp_v5_preflight_trust_update',
            ],
            requires_preflight: true,
            final_gate_required: true,
          },
          recommended_host_behavior: ['surface as a blocking action before final answer'],
          missing_components: [],
          trust_boundary: true,
          orientation_only: true,
          can_update_claim_trust: false,
        },
      ],
      recommended_moments: [],
      trust_boundary_reasons: [],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
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
        reasoning_moves: ['why-question decomposition'],
        relation_path_questions: [
          'Which intermediate definition connects counting to edge CFT labels?',
        ],
        original_question_guard: ['Keep sector matching tied to edge-CFT identification.'],
        unresolved_points: ['finite-size aliasing'],
        next_actions: ['open source backtrace'],
      },
    ],
    trust_boundary_reasons: ['this API cannot update claim trust'],
    moment_policy: {
      ok: true,
      kind: 'host_agnostic_moment_policy',
      decisions: [
        {
          moment: 'record_or_validate_open_obligation',
          decision_type: 'recording',
          action_kind: 'record_evidence_or_validation',
          required_now: true,
          reason: 'open proof obligation requires typed evidence or validation',
          target_type: 'proof_obligation',
          target_id: 'obligation-finite-size',
          target_refs: ['proof_obligation:obligation-finite-size'],
          missing_components: [],
          record_entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
          ],
          exploration_entrypoints: [],
          entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
            'aitp_v5_preflight_trust_update',
          ],
          payload_hints: [
            {
              entrypoint: 'aitp_v5_record_evidence',
              record_action: 'record_evidence',
              action_kind: 'record_evidence_or_validation',
              target_type: 'proof_obligation',
              target_id: 'obligation-finite-size',
              required_fields: ['topic_id', 'claim_id', 'evidence_type', 'status', 'summary'],
              draft: {
                topic_id: 'fqhe',
                claim_id: 'claim-fqhe',
                evidence_type: 'proof_obligation_resolution',
                status: 'supports',
                summary: '<source-grounded evidence summary>',
                supports_outputs: ['analytic derivation'],
              },
              orientation_only: true,
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
              lifecycle_phases: ['pre_final'],
              trigger_conditions: ['draft evidence would satisfy open obligation'],
            },
            {
              entrypoint: 'aitp_v5_record_validation_result',
              record_action: 'record_validation_result',
              action_kind: 'record_evidence_or_validation',
              target_type: 'proof_obligation',
              target_id: 'obligation-finite-size',
              required_fields: ['topic_id', 'claim_id', 'contract_id', 'tool_run_id', 'status', 'summary'],
              draft: {
                topic_id: 'fqhe',
                claim_id: 'claim-fqhe',
                contract_id: '<validation contract id>',
                tool_run_id: '<tool run id>',
                status: 'partial',
                summary: '<validation result summary>',
                checked_outputs: ['analytic derivation'],
              },
              orientation_only: true,
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
            },
          ],
          required_before_trust_change: [
            'record typed evidence or validation for the open obligation',
            'run aitp_v5_preflight_trust_update',
          ],
          lifecycle_phases: ['pre_final'],
          trigger_conditions: [
            'open proof obligation must be recorded before checked final status',
          ],
          recording_threshold: 'before final answer treats source support as checked',
          trust_boundary_inputs: {
            target_refs: ['proof_obligation:obligation-finite-size'],
            claim_id: 'claim-fqhe',
            entrypoints: [
              'aitp_v5_record_evidence',
              'aitp_v5_record_validation_result',
              'aitp_v5_preflight_trust_update',
            ],
            required_before_trust_change: [
              'record typed evidence or validation for the open obligation',
              'run aitp_v5_preflight_trust_update',
            ],
            requires_preflight: true,
            final_gate_required: true,
          },
          recommended_host_behavior: [
            'surface evidence or validation write as a blocking ResearchAction',
          ],
          trust_boundary: true,
          summary_inputs_trusted: false,
          orientation_only: true,
          can_update_kernel_state: false,
          can_update_claim_trust: false,
        },
        {
          moment: 'backtrace_source_reconstruction',
          decision_type: 'backtrace',
          action_kind: 'reconstruct_missing_source_components',
          required_now: true,
          reason: 'missing source reconstruction components',
          target_type: 'claim',
          target_id: 'claim-fqhe',
          missing_components: ['reference_location', 'evidence'],
          record_entrypoints: [
            'aitp_v5_record_exploratory_record',
            'aitp_v5_record_reference_location',
            'aitp_v5_register_source_asset',
          ],
          exploration_entrypoints: ['aitp_v5_record_exploratory_record'],
          entrypoints: [
            'aitp_v5_record_exploratory_record',
            'aitp_v5_record_reference_location',
            'aitp_v5_register_source_asset',
            'aitp_v5_preflight_trust_update',
          ],
          payload_hints: [
            {
              entrypoint: 'aitp_v5_record_reference_location',
              record_action: 'record_reference_location',
              action_kind: 'reconstruct_missing_source_components',
              target_type: 'claim',
              target_id: 'claim-fqhe',
              required_fields: ['topic_id', 'connector_id', 'location_type', 'uri', 'label'],
              draft: {
                topic_id: 'fqhe',
                claim_id: 'claim-fqhe',
                connector_id: '<connector id>',
                location_type: 'paper_section',
                uri: '<source URI>',
                label: '<source label>',
                status: 'located',
                reasoning_moves: [
                  'source dependency backtrace',
                  'bidirectional definition backtrace',
                ],
                backtrace_targets: ['claim:claim-fqhe', 'source:source-asset-edge-counting'],
                definition_boundary_questions: [
                  'Which definition boundary fixes sector matching?',
                ],
                derivation_backtrace_questions: [
                  'Which derivation step assumes sector matching?',
                ],
                source_dependency_questions: [
                  'Which source introduces the matching convention?',
                ],
                original_question_guard: ['Keep sector matching tied to edge-CFT identification.'],
              },
              orientation_only: true,
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
              lifecycle_phases: ['pre_final'],
              trigger_conditions: ['draft reference location would close source provenance gap'],
            },
          ],
          required_before_trust_change: [
            'backtrace missing source components to typed records',
            'record evidence only after source and provenance are explicit',
            'run aitp_v5_preflight_trust_update',
          ],
          lifecyclePhases: ['pre_action'],
          triggerConditions: ['source backtrace has missing reference location'],
          recordingThreshold: 'before treating source support as available',
          trustBoundaryInputs: {
            targetRefs: ['claim:claim-fqhe'],
            claimId: 'claim-fqhe',
            entrypoints: [
              'aitp_v5_record_exploratory_record',
              'aitp_v5_record_reference_location',
              'aitp_v5_register_source_asset',
              'aitp_v5_preflight_trust_update',
            ],
            requiredBeforeTrustChange: [
              'backtrace missing source components to typed records',
              'record evidence only after source and provenance are explicit',
              'run aitp_v5_preflight_trust_update',
            ],
            requiresPreflight: true,
            finalGateRequired: true,
          },
          recommendedHostBehavior: [
            'surface reference-location write before source-dependent reasoning',
          ],
          trust_boundary: true,
          summary_inputs_trusted: false,
          orientation_only: true,
          can_update_kernel_state: false,
          can_update_claim_trust: false,
        },
        {
          moment: 'brainstorm_relation_path',
          decision_type: 'brainstorming',
          action_kind: 'brainstorm_relation_path_before_validation',
          required_now: false,
          reason: 'object relation is still a hypothesis',
          target_type: 'object_relation',
          target_id: 'relation-counting-cft',
          missing_components: [],
          record_entrypoints: [],
          exploration_entrypoints: ['aitp_v5_record_exploratory_record'],
          entrypoints: [
            'aitp_v5_record_exploratory_record',
            'aitp_v5_preflight_trust_update',
          ],
          required_before_trust_change: [
            'convert relation-path brainstorm into typed evidence or validation',
            'run aitp_v5_preflight_trust_update',
          ],
          trust_boundary: true,
          summary_inputs_trusted: false,
          orientation_only: true,
          can_update_kernel_state: false,
          can_update_claim_trust: false,
        },
        {
          moment: 'trust_boundary_before_claim_update',
          decision_type: 'trust_boundary',
          action_kind: 'block_trust_change_until_policy_prerequisites_are_met',
          required_now: true,
          reason: 'recording, brainstorming, or backtrace prerequisites exist before any claim-trust update',
          target_type: 'claim',
          target_id: 'claim-fqhe',
          missing_components: [],
          record_entrypoints: [],
          exploration_entrypoints: [],
          entrypoints: ['aitp_v5_preflight_trust_update'],
          required_before_trust_change: [
            'resolve required recording/backtrace/brainstorm policy decisions',
            'run aitp_v5_preflight_trust_update',
          ],
          trust_boundary: true,
          summary_inputs_trusted: false,
          orientation_only: true,
          can_update_kernel_state: false,
          can_update_claim_trust: false,
        },
      ],
      recommended_moments: [],
      trust_boundary_reasons: ['this API cannot update claim trust'],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    recommended_moments: [
      {
        moment: 'backtrace_source_reconstruction',
        reason: 'missing source reconstruction components',
        target_type: 'claim',
        target_id: 'claim-fqhe',
        priority: 'high',
        timing: 'before_using_as_support',
        trust_boundary: 'source_support',
        missing_components: ['reference_location', 'evidence'],
      },
      {
        moment: 'brainstorm_relation_path',
        reason: 'object relation is still a hypothesis',
        target_type: 'object_relation',
        target_id: 'relation-counting-cft',
        priority: 'high',
        timing: 'before_using_relation_as_claim',
        trust_boundary: 'hypothesis_relation',
      },
    ],
  };
}
