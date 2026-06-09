import { describe, expect, it } from 'vitest';

import {
  DomainProfileRegistry,
  PhysicsMemoryRegistry,
  ResearchEvalCaseRegistry,
  ResearchLedgerRegistry,
  WorkflowRecipeRegistry,
  compileAitpProcessGraphSlice,
  compileResearchContextPack,
  createWorkFrame,
  parseAitpLiteratureSourceReviewHandoff,
  type DomainProfile,
  type FileBackedResearchEvalCase,
  type PhysicsCapsule,
  type ResearchLedgerEvent,
  type WorkflowRecipe,
} from '../../src';

const DOMAIN = 'topological-order/fqhe-cs';

describe('compileResearchContextPack', () => {
  it('compiles profiles, recipes, memory, ledger proposals, and action bindings for a WorkFrame', () => {
    const domainProfiles = new DomainProfileRegistry();
    const workflowRecipes = new WorkflowRecipeRegistry();
    const physicsMemory = new PhysicsMemoryRegistry();
    const researchLedger = new ResearchLedgerRegistry();
    const researchHarness = new ResearchEvalCaseRegistry();

    domainProfiles.register(profile());
    workflowRecipes.register(recipe());
    physicsMemory.register(formulaCapsule());
    physicsMemory.register(benchmarkCapsule());
    researchLedger.register(ledgerEvent());
    researchHarness.register(evalFile());

    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.fqhe',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Relate Laughlin wavefunction and CS response.',
        activeObjectIds: ['formula.fqhe.flux-quantization'],
        sourceRefs: ['prompt:initial-question'],
      }),
      domainProfiles,
      workflowRecipes,
      physicsMemory,
      researchLedger,
      researchHarness,
      now: () => 123,
    });

    expect(pack.id).toMatch(/^context\.frame\.fqhe\.[a-f0-9]{12}$/);
    expect(pack.compiledAt).toBe(123);
    expect(pack.profiles.map((item) => item.id)).toEqual(['domain.fqhe-cs']);
    expect(pack.workflows.map((item) => item.id)).toEqual(['workflow.fqhe-cs.charge-flux']);
    expect(pack.physics.capsules.map((item) => item.id)).toEqual([
      'formula.fqhe.flux-quantization',
    ]);
    expect(pack.ledger.proposals.map((item) => item.id)).toEqual([
      'proposal.event.fqhe.flux-source.formula',
    ]);
    expect(pack.actionBindings.map((item) => item.id)).toEqual([
      'binding.formula.fqhe.flux-quantization.validate.check_convention',
      'binding.fqhe.convention',
    ]);
    expect(pack.domainPack).toMatchObject({
      domain: DOMAIN,
      profileIds: ['domain.fqhe-cs'],
      workflowIds: ['workflow.fqhe-cs.charge-flux'],
      evalCaseIds: ['eval.fqhe.charge-flux'],
      requiredTools: ['PhysicsMemory', 'ResearchLedger'],
    });
    expect(pack.sourceRefs).toEqual([
      'ledger:event.fqhe.flux-source',
      'local:profile',
      'local:workflow',
      'paper:laughlin',
      'prompt:initial-question',
    ]);
  });

  it('keeps missing registries as diagnostics instead of failing compilation', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.empty',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Answer a lightweight question.',
      }),
      now: () => 1,
    });

    expect(pack.profiles).toEqual([]);
    expect(pack.physics.capsules).toEqual([]);
    expect(pack.diagnostics.map((item) => item.code)).toEqual([
      'domain-profile-registry-disabled',
      'workflow-recipe-registry-disabled',
      'physics-memory-registry-disabled',
      'research-ledger-registry-disabled',
    ]);
  });

  it('compiles AITP process graph slices into native context bindings', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.aitp',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Backtrace a provisional relation before promoting it.',
      }),
      aitp: compileAitpProcessGraphSlice(aitpSlicePayload(), {
        prompt: 'Brainstorm the relation path and follow the source dependency.',
      }),
      now: () => 123,
    });

    expect(pack.aitp).toMatchObject({
      truthSource: 'typed_records',
      orientationOnly: true,
      liveRouteIds: ['route-source-first'],
      blockedRouteIds: ['route-direct-proof'],
      abandonedRouteIds: [],
      pivotRequiredRouteIds: ['route-source-first'],
      provenanceGapIds: ['gap-code-state'],
      codeProvenanceGapIds: ['gap-code-state'],
      sourceAssetIds: ['source-asset-edge-counting'],
      sourceAssetMissingHashIds: ['source-asset-edge-counting'],
      sourceAssetDuplicateHashIds: [],
      sourceStackCoverageClaimIds: ['claim-fqhe'],
      sourceStackEvidenceGapClaimIds: ['claim-fqhe'],
      sourceStackReconstructionGapClaimIds: ['claim-fqhe'],
      sourceStackReviewGapClaimIds: [],
      sourceStackCoverageNextActions: expect.arrayContaining([
        'record_evidence_for_required_outputs:claim-fqhe',
      ]),
      sourceReconstructionReviewClaimIds: ['claim-fqhe'],
      sourceReconstructionReviewOpenClaimIds: ['claim-fqhe'],
      sourceReconstructionReviewNeedsRevisionClaimIds: [],
      sourceReconstructionReviewInconclusiveClaimIds: [],
      sourceReconstructionReviewPacketClaimIds: ['claim-fqhe'],
      sourceReconstructionReviewNextActions: ['source_reconstruction_review:claim-fqhe'],
      openObligationIds: ['obligation-source'],
      requiredCallIds: expect.arrayContaining([
        expect.stringContaining('aitp-record-evidence'),
        expect.stringContaining('aitp-record-reference-location'),
        expect.stringContaining('aitp-run-trust-preflight'),
      ]),
      trustPrerequisiteCallIds: expect.arrayContaining([
        expect.stringContaining('aitp-record-evidence'),
        expect.stringContaining('aitp-record-reference-location'),
      ]),
    });
    expect(pack.aitp?.contextLines.join('\n')).toContain(
      'Source asset index: source_asset:source-asset-edge-counting [paper/missing]',
    );
    expect(pack.aitp?.contextLines.join('\n')).toContain(
      'Source stack coverage: claim-fqhe [evidence_gap/guided]',
    );
    expect(pack.aitp?.contextLines.join('\n')).toContain(
      'Source reconstruction review: claim-fqhe [pending/incomplete]',
    );
    expect(pack.actionBindings.map((item) => item.actionId)).toEqual(
      expect.arrayContaining([
        'aitp.create_open_obligation',
        'aitp.checkpoint_before_route_switch',
        'aitp.capture_code_state_auto',
        'aitp.record_evidence',
        'aitp.record_failed_route_lesson',
        'aitp.record_reference_location',
        'aitp.record_route_choice',
        'aitp.request_human_checkpoint',
        'aitp.run_trust_preflight',
        'code.capture_git_diff_observation',
        'physics.brainstorm_relation_path',
        'trace.follow_source_dependency',
      ]),
    );
    expect(pack.diagnostics.map((item) => item.source)).toContain('aitp');
  });

  it('suggests curated RAG promotion draft bindings only for claim-support review context', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.rag-promotion',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Decide whether a retrieved source passage should support claim-fqhe.',
        sourceRefs: ['aitp:claim:claim-fqhe'],
      }),
      curatedRag: curatedRagSearchPayload(),
      curatedRagReasonIds: ['source_backtrace_suggestions'],
      now: () => 123,
    });

    expect(pack.sourceRefs).toEqual(['aitp:claim:claim-fqhe']);
    expect(pack.curatedRag).toMatchObject({
      resultRole: 'heuristic_context',
      readSurfaceEffect: 'orientation_only',
      recordsValidationResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
      requiresPromotionForClaimSupport: true,
      promotionDraftSuggested: true,
      promotionDraftBindingIds: [
        'binding.aitp.curated-rag-promotion-draft.chunk.fqhe.source',
      ],
    });
    expect(pack.curatedRag?.results[0]).toMatchObject({
      chunkId: 'chunk.fqhe.source',
      promotionDraftBindingId: 'binding.aitp.curated-rag-promotion-draft.chunk.fqhe.source',
    });
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        id: 'binding.aitp.curated-rag-promotion-draft.chunk.fqhe.source',
        actionId: 'draft_aitp_curated_rag_promotion',
        adapterId: 'aitp.curated-rag.promotion-draft',
        objectRefs: [
          'aitp:curated_rag_chunk:chunk.fqhe.source',
          'aitp:curated_rag_document:doc.fqhe.lecture',
        ],
        params: expect.objectContaining({
          toolAction: 'ResearchAction.draft_aitp_curated_rag_promotion',
          ragChunkId: 'chunk.fqhe.source',
          ragDocumentId: 'doc.fqhe.lecture',
          ragContentHash: 'sha256:chunk-fqhe-source',
          aitpTopicId: 'fqhe-cs-effective-theory',
          aitpClaimId: 'claim-fqhe',
          aitpPromotionIntent: 'claim_support_review',
          retrievalRole: 'heuristic_context',
          readSurfaceEffect: 'orientation_only',
          draftCreatesRecords: false,
          recordsValidationResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          requiresPromotionForClaimSupport: true,
          requiresUserOrModelDecisionBeforeWrite: true,
        }),
      }),
    );
  });

  it('does not suggest curated RAG promotion drafts for conceptual background only', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.rag-background',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Explain the background intuition.',
      }),
      curatedRag: curatedRagSearchPayload(),
      curatedRagReasonIds: ['conceptual_scaffolding'],
      now: () => 123,
    });

    expect(pack.curatedRag?.promotionDraftSuggested).toBe(false);
    expect(pack.curatedRag?.promotionDraftBindingIds).toEqual([]);
    expect(pack.curatedRag?.results[0]?.promotionDraftBindingId).toBeUndefined();
    expect(pack.actionBindings.map((item) => item.actionId)).not.toContain(
      'draft_aitp_curated_rag_promotion',
    );
  });

  it('adds carried-ref repair sequence reminders without granting write or trust authority', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.rag-carried-ref-repair',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Repair malformed carried-ref handoff input for claim-fqhe.',
      }),
      curatedRagCarriedRefRepairActive: true,
      curatedRagCarriedRefRepairTriggerTerms: [
        'promotion_carried_ref_handoffs',
        'malformed',
      ],
      now: () => 123,
    });

    expect(pack.curatedRagCarriedRefRepair).toMatchObject({
      active: true,
      source: 'turn_text',
      taxonomyAction: 'ResearchAction.list_actions',
      draftAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
      readinessAction: 'ResearchAction.inspect_aitp_write_bridge_handoff_readiness',
      executeAction: 'ResearchAction.execute_aitp_write_bridge',
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
      executesWriteNow: false,
    });
    expect(pack.curatedRagCarriedRefRepair?.safeSequence).toEqual([
      'inspect taxonomy metadata',
      'prepare fresh draft action',
      'apply explicit reviewed overrides',
      'inspect readiness',
      'execute only with explicit execute_aitp_write_bridge call',
    ]);
    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'aitp:curated-rag-carried-ref-repair-sequence',
        source: 'aitp',
      }),
    );
  });

  it('adds carried-ref repair action binding only for concrete failure code and path', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.rag-carried-ref-repair-binding',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Repair malformed carried-ref handoff input for claim-fqhe.',
      }),
      curatedRagCarriedRefRepairActive: true,
      curatedRagCarriedRefRepairTriggerTerms: [
        'carried_ref_handoff_failure',
        'mismatch',
      ],
      curatedRagCarriedRefRepairFailureCode: 'evidence_ref_record_id_mismatch',
      curatedRagCarriedRefRepairFailurePath: 'promotion_carried_ref_handoffs[0].evidence_ref',
      now: () => 123,
    });

    expect(pack.curatedRagCarriedRefRepair).toMatchObject({
      failureCode: 'evidence_ref_record_id_mismatch',
      failurePath: 'promotion_carried_ref_handoffs[0].evidence_ref',
      executesWriteNow: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
    });
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'draft_aitp_curated_rag_write_bridge_call',
        adapterId: 'aitp.curated-rag.carried-ref-repair-draft',
        priority: 'normal',
        params: expect.objectContaining({
          toolAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
          failureCode: 'evidence_ref_record_id_mismatch',
          failurePath: 'promotion_carried_ref_handoffs[0].evidence_ref',
          taxonomyAction: 'ResearchAction.list_actions',
          requiresFreshDraftAction: true,
          requiresExplicitChunkSelection: true,
          requiresExplicitPromotionStageOrOperationSelection: true,
          requiresReviewedOverrides: true,
          requiresReadinessInspection: true,
          requiresExplicitExecuteCall: true,
          infersPayloadValues: false,
          executesWriteNow: false,
          bridgeCalled: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          recordsTrustState: false,
        }),
      }),
    );
    expect(pack.actionBindings[0]?.params).toMatchObject({
      allowedNextToolCall: {
        action: 'draft_aitp_curated_rag_write_bridge_call',
        failure_code: 'evidence_ref_record_id_mismatch',
        failure_path: 'promotion_carried_ref_handoffs[0].evidence_ref',
        requires_fresh_draft_action: true,
        requires_explicit_chunk_selection: true,
        requires_explicit_promotion_stage_or_operation_selection: true,
        requires_reviewed_overrides: true,
        requires_readiness_inspection: true,
        requires_explicit_execute_call: true,
        infers_payload_values: false,
      },
      forbiddenUses: [
        'execute_write_now',
        'evidence_support',
        'validation_result',
        'source_support_result',
        'claim_trust_update',
        'trust_apply',
        'final_gate_satisfaction',
      ],
    });
  });

  it('does not add carried-ref repair action binding without concrete failure metadata', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.rag-carried-ref-repair-generic',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Repair malformed carried-ref handoff input for claim-fqhe.',
      }),
      curatedRagCarriedRefRepairActive: true,
      curatedRagCarriedRefRepairTriggerTerms: [
        'promotion_carried_ref_handoffs',
        'malformed',
      ],
      now: () => 123,
    });

    expect(pack.curatedRagCarriedRefRepair).toMatchObject({
      active: true,
      executesWriteNow: false,
    });
    expect(pack.actionBindings.map((item) => item.adapterId)).not.toContain(
      'aitp.curated-rag.carried-ref-repair-draft',
    );
  });

  it('adds carried-ref repair result continuation bindings without granting support or trust', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.rag-carried-ref-result',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Continue a repaired carried-ref promotion path for claim-fqhe.',
      }),
      curatedRagCarriedRefRepairResult: carriedRefRepairResultSummary(),
      now: () => 123,
    });

    expect(pack.curatedRagCarriedRefRepairResult).toMatchObject({
      source: 'execute_aitp_write_bridge_result',
      handoffId: 'curated-rag-write-handoff.chunk.evidence.hash',
      completedOperation: 'recordEvidence',
      resultKind: 'evidence',
      recordId: 'evidence-reviewed-curated-rag',
      canonicalRef: 'evidence:evidence-reviewed-curated-rag',
      evidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
      refKind: 'evidence',
      reviewedOverridesRequired: true,
      readinessInspectionRequired: true,
      explicitExecutePrecheckPassed: true,
      bridgeCalled: true,
      resultWrittenByAitp: true,
      nextPayloadMutatedNow: false,
      nextWriteExecutedNow: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
      requiresExplicitNextDraft: true,
    });
    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'aitp:curated-rag-carried-ref-repair-result-summary',
        source: 'aitp',
        refId: 'curated-rag-write-handoff.chunk.evidence.hash',
      }),
    );
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'source.review_context',
        adapterId: 'aitp.curated-rag.carried-ref-repair-result-source-context-review',
        priority: 'high',
        objectRefs: expect.arrayContaining([
          'evidence:evidence-reviewed-curated-rag',
          'aitp:evidence:evidence-reviewed-curated-rag',
          'carried_ref_repair_handoff:curated-rag-write-handoff.chunk.evidence.hash',
        ]),
        params: expect.objectContaining({
          toolAction: 'ResearchAction.plan_primitive_tools',
          actionId: 'source.review_context',
          continuationSource: 'carried_ref_repair_result_summary',
          reviewBeforeDraft: true,
          reviewPurpose:
            'check source text, chunk scope, claim scope, and whether the carried ref is appropriate before drafting the next write-bridge call',
          returnedResultOwnedByAitp: true,
          candidateReviewedOverrideRef: 'evidence:evidence-reviewed-curated-rag',
          candidateEvidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
          requiresFreshDraftActionAfterReview: true,
          requiresExplicitChunkSelection: true,
          requiresExplicitPromotionStageOrOperationSelection: true,
          requiresReviewedOverrides: true,
          requiresReadinessInspection: true,
          requiresExplicitExecuteCall: true,
          infersPayloadValues: false,
          mutatesNextPayloadNow: false,
          executesWriteNow: false,
          bridgeCalled: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          recordsTrustState: false,
        }),
      }),
    );
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'draft_aitp_curated_rag_write_bridge_call',
        adapterId: 'aitp.curated-rag.carried-ref-repair-result-continuation',
        objectRefs: expect.arrayContaining([
          'evidence:evidence-reviewed-curated-rag',
          'aitp:evidence:evidence-reviewed-curated-rag',
          'carried_ref_repair_handoff:curated-rag-write-handoff.chunk.evidence.hash',
        ]),
        params: expect.objectContaining({
          toolAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
          continuationSource: 'carried_ref_repair_result_summary',
          returnedResultOwnedByAitp: true,
          candidateReviewedOverrideRef: 'evidence:evidence-reviewed-curated-rag',
          candidateEvidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
          requiresFreshDraftAction: true,
          requiresExplicitChunkSelection: true,
          requiresExplicitPromotionStageOrOperationSelection: true,
          requiresReviewedOverrides: true,
          requiresReadinessInspection: true,
          requiresExplicitExecuteCall: true,
          infersPayloadValues: false,
          mutatesNextPayloadNow: false,
          executesWriteNow: false,
          bridgeCalled: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          recordsTrustState: false,
        }),
      }),
    );
    const reviewBinding = pack.actionBindings.find(
      (item) =>
        item.adapterId === 'aitp.curated-rag.carried-ref-repair-result-source-context-review',
    );
    expect(reviewBinding?.params).toMatchObject({
      allowedNextToolCall: {
        action: 'plan_primitive_tools',
        action_id: 'source.review_context',
        candidate_reviewed_override_ref: 'evidence:evidence-reviewed-curated-rag',
        candidate_evidence_ref: 'aitp:evidence:evidence-reviewed-curated-rag',
        review_before_draft: true,
        requires_fresh_draft_action_after_review: true,
        infers_payload_values: false,
      },
      forbiddenUses: [
        'infer_chunk_id',
        'infer_promotion_stage',
        'mutate_payload_now',
        'execute_write_now',
        'evidence_support',
        'validation_result',
        'source_support_result',
        'claim_trust_update',
        'trust_apply',
        'final_gate_satisfaction',
      ],
    });
    const draftBinding = pack.actionBindings.find(
      (item) => item.adapterId === 'aitp.curated-rag.carried-ref-repair-result-continuation',
    );
    expect(draftBinding?.params).toMatchObject({
      allowedNextToolCall: {
        action: 'draft_aitp_curated_rag_write_bridge_call',
        candidate_reviewed_override_ref: 'evidence:evidence-reviewed-curated-rag',
        candidate_evidence_ref: 'aitp:evidence:evidence-reviewed-curated-rag',
        requires_fresh_draft_action: true,
        requires_explicit_chunk_selection: true,
        requires_explicit_promotion_stage_or_operation_selection: true,
        requires_reviewed_overrides: true,
        requires_readiness_inspection: true,
        requires_explicit_execute_call: true,
        infers_payload_values: false,
      },
      forbiddenUses: [
        'infer_chunk_id',
        'infer_promotion_stage',
        'mutate_payload_now',
        'execute_write_now',
        'evidence_support',
        'validation_result',
        'source_support_result',
        'claim_trust_update',
        'trust_apply',
        'final_gate_satisfaction',
      ],
    });
  });

  it('adds source-context review outcome routing bindings without granting support or trust', () => {
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.source-review-outcome',
        domain: DOMAIN,
        topic: 'fqhe-cs-effective-theory',
        goal: 'Route a reviewed source context decision.',
      }),
      sourceContextReviewOutcome: {
        source: 'ResearchAction.finish_action_call',
        actionId: 'source.review_context',
        callId: 'call.source-review',
        outcome: 'inconclusive',
        decision: 'validate_check_source_support',
        reviewedCanonicalRef: 'evidence:evidence-reviewed-curated-rag',
        reviewedEvidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
        claimScope: 'claim:claim-fqhe',
        chunkScope: 'chunk:chunk-fqhe-flux',
        rationale: 'The chunk appears relevant but still needs source-support validation.',
        nextActionId: 'validate.check_source_support',
        requiresExplicitNextAction: true,
        bridgeCalled: false,
        executesWriteNow: false,
        mutatesNextPayloadNow: false,
        infersPayloadValues: false,
        recordsValidationResult: false,
        sourceSupportResult: false,
        claimTrustMutation: 'none',
        canUpdateClaimTrust: false,
      },
      now: () => 123,
    });

    expect(pack.sourceContextReviewOutcome).toMatchObject({
      decision: 'validate_check_source_support',
      nextActionId: 'validate.check_source_support',
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
    });
    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'aitp:source-context-review-outcome',
        source: 'aitp',
        refId: 'call.source-review',
      }),
    );
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        actionId: 'validate.check_source_support',
        adapterId: 'aitp.curated-rag.source-context-review-outcome',
        priority: 'high',
        objectRefs: expect.arrayContaining([
          'evidence:evidence-reviewed-curated-rag',
          'aitp:evidence:evidence-reviewed-curated-rag',
          'source_context_review_call:call.source-review',
          'source_context_review_decision:validate_check_source_support',
        ]),
        params: expect.objectContaining({
          continuationSource: 'source_context_review_outcome',
          requiresExplicitNextAction: true,
          requiresExplicitAitpWriteOrValidationForCanonicalEffect: true,
          bridgeCalled: false,
          executesWriteNow: false,
          mutatesNextPayloadNow: false,
          infersPayloadValues: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          recordsTrustState: false,
        }),
      }),
    );
    const binding = pack.actionBindings.find(
      (item) => item.adapterId === 'aitp.curated-rag.source-context-review-outcome',
    );
    expect(binding?.params).toMatchObject({
      allowedNextToolCall: {
        action: 'plan_primitive_tools',
        action_id: 'validate.check_source_support',
        reviewed_canonical_ref: 'evidence:evidence-reviewed-curated-rag',
        reviewed_evidence_ref: 'aitp:evidence:evidence-reviewed-curated-rag',
        requires_explicit_next_action: true,
        records_validation_result: false,
        source_support_result: false,
        claim_trust_mutation: 'none',
      },
      forbiddenUses: [
        'infer_chunk_id',
        'infer_promotion_stage',
        'mutate_payload_now',
        'execute_write_now',
        'evidence_support',
        'validation_result',
        'source_support_result',
        'claim_trust_update',
        'trust_apply',
        'final_gate_satisfaction',
      ],
    });
  });

  it('adds literature source review handoff context bindings without support or trust', () => {
    const handoff = parseAitpLiteratureSourceReviewHandoff(fakeLiteratureSourceReviewHandoff());
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.literature-handoff',
        domain: DOMAIN,
        topic: 'fqhe-literature',
        goal: 'Review a literature source handoff.',
      }),
      literatureSourceReviewHandoff: handoff,
      now: () => 123,
    });

    expect(pack.literatureSourceReviewHandoff).toMatchObject({
      source: 'aitp.literature_source_review_handoff',
      sessionId: 'session-qg',
      topicId: 'qg',
      claimId: 'claim-mipt',
      literatureLabel: 'Observer algebra source',
      literatureUri: 'https://arxiv.org/abs/2601.00001',
      referenceLocationId: 'reference-location-observer-algebra',
      recordRefLookupCount: 1,
      recordRefFoundCount: 1,
      recordRefMissingCount: 0,
      sourceStackCoverageStatus: 'incomplete',
      sourceReconstructionReviewStatus: 'needs_review',
      readOnly: true,
      bridgeCalled: false,
      executesWriteNow: false,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
    });
    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'aitp:literature-source-review-handoff',
        source: 'aitp',
        refId: 'claim-mipt',
      }),
    );
    expect(pack.actionBindings).toContainEqual(
      expect.objectContaining({
        id: pack.literatureSourceReviewHandoff?.bindingId,
        actionId: 'source.review_context',
        adapterId: 'aitp.literature.source-review-handoff',
        priority: 'high',
        objectRefs: expect.arrayContaining([
          'literature_session:session-qg',
          'aitp:topic:qg',
          'aitp:claim:claim-mipt',
          'reference_location:reference-location-observer-algebra',
        ]),
        params: expect.objectContaining({
          toolAction: 'ResearchAction.plan_primitive_tools',
          actionId: 'source.review_context',
          continuationSource: 'literature_source_review_handoff',
          sessionId: 'session-qg',
          topicId: 'qg',
          claimId: 'claim-mipt',
          literatureLabel: 'Observer algebra source',
          referenceLocationId: 'reference-location-observer-algebra',
          requiresExplicitNextAction: true,
          bridgeCalled: false,
          executesWriteNow: false,
          mutatesNextPayloadNow: false,
          infersPayloadValues: false,
          recordsValidationResult: false,
          sourceSupportResult: false,
          evidenceCreated: false,
          validationCreated: false,
          writeExecuted: false,
          claimTrustMutation: 'none',
          canUpdateClaimTrust: false,
          recordsTrustState: false,
          allowedNextToolCall: {
            action: 'plan_primitive_tools',
            action_id: 'source.review_context',
            literature_source_review_handoff_binding_id:
              pack.literatureSourceReviewHandoff?.bindingId,
            literature_session_id: 'session-qg',
            literature_uri: 'https://arxiv.org/abs/2601.00001',
            reference_location_id: 'reference-location-observer-algebra',
            requires_explicit_next_action: true,
            records_validation_result: false,
            source_support_result: false,
            claim_trust_mutation: 'none',
          },
          forbiddenUses: [
            'evidence_support',
            'source_support_result',
            'validation_result',
            'write_execution',
            'final_gate_satisfaction',
            'claim_trust_update',
            'trust_apply',
          ],
        }),
      }),
    );
  });

  it('rejects literature source review handoff bindings when boundary flags drift', () => {
    const handoff = {
      ...parseAitpLiteratureSourceReviewHandoff(fakeLiteratureSourceReviewHandoff()),
      recordsValidationResult: true,
    } as any;
    const pack = compileResearchContextPack({
      workFrame: createWorkFrame({
        id: 'frame.literature-handoff-rejected',
        domain: DOMAIN,
        topic: 'fqhe-literature',
        goal: 'Reject an unsafe literature source handoff.',
      }),
      literatureSourceReviewHandoff: handoff,
      now: () => 123,
    });

    expect(pack.literatureSourceReviewHandoff).toBeUndefined();
    expect(pack.actionBindings.map((item) => item.adapterId)).not.toContain(
      'aitp.literature.source-review-handoff',
    );
    expect(pack.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'aitp:literature-source-review-handoff-rejected',
        source: 'aitp',
      }),
    );
  });
});

function carriedRefRepairResultSummary() {
  return {
    source: 'execute_aitp_write_bridge_result',
    handoffId: 'curated-rag-write-handoff.chunk.evidence.hash',
    confirmationId: 'curated-rag-confirmation.chunk.evidence.hash',
    completedStage: 'evidence',
    completedOperation: 'recordEvidence',
    resultKind: 'evidence',
    recordId: 'evidence-reviewed-curated-rag',
    canonicalRef: 'evidence:evidence-reviewed-curated-rag',
    evidenceRef: 'aitp:evidence:evidence-reviewed-curated-rag',
    refKind: 'evidence',
    repairHintOperations: ['recordReferenceLocation'],
    selectedWriteDiffersFromRepairHints: true,
    readinessChecklistId: 'readiness-checklist.curated_rag_write_call_draft.curated-rag-write-handoff.chunk.evidence.hash',
    reviewedOverridesRequired: true,
    readinessInspectionRequired: true,
    explicitExecutePrecheckPassed: true,
    bridgeCalled: true,
    resultWrittenByAitp: true,
    nextPayloadMutatedNow: false,
    nextWriteExecutedNow: false,
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
    requiresExplicitNextDraft: true,
  } as const;
}

function fakeLiteratureSourceReviewHandoff(): any {
  return {
    ok: true,
    kind: 'literature_source_review_handoff',
    session_id: 'session-qg',
    topic_id: 'qg',
    claim_id: 'claim-mipt',
    literature_intake_suggestion: {
      ok: true,
      kind: 'literature_intake_suggestion',
      session_id: 'session-qg',
      topic_id: 'qg',
      active_claim: 'claim-mipt',
      recommended_action: 'record_reference_plus_evidence_candidate',
      reference_candidate: {
        location_id: 'reference-location-observer-algebra',
        topic_id: 'qg',
        claim_id: 'claim-mipt',
        connector_id: 'literature_search',
        location_type: 'paper',
        uri: 'https://arxiv.org/abs/2601.00001',
        label: 'Observer algebra source',
        external_id: 'arXiv:2601.00001',
        status: 'candidate',
        summary: 'Close prior art for source reconstruction.',
        metadata: { detected_relevance: 'explicit claim scope relevance' },
        linked_records: { claim_id: 'claim-mipt' },
        orientation_only: true,
      },
      guarded_next_steps: [],
      mcp_templates: {},
      cli_templates: [],
      risk_notes: ['not_a_supports_claim_by_default'],
      forbidden_without_preflight: ['aitp_v5_preflight_trust_update'],
      trust_update_forbidden: true,
      summary_inputs_trusted: false,
      orientation_only: true,
      can_update_kernel_state: false,
      can_update_claim_trust: false,
      truth_source: 'session_binding_and_agent_supplied_literature_metadata',
    },
    record_ref_lookup: {
      kind: 'record_ref_lookup',
      lookup_scope: 'typed_record_existence_only',
      lookup_count: 1,
      found_count: 1,
      missing_count: 0,
      unsupported_count: 0,
      malformed_count: 0,
      refs: [
        {
          ref: 'source_asset:asset-reviewed',
          ref_kind: 'source_asset',
          record_id: 'asset-reviewed',
          id_field: 'asset_id',
          surface: 'source_asset_record',
          record_role: 'orientation_only_record',
          store_scope: 'registry/source_assets',
          status: 'found',
          record_confirmed: true,
          topic_id: 'qg',
          claim_id: 'claim-mipt',
          record_kind: 'source_asset',
          orientation_only_record: true,
          can_update_record_claim_trust: false,
          read_surface_effect: 'record_existence_check_only',
          records_validation_result: false,
          source_support_result: false,
          claim_trust_mutation: 'none',
          can_update_claim_trust: false,
          suggested_next_operation: '',
          suggested_next_entrypoint: '',
          suggested_next_surface: '',
          suggested_next_reason: '',
          diagnostic: 'record exists in typed store',
        },
      ],
      supported_ref_kinds: ['source_asset'],
      read_surface_effect: 'record_existence_check_only',
      records_validation_result: false,
      source_support_result: false,
      evidence_created: false,
      validation_created: false,
      claim_trust_mutation: 'none',
      can_update_claim_trust: false,
      summary_inputs_trusted: false,
      orientation_only: true,
    },
    source_stack_coverage_item: {
      claim_id: 'claim-mipt',
      coverage_status: 'incomplete',
      missing_count: 1,
    },
    source_reconstruction_review_packet: {
      kind: 'source_reconstruction_review_packet',
      claim_id: 'claim-mipt',
      review_status: 'needs_review',
    },
    recommended_next_entrypoints: [
      {
        entrypoint: 'record_reference_location',
        surface: 'reference_location_record',
        reason: 'record the literature location before using it as source context',
      },
      {
        entrypoint: 'record_source_reconstruction_review_result',
        surface: 'source_reconstruction_review_result_record',
        reason: 'review source reconstruction gaps before trust-sensitive use',
      },
    ],
    handoff_policy: {
      source: 'composed_read_only_aitp_surfaces',
      host_may_use_for: [
        'literature_orientation',
        'source_context_review',
        'record_ref_existence_check',
        'source_stack_gap_review',
        'next_action_selection',
      ],
      requires_explicit_next_entrypoint: true,
      allowed_next_entrypoints: [
        'record_reference_location',
        'register_source_asset',
        'record_evidence',
        'create_validation_contract',
        'record_validation_result',
        'record_source_reconstruction_review_result',
        'preflight_trust_update',
      ],
      forbidden_uses: [
        'evidence_support',
        'source_support_result',
        'validation_result',
        'write_execution',
        'final_gate_satisfaction',
        'claim_trust_update',
        'trust_apply',
      ],
    },
    allowed_next_tool_call: {
      action: 'plan_primitive_tools',
      action_id: 'source.review_context',
      requires_explicit_next_action: true,
      records_validation_result: false,
      source_support_result: false,
      claim_trust_mutation: 'none',
    },
    read_surface_effect: 'handoff_context_only',
    read_only: true,
    requires_explicit_next_action: true,
    bridge_called: false,
    executes_write_now: false,
    mutates_next_payload_now: false,
    infers_payload_values: false,
    summary_inputs_trusted: false,
    orientation_only: true,
    can_update_kernel_state: false,
    can_update_claim_trust: false,
    records_validation_result: false,
    source_support_result: false,
    evidence_created: false,
    validation_created: false,
    write_executed: false,
    trust_update_forbidden: true,
    claim_trust_mutation: 'none',
    truth_source: 'composed_typed_records_and_agent_supplied_literature_metadata',
  };
}

function profile(): DomainProfile {
  return {
    metadata: {
      id: 'domain.fqhe-cs',
      kind: 'domain_profile',
      title: 'FQHE/CS profile',
      domain: DOMAIN,
      status: 'checked',
      sourceRefs: ['local:profile'],
      conventions: ['convention.cs.level-normalization'],
      lenses: ['charge_flux_quantization'],
      workflows: ['workflow.fqhe-cs.charge-flux'],
      capsuleRefs: ['formula.fqhe.flux-quantization'],
      bridgeCapsules: [],
      contextTags: ['fqhe', 'chern-simons'],
    },
    path: 'profile.md',
    body: 'Profile body.',
    source: 'project',
  };
}

function recipe(): WorkflowRecipe {
  return {
    metadata: {
      id: 'workflow.fqhe-cs.charge-flux',
      kind: 'workflow_recipe',
      title: 'Charge-flux convention workflow',
      domain: DOMAIN,
      status: 'checked',
      sourceRefs: ['local:workflow'],
      actionBindings: [
        {
          id: 'binding.fqhe.convention',
          actionId: 'validate.check_convention',
          domainId: DOMAIN,
          lensId: 'charge_flux_quantization',
          checkId: 'check.charge-flux-quantization.convention',
          priority: 'blocking',
        },
      ],
      requiredCapsules: ['formula.fqhe.flux-quantization'],
      requiredTools: ['PhysicsMemory', 'ResearchLedger'],
      failureModes: ['failure.fqhe.convention-mismatch'],
    },
    path: 'workflow.md',
    body: 'Workflow body.',
    source: 'project',
  };
}

function evalFile(): FileBackedResearchEvalCase {
  return {
    path: 'eval.md',
    source: 'project',
    body: 'Eval body.',
    sourceRefs: ['local:eval'],
    evalCase: {
      id: 'eval.fqhe.charge-flux',
      title: 'FQHE charge-flux eval',
      task: 'Explain charge-flux convention.',
      domain: DOMAIN,
      capsuleRefs: ['formula.fqhe.flux-quantization'],
      actionSequence: [],
      validations: [],
    },
  };
}

function formulaCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'formula.fqhe.flux-quantization',
      kind: 'Formula',
      domain: DOMAIN,
      title: 'Flux quantization convention',
      reliability: 'checked',
      symbols: ['Phi', 'Phi_0'],
      assumes: ['convention.cs.level-normalization'],
      dependsOn: [],
      sourceRefs: ['paper:laughlin'],
      graphRefs: [{ kind: 'Formula', id: 'formula.fqhe.flux-quantization' }],
      expansionHandles: [{ kind: 'formula', ref: 'formula.fqhe.flux-quantization' }],
      requiredChecks: [
        {
          id: 'check.charge-flux-quantization.convention',
          kind: 'convention',
          severity: 'blocking',
        },
      ],
      actionAffordances: [
        {
          actionId: 'validate.check_convention',
          intent: 'required',
          reason: 'CS normalization depends on the flux convention.',
        },
      ],
      allowCrossDomain: false,
    },
    path: 'formula.md',
    body: 'Phi = n Phi_0.',
    source: 'project',
  };
}

function benchmarkCapsule(): PhysicsCapsule {
  return {
    metadata: {
      id: 'benchmark.fqhe.flux-smoke',
      kind: 'BenchmarkCase',
      domain: DOMAIN,
      title: 'Flux convention smoke check',
      reliability: 'checked',
      symbols: [],
      assumes: [],
      dependsOn: ['formula.fqhe.flux-quantization'],
      sourceRefs: ['local:benchmark'],
      graphRefs: [],
      expansionHandles: [],
      requiredChecks: [],
      actionAffordances: [],
      allowCrossDomain: false,
    },
    path: 'benchmark.md',
    body: 'Smoke check.',
    source: 'project',
  };
}

function ledgerEvent(): ResearchLedgerEvent {
  return {
    metadata: {
      id: 'event.fqhe.flux-source',
      type: 'source_excerpt',
      topic: 'fqhe-cs-effective-theory',
      domain: DOMAIN,
      status: 'captured',
      sourceRefs: ['ledger:event.fqhe.flux-source'],
      dependsOn: [],
      candidateCapsuleKind: 'Formula',
      openQuestions: [],
      relatedObjects: ['formula.fqhe.flux-quantization'],
    },
    path: 'event.md',
    body: 'Flux insertion source excerpt.',
    root: { path: '.aitp/research-ledger', source: 'project' },
  };
}

function aitpSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [
      {
        id: 'claim:claim-fqhe',
        type: 'claim',
        record: {
          statement: 'Sector counting identifies the edge CFT.',
          status: 'hypothesis',
        },
      },
    ],
    edges: [],
    open_obligations: [
      {
        obligation_id: 'obligation-source',
        claim_id: 'claim-fqhe',
        status: 'open',
        obligation_type: 'source_support',
        statement: 'Locate the source supporting the counting-CFT relation.',
        next_action: 'open source dependency backtrace',
      },
    ],
    source_backtrace: [
      {
        claim_id: 'claim-fqhe',
        missing_components: ['reference_location'],
        complete: false,
      },
    ],
    relation_neighborhood: [
      {
        relation_id: 'relation-counting-cft',
        status: 'hypothesis',
        relation_type: 'diagnoses',
        subject_id: 'object-counting',
        object_id: 'object-cft',
      },
    ],
    exploratory_records: [],
    route_state: {
      active_route_id: 'route-source-first',
      routes: [
        {
          route_id: 'route-source-first',
          topic_id: 'fqhe-cs-effective-theory',
          claim_id: 'claim-fqhe',
          title: 'Source-first route',
          route_type: 'source_backtrace',
          status: 'live',
          active: true,
          rationale: 'Locate source support before direct proof.',
          parent_route_ids: ['route-direct-proof'],
          pivot_reason: 'direct proof lacks a source location',
        },
        {
          route_id: 'route-direct-proof',
          topic_id: 'fqhe-cs-effective-theory',
          claim_id: 'claim-fqhe',
          title: 'Direct proof route',
          route_type: 'derivation',
          status: 'blocked',
          rationale: 'Try direct proof from the provisional relation.',
          failure_modes: ['missing source location'],
          lesson: 'Do not use direct proof until source location exists.',
        },
      ],
      live_route_ids: ['route-source-first'],
      blocked_route_ids: ['route-direct-proof'],
      abandoned_route_ids: [],
      pivot_required_route_ids: ['route-source-first'],
    },
    provenance_gaps: [
      {
        gap_id: 'gap-code-state',
        gap_type: 'code_state_missing',
        provenance_kind: 'code',
        reason: 'code-dependent route has no git code state',
        topic_id: 'fqhe-cs-effective-theory',
        claim_id: 'claim-fqhe',
        target_type: 'claim',
        target_id: 'claim-fqhe',
        target_refs: ['claim:claim-fqhe'],
        recommended_actions: ['aitp.capture_code_state_auto'],
        recommended_entrypoints: ['aitp_v5_capture_code_state_auto'],
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
        topic_id: 'fqhe-cs-effective-theory',
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
        target_refs: ['source_asset:source-asset-edge-counting'],
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
          topic_id: 'fqhe-cs-effective-theory',
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
          topic_id: 'fqhe-cs-effective-theory',
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
          target_id: 'obligation-source',
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
          required_before_trust_change: [
            'record typed evidence or validation for the open obligation',
            'run aitp_v5_preflight_trust_update',
          ],
          trust_boundary: true,
          orientation_only: true,
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
          missing_components: ['reference_location'],
          record_entrypoints: [
            'aitp_v5_record_exploratory_record',
            'aitp_v5_record_reference_location',
          ],
          exploration_entrypoints: ['aitp_v5_record_exploratory_record'],
          entrypoints: [
            'aitp_v5_record_exploratory_record',
            'aitp_v5_record_reference_location',
            'aitp_v5_preflight_trust_update',
          ],
          required_before_trust_change: [
            'backtrace missing source components to typed records',
            'run aitp_v5_preflight_trust_update',
          ],
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
          orientation_only: true,
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
        moment: 'brainstorm_relation_path',
        reason: 'object relation is still a hypothesis',
        target_type: 'object_relation',
        target_id: 'relation-counting-cft',
      },
    ],
  };
}

function curatedRagSearchPayload() {
  return {
    kind: 'curated_rag_search_result' as const,
    catalogVersion: 'aitp.v5.curated_rag_corpus.v1',
    query: 'source support for FQHE',
    indexMode: 'lexical_file_backed' as const,
    resultRole: 'heuristic_context' as const,
    summaryInputsTrusted: false as const,
    canUpdateClaimTrust: false as const,
    recordsValidationResult: false as const,
    claimTrustMutation: 'none' as const,
    requiresPromotionForClaimSupport: true as const,
    indexStatus: 'fresh',
    staleIndexDiagnostics: [],
    resultCount: 1,
    results: [
      {
        chunkId: 'chunk.fqhe.source',
        documentId: 'doc.fqhe.lecture',
        score: 2.5,
        retrievalRole: 'heuristic_context' as const,
        orientationOnly: true as const,
        canUpdateClaimTrust: false as const,
        summary: 'Source-support orientation for FQHE literature.',
        text: 'Use this as a source-backtrace hint, not as claim evidence.',
        anchor: { section: 'source support' },
        tags: ['fqhe', 'source-support'],
        contentHash: 'sha256:chunk-fqhe-source',
        raw: {},
      },
    ],
    raw: {},
  };
}
