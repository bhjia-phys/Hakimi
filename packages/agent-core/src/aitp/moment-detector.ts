import type {
  AitpMomentPolicyDecision,
  AitpProcessGraphEdge,
  AitpProcessGraphSlice,
  AitpRelationNeighborhoodItem,
  AitpResearchMomentId,
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
    });
  }

  for (const moment of slice.recommendedMoments) {
    addMoment(moments, {
      id: moment.id,
      actionId: actionIdForMoment(moment.id),
      priority: moment.priority,
      reason: moment.reason,
      source: 'aitp',
      targetRefs: moment.targetRefs,
      timing: moment.timing,
      trustBoundary: moment.trustBoundary,
    });
  }

  if (slice.openObligations.length > 0) {
    addMoment(moments, {
      id: 'aitp.create_open_obligation',
      actionId: 'aitp.create_open_obligation',
      priority: maxPriority(slice.openObligations.map((item) => priorityForSeverity(item.severity))),
      reason: 'AITP slice contains open obligations that should stay explicit.',
      source: 'obligation',
      targetRefs: slice.openObligations.map((item) => item.id),
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
    });
    addMoment(moments, {
      id: 'trace.open_backtrace',
      actionId: 'trace.open_backtrace',
      priority: 'high',
      reason: 'Open a backtrace before treating the gap as resolved.',
      source: 'source-backtrace',
      targetRefs: slice.sourceBacktrace.map((item) => item.id),
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
      });
      addMoment(moments, {
        id: 'trace.follow_source_dependency',
        actionId: 'trace.follow_source_dependency',
        priority: 'high',
        reason: `Exploratory record ${record.id} points at source dependency work.`,
        source: 'exploration',
        targetRefs,
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
    case 'trust_boundary_before_claim_update':
      return 'aitp.request_human_checkpoint';
    case 'human_checkpoint':
    case 'request_human_checkpoint':
      return 'aitp.request_human_checkpoint';
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
    return 'aitp.create_open_obligation';
  }
  if (decision.entrypoints.includes('aitp_v5_record_reference_location')) {
    return 'aitp.record_reference_location';
  }
  if (decision.entrypoints.includes('aitp_v5_record_tool_run')) {
    return 'aitp.record_tool_run';
  }
  return actionIdForMoment(decision.moment);
}

function priorityForPolicyDecision(
  decision: AitpMomentPolicyDecision,
): ResearchActionBindingPriority {
  if (decision.requiredNow) return 'blocking';
  if (decision.trustBoundary) return 'high';
  if (decision.decisionType === 'brainstorming' || decision.decisionType === 'backtrace') {
    return 'high';
  }
  return 'normal';
}

function timingForPolicyDecision(decision: AitpMomentPolicyDecision): string | undefined {
  if (decision.requiredNow) return 'required_now';
  if (decision.requiredBeforeTrustChange.length > 0) return 'before_trust_update';
  return undefined;
}

function trustBoundaryForPolicyDecision(decision: AitpMomentPolicyDecision): string {
  return decision.decisionType === 'trust_boundary'
    ? 'trust_boundary'
    : `policy_prerequisite:${decision.decisionType}`;
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

function unique(values: readonly string[]): readonly string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}
