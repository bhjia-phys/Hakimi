import { describe, expect, it } from 'vitest';

import {
  compileResearchContextPack,
  createAitpCliBridge,
  createWorkFrame,
  type AitpCommandRunner,
  type ResearchActionBinding,
} from '../../src';

describe('AITP native bridge smoke', () => {
  it('keeps the slice -> context binding -> write bridge -> AITP CLI loop executable', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AitpCommandRunner = {
      async run(command, args) {
        calls.push({ command, args });
        if (args.includes('graph') && args.includes('slice')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(qgMiptSlicePayload()),
            stderr: '',
          };
        }
        if (args.includes('research-state') && args.includes('create-proof-obligation')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'proof_obligation',
              obligation_id: 'proof-obligation-algebra-source-chain',
              topic_id: 'qg-algebra-mipt',
              claim_id: 'claim-mipt-observer-algebra',
              status: 'open',
              can_update_claim_trust: false,
            }),
            stderr: '',
          };
        }
        if (args.includes('evidence') && args.includes('record')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'evidence',
              evidence_id: 'evidence-algebra-source-chain',
              topic_id: 'qg-algebra-mipt',
              claim_id: 'claim-mipt-observer-algebra',
              evidence_type: 'source_reconstruction',
              status: 'supports',
            }),
            stderr: '',
          };
        }
        if (args.includes('checkpoint') && args.includes('request')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'human_checkpoint',
              checkpoint_id: 'checkpoint-qg-trust-boundary',
              topic_id: 'qg-algebra-mipt',
              claim_id: 'claim-mipt-observer-algebra',
              status: 'requested',
            }),
            stderr: '',
          };
        }
        if (args.includes('trust') && args.includes('preflight')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              kind: 'trust_update_preflight',
              request_id: 'trust-request-qg-boundary',
              action: 'change_claim_confidence',
              session_id: 'session-qg-mipt',
              topic_id: 'qg-algebra-mipt',
              claim_id: 'claim-mipt-observer-algebra',
              requested_state: 'supported',
              allowed: false,
              mutation_allowed_after_preflight: false,
              required_actions: ['resolve required recording/backtrace/brainstorm policy decisions'],
              evidence_refs: ['evidence-algebra-source-chain'],
              code_state_ids: [],
              preflight_token: 'trust-preflight-qg-boundary',
              can_update_kernel_state: false,
            }),
            stderr: '',
          };
        }
        return {
          exitCode: 1,
          stdout: '',
          stderr: `unexpected AITP command: ${args.join(' ')}`,
        };
      },
    };
    const bridge = createAitpCliBridge({
      basePath: 'F:/project',
      command: 'aitp-v5',
      runner,
    });

    const aitp = await bridge.readProcessGraphSlice({
      sessionId: 'session-qg-mipt',
      claimId: 'claim-mipt-observer-algebra',
      limit: 16,
      prompt:
        'Brainstorm the relation path, follow the source dependency, and keep the original question visible.',
    });
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.qg-mipt',
        domain: 'theoretical-physics/qg-algebra',
        topic: 'qg-algebra-mipt',
        goal: 'Trace whether an algebraic split can model the MIPT observer role.',
        activeObjectIds: ['object-von-neumann-algebra', 'object-mipt-observer'],
        sourceRefs: [
          'aitp:session:session-qg-mipt',
          'aitp:claim:claim-mipt-observer-algebra',
        ],
        trustState: 'exploratory',
      }),
      aitp,
      now: () => 777,
    });
    const renderedActionParams = JSON.stringify(pack.actionBindings.map((binding) => binding.params));

    const obligationBinding = requiredBinding(pack.actionBindings, 'aitp.create_open_obligation');
    expect(obligationBinding.objectRefs).toEqual(
      expect.arrayContaining([
        'claim:claim-mipt-observer-algebra',
        'obligation:obl-source-chain',
      ]),
    );
    expect(obligationBinding.params?.['writeBridge']).toMatchObject({
      operation: 'createProofObligation',
      cli: 'aitp-v5 research-state create-proof-obligation',
      requiredFields: [
        'topicId',
        'claimId',
        'statement',
        'obligationType',
        'status',
        'maturityLevel',
        'nextAction',
      ],
    });
    expect(obligationBinding.params).toMatchObject({
      timing: 'after_brainstorm_before_derivation',
      trustBoundary: 'source_support',
    });
    const evidenceBinding = requiredBinding(pack.actionBindings, 'aitp.record_evidence');
    expect(evidenceBinding.params).toMatchObject({
      timing: 'required_now',
      trustBoundary: 'policy_prerequisite:recording',
      writeBridge: {
        operation: 'recordEvidence',
        payloadDraft: {
          topicId: 'qg-algebra-mipt',
          claimId: 'claim-mipt-observer-algebra',
          evidenceType: 'proof_obligation_resolution',
          status: 'supports',
          summary: '<source-grounded evidence summary>',
          sourceRefs: ['source_asset:asset-algebra-paper'],
        },
        payloadDraftSchema: {
          requiredFields: ['topicId', 'claimId', 'evidenceType', 'status', 'summary'],
          placeholderFields: ['summary'],
          placeholderValues: { summary: '<source-grounded evidence summary>' },
          hostMustResolve: ['summary'],
          fieldCase: 'camelCase',
          sourceFieldCase: 'snake_case',
          summaryInputsTrusted: false,
          canUpdateClaimTrust: false,
        },
        payloadHint: {
          entrypoint: 'aitp_v5_record_evidence',
          recordAction: 'record_evidence',
          orientationOnly: true,
          summaryInputsTrusted: false,
          canUpdateClaimTrust: false,
        },
      },
      callObligation: {
        actionKind: 'record_evidence_or_validation',
        lifecycleTrigger: {
          lifecyclePhases: ['pre_final'],
          triggerConditions: ['source-support proof obligation must be recorded'],
        },
      },
      lifecycleTrigger: {
        lifecyclePhases: ['pre_final'],
        triggerConditions: ['source-support proof obligation must be recorded'],
      },
    });

    const checkpointBinding = requiredBinding(pack.actionBindings, 'aitp.request_human_checkpoint');
    expect(checkpointBinding.params?.['writeBridge']).toMatchObject({
      operation: 'requestHumanCheckpoint',
      cli: 'aitp-v5 checkpoint request',
      requiredFields: ['topicId', 'claimId', 'reason', 'requestedBy', 'options'],
    });
    const preflightBinding = requiredBinding(pack.actionBindings, 'aitp.run_trust_preflight');
    expect(preflightBinding.params?.['writeBridge']).toMatchObject({
      operation: 'preflightTrustUpdate',
      cli: 'aitp-v5 trust preflight',
      requiredFields: ['action', 'sessionId', 'topicId', 'claimId'],
      canUpdateClaimTrust: false,
      canUpdateKernelState: false,
    });
    expect(pack.aitp?.contextLines.join('\n')).toContain('Moment policy:');
    expect(pack.aitp?.contextLines.join('\n')).toContain('AITP required calls now:');
    expect(pack.aitp?.contextLines.join('\n')).toContain('AITP lifecycle triggers:');
    expect(pack.aitp?.contextLines.join('\n')).toContain('Theory reasoning:');
    expect(renderedActionParams).toContain('source_dependency_backtrace');
    expect(renderedActionParams).toContain('definitionBoundaryQuestions');
    expect(pack.aitp?.requiredCallIds).toEqual(
      expect.arrayContaining([
        expect.stringContaining('aitp-record-evidence'),
        expect.stringContaining('aitp-run-trust-preflight'),
      ]),
    );
    expect(pack.aitp?.trustBoundaryReasons).toEqual([
      'Claim trust cannot be updated until source dependency and human decision are recorded.',
    ]);

    const proof = await bridge.createProofObligation({
      topicId: 'qg-algebra-mipt',
      claimId: 'claim-mipt-observer-algebra',
      statement:
        'Backtrace the algebraic split source chain before treating the observer analogy as supported.',
      obligationType: 'source_support',
      status: 'open',
      maturityLevel: 'hypothesis',
      nextAction: 'follow source dependency back to the definition source',
      requiredEvidence: ['source reconstruction', 'definition provenance'],
      proofStrategy: [
        'trace von Neumann algebra split definition',
        'compare with MIPT observer operational role',
      ],
      failureModes: ['analogy mistaken for derivation'],
      sourceRefs: ['source_asset:asset-algebra-paper'],
    });
    const evidence = await bridge.recordEvidence({
      topicId: 'qg-algebra-mipt',
      claimId: 'claim-mipt-observer-algebra',
      evidenceType: 'source_reconstruction',
      status: 'supports',
      summary: 'Source backtrace keeps the algebraic split analogy explicit and bounded.',
      supportsOutputs: ['source reconstruction'],
      sourceRefs: ['reference_location:algebra-paper-section'],
    });
    const checkpoint = await bridge.requestHumanCheckpoint({
      topicId: 'qg-algebra-mipt',
      claimId: 'claim-mipt-observer-algebra',
      reason: 'Trust boundary before updating claim status from exploratory to supported.',
      requestedBy: 'hakimi',
      options: ['keep exploratory', 'approve source-supported transition'],
    });
    const preflight = await bridge.preflightTrustUpdate({
      action: 'change_claim_confidence',
      sessionId: 'session-qg-mipt',
      topicId: 'qg-algebra-mipt',
      claimId: 'claim-mipt-observer-algebra',
      requestedState: 'supported',
      sourceKind: 'typed_record',
      sourceRef: 'claim:claim-mipt-observer-algebra',
      evidenceRefs: ['evidence-algebra-source-chain'],
      rationale: 'Check AITP policy before any claim-trust update.',
      requestId: 'trust-request-qg-boundary',
    });

    expect(proof).toMatchObject({
      kind: 'proof_obligation',
      obligationId: 'proof-obligation-algebra-source-chain',
      canUpdateClaimTrust: false,
    });
    expect(evidence).toMatchObject({
      kind: 'evidence',
      evidenceId: 'evidence-algebra-source-chain',
      evidenceType: 'source_reconstruction',
      status: 'supports',
    });
    expect(checkpoint).toMatchObject({
      kind: 'human_checkpoint',
      checkpointId: 'checkpoint-qg-trust-boundary',
      status: 'requested',
    });
    expect(preflight).toMatchObject({
      kind: 'trust_update_preflight',
      requestId: 'trust-request-qg-boundary',
      preflightToken: 'trust-preflight-qg-boundary',
      mutationAllowedAfterPreflight: false,
      canUpdateKernelState: false,
    });
    expect(calls).toEqual([
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'graph',
          'slice',
          'session-qg-mipt',
          '--limit',
          '16',
          '--claim',
          'claim-mipt-observer-algebra',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'research-state',
          'create-proof-obligation',
          '--topic',
          'qg-algebra-mipt',
          '--claim',
          'claim-mipt-observer-algebra',
          '--statement',
          'Backtrace the algebraic split source chain before treating the observer analogy as supported.',
          '--type',
          'source_support',
          '--status',
          'open',
          '--maturity-level',
          'hypothesis',
          '--next-action',
          'follow source dependency back to the definition source',
          '--required-evidence',
          'source reconstruction',
          '--required-evidence',
          'definition provenance',
          '--proof-strategy',
          'trace von Neumann algebra split definition',
          '--proof-strategy',
          'compare with MIPT observer operational role',
          '--failure-mode',
          'analogy mistaken for derivation',
          '--source-ref',
          'source_asset:asset-algebra-paper',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'evidence',
          'record',
          '--topic',
          'qg-algebra-mipt',
          '--claim',
          'claim-mipt-observer-algebra',
          '--type',
          'source_reconstruction',
          '--status',
          'supports',
          '--summary',
          'Source backtrace keeps the algebraic split analogy explicit and bounded.',
          '--supports-output',
          'source reconstruction',
          '--source-ref',
          'reference_location:algebra-paper-section',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'checkpoint',
          'request',
          '--topic',
          'qg-algebra-mipt',
          '--claim',
          'claim-mipt-observer-algebra',
          '--reason',
          'Trust boundary before updating claim status from exploratory to supported.',
          '--requested-by',
          'hakimi',
          '--option',
          'keep exploratory',
          '--option',
          'approve source-supported transition',
        ],
      },
      {
        command: 'aitp-v5',
        args: [
          '--base',
          'F:/project',
          'trust',
          'preflight',
          'change_claim_confidence',
          '--session',
          'session-qg-mipt',
          '--topic',
          'qg-algebra-mipt',
          '--claim',
          'claim-mipt-observer-algebra',
          '--requested-state',
          'supported',
          '--source-kind',
          'typed_record',
          '--source-ref',
          'claim:claim-mipt-observer-algebra',
          '--evidence-ref',
          'evidence-algebra-source-chain',
          '--rationale',
          'Check AITP policy before any claim-trust update.',
          '--request-id',
          'trust-request-qg-boundary',
        ],
      },
    ]);
  });
});

function requiredBinding(
  bindings: readonly ResearchActionBinding[],
  actionId: string,
): ResearchActionBinding {
  const binding = bindings.find((item) => item.actionId === actionId);
  expect(binding).toBeDefined();
  return binding!;
}

function qgMiptSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-mipt-observer-algebra',
        type: 'claim',
        record: {
          statement: 'The MIPT observer role may be modeled by an algebraic split.',
          status: 'hypothesis',
          source_refs: ['source_asset:asset-algebra-paper'],
        },
      },
      {
        id: 'source_asset:asset-algebra-paper',
        kind: 'source_asset',
        asset_type: 'paper',
        title: 'Algebraic observer source',
        uri: 'arxiv:2601.00001',
      },
    ],
    edges: [
      {
        id: 'edge-algebra-observer',
        source: 'physics_object:object-von-neumann-algebra',
        target: 'physics_object:object-mipt-observer',
        relation: 'candidate_bridge',
        status: 'hypothesis',
      },
    ],
    open_obligations: [
      {
        obligation_id: 'obl-source-chain',
        claim_id: 'claim-mipt-observer-algebra',
        status: 'open',
        severity: 'blocking',
        obligation_type: 'source_support',
        statement:
          'Backtrace the algebraic split source chain before treating the observer analogy as supported.',
        next_action: 'follow source dependency back to the definition source',
        suggested_moments: ['backtrace_source_reconstruction'],
        source_refs: ['source_asset:asset-algebra-paper'],
      },
    ],
    source_backtrace: [
      {
        id: 'backtrace-algebra-split',
        claim_id: 'claim-mipt-observer-algebra',
        missing_components: ['reference_location', 'definition_source'],
        complete: false,
        source_asset_ids: ['asset-algebra-paper'],
        reason: 'source gap before source trust',
      },
    ],
    relation_neighborhood: [
      {
        relation_id: 'rel-algebra-observer',
        status: 'hypothesis',
        relation_type: 'candidate_bridge',
        subject_id: 'object-von-neumann-algebra',
        object_id: 'object-mipt-observer',
      },
    ],
    exploratory_records: [
      {
        record_id: 'explore-qg-path',
        exploration_type: 'relation_path_brainstorm',
        title: 'Trace algebra to observer relation',
        focal_question:
          'Can the algebraic split and observer role share a definition path?',
        original_question:
          'Does quantum-gravity algebra clarify the observer role in MIPT?',
        local_question:
          'Which source defines the split needed for the observer analogy?',
        status: 'active',
        object_ids: ['object-von-neumann-algebra', 'object-mipt-observer'],
        relation_ids: ['rel-algebra-observer'],
        candidate_paths: [
          'von Neumann algebra -> split property -> observer factorization',
        ],
        unresolved_points: ['which theorem carries the split assumption'],
        next_actions: ['open source dependency backtrace'],
      },
    ],
    trust_boundary_reasons: [
      'Claim trust cannot be updated until source dependency and human decision are recorded.',
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
          target_id: 'obl-source-chain',
          target_refs: [
            'claim:claim-mipt-observer-algebra',
            'obligation:obl-source-chain',
          ],
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
              target_id: 'obl-source-chain',
              required_fields: ['topic_id', 'claim_id', 'evidence_type', 'status', 'summary'],
              draft: {
                topic_id: 'qg-algebra-mipt',
                claim_id: 'claim-mipt-observer-algebra',
                evidence_type: 'proof_obligation_resolution',
                status: 'supports',
                summary: '<source-grounded evidence summary>',
                source_refs: ['source_asset:asset-algebra-paper'],
                reasoning_moves: [
                  'source dependency backtrace',
                  'bidirectional definition backtrace',
                ],
                backtrace_targets: [
                  'claim:claim-mipt-observer-algebra',
                  'source_asset:asset-algebra-paper',
                ],
                definition_boundary_questions: [
                  'Which algebraic split definition is being imported into the MIPT analogy?',
                ],
                source_dependency_questions: [
                  'Which source chain fixes the observer-role algebra convention?',
                ],
                original_question_guard: [
                  'Keep the source backtrace tied to whether the observer analogy is justified.',
                ],
              },
              draft_schema: {
                required_fields: ['topic_id', 'claim_id', 'evidence_type', 'status', 'summary'],
                placeholder_fields: ['summary'],
                placeholder_values: { summary: '<source-grounded evidence summary>' },
                host_must_resolve: ['summary'],
                field_case: 'snake_case',
                summary_inputs_trusted: false,
                can_update_claim_trust: false,
              },
              orientation_only: true,
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
              lifecycle_phases: ['pre_final'],
              trigger_conditions: ['draft evidence would resolve source-support gap'],
            },
          ],
          required_before_trust_change: [
            'record typed evidence or validation for the open obligation',
            'run aitp_v5_preflight_trust_update',
          ],
          lifecycle_phases: ['pre_final'],
          trigger_conditions: ['source-support proof obligation must be recorded'],
          recording_threshold: 'before final answer treats observer analogy as checked',
          trust_boundary_inputs: {
            target_refs: ['proof_obligation:obl-source-chain'],
            claim_id: 'claim-mipt-observer-algebra',
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
          recommended_host_behavior: ['surface evidence write before final response'],
          trust_boundary: true,
          orientation_only: true,
          can_update_claim_trust: false,
        },
        {
          moment: 'trust_boundary_before_claim_update',
          decision_type: 'trust_boundary',
          action_kind: 'block_trust_change_until_policy_prerequisites_are_met',
          required_now: true,
          reason: 'recording, brainstorming, or backtrace prerequisites exist before any claim-trust update',
          target_type: 'claim',
          target_id: 'claim-mipt-observer-algebra',
          missing_components: [],
          record_entrypoints: [],
          exploration_entrypoints: [],
          entrypoints: ['aitp_v5_preflight_trust_update'],
          required_before_trust_change: [
            'resolve required recording/backtrace/brainstorm policy decisions',
            'run aitp_v5_preflight_trust_update',
          ],
          lifecyclePhases: ['pre_final'],
          triggerConditions: ['claim trust update would be implied'],
          recordingThreshold: 'before checked or validated final status',
          trustBoundaryInputs: {
            targetRefs: ['claim:claim-mipt-observer-algebra'],
            claimId: 'claim-mipt-observer-algebra',
            entrypoints: ['aitp_v5_preflight_trust_update'],
            requiredBeforeTrustChange: [
              'resolve required recording/backtrace/brainstorm policy decisions',
              'run aitp_v5_preflight_trust_update',
            ],
            requiresPreflight: true,
            finalGateRequired: true,
          },
          recommendedHostBehavior: ['request human checkpoint before trust update'],
          trust_boundary: true,
          orientation_only: true,
          can_update_claim_trust: false,
        },
      ],
      recommended_moments: [],
      trust_boundary_reasons: [
        'Claim trust cannot be updated until source dependency and human decision are recorded.',
      ],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    recommended_moments: [
      {
        moment: 'record_or_validate_open_obligation',
        priority: 'blocking',
        reason: 'The source-support gap should become an explicit typed obligation.',
        target_refs: [
          'claim:claim-mipt-observer-algebra',
          'obligation:obl-source-chain',
        ],
        timing: 'after_brainstorm_before_derivation',
        trust_boundary: 'source_support',
      },
      {
        moment: 'human_checkpoint',
        priority: 'high',
        reason: 'A human should decide whether the claim can leave exploratory status.',
        target_refs: ['claim:claim-mipt-observer-algebra'],
        timing: 'before_trust_update',
        trust_boundary: 'human_checkpoint',
      },
    ],
  };
}
