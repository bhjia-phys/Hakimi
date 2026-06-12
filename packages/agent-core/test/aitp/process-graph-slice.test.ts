import { describe, expect, it } from 'vitest';

import {
  ResearchMomentDetector,
  compileAitpProcessGraphSlice,
  detectAitpCuratedRagMoment,
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

  it('projects route_state into context and non-blocking route recommendations', () => {
    const compiled = compileAitpProcessGraphSlice(routeStateSlicePayload());
    const actionById = new Map(
      compiled.actionRecommendations.map((binding) => [binding.actionId, binding]),
    );

    expect(compiled.routes.live.map((item) => item.id)).toEqual(['route-live']);
    expect(compiled.routes.blocked.map((item) => item.id)).toEqual(['route-blocked']);
    expect(compiled.routes.abandoned.map((item) => item.id)).toEqual(['route-abandoned']);
    expect(compiled.routes.pivotRequired.map((item) => item.id)).toEqual(['route-live']);
    expect(compiled.contextLines.join('\n')).toContain('Active route: research_route:route-live');
    expect(compiled.contextLines.join('\n')).toContain('Live routes: route-live [live]');
    expect(compiled.contextLines.join('\n')).toContain('Blocked routes: route-blocked [blocked]');
    expect(compiled.contextLines.join('\n')).toContain('Abandoned routes: route-abandoned [abandoned]');
    expect(compiled.contextLines.join('\n')).toContain('Pivot-required routes: route-live [live]');
    expect(actionById.get('aitp.record_route_choice')).toMatchObject({
      priority: 'normal',
      params: {
        routeState: {
          routes: expect.arrayContaining([
            expect.objectContaining({
              id: 'route-live',
              status: 'live',
              active: true,
              pivotRequired: true,
            }),
          ]),
        },
      },
    });
    expect(actionById.get('aitp.record_failed_route_lesson')).toMatchObject({
      priority: 'high',
      params: {
        routeState: {
          routes: expect.arrayContaining([
            expect.objectContaining({ id: 'route-blocked', status: 'blocked' }),
          ]),
        },
      },
    });
    expect(actionById.get('aitp.checkpoint_before_route_switch')).toMatchObject({
      priority: 'high',
      params: {
        routeState: {
          routes: expect.arrayContaining([
            expect.objectContaining({ id: 'route-live', status: 'live', pivotRequired: true }),
          ]),
        },
      },
    });
    expect(compiled.callObligations).toEqual([]);
    expect(compiled.actionRecommendations.map((binding) => binding.priority)).not.toContain('blocking');
  });

  it('keeps route moment policy non-blocking unless AITP marks trust/final prerequisites', () => {
    const compiled = compileAitpProcessGraphSlice(routePolicySlicePayload());
    const ordinary = compiled.callObligations.find((item) =>
      item.actionId === 'aitp.record_route_choice',
    );
    const finalGate = compiled.callObligations.find((item) =>
      item.actionId === 'aitp.checkpoint_before_route_switch',
    );

    expect(ordinary).toMatchObject({
      requiredNow: false,
      trustBoundary: false,
      finalGateRequired: false,
    });
    expect(finalGate).toMatchObject({
      requiredNow: true,
      trustBoundary: true,
      finalGateRequired: true,
      requiredBeforeTrustChange: ['checkpoint pivot route before changing claim trust'],
    });
    expect(
      compiled.actionRecommendations.find((binding) =>
        binding.actionId === 'aitp.record_route_choice',
      )?.priority,
    ).toBe('high');
    expect(
      compiled.actionRecommendations.find((binding) =>
        binding.actionId === 'aitp.checkpoint_before_route_switch',
      )?.priority,
    ).toBe('blocking');
    expect(compiled.contextLines.join('\n')).toContain(
      'AITP trust prerequisites: aitp.checkpoint_before_route_switch before trust change',
    );
    expect(compiled.contextLines.join('\n')).toContain('AITP required calls now: aitp.checkpoint_before_route_switch');
    expect(compiled.contextLines.join('\n')).not.toContain('AITP required calls now: aitp.record_route_choice');
  });

  it('detects curated RAG moments for conceptual and source-oriented prompts', () => {
    const moment = detectAitpCuratedRagMoment({
      prompt: [
        {
          type: 'text',
          text: '请从头解释这个文献来源回溯思路，并给一点 lecture 背景。',
        },
      ],
      workFrame: {
        id: 'frame.rag',
        domain: 'topological-order/fqhe-cs',
        topic: 'fqhe-source-backtrace',
        goal: 'Orient source dependency work before claim support.',
        trustState: 'exploratory',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        sourceRefs: [],
        openObligationIds: [],
      },
    });

    expect(moment).toMatchObject({
      resultRole: 'heuristic_context',
      readSurfaceEffect: 'orientation_only',
      reasons: expect.arrayContaining([
        'conceptual_scaffolding',
        'literature_orientation',
        'source_backtrace_suggestions',
      ]),
    });
    expect(moment?.query).toContain('fqhe-source-backtrace');
    expect(moment?.query).toContain('rag_use:');
    expect(moment?.query).toContain('physics_hints:');
    expect(moment?.query).toContain('physics-object-discovery');
    expect(moment?.query).toContain('open lecture notes');
  });

  it('adds physics-object hints to curated RAG queries for boundary massive matter topics', () => {
    const moment = detectAitpCuratedRagMoment({
      prompt: [
        {
          type: 'text',
          text:
            'Explain the right setup for massive matter in AdS with a cutoff wall, random detector bath, survival, hitting time, and energy flux.',
        },
      ],
      workFrame: {
        id: 'frame.ads-motion',
        domain: 'theoretical-physics/general',
        topic: 'ads-random-boundary-massive-matter',
        goal: 'Find the key physical objects before using normal modes as diagnostics.',
        trustState: 'exploratory',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        sourceRefs: [],
        openObligationIds: [],
      },
    });

    expect(moment).toMatchObject({
      resultRole: 'heuristic_context',
      readSurfaceEffect: 'orientation_only',
      reasons: expect.arrayContaining(['conceptual_scaffolding']),
    });
    expect(moment?.query).toContain('physics_hints:');
    expect(moment?.query).toContain('ads-cft');
    expect(moment?.query).toContain('massive matter');
    expect(moment?.query).toContain('cutoff wall');
    expect(moment?.query).toContain('survival probability');
    expect(moment?.query).toContain('hitting time');
    expect(moment?.query).toContain('energy flux');
    expect(moment?.query).toContain('spectral diagnostic auxiliary');
  });

  it('does not detect curated RAG moments for plain implementation prompts', () => {
    const moment = detectAitpCuratedRagMoment({
      prompt: [{ type: 'text', text: 'Continue the runtime implementation.' }],
      workFrame: {
        id: 'frame.runtime',
        domain: 'agent-runtime',
        topic: 'bridge-wiring',
        goal: 'Implement a narrow bridge change.',
        trustState: 'exploratory',
        activeObjectIds: [],
        assumptionIds: [],
        conventionIds: [],
        sourceRefs: [],
        openObligationIds: [],
      },
    });

    expect(moment).toBeUndefined();
  });

  it('projects AITP provenance gaps into non-blocking source, code, tool, and artifact actions', () => {
    const compiled = compileAitpProcessGraphSlice(provenanceGapSlicePayload());
    const actionById = new Map(
      compiled.actionRecommendations.map((binding) => [binding.actionId, binding]),
    );

    expect(compiled.provenance.all.map((item) => item.id)).toEqual([
      'gap-reference-location',
      'gap-source-hash',
      'gap-code-state',
      'gap-tool-run',
      'gap-benchmark-artifact',
    ]);
    expect(compiled.provenance.code.map((item) => item.id)).toEqual(['gap-code-state']);
    expect(compiled.provenance.artifact.map((item) => item.id)).toEqual([
      'gap-benchmark-artifact',
    ]);
    expect(compiled.sourceAssets.all.map((item) => item.id)).toEqual([
      'source-asset-edge-counting',
      'source-asset-edge-counting-copy',
    ]);
    expect(compiled.sourceAssets.missingHash.map((item) => item.id)).toEqual([
      'source-asset-edge-counting',
    ]);
    expect(compiled.sourceAssets.duplicateHash.map((item) => item.id)).toEqual([
      'source-asset-edge-counting-copy',
    ]);
    expect(compiled.sourceAssets.withReferences.map((item) => item.id)).toEqual([
      'source-asset-edge-counting',
    ]);
    expect(compiled.sourceStackCoverage.all.map((item) => item.claimId)).toEqual([
      'claim-fqhe',
    ]);
    expect(compiled.sourceStackCoverage.evidenceGaps.map((item) => item.claimId)).toEqual([
      'claim-fqhe',
    ]);
    expect(compiled.sourceStackCoverage.reconstructionGaps.map((item) => item.claimId)).toEqual([
      'claim-fqhe',
    ]);
    expect(compiled.sourceStackCoverage.reviewGaps).toEqual([]);
    expect(compiled.sourceStackCoverage.nextActions).toEqual([
      'record_evidence_for_required_outputs:claim-fqhe',
      'complete_source_reconstruction:claim-fqhe',
      'review_source_reconstruction:claim-fqhe',
    ]);
    expect(compiled.sourceReconstructionReview.all.map((item) => item.claimId)).toEqual([
      'claim-fqhe',
    ]);
    expect(compiled.sourceReconstructionReview.pending.map((item) => item.claimId)).toEqual([
      'claim-fqhe',
    ]);
    expect(compiled.sourceReconstructionReview.openReviewClaimIds).toEqual(['claim-fqhe']);
    expect(compiled.sourceReconstructionReview.reviewPacketClaimIds).toEqual(['claim-fqhe']);
    expect(compiled.sourceReconstructionReview.nextActions).toEqual([
      'source_reconstruction_review:claim-fqhe',
    ]);
    expect(compiled.contextLines.join('\n')).toContain(
      'Provenance gaps: gap-reference-location [reference_location_missing/source]',
    );
    expect(compiled.contextLines.join('\n')).toContain('Code provenance gaps: gap-code-state');
    expect(compiled.contextLines.join('\n')).toContain(
      'Source asset index: source_asset:source-asset-edge-counting [paper/missing]',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source assets missing hashes: source-asset-edge-counting',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source assets with duplicate hashes: source-asset-edge-counting-copy',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source stack coverage: claim-fqhe [evidence_gap/guided]',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source stack evidence gaps: claim-fqhe',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source stack reconstruction gaps: claim-fqhe',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source stack next actions: record_evidence_for_required_outputs:claim-fqhe',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source reconstruction review: claim-fqhe [pending/incomplete]',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source reconstruction review open: claim-fqhe',
    );
    expect(compiled.contextLines.join('\n')).toContain(
      'Source reconstruction review next actions: source_reconstruction_review:claim-fqhe',
    );
    expect(compiled.actionRecommendations.map((binding) => binding.actionId)).toEqual(
      expect.arrayContaining([
        'aitp.record_reference_location',
        'aitp.capture_source_asset_auto',
        'aitp.register_source_asset',
        'aitp.capture_code_state_auto',
        'code.capture_git_diff_observation',
        'aitp.capture_tool_run_auto',
        'aitp.record_tool_run',
        'aitp.attach_artifact_auto',
        'aitp.attach_artifact',
      ]),
    );
    expect(actionById.get('aitp.capture_source_asset_auto')).toMatchObject({
      priority: 'high',
      params: {
        provenanceGap: {
          id: 'gap-source-hash',
          gapType: 'source_asset_hash_missing',
          requiredNow: false,
          requiredBeforeTrustChange: false,
          strictBoundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        },
        lifecycleTrigger: {
          trustBoundaryInputs: {
            finalGateRequired: false,
            requiredBeforeTrustChange: [],
            entrypoints: expect.arrayContaining(['aitp_v5_capture_source_asset_auto']),
          },
        },
        writeBridge: {
          operation: 'captureSourceAssetAuto',
          entrypointKey: 'capture_source_asset_auto',
          mcpTool: 'aitp_v5_capture_source_asset_auto',
          cliFallback: 'aitp-v5 asset capture-auto <args>',
          surface: 'source_asset_record',
          cli: 'aitp-v5 asset capture-auto',
          payloadDraft: {
            path: '<local source file path>',
            topicId: 'fqhe',
            claimId: 'claim-fqhe',
            assetType: 'paper',
            title: 'Edge counting source',
            linkedRecords: { claimId: 'claim-fqhe' },
          },
          payloadDraftSchema: {
            requiredFields: ['path', 'topicId'],
            placeholderFields: ['path'],
            placeholderValues: { path: '<local source file path>' },
            hostMustResolve: ['path'],
            fieldCase: 'camelCase',
            sourceFieldCase: 'snake_case',
            summaryInputsTrusted: false,
            canUpdateClaimTrust: false,
          },
          payloadHint: {
            entrypoint: 'aitp_v5_capture_source_asset_auto',
            recordAction: 'capture_source_asset_auto',
            orientationOnly: true,
            canUpdateClaimTrust: false,
          },
        },
      },
    });
    expect(actionById.get('aitp.capture_code_state_auto')).toMatchObject({
      priority: 'high',
      params: {
        provenanceGap: {
          id: 'gap-code-state',
          gapType: 'code_state_missing',
          requiredNow: false,
          requiredBeforeTrustChange: false,
          strictBoundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        },
        provenanceGaps: expect.arrayContaining([
          expect.objectContaining({ id: 'gap-code-state' }),
        ]),
        lifecycleTrigger: {
          trustBoundaryInputs: {
            finalGateRequired: false,
            requiredBeforeTrustChange: [],
            entrypoints: expect.arrayContaining(['aitp_v5_capture_code_state_auto']),
          },
        },
        writeBridge: {
          operation: 'captureCodeStateAuto',
          cli: 'aitp-v5 code state auto',
          payloadDraft: {
            worktreePath: '<local worktree path>',
            repoId: 'librpa',
            topicId: 'gw',
            claimId: 'claim-gw',
            linkedRecords: { claimId: 'claim-gw' },
            writePatchArtifact: true,
          },
          payloadDraftSchema: {
            requiredFields: ['worktreePath'],
            placeholderFields: ['worktreePath'],
            placeholderValues: { worktreePath: '<local worktree path>' },
            hostMustResolve: ['worktreePath'],
            fieldCase: 'camelCase',
          },
          payloadHint: {
            entrypoint: 'aitp_v5_capture_code_state_auto',
            recordAction: 'capture_code_state_auto',
            orientationOnly: true,
            canUpdateClaimTrust: false,
          },
        },
      },
    });
    expect(actionById.get('code.capture_git_diff_observation')).toMatchObject({
      priority: 'high',
      params: {
        provenanceGap: expect.objectContaining({ id: 'gap-code-state' }),
      },
    });
    expect(actionById.get('aitp.capture_tool_run_auto')).toMatchObject({
      priority: 'high',
      params: {
        provenanceGap: expect.objectContaining({ id: 'gap-tool-run' }),
        writeBridge: {
          operation: 'captureToolRunAuto',
          entrypointKey: 'capture_tool_run_auto',
          mcpTool: 'aitp_v5_capture_tool_run_auto',
          cliFallback: 'aitp-v5 tool run capture-auto <args>',
          payloadDraft: {
            path: '<local tool transcript or result file path>',
            recipeId: 'recipe-gw-benchmark',
            toolFamily: 'benchmark',
            toolName: 'gw-reference-check',
            topicId: 'gw',
            claimId: 'claim-gw',
            evidenceStatus: 'unreviewed',
            sourceRefs: ['validation_result:validation-result-gw'],
          },
          payloadDraftSchema: {
            requiredFields: ['path', 'recipeId', 'toolFamily', 'toolName', 'topicId', 'claimId'],
            placeholderFields: ['path'],
            placeholderValues: { path: '<local tool transcript or result file path>' },
            hostMustResolve: ['path'],
            sourceFieldCase: 'snake_case',
          },
          payloadHint: {
            entrypoint: 'aitp_v5_capture_tool_run_auto',
            recordAction: 'capture_tool_run_auto',
          },
        },
      },
    });
    expect(actionById.get('aitp.record_tool_run')).toMatchObject({
      priority: 'high',
      params: {
        provenanceGap: expect.objectContaining({ id: 'gap-tool-run' }),
        writeBridge: {
          operation: 'recordToolRun',
        },
      },
    });
    expect(actionById.get('aitp.attach_artifact_auto')).toMatchObject({
      priority: 'high',
      params: {
        provenanceGap: expect.objectContaining({ id: 'gap-benchmark-artifact' }),
        writeBridge: {
          operation: 'attachArtifactAuto',
          entrypointKey: 'attach_artifact_auto',
          mcpTool: 'aitp_v5_attach_artifact_auto',
          cliFallback: 'aitp-v5 research-state attach-artifact-auto <args>',
          cli: 'aitp-v5 research-state attach-artifact-auto',
          requiredFields: ['path', 'topicId', 'claimId', 'artifactType', 'summary'],
          payloadDraft: {
            path: '<local artifact file path>',
            topicId: 'gw',
            claimId: 'claim-gw',
            artifactType: 'benchmark_log',
            summary: 'benchmark run has no artifact reference',
            metadata: { targetType: 'tool_run', targetId: 'tool-run-gw' },
          },
          payloadHint: {
            entrypoint: 'aitp_v5_attach_artifact_auto',
            recordAction: 'attach_artifact_auto',
            orientationOnly: true,
            canUpdateClaimTrust: false,
          },
        },
      },
    });
    expect(actionById.get('aitp.attach_artifact')).toMatchObject({
      priority: 'high',
      params: {
        provenanceGap: expect.objectContaining({ id: 'gap-benchmark-artifact' }),
        writeBridge: {
          operation: 'attachArtifact',
          cli: 'aitp-v5 research-state attach-artifact',
          requiredFields: ['topicId', 'claimId', 'artifactType', 'uri', 'summary'],
          payloadDraft: {
            topicId: 'gw',
            claimId: 'claim-gw',
            artifactType: 'benchmark_log',
            uri: '<artifact URI>',
            summary: 'benchmark run has no artifact reference',
            metadata: { targetType: 'tool_run', targetId: 'tool-run-gw' },
          },
        },
      },
    });
    expect(compiled.actionRecommendations.map((binding) => binding.priority)).not.toContain('blocking');
    expect(compiled.callObligations).toEqual([]);
    expect(compiled.reminders.join('\n')).toContain(
      'Capture source, code, tool-run, and artifact provenance before reusing',
    );
    expect(compiled.reminders.join('\n')).toContain(
      'Use AITP source asset index hash status before reusing raw papers',
    );
    expect(compiled.reminders.join('\n')).toContain(
      'Use AITP source stack coverage before treating source reconstruction',
    );
    expect(compiled.reminders.join('\n')).toContain(
      'Use AITP source reconstruction review status and review packets',
    );
    expect(compiled.diagnostics).toContain('source-asset-index-present');
    expect(compiled.diagnostics).toContain('source-stack-coverage-present');
    expect(compiled.diagnostics).toContain('source-stack-coverage-gaps-present');
    expect(compiled.diagnostics).toContain('source-reconstruction-review-present');
    expect(compiled.diagnostics).toContain('source-reconstruction-review-open');
  });

  it('projects source reconstruction review result work into an AITP write-bridge action', () => {
    const payload = provenanceGapSlicePayload();
    payload.source_reconstruction_review = {
      ...payload.source_reconstruction_review,
      items: payload.source_reconstruction_review.items.map((item) => ({
        ...item,
        review_status: 'inconclusive',
        next_actions: ['record_source_reconstruction_review_result'],
      })),
      next_actions: ['record_source_reconstruction_review_result'],
    };

    const compiled = compileAitpProcessGraphSlice(payload);
    const reviewResult = compiled.actionRecommendations.find(
      (binding) => binding.actionId === 'aitp.record_source_reconstruction_review_result',
    );

    expect(compiled.sourceReconstructionReview.inconclusiveClaimIds).toEqual([
      'claim-fqhe',
    ]);
    expect(reviewResult).toMatchObject({
      priority: 'high',
      objectRefs: ['claim:claim-fqhe'],
      params: {
        writeBridge: {
          operation: 'recordSourceReconstructionReviewResult',
          cli: 'aitp-v5 source reconstruction-review-result',
          requiredFields: expect.arrayContaining([
            'claimId',
            'status',
            'reviewedComponents',
            'summary',
          ]),
          targetRefs: ['claim:claim-fqhe'],
        },
      },
    });
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
        'aitp.run_trust_preflight',
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
        'aitp.run_trust_preflight',
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
        entrypointKey: 'record_evidence',
        mcpTool: 'aitp_v5_record_evidence',
        cliFallback: 'aitp-v5 evidence record <args>',
        surface: 'evidence_record',
        preferredTransport: 'mcp',
        fallbackTransport: 'cli',
        stateEffect: 'typed_record_write',
        claimTrustMutation: 'none',
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
    expect(compiled.actionRecommendations.find((binding) =>
      binding.actionId === 'aitp.run_trust_preflight',
    )?.params).toMatchObject({
      callObligation: {
        entrypoints: ['aitp_v5_preflight_trust_update'],
        lifecycleTrigger: {
          trustBoundaryInputs: {
            requiresPreflight: true,
            finalGateRequired: true,
          },
        },
      },
      writeBridge: {
        operation: 'preflightTrustUpdate',
        entrypointKey: 'trust_preflight',
        mcpTool: 'aitp_v5_preflight_trust_update',
        cliFallback: 'aitp-v5 trust preflight <args>',
        surface: 'trust_update_preflight',
        preferredTransport: 'mcp',
        fallbackTransport: 'cli',
        stateEffect: 'preflight_only',
        claimTrustMutation: 'none',
        cli: 'aitp-v5 trust preflight',
        canUpdateClaimTrust: false,
        canUpdateKernelState: false,
        payloadDraft: {
          action: 'change_claim_confidence',
          sessionId: 'session-fqhe',
          topicId: 'fqhe',
          claimId: 'claim-fqhe',
          requestedState: '<requested claim confidence state>',
          sourceKind: 'typed_record',
          sourceRef: 'claim:claim-fqhe',
        },
        payloadHint: {
          entrypoint: 'aitp_v5_preflight_trust_update',
          recordAction: 'preflight_trust_update',
          orientationOnly: true,
          canUpdateClaimTrust: false,
        },
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

    expect(byActionId.get('aitp.run_trust_preflight')).toMatchObject({
      priority: 'blocking',
    });
    expect(byActionId.get('aitp.request_human_checkpoint')).toMatchObject({
      priority: 'high',
    });
    expect(compiled.actionRecommendations.map((binding) => binding.actionId)).toEqual(
      expect.arrayContaining([
        'aitp.record_research_state',
        'aitp.request_human_checkpoint',
        'aitp.run_trust_preflight',
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

function routeStateSlicePayload() {
  return {
    kind: 'process_graph_slice',
    nodes: [],
    edges: [],
    open_obligations: [],
    source_backtrace: [],
    relation_neighborhood: [],
    exploratory_records: [],
    route_state: {
      active_route_id: 'route-live',
      routes: [
        {
          route_id: 'route-live',
          topic_id: 'qg-route',
          claim_id: 'claim-route',
          session_id: 'session-route',
          title: 'Use source-first derivation',
          route_type: 'source_backtrace',
          status: 'live',
          active: true,
          rationale: 'Follow sources before algebra.',
          current_question: 'Which source fixes the lemma?',
          summary: 'Follow sources before algebra.',
          next_action: 'record why this route is live',
          parent_route_ids: ['route-blocked'],
          pivot_reason: 'direct proof is blocked by a missing lemma',
        },
        {
          route_id: 'route-blocked',
          topic_id: 'qg-route',
          claim_id: 'claim-route',
          title: 'Direct proof route',
          route_type: 'derivation',
          status: 'blocked',
          rationale: 'Try direct proof before source reconstruction.',
          reason: 'missing lemma',
          failure_modes: ['lemma not located'],
          lesson: 'Need the source lemma before retrying.',
        },
        {
          route_id: 'route-abandoned',
          topic_id: 'qg-route',
          claim_id: 'claim-route',
          title: 'Numerical shortcut',
          route_type: 'benchmark_validation',
          status: 'abandoned',
          rationale: 'Use numerical analogy as a shortcut.',
          lesson: 'Only provides analogy, not derivation.',
        },
      ],
      live_route_ids: ['route-live'],
      blocked_route_ids: ['route-blocked'],
      abandoned_route_ids: ['route-abandoned'],
      pivot_required_route_ids: ['route-live'],
      orientation_only: true,
      can_update_claim_trust: false,
    },
    trust_boundary_reasons: [],
    recommended_moments: [],
    moment_policy: {
      kind: 'host_agnostic_moment_policy',
      decisions: [],
      recommended_moments: [],
    },
    truth_source: 'typed_records',
    orientation_only: true,
  };
}

function routePolicySlicePayload() {
  return {
    ...routeStateSlicePayload(),
    moment_policy: {
      kind: 'host_agnostic_moment_policy',
      decisions: [
        {
          moment: 'record_route_choice',
          decision_type: 'recording',
          action_kind: 'record_route_choice',
          required_now: true,
          reason: 'live route should be recorded as route process context',
          target_type: 'research_route',
          target_id: 'route-live',
          target_refs: ['research_route:route-live'],
          trust_boundary: true,
        },
        {
          moment: 'checkpoint_before_route_switch',
          decision_type: 'recording',
          action_kind: 'checkpoint_before_route_switch',
          required_now: true,
          reason: 'route pivot affects claim trust',
          target_type: 'research_route',
          target_id: 'route-live',
          target_refs: ['research_route:route-live'],
          required_before_trust_change: [
            'checkpoint pivot route before changing claim trust',
          ],
          trust_boundary: true,
          lifecycle_phases: ['pre_final'],
          trust_boundary_inputs: {
            target_refs: ['research_route:route-live'],
            required_before_trust_change: [
              'checkpoint pivot route before changing claim trust',
            ],
            final_gate_required: true,
          },
        },
      ],
      recommended_moments: [],
    },
  };
}

function provenanceGapSlicePayload() {
  return {
    kind: 'process_graph_slice',
    nodes: [],
    edges: [],
    open_obligations: [],
    source_backtrace: [],
    relation_neighborhood: [],
    exploratory_records: [],
    route_state: {
      routes: [],
      live_route_ids: [],
      blocked_route_ids: [],
      abandoned_route_ids: [],
      pivot_required_route_ids: [],
    },
    provenance_gaps: [
      {
        gap_id: 'gap-reference-location',
        gap_type: 'reference_location_missing',
        provenance_kind: 'source',
        reason: 'claim cites a source without a precise reference location',
        topic_id: 'fqhe',
        claim_id: 'claim-fqhe',
        target_type: 'claim',
        target_id: 'claim-fqhe',
        target_refs: ['claim:claim-fqhe'],
        recommended_actions: ['aitp.record_reference_location'],
        recommended_entrypoints: ['aitp_v5_record_reference_location'],
        severity: 'recommended',
        required_now: false,
        required_before_trust_change: false,
        strict_boundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        blocking_when_used_as: ['evidence_basis', 'checked_conclusion'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
      {
        gap_id: 'gap-source-hash',
        gap_type: 'source_asset_hash_missing',
        provenance_kind: 'source',
        reason: 'source asset lacks a content hash',
        topic_id: 'fqhe',
        claim_id: 'claim-fqhe',
        target_type: 'source_asset',
        target_id: 'source-asset-edge-counting',
        target_refs: ['source_asset:source-asset-edge-counting'],
        recommended_actions: ['aitp.capture_source_asset_auto', 'aitp.register_source_asset'],
        recommended_entrypoints: [
          'aitp_v5_capture_source_asset_auto',
          'aitp_v5_register_source_asset',
        ],
        payload_hints: [
          {
            entrypoint: 'aitp_v5_capture_source_asset_auto',
            record_action: 'capture_source_asset_auto',
            action_kind: 'capture_provenance_gap',
            target_type: 'source_asset',
            target_id: 'source-asset-edge-counting',
            required_fields: ['path', 'topic_id'],
            draft: {
              path: '<local source file path>',
              topic_id: 'fqhe',
              claim_id: 'claim-fqhe',
              asset_type: 'paper',
              title: 'Edge counting source',
              source_kind: 'local_file_auto',
              summary: 'source asset lacks a content hash',
              linked_records: { claim_id: 'claim-fqhe' },
            },
            draft_schema: {
              required_fields: ['path', 'topic_id'],
              placeholder_fields: ['path'],
              placeholder_values: { path: '<local source file path>' },
              host_must_resolve: ['path'],
              field_case: 'snake_case',
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
            },
            lifecycle_phases: ['pre_action'],
            trigger_conditions: ['before using source asset as evidence'],
            recording_threshold: 'recommended_before_provenance_dependent_reuse',
            trust_boundary_inputs: {
              target_refs: ['source_asset:source-asset-edge-counting'],
              claim_id: 'claim-fqhe',
              entrypoints: ['aitp_v5_capture_source_asset_auto'],
              required_before_trust_change: [],
              requires_preflight: false,
              final_gate_required: false,
            },
            recommended_host_behavior: ['surface local source asset auto-capture hint'],
            orientation_only: true,
            summary_inputs_trusted: false,
            can_update_claim_trust: false,
          },
        ],
        severity: 'recommended',
        required_now: false,
        required_before_trust_change: false,
        strict_boundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        blocking_when_used_as: ['evidence_basis', 'memory_input'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
      {
        gap_id: 'gap-code-state',
        gap_type: 'code_state_missing',
        provenance_kind: 'code',
        reason: 'code-dependent claim has no git code state',
        topic_id: 'gw',
        claim_id: 'claim-gw',
        target_type: 'claim',
        target_id: 'claim-gw',
        target_refs: ['claim:claim-gw'],
        recommended_actions: ['aitp.capture_code_state_auto', 'aitp.record_code_state'],
        recommended_entrypoints: ['aitp_v5_capture_code_state_auto'],
        payload_hints: [
          {
            entrypoint: 'aitp_v5_capture_code_state_auto',
            record_action: 'capture_code_state_auto',
            action_kind: 'capture_provenance_gap',
            target_type: 'claim',
            target_id: 'claim-gw',
            required_fields: ['worktree_path'],
            draft: {
              worktree_path: '<local worktree path>',
              repo_id: 'librpa',
              topic_id: 'gw',
              claim_id: 'claim-gw',
              linked_records: { claim_id: 'claim-gw' },
              write_patch_artifact: true,
            },
            draft_schema: {
              required_fields: ['worktree_path'],
              placeholder_fields: ['worktree_path'],
              placeholder_values: { worktree_path: '<local worktree path>' },
              host_must_resolve: ['worktree_path'],
              field_case: 'snake_case',
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
            },
            lifecycle_phases: ['pre_action'],
            trigger_conditions: ['before using code-dependent claim as evidence'],
            recording_threshold: 'recommended_before_provenance_dependent_reuse',
            trust_boundary_inputs: {
              target_refs: ['claim:claim-gw'],
              claim_id: 'claim-gw',
              entrypoints: ['aitp_v5_capture_code_state_auto'],
              required_before_trust_change: [],
              requires_preflight: false,
              final_gate_required: false,
            },
            recommended_host_behavior: ['surface provenance payload hint'],
            orientation_only: true,
            summary_inputs_trusted: false,
            can_update_claim_trust: false,
          },
        ],
        severity: 'recommended',
        required_now: false,
        required_before_trust_change: false,
        strict_boundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        blocking_when_used_as: ['benchmark_basis', 'checked_conclusion'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
      {
        gap_id: 'gap-tool-run',
        gap_type: 'tool_run_missing',
        provenance_kind: 'tool',
        reason: 'validation output has no tool-run record',
        topic_id: 'gw',
        claim_id: 'claim-gw',
        target_type: 'validation_result',
        target_id: 'validation-result-gw',
        target_refs: ['validation_result:validation-result-gw'],
        recommended_actions: ['aitp.capture_tool_run_auto', 'aitp.record_tool_run'],
        recommended_entrypoints: ['aitp_v5_capture_tool_run_auto', 'aitp_v5_record_tool_run'],
        payload_hints: [
          {
            entrypoint: 'aitp_v5_capture_tool_run_auto',
            record_action: 'capture_tool_run_auto',
            action_kind: 'capture_provenance_gap',
            target_type: 'validation_result',
            target_id: 'validation-result-gw',
            required_fields: [
              'path',
              'recipe_id',
              'tool_family',
              'tool_name',
              'topic_id',
              'claim_id',
            ],
            draft: {
              path: '<local tool transcript or result file path>',
              recipe_id: 'recipe-gw-benchmark',
              tool_family: 'benchmark',
              tool_name: 'gw-reference-check',
              topic_id: 'gw',
              claim_id: 'claim-gw',
              evidence_status: 'unreviewed',
              source_refs: ['validation_result:validation-result-gw'],
              summary: 'validation output has no tool-run record',
            },
            draft_schema: {
              required_fields: [
                'path',
                'recipe_id',
                'tool_family',
                'tool_name',
                'topic_id',
                'claim_id',
              ],
              placeholder_fields: ['path'],
              placeholder_values: { path: '<local tool transcript or result file path>' },
              host_must_resolve: ['path'],
              field_case: 'snake_case',
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
            },
            lifecycle_phases: ['pre_action'],
            trigger_conditions: ['before reusing validation output'],
            recording_threshold: 'recommended_before_provenance_dependent_reuse',
            trust_boundary_inputs: {
              target_refs: ['validation_result:validation-result-gw'],
              claim_id: 'claim-gw',
              entrypoints: ['aitp_v5_capture_tool_run_auto'],
              required_before_trust_change: [],
              requires_preflight: false,
              final_gate_required: false,
            },
            recommended_host_behavior: ['surface local tool-run auto-capture hint'],
            orientation_only: true,
            summary_inputs_trusted: false,
            can_update_claim_trust: false,
          },
          {
            entrypoint: 'aitp_v5_record_tool_run',
            record_action: 'record_tool_run',
            action_kind: 'capture_provenance_gap',
            target_type: 'validation_result',
            target_id: 'validation-result-gw',
            required_fields: ['recipe_id', 'tool_family', 'tool_name', 'topic_id', 'claim_id'],
            draft: {
              recipe_id: 'recipe-gw-benchmark',
              tool_family: 'benchmark',
              tool_name: 'gw-reference-check',
              topic_id: 'gw',
              claim_id: 'claim-gw',
              evidence_status: 'unreviewed',
              source_refs: ['validation_result:validation-result-gw'],
            },
            lifecycle_phases: ['pre_action'],
            trigger_conditions: ['before reusing validation output'],
            recording_threshold: 'recommended_before_provenance_dependent_reuse',
            trust_boundary_inputs: {
              target_refs: ['validation_result:validation-result-gw'],
              claim_id: 'claim-gw',
              entrypoints: ['aitp_v5_record_tool_run'],
              required_before_trust_change: [],
              requires_preflight: false,
              final_gate_required: false,
            },
            recommended_host_behavior: ['surface provenance payload hint'],
            orientation_only: true,
            summary_inputs_trusted: false,
            can_update_claim_trust: false,
          },
        ],
        severity: 'recommended',
        required_now: false,
        required_before_trust_change: false,
        strict_boundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        blocking_when_used_as: ['validation_input'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
      {
        gap_id: 'gap-benchmark-artifact',
        gap_type: 'benchmark_artifact_missing',
        provenance_kind: 'artifact',
        reason: 'benchmark run has no artifact reference',
        topic_id: 'gw',
        claim_id: 'claim-gw',
        target_type: 'tool_run',
        target_id: 'tool-run-gw',
        target_refs: ['tool_run:tool-run-gw'],
        recommended_actions: ['aitp.attach_artifact_auto', 'aitp.attach_artifact'],
        recommended_entrypoints: ['aitp_v5_attach_artifact_auto', 'aitp_v5_attach_artifact'],
        payload_hints: [
          {
            entrypoint: 'aitp_v5_attach_artifact_auto',
            record_action: 'attach_artifact_auto',
            action_kind: 'capture_provenance_gap',
            target_type: 'tool_run',
            target_id: 'tool-run-gw',
            required_fields: ['path', 'topic_id', 'claim_id', 'artifact_type', 'summary'],
            draft: {
              path: '<local artifact file path>',
              topic_id: 'gw',
              claim_id: 'claim-gw',
              artifact_type: 'benchmark_log',
              summary: 'benchmark run has no artifact reference',
              metadata: { target_type: 'tool_run', target_id: 'tool-run-gw' },
            },
            lifecycle_phases: ['pre_action'],
            trigger_conditions: ['before reusing benchmark run'],
            recording_threshold: 'recommended_before_provenance_dependent_reuse',
            trust_boundary_inputs: {
              target_refs: ['tool_run:tool-run-gw'],
              claim_id: 'claim-gw',
              entrypoints: ['aitp_v5_attach_artifact_auto'],
              required_before_trust_change: [],
              requires_preflight: false,
              final_gate_required: false,
            },
            recommended_host_behavior: ['surface local artifact auto-attach hint'],
            orientation_only: true,
            summary_inputs_trusted: false,
            can_update_claim_trust: false,
          },
          {
            entrypoint: 'aitp_v5_attach_artifact',
            record_action: 'attach_artifact',
            action_kind: 'capture_provenance_gap',
            target_type: 'tool_run',
            target_id: 'tool-run-gw',
            required_fields: ['topic_id', 'claim_id', 'artifact_type', 'uri', 'summary'],
            draft: {
              topic_id: 'gw',
              claim_id: 'claim-gw',
              artifact_type: 'benchmark_log',
              uri: '<artifact URI>',
              summary: 'benchmark run has no artifact reference',
              metadata: { target_type: 'tool_run', target_id: 'tool-run-gw' },
            },
            lifecycle_phases: ['pre_action'],
            trigger_conditions: ['before reusing benchmark run'],
            recording_threshold: 'recommended_before_provenance_dependent_reuse',
            trust_boundary_inputs: {
              target_refs: ['tool_run:tool-run-gw'],
              claim_id: 'claim-gw',
              entrypoints: ['aitp_v5_attach_artifact'],
              required_before_trust_change: [],
              requires_preflight: false,
              final_gate_required: false,
            },
            recommended_host_behavior: ['surface provenance payload hint'],
            orientation_only: true,
            summary_inputs_trusted: false,
            can_update_claim_trust: false,
          },
        ],
        severity: 'recommended',
        required_now: false,
        required_before_trust_change: false,
        strict_boundary: 'before_using_as_evidence_validation_benchmark_memory_or_checked_conclusion',
        blocking_when_used_as: ['benchmark_basis'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
    ],
    source_asset_index: [
      {
        asset_id: 'source-asset-edge-counting',
        topic_id: 'fqhe',
        claim_id: 'claim-fqhe',
        asset_type: 'paper',
        uri: 'arxiv:2601.00001',
        title: 'Edge counting source asset',
        source_kind: 'literature',
        hash_status: 'missing',
        reference_location_ids: ['ref-edge-counting'],
        reference_locations: [
          {
            reference_location_id: 'ref-edge-counting',
            uri: 'arxiv:2601.00001#sec2',
            label: 'Section 2',
            location_type: 'paper_section',
            status: 'located',
          },
        ],
        provenance_gap_ids: ['gap-source-hash'],
        provenance_gap_types: ['source_asset_hash_missing'],
        target_refs: ['source_asset:source-asset-edge-counting'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
      {
        asset_id: 'source-asset-edge-counting-copy',
        topic_id: 'fqhe',
        claim_id: 'claim-fqhe',
        asset_type: 'paper',
        uri: 'file:edge-counting-copy.pdf',
        title: 'Edge counting duplicate',
        source_kind: 'literature',
        content_hash: 'sha256:abc123',
        hash_algorithm: 'sha256',
        hash_status: 'duplicate',
        duplicate_hash_diagnostics: {
          duplicate_hash: true,
          duplicate_of_asset_ids: ['source-asset-edge-counting'],
        },
        target_refs: ['source_asset:source-asset-edge-counting-copy'],
        orientation_only: true,
        can_update_claim_trust: false,
      },
    ],
    source_stack_coverage: {
      kind: 'source_stack_coverage_manifest',
      claim_count: 1,
      coverage_status_counts: {
        complete: 0,
        evidence_gap: 1,
        reconstruction_gap: 0,
        review_gap: 0,
      },
      missing_required_output_counts: {
        scoped_claim: 1,
        evidence_or_provenance: 1,
      },
      source_component_gap_counts: {
        reconstruction_path: 1,
      },
      source_review_status_counts: {
        pending: 1,
      },
      items: [
        {
          topic_id: 'fqhe',
          claim_id: 'claim-fqhe',
          claim_statement: 'Sector counting identifies the edge CFT.',
          risk_level: 'guided',
          required_outputs: ['scoped_claim', 'evidence_or_provenance'],
          satisfied_required_outputs: [],
          missing_required_outputs: ['scoped_claim', 'evidence_or_provenance'],
          evidence_ids_by_output: {
            scoped_claim: [],
            evidence_or_provenance: [],
          },
          source_reconstruction_complete: false,
          missing_source_components: ['reconstruction_path'],
          source_reconstruction_review_status: 'pending',
          latest_source_review_result_id: '',
          coverage_status: 'evidence_gap',
          next_actions: [
            'record_evidence_for_required_outputs:claim-fqhe',
            'complete_source_reconstruction:claim-fqhe',
            'review_source_reconstruction:claim-fqhe',
          ],
          can_update_claim_trust: false,
        },
      ],
      next_actions: [
        'record_evidence_for_required_outputs:claim-fqhe',
        'complete_source_reconstruction:claim-fqhe',
        'review_source_reconstruction:claim-fqhe',
      ],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    source_reconstruction_review: {
      kind: 'source_reconstruction_review_manifest',
      claim_count: 1,
      review_progress: {
        passed: 0,
        needs_revision: 0,
        inconclusive: 0,
        pending: 1,
      },
      items: [
        {
          topic_id: 'fqhe',
          claim_id: 'claim-fqhe',
          claim_statement: 'Sector counting identifies the edge CFT.',
          source_reconstruction_status: 'incomplete',
          missing_components: ['reconstruction_path'],
          review_status: 'pending',
          review_result_ids: [],
          latest_review_result: {},
          reviewed_components: [],
          remaining_actions: [],
          review_packet_cli: 'aitp-v5 source reconstruction-review --claim claim-fqhe',
          result_cli: 'aitp-v5 source reconstruction-review-result --claim claim-fqhe <args>',
          next_actions: ['source_reconstruction_review', 'complete_source_reconstruction'],
          can_update_claim_trust: false,
        },
      ],
      next_actions: ['source_reconstruction_review:claim-fqhe'],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
    trust_boundary_reasons: [],
    recommended_moments: [],
    moment_policy: {
      kind: 'host_agnostic_moment_policy',
      decisions: [],
      recommended_moments: [],
    },
    truth_source: 'typed_records',
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
          payload_hints: [
            {
              entrypoint: 'aitp_v5_preflight_trust_update',
              record_action: 'preflight_trust_update',
              action_kind: 'block_trust_change_until_policy_prerequisites_are_met',
              target_type: 'claim',
              target_id: 'claim-fqhe',
              required_fields: ['action', 'session_id', 'topic_id', 'claim_id'],
              draft: {
                action: 'change_claim_confidence',
                session_id: 'session-fqhe',
                topic_id: 'fqhe',
                claim_id: 'claim-fqhe',
                requested_state: '<requested claim confidence state>',
                source_kind: 'typed_record',
                source_ref: 'claim:claim-fqhe',
                rationale:
                  'Run AITP trust preflight before treating claim:claim-fqhe as a trust-sensitive final conclusion.',
              },
              orientation_only: true,
              summary_inputs_trusted: false,
              can_update_claim_trust: false,
            },
          ],
          required_before_trust_change: [
            'resolve required recording/backtrace/brainstorm policy decisions',
            'run aitp_v5_preflight_trust_update',
          ],
          lifecycle_phases: ['pre_action', 'pre_final'],
          trigger_conditions: ['before any claim-trust update'],
          recording_threshold: 'blocking_before_claim_trust_update',
          trust_boundary_inputs: {
            target_refs: ['claim:claim-fqhe'],
            claim_id: 'claim-fqhe',
            entrypoints: ['aitp_v5_preflight_trust_update'],
            required_before_trust_change: [
              'resolve required recording/backtrace/brainstorm policy decisions',
              'run aitp_v5_preflight_trust_update',
            ],
            requires_preflight: true,
            final_gate_required: true,
          },
          recommended_host_behavior: ['run aitp_v5_preflight_trust_update before trust mutation'],
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
