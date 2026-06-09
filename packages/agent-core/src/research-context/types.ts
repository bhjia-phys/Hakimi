import type { DomainProfileId } from '../domain-profile';
import type { DomainPackManifest } from '../domain-pack';
import type { CompiledAitpProcessGraphSlice } from '../aitp';
import type { AitpCuratedRagIndexMode, AitpCuratedRagSearchResult } from '../aitp/curated-rag';
import type {
  ActionAffordance,
  BridgePolicy,
  CheckContract,
  ExpansionHandle,
  GraphRef,
  PhysicsCapsuleId,
  PhysicsCapsuleKind,
  PhysicsDomainId,
  ReliabilityState,
} from '../physics-memory';
import type { ResearchActionBinding, WorkFrame } from '../research-action';
import type { ResearchLedgerEventStatus, ResearchTopicId } from '../research-ledger';
import type { WorkflowRecipeId } from '../workflow-recipe';

export type ResearchContextPackId = string;

export type ResearchContextRecordSource = 'model-tool' | 'controller' | 'replay';

export type ResearchContextDiagnosticSource =
  | 'aitp'
  | 'workframe'
  | 'domain-profile'
  | 'workflow-recipe'
  | 'physics-memory'
  | 'research-ledger';

export interface ResearchContextPackDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly source: ResearchContextDiagnosticSource;
  readonly refId?: string | undefined;
}

export interface ResearchContextProfileSummary {
  readonly id: DomainProfileId;
  readonly title: string;
  readonly status: ReliabilityState;
  readonly sourceRefs: readonly string[];
  readonly conventions: readonly string[];
  readonly lenses: readonly string[];
  readonly workflows: readonly WorkflowRecipeId[];
  readonly capsuleRefs: readonly PhysicsCapsuleId[];
  readonly bridgeCapsules: readonly PhysicsCapsuleId[];
  readonly contextTags: readonly string[];
}

export interface ResearchContextWorkflowSummary {
  readonly id: WorkflowRecipeId;
  readonly title: string;
  readonly status: ReliabilityState;
  readonly sourceRefs: readonly string[];
  readonly actionBindingIds: readonly string[];
  readonly requiredCapsules: readonly PhysicsCapsuleId[];
  readonly requiredTools: readonly string[];
  readonly failureModes: readonly string[];
}

export interface ResearchContextCapsuleSummary {
  readonly id: PhysicsCapsuleId;
  readonly kind: PhysicsCapsuleKind;
  readonly title: string;
  readonly reliability: ReliabilityState;
  readonly symbols: readonly string[];
  readonly assumes: readonly string[];
  readonly dependsOn: readonly PhysicsCapsuleId[];
  readonly sourceRefs: readonly string[];
  readonly graphRefs: readonly GraphRef[];
  readonly expansionHandles: readonly ExpansionHandle[];
  readonly requiredChecks: readonly CheckContract[];
  readonly actionAffordances: readonly ActionAffordance[];
}

export interface ResearchContextLedgerProposalSummary {
  readonly id: string;
  readonly kind: string;
  readonly eventIds: readonly string[];
  readonly targetCapsuleKind?: PhysicsCapsuleKind | undefined;
  readonly targetCapsuleId?: PhysicsCapsuleId | undefined;
  readonly sourceRefs: readonly string[];
  readonly openQuestions: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
}

export interface ResearchContextPhysicsSection {
  readonly requestedFocus: readonly string[];
  readonly includedFocus: readonly PhysicsCapsuleId[];
  readonly capsules: readonly ResearchContextCapsuleSummary[];
}

export interface ResearchContextLedgerSection {
  readonly includeStatuses: readonly ResearchLedgerEventStatus[];
  readonly proposals: readonly ResearchContextLedgerProposalSummary[];
}

export interface ResearchContextAitpSection {
  readonly truthSource: string;
  readonly orientationOnly: boolean;
  readonly reminders: readonly string[];
  readonly contextLines: readonly string[];
  readonly liveRouteIds: readonly string[];
  readonly blockedRouteIds: readonly string[];
  readonly abandonedRouteIds: readonly string[];
  readonly pivotRequiredRouteIds: readonly string[];
  readonly provenanceGapIds: readonly string[];
  readonly sourceProvenanceGapIds: readonly string[];
  readonly codeProvenanceGapIds: readonly string[];
  readonly toolProvenanceGapIds: readonly string[];
  readonly validationProvenanceGapIds: readonly string[];
  readonly artifactProvenanceGapIds: readonly string[];
  readonly sourceAssetIds: readonly string[];
  readonly sourceAssetMissingHashIds: readonly string[];
  readonly sourceAssetDuplicateHashIds: readonly string[];
  readonly sourceStackCoverageClaimIds: readonly string[];
  readonly sourceStackEvidenceGapClaimIds: readonly string[];
  readonly sourceStackReconstructionGapClaimIds: readonly string[];
  readonly sourceStackReviewGapClaimIds: readonly string[];
  readonly sourceStackCoverageNextActions: readonly string[];
  readonly sourceReconstructionReviewClaimIds: readonly string[];
  readonly sourceReconstructionReviewOpenClaimIds: readonly string[];
  readonly sourceReconstructionReviewNeedsRevisionClaimIds: readonly string[];
  readonly sourceReconstructionReviewInconclusiveClaimIds: readonly string[];
  readonly sourceReconstructionReviewPacketClaimIds: readonly string[];
  readonly sourceReconstructionReviewNextActions: readonly string[];
  readonly trustBoundaryReasons: readonly string[];
  readonly openObligationIds: readonly string[];
  readonly requiredCallIds: readonly string[];
  readonly trustPrerequisiteCallIds: readonly string[];
  readonly suggestedActionIds: readonly string[];
  readonly compiled: CompiledAitpProcessGraphSlice;
}

export interface ResearchContextCuratedRagChunkSummary {
  readonly chunkId: string;
  readonly documentId: string;
  readonly score: number;
  readonly summary: string;
  readonly text: string;
  readonly contentHash: string;
  readonly tags: readonly string[];
  readonly promotionDraftBindingId?: string | undefined;
}

export interface ResearchContextCuratedRagSection {
  readonly query: string;
  readonly reasonIds: readonly string[];
  readonly indexMode: AitpCuratedRagIndexMode;
  readonly resultRole: 'heuristic_context';
  readonly readSurfaceEffect: 'orientation_only';
  readonly resultCount: number;
  readonly recordsValidationResult: false;
  readonly claimTrustMutation: 'none';
  readonly canUpdateClaimTrust: false;
  readonly requiresPromotionForClaimSupport: true;
  readonly promotionDraftSuggested: boolean;
  readonly promotionDraftBindingIds: readonly string[];
  readonly indexStatus?: string | undefined;
  readonly staleIndexDiagnostics: readonly Readonly<Record<string, unknown>>[];
  readonly results: readonly ResearchContextCuratedRagChunkSummary[];
}

export interface ResearchContextCuratedRagCarriedRefRepairSection {
  readonly active: true;
  readonly source: 'turn_text';
  readonly triggerTerms: readonly string[];
  readonly failureCode?: string | undefined;
  readonly failurePath?: string | undefined;
  readonly safeSequence: readonly string[];
  readonly taxonomyAction: 'ResearchAction.list_actions';
  readonly draftAction: 'ResearchAction.draft_aitp_curated_rag_write_bridge_call';
  readonly readinessAction: 'ResearchAction.inspect_aitp_write_bridge_handoff_readiness';
  readonly executeAction: 'ResearchAction.execute_aitp_write_bridge';
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly claimTrustMutation: 'none';
  readonly executesWriteNow: false;
}

export type ResearchContextCuratedRagCarriedRefRepairResultRefKind =
  | 'source_asset'
  | 'reference_location'
  | 'evidence';

export interface ResearchContextCuratedRagCarriedRefRepairResultSummary {
  readonly source: 'execute_aitp_write_bridge_result';
  readonly handoffId: string;
  readonly confirmationId: string;
  readonly completedStage: string;
  readonly completedOperation: string;
  readonly resultKind: ResearchContextCuratedRagCarriedRefRepairResultRefKind;
  readonly recordId: string;
  readonly canonicalRef: string;
  readonly evidenceRef: string;
  readonly refKind: ResearchContextCuratedRagCarriedRefRepairResultRefKind;
  readonly repairHintOperations: readonly string[];
  readonly selectedWriteDiffersFromRepairHints: boolean;
  readonly readinessChecklistId: string;
  readonly reviewedOverridesRequired: true;
  readonly readinessInspectionRequired: true;
  readonly explicitExecutePrecheckPassed: true;
  readonly bridgeCalled: true;
  readonly resultWrittenByAitp: true;
  readonly nextPayloadMutatedNow: false;
  readonly nextWriteExecutedNow: false;
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly claimTrustMutation: 'none';
  readonly canUpdateClaimTrust: false;
  readonly requiresExplicitNextDraft: true;
}

export interface ResearchContextPack {
  readonly id: ResearchContextPackId;
  readonly workFrameId: string;
  readonly domain: PhysicsDomainId;
  readonly topic: ResearchTopicId;
  readonly goal: string;
  readonly focusObjectIds: readonly string[];
  readonly assumptionIds: readonly string[];
  readonly conventionIds: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly profiles: readonly ResearchContextProfileSummary[];
  readonly workflows: readonly ResearchContextWorkflowSummary[];
  readonly physics: ResearchContextPhysicsSection;
  readonly ledger: ResearchContextLedgerSection;
  readonly aitp?: ResearchContextAitpSection | undefined;
  readonly curatedRag?: ResearchContextCuratedRagSection | undefined;
  readonly curatedRagCarriedRefRepair?: ResearchContextCuratedRagCarriedRefRepairSection | undefined;
  readonly curatedRagCarriedRefRepairResult?:
    | ResearchContextCuratedRagCarriedRefRepairResultSummary
    | undefined;
  readonly actionBindings: readonly ResearchActionBinding[];
  readonly domainPack?: DomainPackManifest | undefined;
  readonly diagnostics: readonly ResearchContextPackDiagnostic[];
  readonly compiledAt: number;
}

export interface CompileResearchContextPackLimits {
  readonly maxCapsules?: number | undefined;
  readonly maxLedgerProposals?: number | undefined;
  readonly maxActionBindings?: number | undefined;
  readonly maxCuratedRagResults?: number | undefined;
}

export interface CompileResearchContextPackOptions {
  readonly workFrame: WorkFrame;
  readonly reliabilityFloor?: ReliabilityState | undefined;
  readonly bridgePolicy?: BridgePolicy | undefined;
  readonly includeLedgerStatuses?: readonly ResearchLedgerEventStatus[] | undefined;
  readonly aitp?: CompiledAitpProcessGraphSlice | null | undefined;
  readonly curatedRag?: AitpCuratedRagSearchResult | null | undefined;
  readonly curatedRagReasonIds?: readonly string[] | undefined;
  readonly curatedRagCarriedRefRepairActive?: boolean | undefined;
  readonly curatedRagCarriedRefRepairTriggerTerms?: readonly string[] | undefined;
  readonly curatedRagCarriedRefRepairFailureCode?: string | undefined;
  readonly curatedRagCarriedRefRepairFailurePath?: string | undefined;
  readonly curatedRagCarriedRefRepairResult?:
    | ResearchContextCuratedRagCarriedRefRepairResultSummary
    | undefined;
  readonly limits?: CompileResearchContextPackLimits | undefined;
  readonly now?: (() => number) | undefined;
}
