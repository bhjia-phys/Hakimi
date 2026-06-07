import type {
  AitpMomentPolicyDecision,
  AitpProcessGraphEdge,
  AitpProcessGraphSlice,
  AitpProvenanceGap,
  AitpRelationNeighborhoodItem,
  AitpResearchMomentId,
  AitpRouteStateItem,
  DetectedResearchMoment,
  ResearchMomentDetectorInput,
} from './types';
import type { ResearchActionBindingPriority } from '../research-action';

export class ResearchMomentDetector {
  detect(
    slice: AitpProcessGraphSlice,
    input: ResearchMomentDetectorInput = {},
  ): readonly DetectedResearchMoment[] {
    return detectResearchMoments(slice, input);
  }
}

export function detectResearchMoments(
  slice: AitpProcessGraphSlice,
  input: ResearchMomentDetectorInput = {},
): readonly DetectedResearchMoment[] {
  const moments = new Map<string, DetectedResearchMoment>();
  const text = detectorText(slice, input);

  for (const decision of slice.momentPolicy.decisions) {
    addMoment(moments, {
      id: decision.moment,
      actionId: actionIdForPolicyDecision(decision),
      priority: priorityForPolicyDecision(decision),
      reason: `AITP moment policy: ${decision.reason}`,
      source: 'moment-policy',
      targetRefs: decision.targetRefs,
      timing: timingForPolicyDecision(decision),
      trustBoundary: decision.trustBoundary ? trustBoundaryForPolicyDecision(decision) : undefined,
      lifecycleTrigger: decision.lifecycleTrigger,
    });
  }

  for (const moment of slice.recommendedMoments) {
    const actionId = actionIdForMoment(moment.id);
    addMoment(moments, {
      id: moment.id,
      actionId,
      priority: priorityForRecommendedMoment(actionId, moment.priority, moment.lifecycleTrigger),
      reason: moment.reason,
      source: 'aitp',
      targetRefs: moment.targetRefs,
      timing: moment.timing,
      trustBoundary: moment.trustBoundary,
      lifecycleTrigger: moment.lifecycleTrigger,
    });
  }

  for (const gap of slice.provenanceGaps) {
    for (const actionId of provenanceGapActionIds(gap)) {
      addMoment(moments, {
        id: actionId as AitpResearchMomentId,
        actionId,
        priority: priorityForProvenanceGap(gap),
        reason: `AITP provenance gap ${gap.id}: ${gap.reason}`,
        source: 'provenance-gap',
        targetRefs: gap.targetRefs,
        timing: timingForProvenanceGap(gap),
        trustBoundary: trustBoundaryForProvenanceGap(gap),
        lifecycleTrigger: lifecycleTriggerForProvenanceGap(gap),
      });
    }
  }

  for (const route of slice.routeState.routes) {
    for (const momentId of routeMomentIds(route)) {
      const actionId = actionIdForMoment(momentId);
      addMoment(moments, {
        id: momentId,
        actionId,
        priority: routeMomentPriority(route, actionId),
        reason: routeMomentReason(route, actionId),
        source: 'route-state',
        targetRefs: route.targetRefs,
        timing: route.finalGateRequired ? 'before_final' : undefined,
        trustBoundary: routeTrustBoundary(route),
        lifecycleTrigger: lifecycleTriggerForRoute(route),
      });
    }
  }

  if (slice.openObligations.length > 0) {
    addMoment(moments, {
      id: 'aitp.create_open_obligation',
      actionId: 'aitp.create_open_obligation',
      priority: maxPriority(slice.openObligations.map((item) => priorityForSeverity(item.severity))),
      reason: 'AITP slice contains open obligations that should stay explicit.',
      source: 'obligation',
      targetRefs: slice.openObligations.map((item) => item.id),
      lifecycleTrigger: emptyLifecycleTrigger(),
    });
  }

  const reviewResultTargets = sourceReconstructionReviewResultTargets(slice);
  if (reviewResultTargets.length > 0) {
    addMoment(moments, {
      id: 'aitp.record_source_reconstruction_review_result',
      actionId: 'aitp.record_source_reconstruction_review_result',
      priority: 'high',
      reason:
        'AITP source reconstruction review worklist asks for typed review result records.',
      source: 'aitp',
      targetRefs: reviewResultTargets,
      lifecycleTrigger: emptyLifecycleTrigger(),
    });
  }

  for (const obligation of slice.openObligations) {
    const obligationText = lowerJoin([obligation.kind, obligation.reason, obligation.status]);
    const targetRefs = [obligation.targetNodeId, obligation.id].filter(isString);
    const priority = priorityForSeverity(obligation.severity);

    for (const id of obligation.suggestedMomentIds) {
      addMoment(moments, {
        id,
        actionId: actionIdForMoment(id),
        priority,
        reason: `AITP obligation ${obligation.id} suggests ${id}.`,
        source: 'obligation',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }

    if (hasAny(obligationText, ['source', 'citation', 'backtrace', 'provenance'])) {
      addMoment(moments, {
        id: 'trace.open_backtrace',
        actionId: 'trace.open_backtrace',
        priority,
        reason: `Open obligation ${obligation.id} needs source backtrace.`,
        source: 'obligation',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
    if (hasAny(obligationText, ['source', 'dependency', 'citation', 'gap'])) {
      addMoment(moments, {
        id: 'trace.follow_source_dependency',
        actionId: 'trace.follow_source_dependency',
        priority,
        reason: `Open obligation ${obligation.id} points at a source dependency gap.`,
        source: 'obligation',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
    if (hasAny(obligationText, ['definition', 'define', 'reconstruct'])) {
      addMoment(moments, {
        id: 'trace.reconstruct_definition',
        actionId: 'trace.reconstruct_definition',
        priority,
        reason: `Open obligation ${obligation.id} needs a definition reconstructed.`,
        source: 'obligation',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
  }

  if (hasRelationHypothesis(slice)) {
    addMoment(moments, {
      id: 'physics.brainstorm_relation_path',
      actionId: 'physics.brainstorm_relation_path',
      priority: 'high',
      reason: 'AITP relation neighborhood contains a hypothesis or provisional relation path.',
      source: 'relation',
      targetRefs: relationTargetRefs(slice),
      lifecycleTrigger: emptyLifecycleTrigger(),
    });
  }

  if (hasSourceGap(slice)) {
    addMoment(moments, {
      id: 'trace.follow_source_dependency',
      actionId: 'trace.follow_source_dependency',
      priority: 'high',
      reason: 'AITP source backtrace has an unresolved source gap.',
      source: 'source-backtrace',
      targetRefs: slice.sourceBacktrace.map((item) => item.id),
      lifecycleTrigger: emptyLifecycleTrigger(),
    });
    addMoment(moments, {
      id: 'trace.open_backtrace',
      actionId: 'trace.open_backtrace',
      priority: 'high',
      reason: 'Open a backtrace before treating the gap as resolved.',
      source: 'source-backtrace',
      targetRefs: slice.sourceBacktrace.map((item) => item.id),
      lifecycleTrigger: emptyLifecycleTrigger(),
    });
  }

  if (slice.trustBoundaryReasons.length > 0) {
    const targetRefs = slice.trustBoundaryReasons.map((_, index) =>
      `trust_boundary:${String(index + 1)}`,
    );
    addMoment(moments, {
      id: 'aitp.request_human_checkpoint',
      actionId: 'aitp.request_human_checkpoint',
      priority: 'high',
      reason: 'AITP slice declares a trust boundary; require a human checkpoint before treating trust as updated.',
      source: 'trust-boundary',
      targetRefs,
      timing: 'before_trust_update',
      trustBoundary: 'human_checkpoint',
      lifecycleTrigger: emptyLifecycleTrigger(),
    });
    addMoment(moments, {
      id: 'aitp.record_research_state',
      actionId: 'aitp.record_research_state',
      priority: 'normal',
      reason: 'Record the current AITP-facing state at the trust boundary.',
      source: 'trust-boundary',
      targetRefs,
      timing: 'at_trust_boundary',
      trustBoundary: 'trust_boundary',
      lifecycleTrigger: emptyLifecycleTrigger(),
    });
  }

  for (const record of slice.exploratoryRecords) {
    const targetRefs = [`exploratory_record:${record.id}`];
    const textForRecord = lowerJoin([
      record.explorationType,
      record.title,
      record.focalQuestion,
      record.originalQuestion,
      record.localQuestion,
      record.status,
      ...record.candidatePaths,
      ...record.unresolvedPoints,
      ...record.nextActions,
    ]);
    if (isOpenExploration(record.status)) {
      addMoment(moments, {
        id: 'aitp.record_exploratory_record',
        actionId: 'aitp.record_exploratory_record',
        priority: 'high',
        reason: `AITP exploratory record ${record.id} is active in the local research graph.`,
        source: 'exploration',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
    if (record.explorationType === 'question_decomposition' && isOpenExploration(record.status)) {
      addMoment(moments, {
        id: 'direction.brainstorm',
        actionId: 'direction.brainstorm',
        priority: 'high',
        reason: `Question decomposition ${record.id} should steer the next local analysis.`,
        source: 'exploration',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
    if (record.explorationType === 'relation_path_brainstorm' || hasAny(textForRecord, ['relation path'])) {
      addMoment(moments, {
        id: 'physics.brainstorm_relation_path',
        actionId: 'physics.brainstorm_relation_path',
        priority: 'high',
        reason: `Exploratory record ${record.id} keeps a relation path provisional.`,
        source: 'exploration',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
    if (
      record.explorationType === 'source_asset' ||
      record.explorationType === 'backtrace_step' ||
      hasAny(textForRecord, ['source dependency', 'source gap', 'backtrace'])
    ) {
      addMoment(moments, {
        id: 'trace.open_backtrace',
        actionId: 'trace.open_backtrace',
        priority: 'high',
        reason: `Exploratory record ${record.id} needs source/backtrace continuity.`,
        source: 'exploration',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
      addMoment(moments, {
        id: 'trace.follow_source_dependency',
        actionId: 'trace.follow_source_dependency',
        priority: 'high',
        reason: `Exploratory record ${record.id} points at source dependency work.`,
        source: 'exploration',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
    if (record.originalQuestion !== undefined && record.localQuestion !== undefined) {
      addMoment(moments, {
        id: 'trace.audit_original_question_drift',
        actionId: 'trace.audit_original_question_drift',
        priority: 'high',
        reason: `Exploratory record ${record.id} has a local question tied to an original question.`,
        source: 'exploration',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
    if (record.unresolvedPoints.length > 0) {
      addMoment(moments, {
        id: 'aitp.create_open_obligation',
        actionId: 'aitp.create_open_obligation',
        priority: 'high',
        reason: `Exploratory record ${record.id} has unresolved points that may need typed obligations.`,
        source: 'exploration',
        targetRefs,
        lifecycleTrigger: emptyLifecycleTrigger(),
      });
    }
  }
  if (hasAny(text, [
    'brainstorm',
    'direction',
    'route',
    'approach',
    'explore',
    '\u5934\u8111\u98ce\u66b4',
    '\u8111\u66b4',
    '\u65b9\u5411',
    '\u601d\u8def',
    '\u63a2\u7d22',
  ])) {
    addKeywordMoment(moments, 'direction.brainstorm', 'Prompt asks for direction exploration.');
  }
  if (hasAny(text, [
    'relation path',
    'relation',
    'bridge',
    'connect',
    'link',
    '\u5173\u7cfb\u8def\u5f84',
    '\u5173\u8054\u8def\u5f84',
    '\u6865\u63a5',
    '\u8fde\u63a5',
  ])) {
    addKeywordMoment(
      moments,
      'physics.brainstorm_relation_path',
      'Prompt or context asks about a physics relation path.',
    );
  }
  if (hasAny(text, [
    'backtrace',
    'trace',
    'provenance',
    'source backtrace',
    '\u6e90\u56de\u6eaf',
    '\u56de\u6eaf',
    '\u6eaf\u6e90',
    '\u6765\u6e90',
  ])) {
    addKeywordMoment(moments, 'trace.open_backtrace', 'Prompt or context asks for traceability.');
  }
  if (hasAny(text, ['definition', 'define', 'reconstruct', '\u5b9a\u4e49', '\u6982\u5ff5', '\u91cd\u6784'])) {
    addKeywordMoment(
      moments,
      'trace.reconstruct_definition',
      'Prompt or context asks about a definition boundary.',
    );
  }
  if (hasAny(text, [
    'source dependency',
    'source gap',
    'citation gap',
    'citation',
    'dependency',
    '\u6765\u6e90\u4f9d\u8d56',
    '\u5f15\u7528\u7f3a\u53e3',
    '\u6765\u6e90\u7f3a\u53e3',
    '\u4f9d\u8d56',
  ])) {
    addKeywordMoment(
      moments,
      'trace.follow_source_dependency',
      'Prompt or context asks about source dependency.',
    );
  }
  if (hasAny(text, ['original question', 'drift', 'lost the question', '忘记原问题', '偏离问题'])) {
    addKeywordMoment(
      moments,
      'trace.audit_original_question_drift',
      'Prompt or context suggests the backtrace may be drifting from the original question.',
    );
  }
  if (hasAny(text, [
    'record state',
    'research state',
    'save state',
    'snapshot',
    'log state',
    'capture state',
    '\u8bb0\u5f55\u72b6\u6001',
    '\u4fdd\u5b58\u72b6\u6001',
    '\u7814\u7a76\u72b6\u6001',
    '\u5feb\u7167',
  ])) {
    addKeywordMoment(
      moments,
      'aitp.record_research_state',
      'Prompt or context asks to record research state.',
    );
  }
  if (hasAny(text, [
    'record exploration',
    'exploratory record',
    'brainstorm record',
    'backtrace record',
    'steering checkpoint',
    '\u8bb0\u5f55\u63a2\u7d22',
    '\u63a2\u7d22\u8bb0\u5f55',
    '\u8111\u66b4\u8bb0\u5f55',
    '\u56de\u6eaf\u8bb0\u5f55',
    '\u8f6c\u5411\u68c0\u67e5\u70b9',
  ])) {
    addKeywordMoment(
      moments,
      'aitp.record_exploratory_record',
      'Prompt or context asks to record exploratory research state.',
    );
  }
  if (hasAny(text, [
    'derivation checkpoint',
    'checkpoint',
    'derivation',
    'derive',
    'equation',
    '\u63a8\u5bfc\u68c0\u67e5\u70b9',
    '\u63a8\u5bfc',
    '\u65b9\u7a0b',
  ])) {
    addKeywordMoment(
      moments,
      'aitp.record_derivation_checkpoint',
      'Prompt or context mentions a derivation checkpoint.',
    );
  }
  if (hasAny(text, [
    'open obligation',
    'obligation',
    'open question',
    'todo',
    'gap',
    '\u5f00\u653e\u4e49\u52a1',
    '\u5f85\u529e',
    '\u7f3a\u53e3',
  ])) {
    addKeywordMoment(
      moments,
      'aitp.create_open_obligation',
      'Prompt or context asks to preserve an open obligation.',
    );
  }
  if (hasAny(text, [
    '\u539f\u59cb\u95ee\u9898',
    '\u539f\u95ee\u9898',
    '\u504f\u79bb\u95ee\u9898',
    '\u8dd1\u504f',
  ])) {
    addKeywordMoment(
      moments,
      'trace.audit_original_question_drift',
      'Prompt or context suggests the backtrace may be drifting from the original question.',
    );
  }
  if (hasAny(text, [
    'trust boundary',
    'trust-boundary',
    'human checkpoint',
    'human review',
    'human approval',
    'human decision',
    'manual checkpoint',
    'human-in-the-loop',
    'cannot update claim trust',
    'update claim trust',
    '\u4fe1\u4efb\u8fb9\u754c',
    '\u4eba\u5de5\u68c0\u67e5\u70b9',
    '\u4eba\u7c7b\u68c0\u67e5\u70b9',
    '\u4eba\u5de5\u5ba1\u6838',
    '\u4eba\u5de5\u786e\u8ba4',
    '\u4eba\u7c7b\u786e\u8ba4',
    '\u4fe1\u4efb\u66f4\u65b0',
  ])) {
    addKeywordMoment(
      moments,
      'aitp.request_human_checkpoint',
      'Prompt or context asks for a trust-boundary human checkpoint.',
      'high',
    );
  }
  if (hasAny(text, [
    'source reconstruction review result',
    'record source reconstruction review',
    'reviewed component',
    'reviewed components',
    'review result',
    '\u6e90\u91cd\u6784\u5ba1\u67e5',
    '\u6e90\u91cd\u6784\u5ba1\u6838',
    '\u5ba1\u67e5\u7ed3\u679c',
    '\u5ba1\u6838\u7ed3\u679c',
  ])) {
    addKeywordMoment(
      moments,
      'aitp.record_source_reconstruction_review_result',
      'Prompt or context asks to record a source reconstruction review result.',
      'high',
    );
  }

  return [...moments.values()].toSorted((left, right) => {
    const byPriority = priorityRank(right.priority) - priorityRank(left.priority);
    if (byPriority !== 0) return byPriority;
    return left.actionId.localeCompare(right.actionId);
  });
}

export function actionIdForMoment(id: AitpResearchMomentId): string {
  switch (id) {
    case 'brainstorm_relation_path':
      return 'physics.brainstorm_relation_path';
    case 'backtrace_source_reconstruction':
      return 'trace.open_backtrace';
    case 'record_or_validate_open_obligation':
      return 'aitp.create_open_obligation';
    case 'audit_original_question_drift':
      return 'trace.audit_original_question_drift';
    case 'record_exploratory_record':
      return 'aitp.record_exploratory_record';
    case 'capture_source_or_code_provenance':
      return 'aitp.register_source_asset';
    case 'record_route_choice':
      return 'aitp.record_route_choice';
    case 'record_failed_route_lesson':
      return 'aitp.record_failed_route_lesson';
    case 'checkpoint_before_route_switch':
    case 'route_switch_checkpoint':
      return 'aitp.checkpoint_before_route_switch';
    case 'trust_boundary_before_claim_update':
      return 'aitp.run_trust_preflight';
    case 'human_checkpoint':
    case 'request_human_checkpoint':
      return 'aitp.request_human_checkpoint';
    case 'record_source_reconstruction_review_result':
      return 'aitp.record_source_reconstruction_review_result';
    default:
      return id;
  }
}

export function actionIdForPolicyDecision(decision: AitpMomentPolicyDecision): string {
  if (decision.actionKind === 'record_evidence_or_validation') {
    if (decision.entrypoints.includes('aitp_v5_record_evidence')) {
      return 'aitp.record_evidence';
    }
    if (decision.entrypoints.includes('aitp_v5_record_tool_run')) {
      return 'aitp.record_tool_run';
    }
    if (decision.entrypoints.includes('aitp_v5_record_validation_result')) {
      return 'aitp.record_validation_result';
    }
    if (decision.entrypoints.includes('aitp_v5_record_source_reconstruction_review_result')) {
      return 'aitp.record_source_reconstruction_review_result';
    }
    return 'aitp.create_open_obligation';
  }
  if (decision.entrypoints.includes('aitp_v5_record_source_reconstruction_review_result')) {
    return 'aitp.record_source_reconstruction_review_result';
  }
  if (decision.entrypoints.includes('aitp_v5_record_reference_location')) {
    return 'aitp.record_reference_location';
  }
  if (decision.entrypoints.includes('aitp_v5_capture_source_asset_auto')) {
    return 'aitp.capture_source_asset_auto';
  }
  if (decision.entrypoints.includes('aitp_v5_record_tool_run')) {
    return 'aitp.record_tool_run';
  }
  if (
    decision.entrypoints.includes('aitp_v5_capture_code_state_auto') ||
    decision.entrypoints.includes('aitp_v5_record_code_state')
  ) {
    return 'aitp.capture_code_state_auto';
  }
  if (decision.entrypoints.includes('aitp_v5_preflight_trust_update')) {
    return 'aitp.run_trust_preflight';
  }
  return actionIdForMoment(decision.moment);
}

function priorityForPolicyDecision(
  decision: AitpMomentPolicyDecision,
): ResearchActionBindingPriority {
  const actionId = actionIdForPolicyDecision(decision);
  if (isRouteActionId(actionId) && !routePolicyRequiresFinalGate(decision)) {
    if (decision.requiredNow || decision.trustBoundary) return 'high';
    return 'normal';
  }
  if (decision.requiredNow) return 'blocking';
  if (decision.trustBoundary) return 'high';
  if (decision.decisionType === 'brainstorming' || decision.decisionType === 'backtrace') {
    return 'high';
  }
  return 'normal';
}

function timingForPolicyDecision(decision: AitpMomentPolicyDecision): string | undefined {
  if (
    isRouteActionId(actionIdForPolicyDecision(decision)) &&
    !routePolicyRequiresFinalGate(decision)
  ) {
    return decision.requiredNow ? 'recommended_now' : undefined;
  }
  if (decision.requiredNow) return 'required_now';
  if (decision.requiredBeforeTrustChange.length > 0) return 'before_trust_update';
  return undefined;
}

function trustBoundaryForPolicyDecision(decision: AitpMomentPolicyDecision): string {
  return decision.decisionType === 'trust_boundary'
    ? 'trust_boundary'
    : `policy_prerequisite:${decision.decisionType}`;
}

function routePolicyRequiresFinalGate(decision: AitpMomentPolicyDecision): boolean {
  return (
    decision.requiredBeforeTrustChange.length > 0 ||
    decision.lifecycleTrigger.trustBoundaryInputs.requiredBeforeTrustChange.length > 0 ||
    decision.lifecycleTrigger.trustBoundaryInputs.finalGateRequired
  );
}

function priorityForRecommendedMoment(
  actionId: string,
  priority: ResearchActionBindingPriority,
  trigger: DetectedResearchMoment['lifecycleTrigger'],
): ResearchActionBindingPriority {
  if (!isRouteActionId(actionId)) return priority;
  if (routeTriggerRequiresFinalGate(trigger)) return priority;
  return priority === 'blocking' ? 'high' : priority;
}

function routeMomentIds(route: AitpRouteStateItem): readonly AitpResearchMomentId[] {
  const ids: AitpResearchMomentId[] = route.suggestedMomentIds.filter((id) =>
    isRouteActionId(actionIdForMoment(id)),
  );
  switch (route.status) {
    case 'live':
    case 'selected':
      ids.push('aitp.record_route_choice');
      break;
    case 'blocked':
    case 'abandoned':
    case 'superseded':
      ids.push('aitp.record_failed_route_lesson');
      break;
    default:
      break;
  }
  if (route.pivotRequired) ids.push('aitp.checkpoint_before_route_switch');
  return unique(ids);
}

function routeMomentPriority(
  route: AitpRouteStateItem,
  actionId: string,
): ResearchActionBindingPriority {
  if (route.finalGateRequired || route.requiredBeforeTrustChange.length > 0) return 'blocking';
  if (actionId === 'aitp.checkpoint_before_route_switch' || route.status === 'blocked') return 'high';
  return 'normal';
}

function routeMomentReason(route: AitpRouteStateItem, actionId: string): string {
  const label = route.title ?? route.summary ?? route.id;
  if (actionId === 'aitp.record_route_choice') {
    return `AITP route_state marks ${label} as a live or selected route; preserve the route choice.`;
  }
  if (actionId === 'aitp.record_failed_route_lesson') {
    return `AITP route_state marks ${label} as ${route.status}; preserve the failed-route lesson.`;
  }
  return `AITP route_state marks ${label} as pivot-required route state; checkpoint before route switching.`;
}

function routeTrustBoundary(route: AitpRouteStateItem): string | undefined {
  if (route.requiredBeforeTrustChange.length > 0) return 'route_before_trust_change';
  if (route.finalGateRequired) return 'route_final_gate';
  return undefined;
}

function lifecycleTriggerForRoute(route: AitpRouteStateItem): DetectedResearchMoment['lifecycleTrigger'] {
  return {
    lifecyclePhases: route.finalGateRequired ? ['pre_final'] : [],
    triggerConditions: route.requiredBeforeTrustChange,
    recordingThreshold: route.finalGateRequired ? 'before final answer relies on route switch or route status' : undefined,
    trustBoundaryInputs: {
      targetRefs: route.targetRefs,
      claimId: undefined,
      entrypoints: [],
      requiredBeforeTrustChange: route.requiredBeforeTrustChange,
      requiresPreflight: false,
      finalGateRequired: route.finalGateRequired,
    },
    recommendedHostBehavior: route.finalGateRequired || route.requiredBeforeTrustChange.length > 0
      ? ['surface route moment before final answer']
      : ['surface route moment as a non-blocking recommendation'],
  };
}

function routeTriggerRequiresFinalGate(trigger: DetectedResearchMoment['lifecycleTrigger']): boolean {
  return (
    trigger.trustBoundaryInputs.finalGateRequired ||
    trigger.trustBoundaryInputs.requiredBeforeTrustChange.length > 0
  );
}

function provenanceGapActionIds(gap: AitpProvenanceGap): readonly string[] {
  const fromHints = [
    ...gap.recommendedActions,
    ...gap.recommendedEntrypoints,
  ].flatMap(normalizeProvenanceActionId);
  const inferred: string[] = [];
  const text = lowerJoin([
    gap.gapType,
    gap.provenanceKind,
    gap.reason,
    ...gap.blockingWhenUsedAs,
  ]);
  if (hasAny(text, ['reference_location'])) inferred.push('aitp.record_reference_location');
  if (hasAny(text, ['source_asset', 'source hash'])) {
    inferred.push('aitp.capture_source_asset_auto', 'aitp.register_source_asset');
  } else if (hasAny(text, ['duplicate_hash'])) {
    inferred.push('aitp.register_source_asset');
  }
  if (hasAny(text, ['code_state', 'git diff', 'git_diff', 'patch', 'repo'])) {
    inferred.push('aitp.capture_code_state_auto', 'code.capture_git_diff_observation');
  }
  if (hasAny(text, ['tool_run', 'benchmark'])) {
    inferred.push('aitp.capture_tool_run_auto', 'aitp.record_tool_run');
  }
  if (hasAny(text, ['validation_contract'])) inferred.push('aitp.create_validation_contract');
  if (hasAny(text, ['validation_result'])) inferred.push('aitp.record_validation_result');
  if (hasAny(text, ['source_reconstruction_review_result', 'source reconstruction review result'])) {
    inferred.push('aitp.record_source_reconstruction_review_result');
  }
  if (hasAny(text, ['artifact'])) inferred.push('aitp.attach_artifact_auto', 'aitp.attach_artifact');
  return unique([...fromHints, ...inferred]);
}

function normalizeProvenanceActionId(value: string): readonly string[] {
  switch (value) {
    case 'aitp_v5_record_reference_location':
      return ['aitp.record_reference_location'];
    case 'aitp_v5_capture_source_asset_auto':
      return ['aitp.capture_source_asset_auto'];
    case 'aitp_v5_register_source_asset':
      return ['aitp.register_source_asset'];
    case 'aitp_v5_capture_code_state_auto':
    case 'aitp_v5_record_code_state':
    case 'aitp.record_code_state':
      return ['aitp.capture_code_state_auto'];
    case 'aitp.review_source_asset_duplicate':
      return ['aitp.register_source_asset'];
    case 'aitp_v5_record_tool_run':
      return ['aitp.record_tool_run'];
    case 'aitp_v5_capture_tool_run_auto':
      return ['aitp.capture_tool_run_auto'];
    case 'aitp_v5_create_validation_contract':
    case 'aitp_v5_validation_contract_create':
      return ['aitp.create_validation_contract'];
    case 'aitp_v5_record_validation_result':
      return ['aitp.record_validation_result'];
    case 'aitp_v5_record_source_reconstruction_review_result':
      return ['aitp.record_source_reconstruction_review_result'];
    case 'aitp_v5_attach_artifact_auto':
      return ['aitp.attach_artifact_auto'];
    case 'aitp_v5_attach_artifact':
      return ['aitp.attach_artifact'];
    default:
      if (value.startsWith('aitp.') || value.startsWith('code.')) return [value];
      return [];
  }
}

function priorityForProvenanceGap(gap: AitpProvenanceGap): ResearchActionBindingPriority {
  if (gap.requiredNow || gap.requiredBeforeTrustChange) return 'blocking';
  if (gap.severity === 'blocking' || gap.severity === 'recommended') return 'high';
  return 'normal';
}

function timingForProvenanceGap(gap: AitpProvenanceGap): string | undefined {
  if (gap.requiredNow) return 'required_now';
  if (gap.requiredBeforeTrustChange) return 'before_trust_update';
  if (gap.strictBoundary !== undefined) return gap.strictBoundary;
  return gap.blockingWhenUsedAs.length === 0 ? undefined : 'before_provenance_dependent_reuse';
}

function trustBoundaryForProvenanceGap(gap: AitpProvenanceGap): string | undefined {
  if (gap.requiredBeforeTrustChange) return 'provenance_before_trust_change';
  return gap.strictBoundary;
}

function lifecycleTriggerForProvenanceGap(
  gap: AitpProvenanceGap,
): DetectedResearchMoment['lifecycleTrigger'] {
  const strictBoundary = gap.strictBoundary ?? 'before provenance-dependent reuse';
  return {
    lifecyclePhases: gap.requiredNow ? ['pre_action'] : [],
    triggerConditions: [
      gap.reason,
      ...gap.blockingWhenUsedAs.map((item) => `before using as ${item}`),
    ],
    recordingThreshold: strictBoundary,
    trustBoundaryInputs: {
      targetRefs: gap.targetRefs,
      claimId: gap.claimId,
      entrypoints: gap.recommendedEntrypoints,
      requiredBeforeTrustChange: gap.requiredBeforeTrustChange ? [strictBoundary] : [],
      requiresPreflight: false,
      finalGateRequired: false,
    },
    recommendedHostBehavior: gap.requiredBeforeTrustChange
      ? ['surface provenance capture before changing claim trust']
      : ['surface provenance capture as non-blocking until the target is reused'],
  };
}

function isRouteActionId(actionId: string): boolean {
  return (
    actionId === 'aitp.record_route_choice' ||
    actionId === 'aitp.record_failed_route_lesson' ||
    actionId === 'aitp.checkpoint_before_route_switch'
  );
}

function sourceReconstructionReviewResultTargets(
  slice: AitpProcessGraphSlice,
): readonly string[] {
  const manifestAsksForResult = slice.sourceReconstructionReview.nextActions.includes(
    'record_source_reconstruction_review_result',
  );
  const claimIds = slice.sourceReconstructionReview.items
    .filter(
      (item) =>
        item.nextActions.includes('record_source_reconstruction_review_result') ||
        (manifestAsksForResult && item.reviewStatus !== 'passed'),
    )
    .map((item) => item.claimId);
  return unique(claimIds.map((claimId) => `claim:${claimId}`));
}

function addKeywordMoment(
  moments: Map<string, DetectedResearchMoment>,
  id: AitpResearchMomentId,
  reason: string,
  priority: ResearchActionBindingPriority = 'normal',
): void {
  addMoment(moments, {
    id,
    actionId: actionIdForMoment(id),
    priority,
    reason,
    source: 'keyword',
    targetRefs: [],
    lifecycleTrigger: emptyLifecycleTrigger(),
  });
}

function addMoment(
  moments: Map<string, DetectedResearchMoment>,
  moment: DetectedResearchMoment,
): void {
  const existing = moments.get(moment.actionId);
  if (existing === undefined || priorityRank(moment.priority) > priorityRank(existing.priority)) {
    moments.set(moment.actionId, moment);
    return;
  }
  if (priorityRank(moment.priority) === priorityRank(existing.priority)) {
    moments.set(moment.actionId, {
      ...existing,
      targetRefs: unique([...existing.targetRefs, ...moment.targetRefs]),
      timing: existing.timing ?? moment.timing,
      trustBoundary: existing.trustBoundary ?? moment.trustBoundary,
      lifecycleTrigger: hasLifecycleTrigger(existing.lifecycleTrigger)
        ? existing.lifecycleTrigger
        : moment.lifecycleTrigger,
    });
  }
}

function detectorText(slice: AitpProcessGraphSlice, input: ResearchMomentDetectorInput): string {
  const activeContext =
    typeof input.activeContext === 'string' ? input.activeContext : input.activeContext?.join(' ');
  return lowerJoin([
    input.prompt,
    activeContext,
    ...slice.openObligations.flatMap((item) => [item.kind, item.reason, item.status]),
    ...slice.sourceBacktrace.flatMap((item) => [item.status, item.reason, item.gap]),
    ...slice.provenanceGaps.flatMap((item) => [
      item.gapType,
      item.provenanceKind,
      item.reason,
      item.targetType,
      item.targetId,
      item.strictBoundary,
      ...item.targetRefs,
      ...item.recommendedActions,
      ...item.recommendedEntrypoints,
      ...item.blockingWhenUsedAs,
    ]),
    ...slice.relationNeighborhood.flatMap((item) => [item.relation, item.status, item.reason]),
    ...slice.momentPolicy.decisions.flatMap((item) => [
      item.moment,
      item.decisionType,
      item.actionKind,
      item.reason,
      item.targetType,
      item.targetId,
      ...item.missingComponents,
      ...item.entrypoints,
      ...item.requiredBeforeTrustChange,
      ...item.lifecycleTrigger.lifecyclePhases,
      ...item.lifecycleTrigger.triggerConditions,
      item.lifecycleTrigger.recordingThreshold,
      ...lifecycleTrustBoundaryText(item.lifecycleTrigger),
      ...item.lifecycleTrigger.recommendedHostBehavior,
      ...item.payloadHints.flatMap((hint) => [
        hint.entrypoint,
        hint.recordAction,
        hint.actionKind,
        hint.targetType,
        hint.targetId,
        ...hint.requiredFields,
        ...draftText(hint.draft),
        ...hint.lifecycleTrigger.lifecyclePhases,
        ...hint.lifecycleTrigger.triggerConditions,
        hint.lifecycleTrigger.recordingThreshold,
        ...lifecycleTrustBoundaryText(hint.lifecycleTrigger),
        ...hint.lifecycleTrigger.recommendedHostBehavior,
      ]),
    ]),
    ...slice.recommendedMoments.flatMap((item) => [
      ...item.lifecycleTrigger.lifecyclePhases,
      ...item.lifecycleTrigger.triggerConditions,
      item.lifecycleTrigger.recordingThreshold,
      ...lifecycleTrustBoundaryText(item.lifecycleTrigger),
      ...item.lifecycleTrigger.recommendedHostBehavior,
    ]),
    ...slice.exploratoryRecords.flatMap((item) => [
      item.explorationType,
      item.title,
      item.focalQuestion,
      item.originalQuestion,
      item.localQuestion,
      item.status,
      ...item.candidatePaths,
      ...item.unresolvedPoints,
      ...item.nextActions,
    ]),
  ]);
}

function hasRelationHypothesis(slice: AitpProcessGraphSlice): boolean {
  return [...slice.relationNeighborhood, ...slice.edges].some((item) =>
    hasAny(relationText(item), ['hypothesis', 'hypothesized', 'provisional', 'candidate', 'unknown']),
  );
}

function hasSourceGap(slice: AitpProcessGraphSlice): boolean {
  return slice.sourceBacktrace.some((item) =>
    hasAny(lowerJoin([item.status, item.reason, item.gap]), [
      'gap',
      'missing',
      'unresolved',
      'open',
      'no source',
      'source needed',
    ]),
  );
}

function relationTargetRefs(slice: AitpProcessGraphSlice): readonly string[] {
  return unique(
    [...slice.relationNeighborhood, ...slice.edges].flatMap((item) => [
      item.id,
      item.source,
      item.target,
    ]).filter(isString),
  );
}

function relationText(item: AitpRelationNeighborhoodItem | AitpProcessGraphEdge): string {
  return lowerJoin([
    item.relation,
    item.status,
    'reason' in item ? item.reason : undefined,
    'truthStatus' in item ? item.truthStatus : undefined,
  ]);
}

function priorityForSeverity(severity: string): ResearchActionBindingPriority {
  if (severity === 'blocking') return 'blocking';
  if (severity === 'recommended') return 'high';
  return 'normal';
}

function maxPriority(values: readonly ResearchActionBindingPriority[]): ResearchActionBindingPriority {
  return values.reduce<ResearchActionBindingPriority>((best, value) =>
    priorityRank(value) > priorityRank(best) ? value : best, 'low');
}

function isOpenExploration(status: string | undefined): boolean {
  return status === undefined || status === 'open' || status === 'active' || status === 'deferred';
}

function priorityRank(priority: ResearchActionBindingPriority): number {
  switch (priority) {
    case 'blocking':
      return 4;
    case 'high':
      return 3;
    case 'normal':
      return 2;
    case 'low':
      return 1;
  }
}

function lowerJoin(values: readonly (string | undefined)[]): string {
  return values.filter(isString).join(' ').toLowerCase();
}

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function emptyLifecycleTrigger() {
  return {
    lifecyclePhases: [],
    triggerConditions: [],
    recordingThreshold: undefined,
    trustBoundaryInputs: {
      targetRefs: [],
      claimId: undefined,
      entrypoints: [],
      requiredBeforeTrustChange: [],
      requiresPreflight: false,
      finalGateRequired: false,
    },
    recommendedHostBehavior: [],
  };
}

function hasLifecycleTrigger(trigger: DetectedResearchMoment['lifecycleTrigger']): boolean {
  return (
    trigger.lifecyclePhases.length > 0 ||
    trigger.triggerConditions.length > 0 ||
    trigger.recordingThreshold !== undefined ||
    trigger.trustBoundaryInputs.targetRefs.length > 0 ||
    trigger.trustBoundaryInputs.entrypoints.length > 0 ||
    trigger.trustBoundaryInputs.requiredBeforeTrustChange.length > 0 ||
    trigger.trustBoundaryInputs.requiresPreflight ||
    trigger.trustBoundaryInputs.finalGateRequired ||
    trigger.recommendedHostBehavior.length > 0
  );
}

function lifecycleTrustBoundaryText(
  trigger: DetectedResearchMoment['lifecycleTrigger'],
): readonly string[] {
  return [
    ...trigger.trustBoundaryInputs.targetRefs,
    trigger.trustBoundaryInputs.claimId,
    ...trigger.trustBoundaryInputs.entrypoints,
    ...trigger.trustBoundaryInputs.requiredBeforeTrustChange,
    trigger.trustBoundaryInputs.requiresPreflight ? 'requires_preflight' : undefined,
    trigger.trustBoundaryInputs.finalGateRequired ? 'final_gate_required' : undefined,
  ].filter(isString);
}

function draftText(value: unknown): readonly string[] {
  if (typeof value === 'string' && value.trim().length > 0) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(draftText);
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => [key, ...draftText(item)]);
  }
  return [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values: readonly string[]): readonly string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}
