import type { ResearchActionBinding, ResearchActionBindingPriority } from '../research-action';

export const KNOWN_AITP_RESEARCH_MOMENTS = [
  'direction.brainstorm',
  'physics.brainstorm_relation_path',
  'trace.open_backtrace',
  'trace.reconstruct_definition',
  'trace.follow_source_dependency',
  'trace.audit_original_question_drift',
  'aitp.record_exploratory_record',
  'aitp.register_source_asset',
  'aitp.record_evidence',
  'aitp.record_tool_run',
  'aitp.record_reference_location',
  'aitp.record_research_state',
  'aitp.record_route_choice',
  'aitp.record_failed_route_lesson',
  'aitp.checkpoint_before_route_switch',
  'aitp.record_derivation_checkpoint',
  'aitp.create_open_obligation',
  'aitp.create_validation_contract',
  'aitp.record_validation_result',
  'aitp.request_human_checkpoint',
] as const;

export type KnownAitpResearchMomentId = (typeof KNOWN_AITP_RESEARCH_MOMENTS)[number];
export type AitpResearchMomentId = KnownAitpResearchMomentId | (string & {});

export interface AitpProcessGraphNode {
  readonly id: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly label?: string | undefined;
  readonly summary?: string | undefined;
  readonly uri?: string | undefined;
  readonly assetType?: string | undefined;
  readonly status?: string | undefined;
  readonly truthStatus?: string | undefined;
  readonly trustFlags: readonly string[];
  readonly sourceRefs: readonly string[];
}

export interface AitpProcessGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relation?: string | undefined;
  readonly status?: string | undefined;
  readonly truthStatus?: string | undefined;
  readonly trustFlags: readonly string[];
  readonly sourceRefs: readonly string[];
}

export type AitpObligationSeverity = 'blocking' | 'recommended' | 'advisory';

export interface AitpOpenObligation {
  readonly id: string;
  readonly kind: string;
  readonly severity: AitpObligationSeverity;
  readonly reason: string;
  readonly targetNodeId?: string | undefined;
  readonly status?: string | undefined;
  readonly suggestedMomentIds: readonly AitpResearchMomentId[];
  readonly sourceRefs: readonly string[];
}

export interface AitpSourceBacktraceItem {
  readonly id: string;
  readonly targetNodeId?: string | undefined;
  readonly sourceRef?: string | undefined;
  readonly sourceAssetIds: readonly string[];
  readonly status?: string | undefined;
  readonly reason?: string | undefined;
  readonly gap?: string | undefined;
  readonly reasoningMoves: readonly string[];
  readonly backtraceTargets: readonly string[];
  readonly definitionBoundaryQuestions: readonly string[];
  readonly derivationBacktraceQuestions: readonly string[];
  readonly sourceDependencyQuestions: readonly string[];
  readonly originalQuestionGuard: readonly string[];
}

export interface AitpRelationNeighborhoodItem {
  readonly id: string;
  readonly source?: string | undefined;
  readonly target?: string | undefined;
  readonly relation?: string | undefined;
  readonly status?: string | undefined;
  readonly reason?: string | undefined;
  readonly sourceRefs: readonly string[];
  readonly reasoningMoves: readonly string[];
  readonly candidatePaths: readonly string[];
  readonly relationPathQuestions: readonly string[];
  readonly definitionBoundaryQuestions: readonly string[];
  readonly originalQuestionGuard: readonly string[];
}

export interface AitpExploratoryRecordItem {
  readonly id: string;
  readonly explorationType: string;
  readonly title?: string | undefined;
  readonly focalQuestion?: string | undefined;
  readonly originalQuestion?: string | undefined;
  readonly localQuestion?: string | undefined;
  readonly status?: string | undefined;
  readonly objectIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly candidatePaths: readonly string[];
  readonly reasoningMoves: readonly string[];
  readonly backtraceTargets: readonly string[];
  readonly relationPathQuestions: readonly string[];
  readonly definitionBoundaryQuestions: readonly string[];
  readonly derivationBacktraceQuestions: readonly string[];
  readonly sourceDependencyQuestions: readonly string[];
  readonly originalQuestionGuard: readonly string[];
  readonly unresolvedPoints: readonly string[];
  readonly nextActions: readonly string[];
}

export type AitpRouteStatus =
  | 'live'
  | 'blocked'
  | 'abandoned'
  | 'selected'
  | 'superseded'
  | (string & {});

export interface AitpRouteStateItem {
  readonly id: string;
  readonly status: AitpRouteStatus;
  readonly active: boolean;
  readonly pivotRequired: boolean;
  readonly routeType?: string | undefined;
  readonly title?: string | undefined;
  readonly summary?: string | undefined;
  readonly reason?: string | undefined;
  readonly question?: string | undefined;
  readonly hypothesis?: string | undefined;
  readonly nextAction?: string | undefined;
  readonly lesson?: string | undefined;
  readonly pivotFromRouteId?: string | undefined;
  readonly pivotToRouteId?: string | undefined;
  readonly parentRouteIds: readonly string[];
  readonly checkpointIds: readonly string[];
  readonly exploratoryRecordIds: readonly string[];
  readonly targetRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly blockers: readonly string[];
  readonly suggestedMomentIds: readonly AitpResearchMomentId[];
  readonly requiredBeforeTrustChange: readonly string[];
  readonly finalGateRequired: boolean;
}

export interface AitpRouteState {
  readonly activeRouteId?: string | undefined;
  readonly routes: readonly AitpRouteStateItem[];
  readonly liveRoutes: readonly AitpRouteStateItem[];
  readonly blockedRoutes: readonly AitpRouteStateItem[];
  readonly abandonedRoutes: readonly AitpRouteStateItem[];
  readonly pivotRequiredRoutes: readonly AitpRouteStateItem[];
}

export interface AitpRecommendedMoment {
  readonly id: AitpResearchMomentId;
  readonly priority: ResearchActionBindingPriority;
  readonly reason: string;
  readonly targetRefs: readonly string[];
  readonly timing?: string | undefined;
  readonly trustBoundary?: string | undefined;
  readonly lifecycleTrigger: AitpLifecycleTriggerInfo;
}

export type AitpMomentPolicyDecisionType =
  | 'recording'
  | 'brainstorming'
  | 'backtrace'
  | 'route'
  | 'trust_boundary'
  | (string & {});

export interface AitpMomentPolicyDecision {
  readonly moment: AitpResearchMomentId;
  readonly decisionType: AitpMomentPolicyDecisionType;
  readonly actionKind: string;
  readonly requiredNow: boolean;
  readonly reason: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetRefs: readonly string[];
  readonly missingComponents: readonly string[];
  readonly recordEntrypoints: readonly string[];
  readonly explorationEntrypoints: readonly string[];
  readonly entrypoints: readonly string[];
  readonly payloadHints: readonly AitpPayloadHint[];
  readonly requiredBeforeTrustChange: readonly string[];
  readonly trustBoundary: boolean;
  readonly orientationOnly: boolean;
  readonly canUpdateClaimTrust: boolean;
  readonly lifecycleTrigger: AitpLifecycleTriggerInfo;
}

export interface AitpPayloadHint {
  readonly entrypoint: string;
  readonly recordAction: string;
  readonly actionKind: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly requiredFields: readonly string[];
  readonly draft: Readonly<Record<string, unknown>>;
  readonly orientationOnly: boolean;
  readonly summaryInputsTrusted: boolean;
  readonly canUpdateClaimTrust: boolean;
  readonly lifecycleTrigger: AitpLifecycleTriggerInfo;
}

export interface AitpLifecycleTriggerInfo {
  readonly lifecyclePhases: readonly string[];
  readonly triggerConditions: readonly string[];
  readonly recordingThreshold?: string | undefined;
  readonly trustBoundaryInputs: AitpTrustBoundaryInputs;
  readonly recommendedHostBehavior: readonly string[];
}

export interface AitpTrustBoundaryInputs {
  readonly targetRefs: readonly string[];
  readonly claimId?: string | undefined;
  readonly entrypoints: readonly string[];
  readonly requiredBeforeTrustChange: readonly string[];
  readonly requiresPreflight: boolean;
  readonly finalGateRequired: boolean;
}

export interface AitpMomentPolicy {
  readonly kind: string;
  readonly decisions: readonly AitpMomentPolicyDecision[];
  readonly recommendedMoments: readonly AitpRecommendedMoment[];
  readonly trustBoundaryReasons: readonly string[];
  readonly truthSource: string;
  readonly orientationOnly: boolean;
  readonly canUpdateClaimTrust: boolean;
}

export interface AitpProcessGraphSlice {
  readonly kind: 'process_graph_slice';
  readonly nodes: readonly AitpProcessGraphNode[];
  readonly edges: readonly AitpProcessGraphEdge[];
  readonly openObligations: readonly AitpOpenObligation[];
  readonly sourceBacktrace: readonly AitpSourceBacktraceItem[];
  readonly relationNeighborhood: readonly AitpRelationNeighborhoodItem[];
  readonly exploratoryRecords: readonly AitpExploratoryRecordItem[];
  readonly routeState: AitpRouteState;
  readonly trustBoundaryReasons: readonly string[];
  readonly recommendedMoments: readonly AitpRecommendedMoment[];
  readonly momentPolicy: AitpMomentPolicy;
  readonly truthSource: string;
  readonly orientationOnly: boolean;
}

export interface ResearchMomentDetectorInput {
  readonly prompt?: string | undefined;
  readonly activeContext?: string | readonly string[] | undefined;
}

export interface DetectedResearchMoment {
  readonly id: AitpResearchMomentId;
  readonly actionId: string;
  readonly priority: ResearchActionBindingPriority;
  readonly reason: string;
  readonly source:
    | 'aitp'
    | 'keyword'
    | 'obligation'
    | 'moment-policy'
    | 'relation'
    | 'source-backtrace'
    | 'exploration'
    | 'route-state'
    | 'trust-boundary';
  readonly targetRefs: readonly string[];
  readonly timing?: string | undefined;
  readonly trustBoundary?: string | undefined;
  readonly lifecycleTrigger: AitpLifecycleTriggerInfo;
}

export interface AitpCallObligation {
  readonly id: string;
  readonly actionId: string;
  readonly momentId: AitpResearchMomentId;
  readonly requiredNow: boolean;
  readonly decisionType: AitpMomentPolicyDecisionType;
  readonly actionKind: string;
  readonly reason: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetRefs: readonly string[];
  readonly missingComponents: readonly string[];
  readonly recordEntrypoints: readonly string[];
  readonly explorationEntrypoints: readonly string[];
  readonly entrypoints: readonly string[];
  readonly payloadHints: readonly AitpPayloadHint[];
  readonly requiredBeforeTrustChange: readonly string[];
  readonly finalGateRequired: boolean;
  readonly trustBoundary: boolean;
  readonly lifecycleTrigger: AitpLifecycleTriggerInfo;
}

export interface AitpTheoryReasoningProjection {
  readonly moves: readonly string[];
  readonly prompts: readonly string[];
  readonly whyQuestions?: readonly string[];
  readonly relationTargets?: readonly string[];
  readonly relationPathQuestions?: unknown;
  readonly backtraceTargets?: unknown;
  readonly definitionBoundaryQuestions?: unknown;
  readonly derivationBacktraceQuestions?: readonly string[];
  readonly sourceDependencyQuestions?: unknown;
  readonly originalQuestionGuard?: unknown;
  readonly reasoningMoves?: unknown;
}

export interface AitpObligationSummary {
  readonly blocking: readonly AitpOpenObligation[];
  readonly recommended: readonly AitpOpenObligation[];
  readonly advisory: readonly AitpOpenObligation[];
  readonly lines: readonly string[];
}

export interface AitpRouteSummary {
  readonly live: readonly AitpRouteStateItem[];
  readonly blocked: readonly AitpRouteStateItem[];
  readonly abandoned: readonly AitpRouteStateItem[];
  readonly pivotRequired: readonly AitpRouteStateItem[];
  readonly lines: readonly string[];
}

export interface AitpTrustSummary {
  readonly truthSource: string;
  readonly orientationOnly: boolean;
  readonly trustBoundaryReasons: readonly string[];
  readonly trustedNodeIds: readonly string[];
  readonly trustedEdgeIds: readonly string[];
}

export interface CompiledAitpProcessGraphSlice {
  readonly reminders: readonly string[];
  readonly contextLines: readonly string[];
  readonly actionRecommendations: readonly ResearchActionBinding[];
  readonly callObligations: readonly AitpCallObligation[];
  readonly obligations: AitpObligationSummary;
  readonly routes: AitpRouteSummary;
  readonly suggestedNextMoments: readonly DetectedResearchMoment[];
  readonly trust: AitpTrustSummary;
  readonly diagnostics: readonly string[];
}

export const AITP_EXPLORATION_TYPES = [
  'source_asset',
  'question_decomposition',
  'relation_path_brainstorm',
  'backtrace_step',
  'steering_checkpoint',
] as const;

export type AitpExplorationType = (typeof AITP_EXPLORATION_TYPES)[number];

export const AITP_EXPLORATION_STATUSES = [
  'open',
  'active',
  'resolved',
  'deferred',
  'superseded',
] as const;

export type AitpExplorationStatus = (typeof AITP_EXPLORATION_STATUSES)[number];
