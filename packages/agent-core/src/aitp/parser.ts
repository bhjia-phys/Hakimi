import type {
  AitpExploratoryRecordItem,
  AitpLifecycleTriggerInfo,
  AitpMomentPolicy,
  AitpMomentPolicyDecision,
  AitpObligationSeverity,
  AitpOpenObligation,
  AitpPayloadHint,
  AitpProcessGraphEdge,
  AitpProcessGraphNode,
  AitpProcessGraphSlice,
  AitpRecommendedMoment,
  AitpRelationNeighborhoodItem,
  AitpResearchMomentId,
  AitpSourceBacktraceItem,
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
    relationNeighborhood: objectArray(input['relation_neighborhood']).map(
      parseRelationNeighborhoodItem,
    ),
    exploratoryRecords: objectArray(input['exploratory_records']).map(parseExploratoryRecordItem),
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
        : targetRefsFromMoment(item),
      timing: stringValue(item['timing']) ?? stringValue(item['call_timing']),
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
  return {
    entrypoint: stringValue(raw['entrypoint']) ?? '',
    recordAction: stringValue(raw['record_action']) ?? stringValue(raw['recordAction']) ?? '',
    actionKind: stringValue(raw['action_kind']) ?? stringValue(raw['actionKind']) ?? '',
    targetType: stringValue(raw['target_type']) ?? stringValue(raw['targetType']) ?? '',
    targetId: stringValue(raw['target_id']) ?? stringValue(raw['targetId']) ?? '',
    requiredFields: stringArray(raw['required_fields']).length > 0
      ? stringArray(raw['required_fields'])
      : stringArray(raw['requiredFields']),
    draft: isRecord(raw['draft']) ? raw['draft'] : {},
    orientationOnly: booleanValue(raw['orientation_only']) ?? true,
    summaryInputsTrusted: booleanValue(raw['summary_inputs_trusted']) ?? false,
    canUpdateClaimTrust: booleanValue(raw['can_update_claim_trust']) ?? false,
    lifecycleTrigger: parseLifecycleTrigger(raw),
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
