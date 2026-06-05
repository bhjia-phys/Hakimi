import type { ResearchActionBinding, ResearchActionBindingPriority } from '../research-action';

export const KNOWN_AITP_RESEARCH_MOMENTS = [
  'direction.brainstorm',
  'physics.brainstorm_relation_path',
  'trace.open_backtrace',
  'trace.reconstruct_definition',
  'trace.follow_source_dependency',
  'trace.audit_original_question_drift',
  'aitp.record_exploratory_record',
  'aitp.record_research_state',
  'aitp.record_derivation_checkpoint',
  'aitp.create_open_obligation',
] as const;

export type KnownAitpResearchMomentId = (typeof KNOWN_AITP_RESEARCH_MOMENTS)[number];
export type AitpResearchMomentId = KnownAitpResearchMomentId | (string & {});

export interface AitpProcessGraphNode {
  readonly id: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly label?: string | undefined;
  readonly summary?: string | undefined;
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
  readonly status?: string | undefined;
  readonly reason?: string | undefined;
  readonly gap?: string | undefined;
}

export interface AitpRelationNeighborhoodItem {
  readonly id: string;
  readonly source?: string | undefined;
  readonly target?: string | undefined;
  readonly relation?: string | undefined;
  readonly status?: string | undefined;
  readonly reason?: string | undefined;
  readonly sourceRefs: readonly string[];
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
  readonly unresolvedPoints: readonly string[];
  readonly nextActions: readonly string[];
}

export interface AitpRecommendedMoment {
  readonly id: AitpResearchMomentId;
  readonly priority: ResearchActionBindingPriority;
  readonly reason: string;
  readonly targetRefs: readonly string[];
}

export interface AitpProcessGraphSlice {
  readonly kind: 'process_graph_slice';
  readonly nodes: readonly AitpProcessGraphNode[];
  readonly edges: readonly AitpProcessGraphEdge[];
  readonly openObligations: readonly AitpOpenObligation[];
  readonly sourceBacktrace: readonly AitpSourceBacktraceItem[];
  readonly relationNeighborhood: readonly AitpRelationNeighborhoodItem[];
  readonly exploratoryRecords: readonly AitpExploratoryRecordItem[];
  readonly trustBoundaryReasons: readonly string[];
  readonly recommendedMoments: readonly AitpRecommendedMoment[];
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
  readonly source: 'aitp' | 'keyword' | 'obligation' | 'relation' | 'source-backtrace' | 'exploration';
  readonly targetRefs: readonly string[];
}

export interface AitpObligationSummary {
  readonly blocking: readonly AitpOpenObligation[];
  readonly recommended: readonly AitpOpenObligation[];
  readonly advisory: readonly AitpOpenObligation[];
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
  readonly obligations: AitpObligationSummary;
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
