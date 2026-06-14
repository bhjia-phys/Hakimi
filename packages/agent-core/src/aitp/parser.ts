import type {
  AitpExploratoryRecordItem,
  AitpLifecycleTriggerInfo,
  AitpMomentPolicy,
  AitpMomentPolicyDecision,
  AitpMigrationHealth,
  AitpObligationSeverity,
  AitpPayloadDraftSchema,
  AitpOpenObligation,
  AitpPayloadHint,
  AitpProcessGraphEdge,
  AitpProcessGraphNode,
  AitpProcessGraphSlice,
  AitpProvenanceGap,
  AitpRecommendedMoment,
  AitpRelationNeighborhoodItem,
  AitpResearchMomentId,
  AitpRouteState,
  AitpRouteStateItem,
  AitpSourceReconstructionReview,
  AitpSourceReconstructionReviewItem,
  AitpSourceAssetIndexItem,
  AitpSourceBacktraceItem,
  AitpSourceStackCoverage,
  AitpSourceStackCoverageItem,
} from './types';
import type { ResearchActionBindingPriority } from '../research-action';

export class AitpProcessGraphSliceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpProcessGraphSliceParseError';
  }
}

export function parseAitpProcessGraphSlice(input: unknown): AitpProcessGraphSlice {
  if (!isRecord(input)) {
    throw new AitpProcessGraphSliceParseError('AITP process graph slice must be an object');
  }
  if (stringValue(input['kind']) !== 'process_graph_slice') {
    throw new AitpProcessGraphSliceParseError('AITP payload kind must be "process_graph_slice"');
  }

  return {
    kind: 'process_graph_slice',
    nodes: objectArray(input['nodes']).map(parseNode),
    edges: objectArray(input['edges']).map(parseEdge),
    openObligations: objectArray(input['open_obligations']).map(parseOpenObligation),
    sourceBacktrace: objectArray(input['source_backtrace']).map(parseSourceBacktraceItem),
    sourceAssetIndex: objectArray(valueFor(input, 'source_asset_index', 'sourceAssetIndex')).map(
      parseSourceAssetIndexItem,
    ),
    sourceStackCoverage: parseSourceStackCoverage(
      valueFor(input, 'source_stack_coverage', 'sourceStackCoverage'),
    ),
    sourceReconstructionReview: parseSourceReconstructionReview(
      valueFor(input, 'source_reconstruction_review', 'sourceReconstructionReview'),
    ),
    migrationHealth: parseMigrationHealth(
      valueFor(input, 'migration_health', 'migrationHealth'),
    ),
    relationNeighborhood: objectArray(input['relation_neighborhood']).map(
      parseRelationNeighborhoodItem,
    ),
    exploratoryRecords: objectArray(input['exploratory_records']).map(parseExploratoryRecordItem),
    routeState: parseRouteState(valueFor(input, 'route_state', 'routeState')),
    provenanceGaps: objectArray(valueFor(input, 'provenance_gaps', 'provenanceGaps')).map(
      parseProvenanceGap,
    ),
    trustBoundaryReasons: stringArray(input['trust_boundary_reasons']),
    recommendedMoments: momentArray(input['recommended_moments']),
    momentPolicy: parseMomentPolicy(input['moment_policy']),
    truthSource: stringValue(input['truth_source']) ?? 'aitp',
    orientationOnly: booleanValue(input['orientation_only']) ?? false,
  };
}

function parseNode(raw: Record<string, unknown>, index: number): AitpProcessGraphNode {
  const record = isRecord(raw['record']) ? raw['record'] : {};
  return {
    id: requiredString(raw, 'id', `nodes[${String(index)}]`),
    kind: stringValue(raw['kind']) ?? stringValue(raw['type']) ?? stringValue(record['kind']),
    title: stringValue(raw['title']),
    label: stringValue(raw['label']),
    summary: stringValue(raw['summary']) ?? stringValue(record['summary']) ?? stringValue(record['statement']),
    uri: stringValue(raw['uri']) ?? stringValue(record['uri']),
    assetType: stringValue(raw['asset_type']) ?? stringValue(raw['assetType']) ?? stringValue(record['asset_type']) ?? stringValue(record['assetType']),
    status: stringValue(raw['status']) ?? stringValue(record['status']),
    truthStatus: stringValue(raw['truth_status']) ?? stringValue(record['truth_status']),
    trustFlags: stringArray(raw['trust_flags']).length > 0
      ? stringArray(raw['trust_flags'])
      : stringArray(record['trust_flags']),
    sourceRefs: stringArray(raw['source_refs']).length > 0
      ? stringArray(raw['source_refs'])
      : stringArray(record['source_refs']),
  };
}

function parseEdge(raw: Record<string, unknown>, index: number): AitpProcessGraphEdge {
  const source = requiredString(raw, 'source', `edges[${String(index)}]`);
  const target = requiredString(raw, 'target', `edges[${String(index)}]`);
  return {
    id: stringValue(raw['id']) ?? `${source}->${target}#${String(index + 1)}`,
    source,
    target,
    relation: stringValue(raw['relation']) ?? stringValue(raw['type']),
    status: stringValue(raw['status']),
    truthStatus: stringValue(raw['truth_status']),
    trustFlags: stringArray(raw['trust_flags']),
    sourceRefs: stringArray(raw['source_refs']),
  };
}

function parseOpenObligation(
  raw: Record<string, unknown>,
  index: number,
): AitpOpenObligation {
  const kind = stringValue(raw['kind']) ?? stringValue(raw['obligation_type']) ?? 'open_obligation';
  const id = stringValue(raw['id']) ?? stringValue(raw['obligation_id']) ?? `aitp.obligation.${String(index + 1)}`;
  const reason =
    stringValue(raw['reason']) ??
    stringValue(raw['statement']) ??
    stringValue(raw['next_action']) ??
    kind;
  return {
    id,
    kind,
    severity: parseSeverity(raw['severity']),
    reason,
    targetNodeId: stringValue(raw['target_node_id']) ?? nodeRef('proof_obligation', id),
    status: stringValue(raw['status']),
    suggestedMomentIds: stringArray(raw['suggested_moments']).map((id) => id as AitpResearchMomentId),
    sourceRefs: stringArray(raw['source_refs']),
  };
}

function parseSourceBacktraceItem(
  raw: Record<string, unknown>,
  index: number,
): AitpSourceBacktraceItem {
  const claimId = stringValue(raw['claim_id']);
  const missing = stringArray(raw['missing_components']);
  const complete = raw['complete'] === true;
  return {
    id: stringValue(raw['id']) ?? claimId ?? `aitp.backtrace.${String(index + 1)}`,
    targetNodeId: stringValue(raw['target_node_id']) ?? (claimId === undefined ? undefined : nodeRef('claim', claimId)),
    sourceRef: stringValue(raw['source_ref']),
    sourceAssetIds: stringArray(raw['source_asset_ids']),
    status: stringValue(raw['status']) ?? (complete ? 'complete' : missing.length > 0 ? 'missing' : undefined),
    reason: stringValue(raw['reason']) ?? stringValue(raw['statement']),
    gap: stringValue(raw['gap']) ?? (missing.length > 0 ? missing.join(', ') : undefined),
    reasoningMoves: stringArray(valueFor(raw, 'reasoning_moves', 'reasoningMoves')),
    backtraceTargets: stringArray(valueFor(raw, 'backtrace_targets', 'backtraceTargets')),
    definitionBoundaryQuestions: stringArray(
      valueFor(raw, 'definition_boundary_questions', 'definitionBoundaryQuestions'),
    ),
    derivationBacktraceQuestions: stringArray(
      valueFor(raw, 'derivation_backtrace_questions', 'derivationBacktraceQuestions'),
    ),
    sourceDependencyQuestions: stringArray(
      valueFor(raw, 'source_dependency_questions', 'sourceDependencyQuestions'),
    ),
    originalQuestionGuard: stringArray(valueFor(raw, 'original_question_guard', 'originalQuestionGuard')),
  };
}

function parseSourceAssetIndexItem(
  raw: Record<string, unknown>,
  index: number,
): AitpSourceAssetIndexItem {
  const id =
    stringValue(valueFor(raw, 'asset_id', 'assetId')) ??
    stringValue(raw['id']) ??
    `aitp.source_asset.${String(index + 1)}`;
  return {
    id,
    topicId: stringValue(valueFor(raw, 'topic_id', 'topicId')),
    claimId: stringValue(valueFor(raw, 'claim_id', 'claimId')),
    assetType: stringValue(valueFor(raw, 'asset_type', 'assetType')) ?? 'other',
    uri: stringValue(raw['uri']) ?? '',
    title: stringValue(raw['title']) ?? id,
    label: stringValue(raw['label']),
    summary: stringValue(raw['summary']),
    sourceKind: stringValue(valueFor(raw, 'source_kind', 'sourceKind')),
    contentHash: stringValue(valueFor(raw, 'content_hash', 'contentHash')),
    hashAlgorithm: stringValue(valueFor(raw, 'hash_algorithm', 'hashAlgorithm')),
    hashStatus: stringValue(valueFor(raw, 'hash_status', 'hashStatus')) ?? 'unknown',
    versionAnchor: recordValue(valueFor(raw, 'version_anchor', 'versionAnchor')),
    acquiredAt: stringValue(valueFor(raw, 'acquired_at', 'acquiredAt')),
    sourceRefs: stringArray(valueFor(raw, 'source_refs', 'sourceRefs')),
    artifactIds: stringArray(valueFor(raw, 'artifact_ids', 'artifactIds')),
    codeStateIds: stringArray(valueFor(raw, 'code_state_ids', 'codeStateIds')),
    referenceLocationIds: stringArray(
      valueFor(raw, 'reference_location_ids', 'referenceLocationIds'),
    ),
    referenceLocations: objectArray(
      valueFor(raw, 'reference_locations', 'referenceLocations'),
    ).map(parseSourceAssetReferenceLocation),
    derivedFrom: stringArray(valueFor(raw, 'derived_from', 'derivedFrom')),
    linkedRecords: recordValue(valueFor(raw, 'linked_records', 'linkedRecords')),
    duplicateHashDiagnostics: recordValue(
      valueFor(raw, 'duplicate_hash_diagnostics', 'duplicateHashDiagnostics'),
    ),
    provenanceGapIds: stringArray(valueFor(raw, 'provenance_gap_ids', 'provenanceGapIds')),
    provenanceGapTypes: stringArray(
      valueFor(raw, 'provenance_gap_types', 'provenanceGapTypes'),
    ),
    targetRefs: stringArray(valueFor(raw, 'target_refs', 'targetRefs')),
    orientationOnly: booleanValue(valueFor(raw, 'orientation_only', 'orientationOnly')) ?? true,
    canUpdateClaimTrust:
      booleanValue(valueFor(raw, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function parseSourceAssetReferenceLocation(
  raw: Record<string, unknown>,
): AitpSourceAssetIndexItem['referenceLocations'][number] {
  return {
    id:
      stringValue(valueFor(raw, 'reference_location_id', 'referenceLocationId')) ??
      stringValue(raw['id']) ??
      '',
    uri: stringValue(raw['uri']),
    label: stringValue(raw['label']),
    connectorId: stringValue(valueFor(raw, 'connector_id', 'connectorId')),
    locationType: stringValue(valueFor(raw, 'location_type', 'locationType')),
    status: stringValue(raw['status']),
  };
}

function parseSourceStackCoverage(value: unknown): AitpSourceStackCoverage {
  if (!isRecord(value)) return emptySourceStackCoverage();
  return {
    kind: stringValue(value['kind']) ?? 'source_stack_coverage_manifest',
    claimCount: numberValue(valueFor(value, 'claim_count', 'claimCount')) ?? 0,
    coverageStatusCounts: recordValue(
      valueFor(value, 'coverage_status_counts', 'coverageStatusCounts'),
    ),
    missingRequiredOutputCounts: recordValue(
      valueFor(value, 'missing_required_output_counts', 'missingRequiredOutputCounts'),
    ),
    sourceComponentGapCounts: recordValue(
      valueFor(value, 'source_component_gap_counts', 'sourceComponentGapCounts'),
    ),
    sourceReviewStatusCounts: recordValue(
      valueFor(value, 'source_review_status_counts', 'sourceReviewStatusCounts'),
    ),
    items: objectArray(value['items']).map(parseSourceStackCoverageItem),
    nextActions: stringArray(valueFor(value, 'next_actions', 'nextActions')),
    truthSource: stringValue(valueFor(value, 'truth_source', 'truthSource')) ?? 'typed_records',
    orientationOnly: booleanValue(valueFor(value, 'orientation_only', 'orientationOnly')) ?? true,
    canUpdateClaimTrust:
      booleanValue(valueFor(value, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function emptySourceStackCoverage(): AitpSourceStackCoverage {
  return {
    kind: 'source_stack_coverage_manifest',
    claimCount: 0,
    coverageStatusCounts: {},
    missingRequiredOutputCounts: {},
    sourceComponentGapCounts: {},
    sourceReviewStatusCounts: {},
    items: [],
    nextActions: [],
    truthSource: 'typed_records',
    orientationOnly: true,
    canUpdateClaimTrust: false,
  };
}

function parseSourceStackCoverageItem(
  raw: Record<string, unknown>,
): AitpSourceStackCoverageItem {
  const claimId = stringValue(valueFor(raw, 'claim_id', 'claimId')) ?? '';
  return {
    topicId: stringValue(valueFor(raw, 'topic_id', 'topicId')) ?? '',
    claimId,
    claimStatement: stringValue(valueFor(raw, 'claim_statement', 'claimStatement')) ?? '',
    riskLevel: stringValue(valueFor(raw, 'risk_level', 'riskLevel')) ?? 'unknown',
    requiredOutputs: stringArray(valueFor(raw, 'required_outputs', 'requiredOutputs')),
    satisfiedRequiredOutputs: stringArray(
      valueFor(raw, 'satisfied_required_outputs', 'satisfiedRequiredOutputs'),
    ),
    missingRequiredOutputs: stringArray(
      valueFor(raw, 'missing_required_outputs', 'missingRequiredOutputs'),
    ),
    evidenceIdsByOutput: recordValue(
      valueFor(raw, 'evidence_ids_by_output', 'evidenceIdsByOutput'),
    ),
    sourceReconstructionComplete:
      booleanValue(valueFor(raw, 'source_reconstruction_complete', 'sourceReconstructionComplete')) ??
      false,
    missingSourceComponents: stringArray(
      valueFor(raw, 'missing_source_components', 'missingSourceComponents'),
    ),
    sourceReconstructionReviewStatus:
      stringValue(
        valueFor(raw, 'source_reconstruction_review_status', 'sourceReconstructionReviewStatus'),
      ) ?? 'pending',
    latestSourceReviewResultId:
      stringValue(
        valueFor(raw, 'latest_source_review_result_id', 'latestSourceReviewResultId'),
      ) ?? '',
    coverageStatus:
      stringValue(valueFor(raw, 'coverage_status', 'coverageStatus')) ??
      (claimId.length === 0 ? 'unknown' : 'evidence_gap'),
    nextActions: stringArray(valueFor(raw, 'next_actions', 'nextActions')),
    canUpdateClaimTrust:
      booleanValue(valueFor(raw, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function parseSourceReconstructionReview(value: unknown): AitpSourceReconstructionReview {
  if (!isRecord(value)) return emptySourceReconstructionReview();
  return {
    kind: stringValue(value['kind']) ?? 'source_reconstruction_review_manifest',
    claimCount: numberValue(valueFor(value, 'claim_count', 'claimCount')) ?? 0,
    reviewProgress: recordValue(valueFor(value, 'review_progress', 'reviewProgress')),
    items: objectArray(value['items']).map(parseSourceReconstructionReviewItem),
    nextActions: stringArray(valueFor(value, 'next_actions', 'nextActions')),
    truthSource: stringValue(valueFor(value, 'truth_source', 'truthSource')) ?? 'typed_records',
    orientationOnly: booleanValue(valueFor(value, 'orientation_only', 'orientationOnly')) ?? true,
    canUpdateClaimTrust:
      booleanValue(valueFor(value, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function emptySourceReconstructionReview(): AitpSourceReconstructionReview {
  return {
    kind: 'source_reconstruction_review_manifest',
    claimCount: 0,
    reviewProgress: {},
    items: [],
    nextActions: [],
    truthSource: 'typed_records',
    orientationOnly: true,
    canUpdateClaimTrust: false,
  };
}

function parseSourceReconstructionReviewItem(
  raw: Record<string, unknown>,
): AitpSourceReconstructionReviewItem {
  return {
    topicId: stringValue(valueFor(raw, 'topic_id', 'topicId')) ?? '',
    claimId: stringValue(valueFor(raw, 'claim_id', 'claimId')) ?? '',
    claimStatement: stringValue(valueFor(raw, 'claim_statement', 'claimStatement')) ?? '',
    sourceReconstructionStatus:
      stringValue(
        valueFor(raw, 'source_reconstruction_status', 'sourceReconstructionStatus'),
      ) ?? 'unknown',
    missingComponents: stringArray(valueFor(raw, 'missing_components', 'missingComponents')),
    reviewStatus: stringValue(valueFor(raw, 'review_status', 'reviewStatus')) ?? 'pending',
    reviewResultIds: stringArray(valueFor(raw, 'review_result_ids', 'reviewResultIds')),
    latestReviewResult: recordValue(valueFor(raw, 'latest_review_result', 'latestReviewResult')),
    reviewedComponents: stringArray(valueFor(raw, 'reviewed_components', 'reviewedComponents')),
    remainingActions: stringArray(valueFor(raw, 'remaining_actions', 'remainingActions')),
    reviewPacketCli:
      stringValue(valueFor(raw, 'review_packet_cli', 'reviewPacketCli')) ?? '',
    resultCli: stringValue(valueFor(raw, 'result_cli', 'resultCli')) ?? '',
    nextActions: stringArray(valueFor(raw, 'next_actions', 'nextActions')),
    canUpdateClaimTrust:
      booleanValue(valueFor(raw, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function parseRelationNeighborhoodItem(
  raw: Record<string, unknown>,
  index: number,
): AitpRelationNeighborhoodItem {
  const source = stringValue(raw['source']) ?? stringValue(raw['subject_id']);
  const target = stringValue(raw['target']) ?? stringValue(raw['object_id']);
  const id = stringValue(raw['id']) ?? stringValue(raw['relation_id']);
  return {
    id: id ?? `${source ?? 'unknown'}~${target ?? 'unknown'}#${String(index + 1)}`,
    source,
    target,
    relation: stringValue(raw['relation']) ?? stringValue(raw['relation_type']),
    status: stringValue(raw['status']),
    reason: stringValue(raw['reason']),
    sourceRefs: stringArray(raw['source_refs']),
    reasoningMoves: stringArray(valueFor(raw, 'reasoning_moves', 'reasoningMoves')),
    candidatePaths: stringArray(valueFor(raw, 'candidate_paths', 'candidatePaths')),
    relationPathQuestions: stringArray(
      valueFor(raw, 'relation_path_questions', 'relationPathQuestions'),
    ),
    definitionBoundaryQuestions: stringArray(
      valueFor(raw, 'definition_boundary_questions', 'definitionBoundaryQuestions'),
    ),
    originalQuestionGuard: stringArray(valueFor(raw, 'original_question_guard', 'originalQuestionGuard')),
  };
}

function parseExploratoryRecordItem(
  raw: Record<string, unknown>,
  index: number,
): AitpExploratoryRecordItem {
  const id = stringValue(raw['id']) ?? stringValue(raw['record_id']);
  return {
    id: id ?? `aitp.exploration.${String(index + 1)}`,
    explorationType:
      stringValue(raw['explorationType']) ??
      stringValue(raw['exploration_type']) ??
      stringValue(raw['type']) ??
      'exploratory_record',
    title: stringValue(raw['title']),
    focalQuestion: stringValue(raw['focalQuestion']) ?? stringValue(raw['focal_question']),
    originalQuestion: stringValue(raw['originalQuestion']) ?? stringValue(raw['original_question']),
    localQuestion: stringValue(raw['localQuestion']) ?? stringValue(raw['local_question']),
    status: stringValue(raw['status']),
    objectIds: stringArray(raw['objectIds']).length > 0
      ? stringArray(raw['objectIds'])
      : stringArray(raw['object_ids']),
    relationIds: stringArray(raw['relationIds']).length > 0
      ? stringArray(raw['relationIds'])
      : stringArray(raw['relation_ids']),
    sourceRefs: stringArray(raw['sourceRefs']).length > 0
      ? stringArray(raw['sourceRefs'])
      : stringArray(raw['source_refs']),
    candidatePaths: stringArray(raw['candidatePaths']).length > 0
      ? stringArray(raw['candidatePaths'])
      : stringArray(raw['candidate_paths']),
    reasoningMoves: stringArray(valueFor(raw, 'reasoning_moves', 'reasoningMoves')),
    backtraceTargets: stringArray(valueFor(raw, 'backtrace_targets', 'backtraceTargets')),
    relationPathQuestions: stringArray(
      valueFor(raw, 'relation_path_questions', 'relationPathQuestions'),
    ),
    definitionBoundaryQuestions: stringArray(
      valueFor(raw, 'definition_boundary_questions', 'definitionBoundaryQuestions'),
    ),
    derivationBacktraceQuestions: stringArray(
      valueFor(raw, 'derivation_backtrace_questions', 'derivationBacktraceQuestions'),
    ),
    sourceDependencyQuestions: stringArray(
      valueFor(raw, 'source_dependency_questions', 'sourceDependencyQuestions'),
    ),
    originalQuestionGuard: stringArray(valueFor(raw, 'original_question_guard', 'originalQuestionGuard')),
    unresolvedPoints: stringArray(raw['unresolvedPoints']).length > 0
      ? stringArray(raw['unresolvedPoints'])
      : stringArray(raw['unresolved_points']),
    nextActions: stringArray(raw['nextActions']).length > 0
      ? stringArray(raw['nextActions'])
      : stringArray(raw['next_actions']),
  };
}

function parseRouteState(value: unknown): AitpRouteState {
  if (!isRecord(value)) {
    return {
      activeRouteId: undefined,
      routes: [],
      liveRoutes: [],
      blockedRoutes: [],
      abandonedRoutes: [],
      pivotRequiredRoutes: [],
    };
  }
  const activeRouteId = stringValue(valueFor(value, 'active_route_id', 'activeRouteId'));
  const liveRouteIds = stringArray(valueFor(value, 'live_route_ids', 'liveRouteIds'));
  const blockedRouteIds = stringArray(valueFor(value, 'blocked_route_ids', 'blockedRouteIds'));
  const abandonedRouteIds = stringArray(valueFor(value, 'abandoned_route_ids', 'abandonedRouteIds'));
  const pivotRequiredRouteIds = unique([
    ...stringArray(valueFor(value, 'pivot_required_route_ids', 'pivotRequiredRouteIds')),
    ...stringArray(valueFor(value, 'pivot_route_ids', 'pivotRouteIds')),
  ]);
  const grouped = [
    ...objectArray(value['live_routes']).map((item, index) =>
      parseRouteStateItem(item, index, { statusHint: 'live', activeRouteId, pivotRequiredRouteIds }),
    ),
    ...objectArray(value['blocked_routes']).map((item, index) =>
      parseRouteStateItem(item, index, { statusHint: 'blocked', activeRouteId, pivotRequiredRouteIds }),
    ),
    ...objectArray(value['abandoned_routes']).map((item, index) =>
      parseRouteStateItem(item, index, { statusHint: 'abandoned', activeRouteId, pivotRequiredRouteIds }),
    ),
    ...objectArray(value['pivot_routes']).map((item, index) =>
      parseRouteStateItem(item, index, { statusHint: 'superseded', activeRouteId, pivotRequiredRouteIds, pivotRequiredHint: true }),
    ),
  ];
  const explicit = objectArray(value['routes']).map((item, index) =>
    parseRouteStateItem(item, index, { activeRouteId, pivotRequiredRouteIds }),
  );
  const routes = uniqueRoutes([...explicit, ...grouped]);
  return {
    activeRouteId,
    routes,
    liveRoutes: routes.filter((item) =>
      liveRouteIds.length > 0
        ? liveRouteIds.includes(item.id)
        : item.status === 'live' || item.status === 'selected',
    ),
    blockedRoutes: routes.filter((item) =>
      blockedRouteIds.length > 0
        ? blockedRouteIds.includes(item.id)
        : item.status === 'blocked',
    ),
    abandonedRoutes: routes.filter((item) =>
      abandonedRouteIds.length > 0
        ? abandonedRouteIds.includes(item.id)
        : item.status === 'abandoned',
    ),
    pivotRequiredRoutes: routes.filter((item) => item.pivotRequired),
  };
}

function parseRouteStateItem(
  raw: Record<string, unknown>,
  index: number,
  options: {
    readonly statusHint?: string | undefined;
    readonly activeRouteId?: string | undefined;
    readonly pivotRequiredRouteIds?: readonly string[] | undefined;
    readonly pivotRequiredHint?: boolean | undefined;
  } = {},
): AitpRouteStateItem {
  const id =
    stringValue(valueFor(raw, 'route_id', 'routeId')) ??
    stringValue(raw['id']) ??
    `aitp.route.${String(index + 1)}`;
  const checkpointIds = stringArray(valueFor(raw, 'checkpoint_ids', 'checkpointIds'));
  const parentRouteIds = stringArray(valueFor(raw, 'parent_route_ids', 'parentRouteIds'));
  const pivotReason = stringValue(valueFor(raw, 'pivot_reason', 'pivotReason'));
  const active =
    booleanValue(raw['active']) ??
    (options.activeRouteId !== undefined && options.activeRouteId === id);
  const explicitPivotRequired = booleanValue(valueFor(raw, 'pivot_required', 'pivotRequired'));
  const pivotRequired = explicitPivotRequired ?? (
    options.pivotRequiredHint === true ||
    (options.pivotRequiredRouteIds ?? []).includes(id) ||
    parentRouteIds.length > 0 ||
    checkpointIds.length > 0 ||
    pivotReason !== undefined
  );
  return {
    id,
    status: stringValue(raw['status']) ?? options.statusHint ?? 'live',
    active,
    pivotRequired,
    routeType: stringValue(valueFor(raw, 'route_type', 'routeType')),
    title: stringValue(raw['title']) ?? stringValue(raw['label']) ?? stringValue(raw['name']),
    summary:
      stringValue(raw['summary']) ??
      stringValue(raw['description']) ??
      stringValue(raw['rationale']),
    reason:
      stringValue(raw['reason']) ??
      stringValue(valueFor(raw, 'decision_rationale', 'decisionRationale')) ??
      stringValue(raw['blocked_reason']) ??
      stringValue(raw['abandoned_reason']) ??
      pivotReason,
    question:
      stringValue(valueFor(raw, 'current_question', 'currentQuestion')) ??
      stringValue(valueFor(raw, 'question', 'routeQuestion')),
    hypothesis: stringValue(raw['hypothesis']),
    nextAction: stringValue(valueFor(raw, 'next_action', 'nextAction')),
    lesson:
      stringValue(raw['lesson']) ??
      stringValue(valueFor(raw, 'failed_route_lesson', 'failedRouteLesson')) ??
      stringValue(valueFor(raw, 'failure_lesson', 'failureLesson')) ??
      stringValue(valueFor(raw, 'decision_rationale', 'decisionRationale')),
    pivotFromRouteId:
      stringValue(valueFor(raw, 'pivot_from_route_id', 'pivotFromRouteId')) ??
      stringValue(valueFor(raw, 'from_route_id', 'fromRouteId')),
    pivotToRouteId:
      stringValue(valueFor(raw, 'pivot_to_route_id', 'pivotToRouteId')) ??
      stringValue(valueFor(raw, 'to_route_id', 'toRouteId')),
    parentRouteIds,
    checkpointIds,
    exploratoryRecordIds: stringArray(
      valueFor(raw, 'exploratory_record_ids', 'exploratoryRecordIds'),
    ),
    targetRefs: routeTargetRefs(raw, id),
    sourceRefs: stringArray(raw['source_refs']).length > 0
      ? stringArray(raw['source_refs'])
      : stringArray(raw['sourceRefs']),
    blockers: stringArray(raw['blockers']).length > 0
      ? stringArray(raw['blockers'])
      : stringArray(valueFor(raw, 'blocking_reasons', 'blockingReasons')).length > 0
        ? stringArray(valueFor(raw, 'blocking_reasons', 'blockingReasons'))
        : stringArray(valueFor(raw, 'failure_modes', 'failureModes')),
    suggestedMomentIds: stringArray(valueFor(raw, 'suggested_moments', 'suggestedMoments')).map(
      (moment) => moment as AitpResearchMomentId,
    ),
    requiredBeforeTrustChange: stringArray(
      valueFor(raw, 'required_before_trust_change', 'requiredBeforeTrustChange'),
    ),
    finalGateRequired: booleanValue(valueFor(raw, 'final_gate_required', 'finalGateRequired')) ?? false,
  };
}

function routeTargetRefs(raw: Record<string, unknown>, routeId: string): readonly string[] {
  const explicit = stringArray(valueFor(raw, 'target_refs', 'targetRefs'));
  const refs = [
    ...explicit,
    nodeRef('research_route', routeId),
    stringValue(valueFor(raw, 'claim_id', 'claimId')) === undefined
      ? undefined
      : nodeRef('claim', stringValue(valueFor(raw, 'claim_id', 'claimId'))!),
    stringValue(valueFor(raw, 'topic_id', 'topicId')) === undefined
      ? undefined
      : nodeRef('topic', stringValue(valueFor(raw, 'topic_id', 'topicId'))!),
    stringValue(valueFor(raw, 'session_id', 'sessionId')) === undefined
      ? undefined
      : nodeRef('session', stringValue(valueFor(raw, 'session_id', 'sessionId'))!),
  ];
  return unique(refs.filter((ref): ref is string => ref !== undefined));
}

function uniqueRoutes(routes: readonly AitpRouteStateItem[]): readonly AitpRouteStateItem[] {
  const byKey = new Map<string, AitpRouteStateItem>();
  for (const route of routes) {
    if (!byKey.has(route.id)) byKey.set(route.id, route);
  }
  return [...byKey.values()];
}

function parseProvenanceGap(raw: Record<string, unknown>, index: number): AitpProvenanceGap {
  const id =
    stringValue(valueFor(raw, 'gap_id', 'gapId')) ??
    stringValue(raw['id']) ??
    `aitp.provenance_gap.${String(index + 1)}`;
  const targetType = stringValue(valueFor(raw, 'target_type', 'targetType')) ?? 'unknown';
  const targetId = stringValue(valueFor(raw, 'target_id', 'targetId')) ?? id;
  const targetRefs = stringArray(valueFor(raw, 'target_refs', 'targetRefs'));
  return {
    id,
    gapType: stringValue(valueFor(raw, 'gap_type', 'gapType')) ?? 'provenance_gap',
    provenanceKind:
      stringValue(valueFor(raw, 'provenance_kind', 'provenanceKind')) ?? 'unknown',
    reason: stringValue(raw['reason']) ?? id,
    topicId: stringValue(valueFor(raw, 'topic_id', 'topicId')),
    claimId: stringValue(valueFor(raw, 'claim_id', 'claimId')),
    targetType,
    targetId,
    targetRefs: targetRefs.length > 0 ? targetRefs : [nodeRef(targetType, targetId)],
    recommendedActions: stringArray(
      valueFor(raw, 'recommended_actions', 'recommendedActions'),
    ),
    recommendedEntrypoints: stringArray(
      valueFor(raw, 'recommended_entrypoints', 'recommendedEntrypoints'),
    ),
    payloadHints: objectArray(valueFor(raw, 'payload_hints', 'payloadHints')).map(
      parsePayloadHint,
    ),
    severity: stringValue(raw['severity']) ?? 'recommended',
    requiredNow: booleanValue(valueFor(raw, 'required_now', 'requiredNow')) ?? false,
    requiredBeforeTrustChange:
      booleanValue(valueFor(raw, 'required_before_trust_change', 'requiredBeforeTrustChange')) ??
      false,
    strictBoundary: stringValue(valueFor(raw, 'strict_boundary', 'strictBoundary')),
    blockingWhenUsedAs: stringArray(
      valueFor(raw, 'blocking_when_used_as', 'blockingWhenUsedAs'),
    ),
    orientationOnly: booleanValue(valueFor(raw, 'orientation_only', 'orientationOnly')) ?? true,
    canUpdateClaimTrust:
      booleanValue(valueFor(raw, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function momentArray(value: unknown): readonly AitpRecommendedMoment[] {
  if (!Array.isArray(value)) return [];
  const moments: AitpRecommendedMoment[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item === 'string' && item.trim().length > 0) {
      moments.push({
        id: item.trim() as AitpResearchMomentId,
        priority: 'normal',
        reason: 'Recommended by AITP process graph slice.',
        targetRefs: [],
        timing: undefined,
        trustBoundary: undefined,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
      continue;
    }
    if (!isRecord(item)) continue;
    const id = stringValue(item['id']) ?? stringValue(item['moment']);
    if (id === undefined) continue;
    moments.push({
      id: id as AitpResearchMomentId,
      priority: parsePriority(item['priority']),
      reason: stringValue(item['reason']) ?? `Recommended by AITP moment ${String(index + 1)}.`,
      targetRefs: stringArray(item['target_refs']).length > 0
        ? stringArray(item['target_refs'])
        : stringArray(item['targetRefs']).length > 0
          ? stringArray(item['targetRefs'])
          : targetRefsFromMoment(item),
      timing:
        stringValue(item['timing']) ??
        stringValue(item['call_timing']) ??
        stringValue(item['callTiming']),
      trustBoundary:
        stringValue(item['trust_boundary']) ??
        stringValue(item['trustBoundary']) ??
        stringValue(item['boundary']),
      lifecycleTrigger: parseLifecycleTrigger(item),
    });
  }
  return moments;
}

function parseMomentPolicy(value: unknown): AitpMomentPolicy {
  if (!isRecord(value)) {
    return {
      kind: 'host_agnostic_moment_policy',
      decisions: [],
      recommendedMoments: [],
      trustBoundaryReasons: [],
      truthSource: 'aitp',
      orientationOnly: true,
      canUpdateClaimTrust: false,
    };
  }
  return {
    kind: stringValue(value['kind']) ?? 'host_agnostic_moment_policy',
    decisions: objectArray(value['decisions']).map(parseMomentPolicyDecision),
    recommendedMoments: momentArray(value['recommended_moments']),
    trustBoundaryReasons: stringArray(value['trust_boundary_reasons']),
    truthSource: stringValue(value['truth_source']) ?? 'aitp',
    orientationOnly: booleanValue(value['orientation_only']) ?? true,
    canUpdateClaimTrust: booleanValue(value['can_update_claim_trust']) ?? false,
  };
}

function parseMigrationHealth(value: unknown): AitpMigrationHealth {
  if (!isRecord(value)) {
    return emptyMigrationHealth();
  }
  return {
    kind: stringValue(value['kind']) ?? 'aitp_workspace_migration_health',
    status: stringValue(value['status']) ?? 'unknown',
    canonicalStore: stringValue(valueFor(value, 'canonical_store', 'canonicalStore')) ?? '',
    ledgerPath: stringValue(valueFor(value, 'ledger_path', 'ledgerPath')),
    ledgerStatus: stringValue(valueFor(value, 'ledger_status', 'ledgerStatus')) ?? 'missing',
    fileDecisionCount: numberValue(valueFor(value, 'file_decision_count', 'fileDecisionCount')) ?? 0,
    expectedTotalFileCount: numberValue(valueFor(value, 'expected_total_file_count', 'expectedTotalFileCount')) ?? 0,
    noOmissionCheck: booleanValue(valueFor(value, 'no_omission_check', 'noOmissionCheck')) ?? false,
    blockingFileCount: numberValue(valueFor(value, 'blocking_file_count', 'blockingFileCount')) ?? 0,
    oldStoreRetirementSafe:
      booleanValue(valueFor(value, 'old_store_retirement_safe', 'oldStoreRetirementSafe')) ?? false,
    semanticReviewRequired:
      booleanValue(valueFor(value, 'semantic_review_required', 'semanticReviewRequired')) ?? false,
    rootL2GlobalMemoryRisk:
      booleanValue(valueFor(value, 'root_l2_global_memory_risk', 'rootL2GlobalMemoryRisk')) ?? false,
    rootL2GlobalMemoryDecisionCount: numberValue(
      valueFor(value, 'root_l2_global_memory_decision_count', 'rootL2GlobalMemoryDecisionCount'),
    ) ?? 0,
    rootL2GlobalMemoryTopicCount: numberValue(
      valueFor(value, 'root_l2_global_memory_topic_count', 'rootL2GlobalMemoryTopicCount'),
    ) ?? 0,
    rootL2GlobalMemoryRiskReason:
      stringValue(valueFor(value, 'root_l2_global_memory_risk_reason', 'rootL2GlobalMemoryRiskReason')) ?? '',
    canonicalLegacySeedCount: numberValue(
      valueFor(value, 'canonical_legacy_seed_count', 'canonicalLegacySeedCount'),
    ) ?? 0,
    activeLegacySeedCount: numberValue(
      valueFor(value, 'active_legacy_seed_count', 'activeLegacySeedCount'),
    ) ?? 0,
    legacySeedTopicCount: numberValue(
      valueFor(value, 'legacy_seed_topic_count', 'legacySeedTopicCount'),
    ) ?? 0,
    legacySeedQuarantineStatus:
      stringValue(valueFor(value, 'legacy_seed_quarantine_status', 'legacySeedQuarantineStatus')) ??
      'no_canonical_legacy_l2_seeds',
    legacySeedNextActions: stringArray(
      valueFor(value, 'legacy_seed_next_actions', 'legacySeedNextActions'),
    ),
    nextActions: stringArray(valueFor(value, 'next_actions', 'nextActions')),
    summaryLines: stringArray(valueFor(value, 'summary_lines', 'summaryLines')),
    truthSource: stringValue(valueFor(value, 'truth_source', 'truthSource')) ?? 'aitp',
    orientationOnly: booleanValue(valueFor(value, 'orientation_only', 'orientationOnly')) ?? true,
    canUpdateClaimTrust:
      booleanValue(valueFor(value, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function emptyMigrationHealth(): AitpMigrationHealth {
  return {
    kind: 'aitp_workspace_migration_health',
    status: 'unknown',
    canonicalStore: '',
    ledgerPath: undefined,
    ledgerStatus: 'missing',
    fileDecisionCount: 0,
    expectedTotalFileCount: 0,
    noOmissionCheck: false,
    blockingFileCount: 0,
    oldStoreRetirementSafe: false,
    semanticReviewRequired: false,
    rootL2GlobalMemoryRisk: false,
    rootL2GlobalMemoryDecisionCount: 0,
    rootL2GlobalMemoryTopicCount: 0,
    rootL2GlobalMemoryRiskReason: '',
    canonicalLegacySeedCount: 0,
    activeLegacySeedCount: 0,
    legacySeedTopicCount: 0,
    legacySeedQuarantineStatus: 'no_canonical_legacy_l2_seeds',
    legacySeedNextActions: [],
    nextActions: [],
    summaryLines: [],
    truthSource: 'aitp',
    orientationOnly: true,
    canUpdateClaimTrust: false,
  };
}

function parseMomentPolicyDecision(
  raw: Record<string, unknown>,
  index: number,
): AitpMomentPolicyDecision {
  const moment = stringValue(raw['moment']) ?? `aitp.policy.${String(index + 1)}`;
  const targetType = stringValue(raw['target_type']) ?? 'unknown';
  const targetId = stringValue(raw['target_id']) ?? `target-${String(index + 1)}`;
  const recordEntrypoints = stringArray(raw['record_entrypoints']);
  const explorationEntrypoints = stringArray(raw['exploration_entrypoints']);
  const explicitEntrypoints = stringArray(raw['entrypoints']);
  return {
    moment: moment as AitpResearchMomentId,
    decisionType: stringValue(raw['decision_type']) ?? 'recording',
    actionKind: stringValue(raw['action_kind']) ?? moment,
    requiredNow: booleanValue(raw['required_now']) ?? false,
    reason: stringValue(raw['reason']) ?? `AITP moment policy decision ${String(index + 1)}.`,
    targetType,
    targetId,
    targetRefs: stringArray(raw['target_refs']).length > 0
      ? stringArray(raw['target_refs'])
      : [nodeRef(targetType, targetId)],
    missingComponents: stringArray(raw['missing_components']),
    recordEntrypoints,
    explorationEntrypoints,
    entrypoints: explicitEntrypoints.length > 0
      ? explicitEntrypoints
      : unique([...recordEntrypoints, ...explorationEntrypoints]),
    payloadHints: objectArray(raw['payload_hints']).map(parsePayloadHint),
    requiredBeforeTrustChange: stringArray(raw['required_before_trust_change']),
    trustBoundary: booleanValue(raw['trust_boundary']) ?? false,
    orientationOnly: booleanValue(raw['orientation_only']) ?? true,
    canUpdateClaimTrust: booleanValue(raw['can_update_claim_trust']) ?? false,
    lifecycleTrigger: parseLifecycleTrigger(raw),
  };
}

function parsePayloadHint(raw: Record<string, unknown>): AitpPayloadHint {
  const requiredFields = stringArray(raw['required_fields']).length > 0
    ? stringArray(raw['required_fields'])
    : stringArray(raw['requiredFields']);
  return {
    entrypoint: stringValue(raw['entrypoint']) ?? '',
    recordAction: stringValue(raw['record_action']) ?? stringValue(raw['recordAction']) ?? '',
    actionKind: stringValue(raw['action_kind']) ?? stringValue(raw['actionKind']) ?? '',
    targetType: stringValue(raw['target_type']) ?? stringValue(raw['targetType']) ?? '',
    targetId: stringValue(raw['target_id']) ?? stringValue(raw['targetId']) ?? '',
    requiredFields,
    draft: isRecord(raw['draft']) ? raw['draft'] : {},
    draftSchema: parsePayloadDraftSchema(valueFor(raw, 'draft_schema', 'draftSchema'), requiredFields),
    orientationOnly: booleanValue(raw['orientation_only']) ?? true,
    summaryInputsTrusted: booleanValue(raw['summary_inputs_trusted']) ?? false,
    canUpdateClaimTrust: booleanValue(raw['can_update_claim_trust']) ?? false,
    lifecycleTrigger: parseLifecycleTrigger(raw),
  };
}

function parsePayloadDraftSchema(
  raw: unknown,
  fallbackRequiredFields: readonly string[],
): AitpPayloadDraftSchema {
  const schema = recordValue(raw);
  return {
    requiredFields: stringArray(valueFor(schema, 'required_fields', 'requiredFields')).length > 0
      ? stringArray(valueFor(schema, 'required_fields', 'requiredFields'))
      : fallbackRequiredFields,
    placeholderFields: stringArray(valueFor(schema, 'placeholder_fields', 'placeholderFields')),
    placeholderValues: stringRecord(valueFor(schema, 'placeholder_values', 'placeholderValues')),
    hostMustResolve: stringArray(valueFor(schema, 'host_must_resolve', 'hostMustResolve')),
    fieldCase: stringValue(valueFor(schema, 'field_case', 'fieldCase')) ?? 'snake_case',
    summaryInputsTrusted: booleanValue(valueFor(schema, 'summary_inputs_trusted', 'summaryInputsTrusted')) ?? false,
    canUpdateClaimTrust: booleanValue(valueFor(schema, 'can_update_claim_trust', 'canUpdateClaimTrust')) ?? false,
  };
}

function parseLifecycleTrigger(raw: Record<string, unknown>): AitpLifecycleTriggerInfo {
  return {
    lifecyclePhases: stringArray(valueFor(raw, 'lifecycle_phases', 'lifecyclePhases')),
    triggerConditions: stringArray(valueFor(raw, 'trigger_conditions', 'triggerConditions')),
    recordingThreshold: stringValue(valueFor(raw, 'recording_threshold', 'recordingThreshold')),
    trustBoundaryInputs: parseTrustBoundaryInputs(
      valueFor(raw, 'trust_boundary_inputs', 'trustBoundaryInputs'),
    ),
    recommendedHostBehavior: stringList(
      valueFor(raw, 'recommended_host_behavior', 'recommendedHostBehavior'),
    ),
  };
}

function emptyLifecycleTrigger(): AitpLifecycleTriggerInfo {
  return {
    lifecyclePhases: [],
    triggerConditions: [],
    recordingThreshold: undefined,
    trustBoundaryInputs: emptyTrustBoundaryInputs(),
    recommendedHostBehavior: [],
  };
}

function parseTrustBoundaryInputs(value: unknown): AitpLifecycleTriggerInfo['trustBoundaryInputs'] {
  if (isRecord(value)) {
    return {
      targetRefs: stringArray(valueFor(value, 'target_refs', 'targetRefs')),
      claimId: stringValue(valueFor(value, 'claim_id', 'claimId')),
      entrypoints: stringArray(value['entrypoints']),
      requiredBeforeTrustChange: stringArray(
        valueFor(value, 'required_before_trust_change', 'requiredBeforeTrustChange'),
      ),
      requiresPreflight: booleanValue(
        valueFor(value, 'requires_preflight', 'requiresPreflight'),
      ) ?? false,
      finalGateRequired: booleanValue(
        valueFor(value, 'final_gate_required', 'finalGateRequired'),
      ) ?? false,
    };
  }
  const targetRefs = stringArray(value);
  return {
    ...emptyTrustBoundaryInputs(),
    targetRefs,
  };
}

function emptyTrustBoundaryInputs(): AitpLifecycleTriggerInfo['trustBoundaryInputs'] {
  return {
    targetRefs: [],
    claimId: undefined,
    entrypoints: [],
    requiredBeforeTrustChange: [],
    requiresPreflight: false,
    finalGateRequired: false,
  };
}

function targetRefsFromMoment(item: Record<string, unknown>): readonly string[] {
  const targetType = stringValue(item['target_type']);
  const targetId = stringValue(item['target_id']);
  if (targetType !== undefined && targetId !== undefined) return [nodeRef(targetType, targetId)];
  return [];
}

function parseSeverity(value: unknown): AitpObligationSeverity {
  const text = stringValue(value);
  if (text === 'blocking' || text === 'recommended' || text === 'advisory') return text;
  if (text === 'important') return 'recommended';
  return 'recommended';
}

function parsePriority(value: unknown): ResearchActionBindingPriority {
  const text = stringValue(value);
  if (text === 'low' || text === 'normal' || text === 'high' || text === 'blocking') return text;
  return 'normal';
}

function requiredString(raw: Record<string, unknown>, key: string, path: string): string {
  const value = stringValue(raw[key]);
  if (value !== undefined) return value;
  throw new AitpProcessGraphSliceParseError(`Missing required AITP field ${path}.${key}`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function stringList(value: unknown): readonly string[] {
  const single = stringValue(value);
  if (single !== undefined) return [single];
  return stringArray(value);
}

function objectArray(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    const stringItem = stringValue(item);
    if (stringItem !== undefined) result[key] = stringItem;
  }
  return result;
}

function valueFor(
  raw: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): unknown {
  return raw[snakeKey] ?? raw[camelKey];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nodeRef(type: string, id: string): string {
  return `${type}:${id}`;
}

function unique(values: readonly string[]): readonly string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}
