import type {
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

  for (const moment of slice.recommendedMoments) {
    addMoment(moments, {
      id: moment.id,
      actionId: actionIdForMoment(moment.id),
      priority: moment.priority,
      reason: moment.reason,
      source: 'aitp',
      targetRefs: moment.targetRefs,
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

  if (hasAny(text, ['brainstorm', 'direction', 'route', 'approach', 'explore'])) {
    addKeywordMoment(moments, 'direction.brainstorm', 'Prompt asks for direction exploration.');
  }
  if (hasAny(text, ['relation path', 'relation', 'bridge', 'connect', 'link'])) {
    addKeywordMoment(
      moments,
      'physics.brainstorm_relation_path',
      'Prompt or context asks about a physics relation path.',
    );
  }
  if (hasAny(text, ['backtrace', 'trace', 'provenance'])) {
    addKeywordMoment(moments, 'trace.open_backtrace', 'Prompt or context asks for traceability.');
  }
  if (hasAny(text, ['definition', 'define', 'reconstruct'])) {
    addKeywordMoment(
      moments,
      'trace.reconstruct_definition',
      'Prompt or context asks about a definition boundary.',
    );
  }
  if (hasAny(text, ['source dependency', 'source gap', 'citation gap', 'citation', 'dependency'])) {
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
  if (hasAny(text, ['record state', 'research state', 'save state', 'snapshot'])) {
    addKeywordMoment(
      moments,
      'aitp.record_research_state',
      'Prompt or context asks to record research state.',
    );
  }
  if (hasAny(text, ['record exploration', 'exploratory record', 'brainstorm record', 'backtrace record'])) {
    addKeywordMoment(
      moments,
      'aitp.record_exploratory_record',
      'Prompt or context asks to record exploratory research state.',
    );
  }
  if (hasAny(text, ['derivation checkpoint', 'checkpoint', 'derivation', 'derive', 'equation'])) {
    addKeywordMoment(
      moments,
      'aitp.record_derivation_checkpoint',
      'Prompt or context mentions a derivation checkpoint.',
    );
  }
  if (hasAny(text, ['open obligation', 'obligation', 'open question', 'todo', 'gap'])) {
    addKeywordMoment(
      moments,
      'aitp.create_open_obligation',
      'Prompt or context asks to preserve an open obligation.',
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
    default:
      return id;
  }
}

function addKeywordMoment(
  moments: Map<string, DetectedResearchMoment>,
  id: AitpResearchMomentId,
  reason: string,
): void {
  addMoment(moments, {
    id,
    actionId: actionIdForMoment(id),
    priority: 'normal',
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
