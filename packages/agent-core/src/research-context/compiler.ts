import { createHash } from 'node:crypto';

import { compileDomainPackManifest } from '../domain-pack';
import type { DomainProfileRegistry } from '../domain-profile';
import {
  compilePhysicsContext,
  type ActionAffordance,
  type PhysicsCapsule,
  type PhysicsMemoryRegistry,
} from '../physics-memory';
import type { ResearchActionBinding } from '../research-action';
import type { AitpLiteratureSourceReviewHandoff } from '../aitp/literature-source-review-handoff';
import {
  compileResearchLedgerProposals,
  type ResearchLedgerEventStatus,
  type ResearchLedgerRegistry,
} from '../research-ledger';
import type { ResearchEvalCaseRegistry } from '../research-harness';
import {
  GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID,
  GENERIC_THEORETICAL_PHYSICS_DOMAIN,
  GENERIC_THEORETICAL_PHYSICS_PROFILE_ID,
  hasComputationalResearchIntent,
  isGenericTheoreticalPhysicsCapsuleId,
  isGenericTheoreticalPhysicsProfileId,
  isGenericTheoreticalPhysicsWorkflowId,
  shouldUseGenericTheoreticalPhysicsFallback,
} from '../research-defaults/theoretical-physics';
import type { WorkflowRecipe, WorkflowRecipeRegistry } from '../workflow-recipe';
import type {
  CompileResearchContextPackOptions,
  ResearchContextAitpSection,
  ResearchContextCapsuleSummary,
  ResearchContextCuratedRagCarriedRefRepairSection,
  ResearchContextCuratedRagCarriedRefRepairResultSummary,
  ResearchContextCuratedRagChunkSummary,
  ResearchContextCuratedRagSection,
  ResearchContextLedgerProposalSummary,
  ResearchContextLiteratureSourceReviewHandoffSection,
  ResearchContextPack,
  ResearchContextPackDiagnostic,
  ResearchContextProfileSummary,
  ResearchContextSourceContextReviewOutcomeSummary,
  ResearchContextWorkflowSummary,
} from './types';

export interface CompileResearchContextPackInput extends CompileResearchContextPackOptions {
  readonly domainProfiles?: DomainProfileRegistry | null | undefined;
  readonly workflowRecipes?: WorkflowRecipeRegistry | null | undefined;
  readonly physicsMemory?: PhysicsMemoryRegistry | null | undefined;
  readonly researchLedger?: ResearchLedgerRegistry | null | undefined;
  readonly researchHarness?: ResearchEvalCaseRegistry | null | undefined;
}

const DEFAULT_LEDGER_STATUSES: readonly ResearchLedgerEventStatus[] = [
  'captured',
  'parsed',
  'linked',
  'compiled',
  'promoted',
];

const DEFAULT_MAX_CAPSULES = 12;
const DEFAULT_MAX_LEDGER_PROPOSALS = 12;
const DEFAULT_MAX_ACTION_BINDINGS = 40;
const DEFAULT_MAX_CURATED_RAG_RESULTS = 3;

export function compileResearchContextPack(
  input: CompileResearchContextPackInput,
): ResearchContextPack {
  const frame = input.workFrame;
  const diagnostics: ResearchContextPackDiagnostic[] = [];
  const domainPack = compileDomainPackManifest({
    domain: frame.domain,
    domainProfiles: input.domainProfiles,
    workflowRecipes: input.workflowRecipes,
    physicsMemory: input.physicsMemory,
    researchHarness: input.researchHarness,
    workFrame: frame,
    now: input.now,
  });
  const profiles = collectProfiles(input, diagnostics);
  const workflows = collectWorkflows(input, profiles, diagnostics);
  const requestedFocus = unique([
    ...frame.activeObjectIds,
    ...frame.assumptionIds,
    ...frame.conventionIds,
    ...profiles.flatMap((profile) => profile.capsuleRefs),
    ...profiles.flatMap((profile) => profile.bridgeCapsules),
    ...workflows.flatMap((workflow) => workflow.metadata.requiredCapsules),
  ]);
  const physics = collectPhysics(input, requestedFocus, diagnostics);
  const ledger = collectLedger(input, diagnostics);
  const aitp = collectAitp(input, diagnostics);
  const curatedRag = collectCuratedRag(input, diagnostics);
  const curatedRagCarriedRefRepair = collectCuratedRagCarriedRefRepair(input, diagnostics);
  const curatedRagCarriedRefRepairResult = collectCuratedRagCarriedRefRepairResult(
    input,
    diagnostics,
  );
  const sourceContextReviewOutcome = collectSourceContextReviewOutcome(input, diagnostics);
  const literatureSourceReviewHandoff = collectLiteratureSourceReviewHandoff(
    input,
    diagnostics,
  );
  const curatedRagActionBindings = curatedRagPromotionDraftBindings(input, curatedRag);
  const curatedRagRepairActionBindings = curatedRagCarriedRefRepairBindings(
    input,
    curatedRagCarriedRefRepair,
  );
  const curatedRagRepairResultActionBindings = curatedRagCarriedRefRepairResultBindings(
    input,
    curatedRagCarriedRefRepairResult,
  );
  const sourceContextReviewOutcomeActionBindings =
    sourceContextReviewOutcomeBindings(input, sourceContextReviewOutcome);
  const literatureSourceReviewHandoffActionBindings =
    literatureSourceReviewHandoffBindings(input, literatureSourceReviewHandoff);
  const actionBindings = bounded(
    uniqueBindings([
      ...workflows.flatMap((workflow) => workflow.metadata.actionBindings),
      ...physics.capsules.flatMap((capsule) => bindingsFromAffordances(capsule)),
      ...(aitp?.compiled.actionRecommendations ?? []),
      ...curatedRagActionBindings,
      ...curatedRagRepairActionBindings,
      ...curatedRagRepairResultActionBindings,
      ...sourceContextReviewOutcomeActionBindings,
      ...literatureSourceReviewHandoffActionBindings,
    ]),
    input.limits?.maxActionBindings ?? DEFAULT_MAX_ACTION_BINDINGS,
    (remaining) =>
      diagnostics.push({
        severity: 'info',
        code: 'action-bindings-truncated',
        message: `${remaining} action bindings were omitted from the context pack.`,
        source: 'workframe',
        refId: frame.id,
      }),
  );
  const sourceRefs = unique([
    ...frame.sourceRefs,
    ...profiles.flatMap((profile) => profile.sourceRefs),
    ...workflows.flatMap((workflow) => workflow.metadata.sourceRefs),
    ...physics.capsules.flatMap((capsule) => capsule.sourceRefs),
    ...ledger.proposals.flatMap((proposal) => proposal.sourceRefs),
  ]);
  const id = contextPackId({
    workFrameId: frame.id,
    domain: frame.domain,
    topic: frame.topic,
    requestedFocus,
    profileIds: profiles.map((profile) => profile.id),
    workflowIds: workflows.map((workflow) => workflow.metadata.id),
    capsuleIds: physics.capsules.map((capsule) => capsule.id),
    proposalIds: ledger.proposals.map((proposal) => proposal.id),
    aitpDigest: aitp === undefined ? undefined : contextDigest(aitp.contextLines),
    curatedRagDigest:
      curatedRag === undefined
        ? undefined
        : contextDigest([
            curatedRag.query,
            ...curatedRag.results.map((item) => `${item.chunkId}:${item.contentHash}`),
          ]),
    curatedRagCarriedRefRepairDigest:
      curatedRagCarriedRefRepair === undefined
        ? undefined
        : contextDigest([
            ...curatedRagCarriedRefRepair.triggerTerms,
            curatedRagCarriedRefRepair.failureCode ?? '',
            curatedRagCarriedRefRepair.failurePath ?? '',
          ]),
    curatedRagCarriedRefRepairResultDigest:
      curatedRagCarriedRefRepairResult === undefined
        ? undefined
        : contextDigest([
            curatedRagCarriedRefRepairResult.handoffId,
            curatedRagCarriedRefRepairResult.confirmationId,
            curatedRagCarriedRefRepairResult.canonicalRef,
            curatedRagCarriedRefRepairResult.evidenceRef,
            curatedRagCarriedRefRepairResult.completedOperation,
          ]),
    sourceContextReviewOutcomeDigest:
      sourceContextReviewOutcome === undefined
        ? undefined
        : contextDigest([
            sourceContextReviewOutcome.callId,
            sourceContextReviewOutcome.decision,
            sourceContextReviewOutcome.reviewedCanonicalRef,
            sourceContextReviewOutcome.nextActionId,
          ]),
    literatureSourceReviewHandoffDigest:
      literatureSourceReviewHandoff === undefined
        ? undefined
        : contextDigest([
            literatureSourceReviewHandoff.sessionId,
            literatureSourceReviewHandoff.topicId,
            literatureSourceReviewHandoff.claimId,
            literatureSourceReviewHandoff.literatureUri,
            literatureSourceReviewHandoff.referenceLocationId,
          ]),
  });

  return {
    id,
    workFrameId: frame.id,
    domain: frame.domain,
    topic: frame.topic,
    goal: frame.goal,
    focusObjectIds: frame.activeObjectIds,
    assumptionIds: frame.assumptionIds,
    conventionIds: frame.conventionIds,
    sourceRefs,
    profiles,
    workflows: workflows.map(workflowSummary),
    physics,
    ledger,
    ...(aitp === undefined ? {} : { aitp }),
    ...(curatedRag === undefined ? {} : { curatedRag }),
    ...(curatedRagCarriedRefRepair === undefined ? {} : { curatedRagCarriedRefRepair }),
    ...(curatedRagCarriedRefRepairResult === undefined
      ? {}
      : { curatedRagCarriedRefRepairResult }),
    ...(sourceContextReviewOutcome === undefined ? {} : { sourceContextReviewOutcome }),
    ...(literatureSourceReviewHandoff === undefined
      ? {}
      : { literatureSourceReviewHandoff }),
    actionBindings,
    domainPack,
    diagnostics,
    compiledAt: input.now?.() ?? Date.now(),
  };
}

function collectSourceContextReviewOutcome(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextSourceContextReviewOutcomeSummary | undefined {
  const summary = input.sourceContextReviewOutcome;
  if (summary === undefined) return undefined;
  diagnostics.push({
    severity: 'info',
    code: 'aitp:source-context-review-outcome',
    message:
      'Source context review selected a next research action; the selection is runtime guidance only and does not prove source support or trust.',
    source: 'aitp',
    refId: summary.callId,
  });
  return summary;
}

function sourceContextReviewOutcomeBindings(
  input: CompileResearchContextPackInput,
  summary: ResearchContextSourceContextReviewOutcomeSummary | undefined,
): readonly ResearchActionBinding[] {
  if (summary === undefined) return [];
  const bindingId = sourceContextReviewOutcomeBindingId(summary.callId, summary.nextActionId);
  return [
    {
      id: bindingId,
      actionId: summary.nextActionId,
      adapterId: 'aitp.curated-rag.source-context-review-outcome',
      domainId: input.workFrame.domain,
      objectRefs: [
        summary.reviewedCanonicalRef,
        summary.reviewedEvidenceRef,
        `source_context_review_call:${summary.callId}`,
        `source_context_review_decision:${summary.decision}`,
      ],
      priority: summary.decision === 'blocker' ? 'blocking' : 'high',
      reason:
        'Source-context review selected the next runtime research action; execute it explicitly and keep validation, source support, and trust facts in AITP.',
      params: {
        toolAction: `ResearchAction.${summary.nextActionId}`,
        actionId: summary.nextActionId,
        sourceReviewCallId: summary.callId,
        sourceReviewOutcome: summary.outcome,
        sourceReviewDecision: summary.decision,
        reviewedCanonicalRef: summary.reviewedCanonicalRef,
        reviewedEvidenceRef: summary.reviewedEvidenceRef,
        claimScope: summary.claimScope,
        chunkScope: summary.chunkScope,
        rationale: summary.rationale,
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
        allowedNextToolCall: {
          action: 'plan_primitive_tools',
          action_id: summary.nextActionId,
          source_context_review_outcome_binding_id: bindingId,
          reviewed_canonical_ref: summary.reviewedCanonicalRef,
          reviewed_evidence_ref: summary.reviewedEvidenceRef,
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
      },
    },
  ];
}

function collectLiteratureSourceReviewHandoff(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextLiteratureSourceReviewHandoffSection | undefined {
  const handoff = input.literatureSourceReviewHandoff;
  if (handoff === null || handoff === undefined) return undefined;
  if (!isValidLiteratureSourceReviewHandoffForContext(handoff)) {
    diagnostics.push({
      severity: 'warning',
      code: 'aitp:literature-source-review-handoff-rejected',
      message:
        'AITP literature source review handoff was omitted because no-trust/no-write flags did not match the ContextPack boundary.',
      source: 'aitp',
      refId: input.workFrame.id,
    });
    return undefined;
  }
  const referenceCandidate = recordValue(
    handoff.literatureIntakeSuggestion['reference_candidate'],
  );
  const section: ResearchContextLiteratureSourceReviewHandoffSection = {
    source: 'aitp.literature_source_review_handoff',
    sessionId: handoff.sessionId,
    topicId: handoff.topicId,
    claimId: handoff.claimId,
    truthSource: handoff.truthSource,
    readSurfaceEffect: 'handoff_context_only',
    literatureLabel: stringValue(referenceCandidate['label']),
    literatureUri: stringValue(referenceCandidate['uri']),
    literatureExternalId: stringValue(referenceCandidate['external_id']),
    referenceLocationId: stringValue(referenceCandidate['location_id']),
    recommendedAction: stringValue(handoff.literatureIntakeSuggestion['recommended_action']),
    recordRefLookupCount: numberValue(handoff.recordRefLookup['lookup_count']),
    recordRefFoundCount: numberValue(handoff.recordRefLookup['found_count']),
    recordRefMissingCount: numberValue(handoff.recordRefLookup['missing_count']),
    sourceStackCoverageStatus: stringValue(
      handoff.sourceStackCoverageItem['coverage_status'],
    ),
    sourceStackCoverageMissingCount: numberValue(
      handoff.sourceStackCoverageItem['missing_count'],
    ),
    sourceReconstructionReviewStatus: stringValue(
      handoff.sourceReconstructionReviewPacket['review_status'],
    ),
    recommendedNextEntrypoints: unique(
      handoff.recommendedNextEntrypoints.map((item) => item.entrypoint),
    ),
    forbiddenUses: handoff.handoffPolicy.forbiddenUses,
    allowedNextToolCall: {
      action: 'plan_primitive_tools',
      actionId: 'source.review_context',
      requiresExplicitNextAction: true,
      recordsValidationResult: false,
      sourceSupportResult: false,
      claimTrustMutation: 'none',
    },
    bindingId: literatureSourceReviewHandoffBindingId(
      handoff.sessionId,
      handoff.claimId,
      stringValue(referenceCandidate['location_id']),
    ),
    raw: handoff,
    readOnly: true,
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
  };
  diagnostics.push({
    severity: 'info',
    code: 'aitp:literature-source-review-handoff',
    message:
      'AITP literature source review handoff is available as read-only source-review context; canonical effects require explicit later AITP entrypoints.',
    source: 'aitp',
    refId: handoff.claimId || handoff.sessionId,
  });
  return section;
}

function literatureSourceReviewHandoffBindings(
  input: CompileResearchContextPackInput,
  section: ResearchContextLiteratureSourceReviewHandoffSection | undefined,
): readonly ResearchActionBinding[] {
  if (section === undefined) return [];
  return [
    {
      id: section.bindingId,
      actionId: 'source.review_context',
      adapterId: 'aitp.literature.source-review-handoff',
      domainId: input.workFrame.domain,
      objectRefs: unique([
        `literature_session:${section.sessionId}`,
        `aitp:topic:${section.topicId}`,
        section.claimId.length > 0 ? `aitp:claim:${section.claimId}` : '',
        section.referenceLocationId.length > 0
          ? `reference_location:${section.referenceLocationId}`
          : '',
        section.literatureUri.length > 0 ? `literature_uri:${section.literatureUri}` : '',
      ]),
      priority: 'high',
      reason:
        'AITP literature/source review handoff is ready for explicit source.review_context planning; this binding is read-only and grants no evidence, validation, write, final-gate, or trust authority.',
      params: {
        toolAction: 'ResearchAction.plan_primitive_tools',
        actionId: 'source.review_context',
        continuationSource: 'literature_source_review_handoff',
        sessionId: section.sessionId,
        topicId: section.topicId,
        claimId: section.claimId,
        literatureLabel: section.literatureLabel,
        literatureUri: section.literatureUri,
        literatureExternalId: section.literatureExternalId,
        referenceLocationId: section.referenceLocationId,
        recommendedAction: section.recommendedAction,
        recordRefLookupCount: section.recordRefLookupCount,
        recordRefFoundCount: section.recordRefFoundCount,
        recordRefMissingCount: section.recordRefMissingCount,
        sourceStackCoverageStatus: section.sourceStackCoverageStatus,
        sourceStackCoverageMissingCount: section.sourceStackCoverageMissingCount,
        sourceReconstructionReviewStatus: section.sourceReconstructionReviewStatus,
        recommendedNextEntrypoints: section.recommendedNextEntrypoints,
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
          literature_source_review_handoff_binding_id: section.bindingId,
          literature_session_id: section.sessionId,
          literature_uri: section.literatureUri,
          reference_location_id: section.referenceLocationId,
          requires_explicit_next_action: true,
          records_validation_result: false,
          source_support_result: false,
          claim_trust_mutation: 'none',
        },
        forbiddenUses: section.forbiddenUses,
      },
    },
  ];
}

function isValidLiteratureSourceReviewHandoffForContext(
  handoff: AitpLiteratureSourceReviewHandoff,
): boolean {
  return (
    handoff.kind === 'literature_source_review_handoff' &&
    handoff.readOnly === true &&
    handoff.requiresExplicitNextAction === true &&
    handoff.allowedNextToolCall.action === 'plan_primitive_tools' &&
    handoff.allowedNextToolCall.actionId === 'source.review_context' &&
    handoff.bridgeCalled === false &&
    handoff.executesWriteNow === false &&
    handoff.mutatesNextPayloadNow === false &&
    handoff.infersPayloadValues === false &&
    handoff.recordsValidationResult === false &&
    handoff.sourceSupportResult === false &&
    handoff.evidenceCreated === false &&
    handoff.validationCreated === false &&
    handoff.writeExecuted === false &&
    handoff.claimTrustMutation === 'none' &&
    handoff.canUpdateClaimTrust === false &&
    [
      'evidence_support',
      'source_support_result',
      'validation_result',
      'write_execution',
      'final_gate_satisfaction',
      'claim_trust_update',
      'trust_apply',
    ].every((item) => handoff.handoffPolicy.forbiddenUses.includes(item))
  );
}

function collectCuratedRagCarriedRefRepair(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextCuratedRagCarriedRefRepairSection | undefined {
  if (input.curatedRagCarriedRefRepairActive !== true) return undefined;
  diagnostics.push({
    severity: 'info',
    code: 'aitp:curated-rag-carried-ref-repair-sequence',
    message:
      'Curated RAG carried-ref handoff repair is active; use taxonomy metadata, fresh draft review, readiness inspection, and explicit execute in order.',
    source: 'aitp',
    refId: input.workFrame.id,
  });
  return {
    active: true,
    source: 'turn_text',
    triggerTerms: unique(input.curatedRagCarriedRefRepairTriggerTerms ?? []),
    ...(hasText(input.curatedRagCarriedRefRepairFailureCode)
      ? { failureCode: input.curatedRagCarriedRefRepairFailureCode }
      : {}),
    ...(hasText(input.curatedRagCarriedRefRepairFailurePath)
      ? { failurePath: input.curatedRagCarriedRefRepairFailurePath }
      : {}),
    safeSequence: [
      'inspect taxonomy metadata',
      'prepare fresh draft action',
      'apply explicit reviewed overrides',
      'inspect readiness',
      'execute only with explicit execute_aitp_write_bridge call',
    ],
    taxonomyAction: 'ResearchAction.list_actions',
    draftAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
    readinessAction: 'ResearchAction.inspect_aitp_write_bridge_handoff_readiness',
    executeAction: 'ResearchAction.execute_aitp_write_bridge',
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    executesWriteNow: false,
  };
}

function curatedRagCarriedRefRepairBindings(
  input: CompileResearchContextPackInput,
  repair: ResearchContextCuratedRagCarriedRefRepairSection | undefined,
): readonly ResearchActionBinding[] {
  if (repair === undefined) return [];
  if (!hasText(repair.failureCode) || !hasText(repair.failurePath)) return [];
  const bindingId = curatedRagCarriedRefRepairBindingId(repair.failureCode, repair.failurePath);
  return [
    {
      id: bindingId,
      actionId: 'draft_aitp_curated_rag_write_bridge_call',
      adapterId: 'aitp.curated-rag.carried-ref-repair-draft',
      domainId: input.workFrame.domain,
      objectRefs: [
        `carried_ref_handoff_failure:${safeId(repair.failureCode)}`,
        `carried_ref_handoff_path:${contextDigest([repair.failurePath])}`,
      ],
      priority: 'normal',
      reason:
        'Concrete carried-ref handoff failure can be repaired by drafting a fresh curated RAG write-bridge call with reviewed overrides; this binding does not execute a write.',
      params: {
        toolAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
        failureCode: repair.failureCode,
        failurePath: repair.failurePath,
        failureSource: 'carried_ref_handoff_failure',
        taxonomyAction: repair.taxonomyAction,
        draftAction: repair.draftAction,
        readinessAction: repair.readinessAction,
        executeAction: repair.executeAction,
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
        allowedNextToolCall: {
          action: 'draft_aitp_curated_rag_write_bridge_call',
          failure_code: repair.failureCode,
          failure_path: repair.failurePath,
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
      },
    },
  ];
}

function collectCuratedRagCarriedRefRepairResult(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextCuratedRagCarriedRefRepairResultSummary | undefined {
  const summary = input.curatedRagCarriedRefRepairResult;
  if (summary === undefined) return undefined;
  diagnostics.push({
    severity: 'info',
    code: 'aitp:curated-rag-carried-ref-repair-result-summary',
    message:
      'Curated RAG carried-ref repair returned a successful AITP record; any continuation is a fresh draft with explicit reviewed overrides.',
    source: 'aitp',
    refId: summary.handoffId,
  });
  return summary;
}

function curatedRagCarriedRefRepairResultBindings(
  input: CompileResearchContextPackInput,
  summary: ResearchContextCuratedRagCarriedRefRepairResultSummary | undefined,
): readonly ResearchActionBinding[] {
  if (summary === undefined) return [];
  const draftBindingId = curatedRagCarriedRefRepairResultBindingId(
    summary.handoffId,
    summary.canonicalRef,
  );
  const reviewBindingId = curatedRagCarriedRefRepairResultReviewBindingId(
    summary.handoffId,
    summary.canonicalRef,
  );
  return [
    {
      id: reviewBindingId,
      actionId: 'source.review_context',
      adapterId: 'aitp.curated-rag.carried-ref-repair-result-source-context-review',
      domainId: input.workFrame.domain,
      objectRefs: [
        summary.canonicalRef,
        summary.evidenceRef,
        `aitp:${summary.refKind}:${summary.recordId}`,
        `carried_ref_repair_handoff:${summary.handoffId}`,
      ],
      priority: 'high',
      reason:
        'Successful carried-ref repair result should be reviewed against source text, chunk scope, and claim scope before choosing a fresh draft, validation check, or blocker; this binding is read-only and does not grant support or trust.',
      params: {
        toolAction: 'ResearchAction.plan_primitive_tools',
        actionId: 'source.review_context',
        handoffId: summary.handoffId,
        confirmationId: summary.confirmationId,
        completedStage: summary.completedStage,
        completedOperation: summary.completedOperation,
        resultKind: summary.resultKind,
        refKind: summary.refKind,
        recordId: summary.recordId,
        canonicalRef: summary.canonicalRef,
        evidenceRef: summary.evidenceRef,
        readinessChecklistId: summary.readinessChecklistId,
        repairHintOperations: summary.repairHintOperations,
        selectedWriteDiffersFromRepairHints: summary.selectedWriteDiffersFromRepairHints,
        continuationSource: 'carried_ref_repair_result_summary',
        reviewPurpose:
          'check source text, chunk scope, claim scope, and whether the carried ref is appropriate before drafting the next write-bridge call',
        reviewBeforeDraft: true,
        returnedResultOwnedByAitp: true,
        candidateReviewedOverrideRef: summary.canonicalRef,
        candidateEvidenceRef: summary.evidenceRef,
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
        allowedNextToolCall: {
          action: 'plan_primitive_tools',
          action_id: 'source.review_context',
          carried_ref_repair_result_binding_id: reviewBindingId,
          candidate_reviewed_override_ref: summary.canonicalRef,
          candidate_evidence_ref: summary.evidenceRef,
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
      },
    },
    {
      id: draftBindingId,
      actionId: 'draft_aitp_curated_rag_write_bridge_call',
      adapterId: 'aitp.curated-rag.carried-ref-repair-result-continuation',
      domainId: input.workFrame.domain,
      objectRefs: [
        summary.canonicalRef,
        summary.evidenceRef,
        `aitp:${summary.refKind}:${summary.recordId}`,
        `carried_ref_repair_handoff:${summary.handoffId}`,
      ],
      priority: 'normal',
      reason:
        'Successful carried-ref repair result can be carried into a later fresh curated RAG write-bridge draft as explicit reviewed override input; this binding does not infer chunk, stage, payload, validation, or trust.',
      params: {
        toolAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call',
        handoffId: summary.handoffId,
        confirmationId: summary.confirmationId,
        completedStage: summary.completedStage,
        completedOperation: summary.completedOperation,
        resultKind: summary.resultKind,
        refKind: summary.refKind,
        recordId: summary.recordId,
        canonicalRef: summary.canonicalRef,
        evidenceRef: summary.evidenceRef,
        readinessChecklistId: summary.readinessChecklistId,
        repairHintOperations: summary.repairHintOperations,
        selectedWriteDiffersFromRepairHints: summary.selectedWriteDiffersFromRepairHints,
        continuationSource: 'carried_ref_repair_result_summary',
        returnedResultOwnedByAitp: true,
        candidateReviewedOverrideRef: summary.canonicalRef,
        candidateEvidenceRef: summary.evidenceRef,
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
        allowedNextToolCall: {
          action: 'draft_aitp_curated_rag_write_bridge_call',
          carried_ref_repair_result_binding_id: draftBindingId,
          candidate_reviewed_override_ref: summary.canonicalRef,
          candidate_evidence_ref: summary.evidenceRef,
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
      },
    },
  ];
}

function collectCuratedRag(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextCuratedRagSection | undefined {
  if (input.curatedRag === null || input.curatedRag === undefined) return undefined;
  diagnostics.push({
    severity: 'info',
    code: 'aitp:curated-rag-heuristic-context',
    message:
      'AITP curated RAG results are heuristic context only and require normal source/evidence promotion before claim support.',
    source: 'aitp',
    refId: input.workFrame.id,
  });
  if (input.curatedRag.staleIndexDiagnostics.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'aitp:curated-rag-stale-index-diagnostic',
      message: 'AITP curated RAG returned stale-index diagnostics.',
      source: 'aitp',
      refId: input.workFrame.id,
    });
  }
  const promotionDraftSuggested = shouldSuggestCuratedRagPromotionDraft(input);
  const results = bounded(
    input.curatedRag.results.map((item) =>
      curatedRagChunkSummary(item, promotionDraftSuggested),
    ),
    input.limits?.maxCuratedRagResults ?? DEFAULT_MAX_CURATED_RAG_RESULTS,
    (remaining) =>
      diagnostics.push({
        severity: 'info',
        code: 'curated-rag-results-truncated',
        message: `${remaining} curated RAG result(s) were omitted from the context pack.`,
        source: 'aitp',
        refId: input.workFrame.id,
      }),
  );
  return {
    query: input.curatedRag.query,
    reasonIds: unique(input.curatedRagReasonIds ?? []),
    indexMode: input.curatedRag.indexMode,
    resultRole: 'heuristic_context',
    readSurfaceEffect: 'orientation_only',
    resultCount: results.length,
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
    requiresPromotionForClaimSupport: true,
    promotionDraftSuggested,
    promotionDraftBindingIds: promotionDraftSuggested
      ? results.map((item) => item.promotionDraftBindingId).filter(isString)
      : [],
    indexStatus: input.curatedRag.indexStatus,
    staleIndexDiagnostics: input.curatedRag.staleIndexDiagnostics,
    results,
  };
}

function curatedRagChunkSummary(
  item: {
    readonly chunkId: string;
    readonly documentId: string;
    readonly score: number;
    readonly summary: string;
    readonly text: string;
    readonly contentHash: string;
    readonly tags: readonly string[];
  },
  promotionDraftSuggested: boolean,
): ResearchContextCuratedRagChunkSummary {
  return {
    chunkId: item.chunkId,
    documentId: item.documentId,
    score: item.score,
    summary: item.summary,
    text: item.text,
    contentHash: item.contentHash,
    tags: item.tags,
    promotionDraftBindingId: promotionDraftSuggested
      ? curatedRagPromotionDraftBindingId(item.chunkId)
      : undefined,
  };
}

function curatedRagPromotionDraftBindings(
  input: CompileResearchContextPackInput,
  curatedRag: ResearchContextCuratedRagSection | undefined,
): readonly ResearchActionBinding[] {
  if (curatedRag === undefined || !curatedRag.promotionDraftSuggested) return [];
  const scope = inferAitpClaimScope(input);
  return curatedRag.results.map((item) => ({
    id: curatedRagPromotionDraftBindingId(item.chunkId),
    actionId: 'draft_aitp_curated_rag_promotion',
    adapterId: 'aitp.curated-rag.promotion-draft',
    domainId: input.workFrame.domain,
    objectRefs: [`aitp:curated_rag_chunk:${item.chunkId}`, `aitp:curated_rag_document:${item.documentId}`],
    priority: 'normal',
    reason:
      'Retrieved AITP curated RAG chunk may be claim-relevant; ask AITP for a read-only promotion draft before any source/evidence write.',
    params: {
      toolAction: 'ResearchAction.draft_aitp_curated_rag_promotion',
      ragChunkId: item.chunkId,
      ragDocumentId: item.documentId,
      ragContentHash: item.contentHash,
      aitpTopicId: scope.topicId,
      aitpClaimId: scope.claimId,
      aitpConnectorId: scope.connectorId,
      aitpPromotionIntent: 'claim_support_review',
      retrievalRole: 'heuristic_context',
      readSurfaceEffect: 'orientation_only',
      draftCreatesRecords: false,
      recordsValidationResult: false,
      claimTrustMutation: 'none',
      canUpdateClaimTrust: false,
      requiresPromotionForClaimSupport: true,
      requiresUserOrModelDecisionBeforeWrite: true,
      forbiddenUses: [
        'evidence_support',
        'validation_result',
        'claim_trust_update',
        'trust_apply',
        'final_gate_satisfaction',
      ],
      allowedNextToolCall: {
        action: 'draft_aitp_curated_rag_promotion',
        rag_chunk_id: item.chunkId,
        aitp_topic_id: scope.topicId,
        aitp_claim_id: scope.claimId,
        aitp_connector_id: scope.connectorId,
        aitp_promotion_intent: 'claim_support_review',
      },
    },
  }));
}

function shouldSuggestCuratedRagPromotionDraft(input: CompileResearchContextPackInput): boolean {
  if (input.curatedRag === null || input.curatedRag === undefined) return false;
  const reasons = new Set(input.curatedRagReasonIds ?? []);
  if (reasons.has('source_backtrace_suggestions')) return true;
  const promptableRefs = [
    input.workFrame.goal,
    ...input.workFrame.sourceRefs,
    ...input.workFrame.activeObjectIds,
    ...(input.aitp?.contextLines ?? []),
  ].join(' ').toLowerCase();
  return (
    promptableRefs.includes('claim support') ||
    promptableRefs.includes('source support') ||
    promptableRefs.includes('evidence') ||
    promptableRefs.includes('source stack') ||
    promptableRefs.includes('reference location') ||
    promptableRefs.includes('source reconstruction')
  );
}

function curatedRagPromotionDraftBindingId(chunkId: string): string {
  return `binding.aitp.curated-rag-promotion-draft.${safeId(chunkId)}`;
}

function curatedRagCarriedRefRepairBindingId(failureCode: string, failurePath: string): string {
  return `binding.aitp.curated-rag-carried-ref-repair.${safeId(failureCode)}.${contextDigest([failurePath])}`;
}

function curatedRagCarriedRefRepairResultBindingId(handoffId: string, canonicalRef: string): string {
  return `binding.aitp.curated-rag-carried-ref-repair-result.${safeId(handoffId)}.${contextDigest([canonicalRef])}`;
}

function curatedRagCarriedRefRepairResultReviewBindingId(
  handoffId: string,
  canonicalRef: string,
): string {
  return `binding.aitp.curated-rag-carried-ref-repair-result-review.${safeId(handoffId)}.${contextDigest([canonicalRef])}`;
}

function sourceContextReviewOutcomeBindingId(callId: string, nextActionId: string): string {
  return `binding.aitp.source-context-review-outcome.${safeId(callId)}.${safeId(nextActionId)}`;
}

function literatureSourceReviewHandoffBindingId(
  sessionId: string,
  claimId: string,
  referenceLocationId: string,
): string {
  return `binding.aitp.literature-source-review-handoff.${safeId(sessionId)}.${contextDigest([
    claimId,
    referenceLocationId,
  ])}`;
}

function inferAitpClaimScope(input: CompileResearchContextPackInput): {
  readonly topicId: string;
  readonly claimId: string;
  readonly connectorId: string;
} {
  const topicId = input.workFrame.topic;
  const claimId =
    firstClaimId(input.workFrame.sourceRefs) ??
    firstClaimId(input.workFrame.activeObjectIds) ??
    input.aitp?.sourceStackCoverage.all[0]?.claimId ??
    input.aitp?.sourceReconstructionReview.all[0]?.claimId ??
    '';
  return {
    topicId,
    claimId,
    connectorId: claimId.length > 0 ? `curated-rag:${claimId}` : 'curated-rag:<claim-id>',
  };
}

function firstClaimId(values: readonly string[]): string | undefined {
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.startsWith('aitp:claim:')) return normalized.slice('aitp:claim:'.length);
    if (normalized.startsWith('claim:')) return normalized.slice('claim:'.length);
    if (normalized.startsWith('claim-')) return normalized;
  }
  return undefined;
}

function collectAitp(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextAitpSection | undefined {
  if (input.aitp === null || input.aitp === undefined) return undefined;
  for (const code of input.aitp.diagnostics) {
    diagnostics.push({
      severity: code === 'orientation-only' ? 'info' : 'warning',
      code: `aitp:${code}`,
      message: `AITP process graph diagnostic: ${code}`,
      source: 'aitp',
      refId: input.workFrame.id,
    });
  }
  return {
    truthSource: input.aitp.trust.truthSource,
    orientationOnly: input.aitp.trust.orientationOnly,
    reminders: input.aitp.reminders,
    contextLines: input.aitp.contextLines,
    liveRouteIds: input.aitp.routes.live.map((item) => item.id),
    blockedRouteIds: input.aitp.routes.blocked.map((item) => item.id),
    abandonedRouteIds: input.aitp.routes.abandoned.map((item) => item.id),
    pivotRequiredRouteIds: input.aitp.routes.pivotRequired.map((item) => item.id),
    provenanceGapIds: input.aitp.provenance.all.map((item) => item.id),
    sourceProvenanceGapIds: input.aitp.provenance.source.map((item) => item.id),
    codeProvenanceGapIds: input.aitp.provenance.code.map((item) => item.id),
    toolProvenanceGapIds: input.aitp.provenance.tool.map((item) => item.id),
    validationProvenanceGapIds: input.aitp.provenance.validation.map((item) => item.id),
    artifactProvenanceGapIds: input.aitp.provenance.artifact.map((item) => item.id),
    sourceAssetIds: input.aitp.sourceAssets.all.map((item) => item.id),
    sourceAssetMissingHashIds: input.aitp.sourceAssets.missingHash.map((item) => item.id),
    sourceAssetDuplicateHashIds: input.aitp.sourceAssets.duplicateHash.map((item) => item.id),
    sourceStackCoverageClaimIds: input.aitp.sourceStackCoverage.all.map((item) => item.claimId),
    sourceStackEvidenceGapClaimIds:
      input.aitp.sourceStackCoverage.missingRequiredOutputClaimIds,
    sourceStackReconstructionGapClaimIds:
      input.aitp.sourceStackCoverage.missingSourceComponentClaimIds,
    sourceStackReviewGapClaimIds: input.aitp.sourceStackCoverage.reviewGapClaimIds,
    sourceStackCoverageNextActions: input.aitp.sourceStackCoverage.nextActions,
    sourceReconstructionReviewClaimIds:
      input.aitp.sourceReconstructionReview.all.map((item) => item.claimId),
    sourceReconstructionReviewOpenClaimIds:
      input.aitp.sourceReconstructionReview.openReviewClaimIds,
    sourceReconstructionReviewNeedsRevisionClaimIds:
      input.aitp.sourceReconstructionReview.needsRevisionClaimIds,
    sourceReconstructionReviewInconclusiveClaimIds:
      input.aitp.sourceReconstructionReview.inconclusiveClaimIds,
    sourceReconstructionReviewPacketClaimIds:
      input.aitp.sourceReconstructionReview.reviewPacketClaimIds,
    sourceReconstructionReviewNextActions:
      input.aitp.sourceReconstructionReview.nextActions,
    trustBoundaryReasons: input.aitp.trust.trustBoundaryReasons,
    openObligationIds: [
      ...input.aitp.obligations.blocking,
      ...input.aitp.obligations.recommended,
      ...input.aitp.obligations.advisory,
    ].map((item) => item.id),
    requiredCallIds: input.aitp.callObligations
      .filter((item) => item.requiredNow)
      .map((item) => item.id),
    trustPrerequisiteCallIds: input.aitp.callObligations
      .filter((item) => item.requiredBeforeTrustChange.length > 0)
      .map((item) => item.id),
    suggestedActionIds: input.aitp.actionRecommendations.map((binding) => binding.actionId),
    compiled: input.aitp,
  };
}

function collectProfiles(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): readonly ResearchContextProfileSummary[] {
  if (input.domainProfiles === null || input.domainProfiles === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'domain-profile-registry-disabled',
      message: 'DomainProfile registry is not available for this session.',
      source: 'domain-profile',
    });
    return [];
  }
  for (const diagnostic of input.domainProfiles.getDiagnostics()) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'domain-profile',
      refId: diagnostic.profileId,
    });
  }
  const exactProfiles = input.domainProfiles.listProfiles({ domain: input.workFrame.domain });
  let selectedProfiles = exactProfiles;
  if (
    shouldUseGenericTheoreticalPhysicsFallback({
      domain: input.workFrame.domain,
      exactCount: exactProfiles.length,
    })
  ) {
    const fallback = input.domainProfiles.getProfile(GENERIC_THEORETICAL_PHYSICS_PROFILE_ID);
    if (fallback !== undefined) {
      selectedProfiles = [fallback];
      diagnostics.push({
        severity: 'info',
        code: 'generic-theoretical-physics-profile-fallback',
        message:
          `No domain profile is registered for "${input.workFrame.domain}"; using the built-in ` +
          `${GENERIC_THEORETICAL_PHYSICS_DOMAIN} research profile as a process scaffold.`,
        source: 'domain-profile',
        refId: fallback.metadata.id,
      });
    }
  }
  return selectedProfiles.map((profile) => ({
      id: profile.metadata.id,
      title: profile.metadata.title,
      status: profile.metadata.status,
      sourceRefs: profile.metadata.sourceRefs,
      conventions: profile.metadata.conventions,
      lenses: profile.metadata.lenses,
      workflows: profile.metadata.workflows,
      capsuleRefs: profile.metadata.capsuleRefs,
      bridgeCapsules: profile.metadata.bridgeCapsules,
      contextTags: profile.metadata.contextTags,
    }));
}

function collectWorkflows(
  input: CompileResearchContextPackInput,
  profiles: readonly ResearchContextProfileSummary[],
  diagnostics: ResearchContextPackDiagnostic[],
): readonly WorkflowRecipe[] {
  if (input.workflowRecipes === null || input.workflowRecipes === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'workflow-recipe-registry-disabled',
      message: 'WorkflowRecipe registry is not available for this session.',
      source: 'workflow-recipe',
    });
    return [];
  }
  for (const diagnostic of input.workflowRecipes.getDiagnostics()) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'workflow-recipe',
      refId: diagnostic.recipeId,
    });
  }
  const profileWorkflowIds = unique(profiles.flatMap((profile) => profile.workflows));
  if (profileWorkflowIds.length === 0) {
    return input.workflowRecipes.listRecipes({ domain: input.workFrame.domain });
  }

  const byId = new Map<string, WorkflowRecipe>();
  const usingGenericFallback = profiles.some((profile) =>
    isGenericTheoreticalPhysicsProfileId(profile.id),
  );
  for (const workflowId of profileWorkflowIds) {
    const workflow = input.workflowRecipes.getRecipe(workflowId);
    if (workflow === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'missing-profile-workflow',
        message: `Domain profile references missing workflow recipe "${workflowId}".`,
        source: 'workflow-recipe',
        refId: workflowId,
      });
      continue;
    }
    if (
      workflow.metadata.domain !== input.workFrame.domain &&
      !isGenericTheoreticalPhysicsWorkflowId(workflow.metadata.id)
    ) {
      diagnostics.push({
        severity: 'warning',
        code: 'cross-domain-profile-workflow',
        message: `Workflow recipe "${workflowId}" belongs to domain "${workflow.metadata.domain}", not "${input.workFrame.domain}".`,
        source: 'workflow-recipe',
        refId: workflowId,
      });
      continue;
    }
    byId.set(workflow.metadata.id, workflow);
  }
  if (usingGenericFallback && hasComputationalResearchIntent(input.workFrame)) {
    const computational = input.workflowRecipes.getRecipe(
      GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID,
    );
    if (computational !== undefined) byId.set(computational.metadata.id, computational);
  }
  return [...byId.values()].toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
}

function collectPhysics(
  input: CompileResearchContextPackInput,
  requestedFocus: readonly string[],
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextPack['physics'] {
  if (input.physicsMemory === null || input.physicsMemory === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'physics-memory-registry-disabled',
      message: 'PhysicsMemory registry is not available for this session.',
      source: 'physics-memory',
    });
    return { requestedFocus, includedFocus: [], capsules: [] };
  }
  const knownFocus = requestedFocus.filter((id) => input.physicsMemory?.getCapsule(id) !== undefined);
  for (const focusId of requestedFocus) {
    if (input.physicsMemory.getCapsule(focusId) !== undefined) continue;
    diagnostics.push({
      severity: 'info',
      code: 'unresolved-focus-ref',
      message: `Focus ref "${focusId}" is not a registered physics capsule id.`,
      source: 'physics-memory',
      refId: focusId,
    });
  }
  const genericFocus = knownFocus.filter((id) => isGenericTheoreticalPhysicsCapsuleId(id));
  const localFocus = knownFocus.filter((id) => !isGenericTheoreticalPhysicsCapsuleId(id));
  const physicsPacks =
    genericFocus.length === 0
      ? [
          compilePhysicsContext(input.physicsMemory, {
            domain: input.workFrame.domain,
            focus: knownFocus.length === 0 ? undefined : knownFocus,
            reliabilityFloor: input.reliabilityFloor,
            bridgePolicy: input.bridgePolicy,
          }),
        ]
      : [
          ...(localFocus.length === 0
            ? []
            : [
                compilePhysicsContext(input.physicsMemory, {
                  domain: input.workFrame.domain,
                  focus: localFocus,
                  reliabilityFloor: input.reliabilityFloor,
                  bridgePolicy: input.bridgePolicy,
                }),
              ]),
          compilePhysicsContext(input.physicsMemory, {
            domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN,
            focus: genericFocus,
            reliabilityFloor: input.reliabilityFloor,
            bridgePolicy: input.bridgePolicy,
          }),
        ];
  for (const diagnostic of physicsPacks.flatMap((pack) => pack.diagnostics)) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'physics-memory',
      refId: diagnostic.capsuleId,
    });
  }
  const capsules = bounded(
    uniqueCapsules(physicsPacks.flatMap((pack) => pack.capsules)).map(capsuleSummary),
    input.limits?.maxCapsules ?? DEFAULT_MAX_CAPSULES,
    (remaining) =>
      diagnostics.push({
        severity: 'info',
        code: 'physics-capsules-truncated',
        message: `${remaining} physics capsules were omitted from the context pack.`,
        source: 'physics-memory',
        refId: input.workFrame.id,
      }),
  );
  return {
    requestedFocus,
    includedFocus: knownFocus,
    capsules,
  };
}

function collectLedger(
  input: CompileResearchContextPackInput,
  diagnostics: ResearchContextPackDiagnostic[],
): ResearchContextPack['ledger'] {
  const includeStatuses = input.includeLedgerStatuses ?? DEFAULT_LEDGER_STATUSES;
  if (input.researchLedger === null || input.researchLedger === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'research-ledger-registry-disabled',
      message: 'ResearchLedger registry is not available for this session.',
      source: 'research-ledger',
    });
    return { includeStatuses, proposals: [] };
  }
  const result = compileResearchLedgerProposals(input.researchLedger, {
    topic: input.workFrame.topic,
    domain: input.workFrame.domain,
    includeStatuses,
  });
  for (const diagnostic of result.diagnostics) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'research-ledger',
      refId: diagnostic.eventId ?? diagnostic.proposalId,
    });
  }
  return {
    includeStatuses,
    proposals: bounded(
      result.proposals.map((proposal): ResearchContextLedgerProposalSummary => ({
        id: proposal.id,
        kind: proposal.kind,
        eventIds: proposal.eventIds,
        targetCapsuleKind: proposal.targetCapsuleKind,
        targetCapsuleId: proposal.targetCapsuleId,
        sourceRefs: proposal.sourceRefs,
        openQuestions: proposal.openQuestions,
        confidence: proposal.confidence,
      })),
      input.limits?.maxLedgerProposals ?? DEFAULT_MAX_LEDGER_PROPOSALS,
      (remaining) =>
        diagnostics.push({
          severity: 'info',
          code: 'ledger-proposals-truncated',
          message: `${remaining} ledger proposals were omitted from the context pack.`,
          source: 'research-ledger',
          refId: input.workFrame.id,
        }),
    ),
  };
}

function workflowSummary(workflow: WorkflowRecipe): ResearchContextWorkflowSummary {
  return {
    id: workflow.metadata.id,
    title: workflow.metadata.title,
    status: workflow.metadata.status,
    sourceRefs: workflow.metadata.sourceRefs,
    actionBindingIds: workflow.metadata.actionBindings.map((binding) => binding.id),
    requiredCapsules: workflow.metadata.requiredCapsules,
    requiredTools: workflow.metadata.requiredTools,
    failureModes: workflow.metadata.failureModes,
  };
}

function capsuleSummary(capsule: PhysicsCapsule): ResearchContextCapsuleSummary {
  return {
    id: capsule.metadata.id,
    kind: capsule.metadata.kind,
    title: capsule.metadata.title,
    reliability: capsule.metadata.reliability,
    symbols: capsule.metadata.symbols,
    assumes: capsule.metadata.assumes,
    dependsOn: capsule.metadata.dependsOn,
    sourceRefs: capsule.metadata.sourceRefs,
    graphRefs: capsule.metadata.graphRefs,
    expansionHandles: capsule.metadata.expansionHandles,
    requiredChecks: capsule.metadata.requiredChecks,
    actionAffordances: capsule.metadata.actionAffordances,
  };
}

function bindingsFromAffordances(
  capsule: ResearchContextCapsuleSummary,
): readonly ResearchActionBinding[] {
  return capsule.actionAffordances.map((affordance) => ({
    id: `binding.${capsule.id}.${affordance.actionId}`,
    actionId: affordance.actionId,
    objectRefs: [capsule.id],
    reason: affordance.reason,
    priority: bindingPriority(affordance),
  }));
}

function bindingPriority(affordance: ActionAffordance): ResearchActionBinding['priority'] {
  switch (affordance.intent) {
    case 'required':
      return 'blocking';
    case 'recommended':
      return 'normal';
    case 'allowed':
      return 'low';
  }
}

function uniqueBindings(
  bindings: readonly ResearchActionBinding[],
): readonly ResearchActionBinding[] {
  const byId = new Map<string, ResearchActionBinding>();
  for (const binding of bindings) {
    const key = [
      binding.id,
      binding.actionId,
      binding.domainId ?? '',
      binding.workflowId ?? '',
      binding.lensId ?? '',
      binding.checkId ?? '',
      binding.adapterId ?? '',
      (binding.objectRefs ?? []).join(','),
    ].join('|');
    if (!byId.has(key)) byId.set(key, binding);
  }
  return [...byId.values()].toSorted((a, b) => a.id.localeCompare(b.id));
}

function uniqueCapsules(capsules: readonly PhysicsCapsule[]): readonly PhysicsCapsule[] {
  const byId = new Map<string, PhysicsCapsule>();
  for (const capsule of capsules) {
    if (!byId.has(capsule.metadata.id)) byId.set(capsule.metadata.id, capsule);
  }
  return [...byId.values()].toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
}

function bounded<T>(
  items: readonly T[],
  max: number,
  onTruncated: (remaining: number) => void,
): readonly T[] {
  if (items.length <= max) return items;
  onTruncated(items.length - max);
  return items.slice(0, max);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].toSorted();
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Readonly<Record<string, unknown>>;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function contextPackId(input: {
  readonly workFrameId: string;
  readonly domain: string;
  readonly topic: string;
  readonly requestedFocus: readonly string[];
  readonly profileIds: readonly string[];
  readonly workflowIds: readonly string[];
  readonly capsuleIds: readonly string[];
  readonly proposalIds: readonly string[];
  readonly aitpDigest?: string | undefined;
  readonly curatedRagDigest?: string | undefined;
  readonly curatedRagCarriedRefRepairDigest?: string | undefined;
  readonly curatedRagCarriedRefRepairResultDigest?: string | undefined;
  readonly sourceContextReviewOutcomeDigest?: string | undefined;
  readonly literatureSourceReviewHandoffDigest?: string | undefined;
}): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 12);
  return `context.${safeId(input.workFrameId)}.${hash}`;
}

function contextDigest(values: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 12);
}

function safeId(input: string): string {
  return input.replaceAll(/[^a-zA-Z0-9_.-]/g, '-');
}
