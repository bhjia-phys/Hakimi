import { actionIdForPolicyDecision, detectResearchMoments } from './moment-detector';
import { parseAitpProcessGraphSlice } from './parser';
import type {
  AitpCallObligation,
  AitpMomentPolicyDecision,
  AitpObligationSummary,
  AitpOpenObligation,
  AitpPayloadHint,
  AitpProcessGraphSlice,
  AitpRouteState,
  AitpRouteStateItem,
  AitpRouteSummary,
  AitpTheoryReasoningProjection,
  AitpTrustSummary,
  CompiledAitpProcessGraphSlice,
  DetectedResearchMoment,
  ResearchMomentDetectorInput,
} from './types';
import type { ResearchActionBinding } from '../research-action';

const MAX_CONTEXT_ITEMS = 6;
const AITP_ADAPTER_ID = 'aitp.native.process-graph-slice';
const THEORY_REASONING_DRAFT_KEYS = [
  'reasoningMoves',
  'whyQuestions',
  'relationPathQuestions',
  'backtraceTargets',
  'definitionBoundaryQuestions',
  'derivationBacktraceQuestions',
  'sourceDependencyQuestions',
  'originalQuestionGuard',
] as const;

export interface CompileAitpProcessGraphSliceOptions extends ResearchMomentDetectorInput {
  readonly maxContextItems?: number | undefined;
}

export function compileAitpProcessGraphSlice(
  input: AitpProcessGraphSlice | unknown,
  options: CompileAitpProcessGraphSliceOptions = {},
): CompiledAitpProcessGraphSlice {
  const slice = withRouteState(
    isAitpProcessGraphSlice(input) ? input : parseAitpProcessGraphSlice(input),
  );
  const maxItems = options.maxContextItems ?? MAX_CONTEXT_ITEMS;
  const obligations = summarizeObligations(slice.openObligations, maxItems);
  const routes = summarizeRoutes(slice.routeState, maxItems);
  const trust = summarizeTrust(slice);
  const suggestedNextMoments = detectResearchMoments(slice, options);
  const callObligations = buildCallObligations(slice);
  const theoryReasoning = buildTheoryReasoning(slice, callObligations, maxItems);
  const actionRecommendations = suggestedNextMoments.map((moment) =>
    actionBindingForMoment(moment, slice, callObligations, theoryReasoning),
  );
  const contextLines = buildContextLines(
    slice,
    obligations,
    routes,
    suggestedNextMoments,
    callObligations,
    theoryReasoning,
    maxItems,
  );

  return {
    reminders: buildReminderLines(slice, contextLines, trust, callObligations, maxItems),
    contextLines,
    actionRecommendations,
    callObligations,
    obligations,
    routes,
    suggestedNextMoments,
    trust,
    diagnostics: buildDiagnostics(slice),
  };
}

export function summarizeObligations(
  obligations: readonly AitpOpenObligation[],
  maxItems = MAX_CONTEXT_ITEMS,
): AitpObligationSummary {
  const blocking = obligations.filter((item) => item.severity === 'blocking');
  const recommended = obligations.filter((item) => item.severity === 'recommended');
  const advisory = obligations.filter((item) => item.severity === 'advisory');
  const lines: string[] = [];
  if (blocking.length > 0) {
    lines.push(`Blocking obligations: ${bounded(blocking.map(renderObligation), maxItems).join('; ')}`);
  }
  if (recommended.length > 0) {
    lines.push(
      `Recommended obligations: ${bounded(recommended.map(renderObligation), maxItems).join('; ')}`,
    );
  }
  if (advisory.length > 0) {
    lines.push(`Advisory obligations: ${bounded(advisory.map(renderObligation), maxItems).join('; ')}`);
  }
  return { blocking, recommended, advisory, lines };
}

function buildContextLines(
  slice: AitpProcessGraphSlice,
  obligations: AitpObligationSummary,
  routes: AitpRouteSummary,
  moments: readonly DetectedResearchMoment[],
  callObligations: readonly AitpCallObligation[],
  theoryReasoning: AitpTheoryReasoningProjection | undefined,
  maxItems: number,
): readonly string[] {
  const lines: string[] = [
    `AITP slice: ${String(slice.nodes.length)} nodes, ${String(slice.edges.length)} edges, truth_source=${slice.truthSource}.`,
  ];
  if (slice.orientationOnly) {
    lines.push('Orientation only: use the slice for local guidance, not as promoted research truth.');
  }
  lines.push(...obligations.lines);
  lines.push(...routes.lines);

  const sourceGaps = slice.sourceBacktrace.filter((item) =>
    lowerJoin([item.status, item.reason, item.gap]).match(/gap|missing|unresolved|open|no source/) !==
    null,
  );
  if (sourceGaps.length > 0) {
    lines.push(`Source gaps: ${bounded(sourceGaps.map((item) => item.id), maxItems).join(', ')}`);
  }
  const sourceAssetNodes = slice.nodes.filter((item) => item.kind === 'source_asset');
  const backtraceAssetIds = unique(slice.sourceBacktrace.flatMap((item) => item.sourceAssetIds));
  if (sourceAssetNodes.length > 0 || backtraceAssetIds.length > 0) {
    lines.push(
      `Source assets: ${bounded([
        ...sourceAssetNodes.map(renderSourceAsset),
        ...backtraceAssetIds.map((id) => `source_asset:${id}`),
      ], maxItems).join('; ')}`,
    );
  }

  const relationHypotheses = slice.relationNeighborhood.filter((item) =>
    lowerJoin([item.status, item.reason, item.relation]).match(/hypothesis|provisional|candidate/) !==
    null,
  );
  if (relationHypotheses.length > 0) {
    lines.push(
      `Relation hypotheses: ${bounded(relationHypotheses.map((item) => item.id), maxItems).join(', ')}`,
    );
  }

  const openExploration = slice.exploratoryRecords.filter((item) =>
    item.status === undefined || ['open', 'active', 'deferred'].includes(item.status),
  );
  if (openExploration.length > 0) {
    lines.push(
      `Exploration records: ${bounded(openExploration.map(renderExploration), maxItems).join('; ')}`,
    );
  }
  const unresolvedExploration = slice.exploratoryRecords.filter((item) => item.unresolvedPoints.length > 0);
  if (unresolvedExploration.length > 0) {
    lines.push(
      `Exploration unresolved points: ${bounded(unresolvedExploration.flatMap((item) => item.unresolvedPoints), maxItems).join('; ')}`,
    );
  }
  if (theoryReasoning !== undefined) {
    lines.push(renderTheoryReasoningLine(theoryReasoning, maxItems));
  }

  if (moments.length > 0) {
    lines.push(
      `Suggested moments: ${bounded(moments.map((moment) => moment.actionId), maxItems).join(', ')}`,
    );
    const policyMoments = moments.filter((moment) =>
      moment.timing !== undefined || moment.trustBoundary !== undefined);
    if (policyMoments.length > 0) {
      lines.push(
        `Moment policy: ${bounded(policyMoments.map(renderMomentPolicy), maxItems).join('; ')}`,
      );
    }
  }
  const requiredNow = callObligations.filter((item) => item.requiredNow);
  if (requiredNow.length > 0) {
    lines.push(
      `AITP required calls now: ${bounded(requiredNow.map(renderCallObligation), maxItems).join('; ')}`,
    );
  }
  const lifecycleTriggers = callObligations.filter((item) =>
    hasLifecycleTrigger(item.lifecycleTrigger),
  );
  if (lifecycleTriggers.length > 0) {
    lines.push(
      `AITP lifecycle triggers: ${bounded(lifecycleTriggers.map(renderLifecycleTrigger), maxItems).join('; ')}`,
    );
  }
  const trustPrerequisites = callObligations.filter(
    (item) => item.requiredBeforeTrustChange.length > 0,
  );
  if (trustPrerequisites.length > 0) {
    lines.push(
      `AITP trust prerequisites: ${bounded(trustPrerequisites.map(renderTrustPrerequisite), maxItems).join('; ')}`,
    );
  }
  return lines;
}

function buildReminderLines(
  slice: AitpProcessGraphSlice,
  contextLines: readonly string[],
  trust: AitpTrustSummary,
  callObligations: readonly AitpCallObligation[],
  maxItems: number,
): readonly string[] {
  const lines = [
    'AITP native context is active. Consume this as a local process graph slice and do not re-save it as Hakimi truth.',
    ...contextLines,
  ];
  if (trust.trustBoundaryReasons.length > 0) {
    lines.push(`Trust boundary: ${bounded(trust.trustBoundaryReasons, maxItems).join('; ')}`);
  }
  if (trust.trustedNodeIds.length > 0) {
    lines.push(`Explicit trust flags on nodes: ${bounded(trust.trustedNodeIds, maxItems).join(', ')}`);
  }
  if (trust.trustedEdgeIds.length > 0) {
    lines.push(`Explicit trust flags on edges: ${bounded(trust.trustedEdgeIds, maxItems).join(', ')}`);
  }
  if (slice.openObligations.length > 0) {
    lines.push('Keep open obligations visible until AITP records a resolution.');
  }
  if (callObligations.some((item) => item.requiredNow)) {
    lines.push(
      'Treat AITP required-now call obligations as current-turn ResearchAction bindings, then record outcomes or blockers.',
    );
  }
  if (callObligations.some((item) => hasLifecycleTrigger(item.lifecycleTrigger))) {
    lines.push(
      'Use AITP lifecycle trigger info as orientation-only policy context for when a ResearchAction should run.',
    );
  }
  return lines;
}

export function summarizeRoutes(
  routeState: AitpRouteState,
  maxItems = MAX_CONTEXT_ITEMS,
): AitpRouteSummary {
  const live = routeState.liveRoutes.length > 0
    ? routeState.liveRoutes
    : routeState.routes.filter((item) => item.status === 'live');
  const blocked = routeState.blockedRoutes.length > 0
    ? routeState.blockedRoutes
    : routeState.routes.filter((item) => item.status === 'blocked');
  const abandoned = routeState.abandonedRoutes.length > 0
    ? routeState.abandonedRoutes
    : routeState.routes.filter((item) => item.status === 'abandoned');
  const pivotRequired = routeState.pivotRequiredRoutes.length > 0
    ? routeState.pivotRequiredRoutes
    : routeState.routes.filter((item) => item.pivotRequired);
  const lines: string[] = [];
  if (routeState.activeRouteId !== undefined && routeState.activeRouteId.length > 0) {
    lines.push(`Active route: research_route:${routeState.activeRouteId}`);
  }
  if (live.length > 0) {
    lines.push(`Live routes: ${bounded(live.map(renderRoute), maxItems).join('; ')}`);
  }
  if (blocked.length > 0) {
    lines.push(`Blocked routes: ${bounded(blocked.map(renderRoute), maxItems).join('; ')}`);
  }
  if (abandoned.length > 0) {
    lines.push(`Abandoned routes: ${bounded(abandoned.map(renderRoute), maxItems).join('; ')}`);
  }
  if (pivotRequired.length > 0) {
    lines.push(`Pivot-required routes: ${bounded(pivotRequired.map(renderRoute), maxItems).join('; ')}`);
  }
  const finalGateRoutes = routeState.routes.filter(
    (item) => item.finalGateRequired || item.requiredBeforeTrustChange.length > 0,
  );
  if (finalGateRoutes.length > 0) {
    lines.push(
      `Route final-gate prerequisites: ${bounded(finalGateRoutes.map(renderRouteGate), maxItems).join('; ')}`,
    );
  }
  return { live, blocked, abandoned, pivotRequired, lines };
}

function summarizeTrust(slice: AitpProcessGraphSlice): AitpTrustSummary {
  return {
    truthSource: slice.truthSource,
    orientationOnly: slice.orientationOnly,
    trustBoundaryReasons: slice.trustBoundaryReasons,
    trustedNodeIds: slice.nodes.filter((item) => hasExplicitTrustFlag(item.trustFlags)).map((item) => item.id),
    trustedEdgeIds: slice.edges.filter((item) => hasExplicitTrustFlag(item.trustFlags)).map((item) => item.id),
  };
}

function actionBindingForMoment(
  moment: DetectedResearchMoment,
  slice: AitpProcessGraphSlice,
  callObligations: readonly AitpCallObligation[],
  theoryReasoning: AitpTheoryReasoningProjection | undefined,
): ResearchActionBinding {
  const obligation = callObligationForMoment(moment, callObligations);
  const relevantTheoryReasoning = theoryReasoningForMoment(moment, theoryReasoning);
  return {
    id: `binding.${AITP_ADAPTER_ID}.${slug(moment.actionId)}.${slug(moment.source)}`,
    actionId: moment.actionId,
    adapterId: AITP_ADAPTER_ID,
    objectRefs: moment.targetRefs,
    params: {
      momentId: moment.id,
      truthSource: slice.truthSource,
      orientationOnly: slice.orientationOnly,
      source: moment.source,
      timing: moment.timing,
      trustBoundary: moment.trustBoundary,
      lifecycleTrigger: lifecycleTriggerForMoment(moment, obligation),
      callObligation: obligation,
      routeState: routeStateForMoment(moment, slice),
      writeBridge: writeBridgeForMoment(moment, obligation),
      theoryReasoning: relevantTheoryReasoning,
    },
    reason: moment.reason,
    priority: moment.priority,
  };
}

function buildCallObligations(slice: AitpProcessGraphSlice): readonly AitpCallObligation[] {
  return slice.momentPolicy.decisions.map((decision, index) =>
    callObligationForDecision(decision, index),
  );
}

function callObligationForDecision(
  decision: AitpMomentPolicyDecision,
  index: number,
): AitpCallObligation {
  const actionId = actionIdForPolicyDecision(decision);
  const finalGateRequired = finalGateRequiredForDecision(decision);
  const routeMoment = isRouteActionId(actionId);
  return {
    id: `aitp.policy.${String(index + 1)}.${slug(actionId)}.${slug(decision.targetType)}.${slug(decision.targetId)}`,
    actionId,
    momentId: decision.moment,
    requiredNow: routeMoment ? decision.requiredNow && finalGateRequired : decision.requiredNow,
    decisionType: decision.decisionType,
    actionKind: decision.actionKind,
    reason: decision.reason,
    targetType: decision.targetType,
    targetId: decision.targetId,
    targetRefs: decision.targetRefs,
    missingComponents: decision.missingComponents,
    recordEntrypoints: decision.recordEntrypoints,
    explorationEntrypoints: decision.explorationEntrypoints,
    entrypoints: decision.entrypoints,
    payloadHints: decision.payloadHints,
    requiredBeforeTrustChange: decision.requiredBeforeTrustChange,
    finalGateRequired,
    trustBoundary: routeMoment ? finalGateRequired : decision.trustBoundary,
    lifecycleTrigger: decision.lifecycleTrigger,
  };
}

function callObligationForMoment(
  moment: DetectedResearchMoment,
  callObligations: readonly AitpCallObligation[],
): AitpCallObligation | undefined {
  const exact = callObligations.find((item) =>
    item.actionId === moment.actionId &&
    item.targetRefs.some((ref) => moment.targetRefs.includes(ref)),
  );
  if (exact !== undefined) return exact;
  return callObligations.find((item) => item.actionId === moment.actionId);
}

function routeStateForMoment(
  moment: DetectedResearchMoment,
  slice: AitpProcessGraphSlice,
): Readonly<Record<string, unknown>> | undefined {
  if (!isRouteActionId(moment.actionId)) return undefined;
  const routes = slice.routeState.routes.filter((route) =>
    route.targetRefs.length === 0 ||
    route.targetRefs.some((ref) => moment.targetRefs.includes(ref)),
  );
  if (routes.length === 0) return undefined;
  return {
    routes: routes.map((route) => ({
      id: route.id,
      status: route.status,
      active: route.active,
      pivotRequired: route.pivotRequired,
      routeType: route.routeType,
      title: route.title,
      summary: route.summary,
      reason: route.reason,
      question: route.question,
      nextAction: route.nextAction,
      lesson: route.lesson,
      parentRouteIds: route.parentRouteIds,
      checkpointIds: route.checkpointIds,
      exploratoryRecordIds: route.exploratoryRecordIds,
      blockers: route.blockers,
      targetRefs: route.targetRefs,
      sourceRefs: route.sourceRefs,
      requiredBeforeTrustChange: route.requiredBeforeTrustChange,
      finalGateRequired: route.finalGateRequired,
    })),
  };
}

function writeBridgeForMoment(
  moment: DetectedResearchMoment,
  obligation: AitpCallObligation | undefined,
): Readonly<Record<string, unknown>> | undefined {
  switch (moment.actionId) {
    case 'aitp.record_exploratory_record':
      return withPayloadDraft({
        operation: 'recordExploratoryRecord',
        cli: 'aitp-v5 exploration record',
        requiredFields: ['topicId', 'explorationType', 'title', 'focalQuestion', 'summary'],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.register_source_asset':
      return withPayloadDraft({
        operation: 'registerSourceAsset',
        cli: 'aitp-v5 asset register',
        requiredFields: ['topicId', 'assetType', 'uri', 'title'],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.record_evidence':
      return withPayloadDraft({
        operation: 'recordEvidence',
        cli: 'aitp-v5 evidence record',
        requiredFields: ['topicId', 'claimId', 'evidenceType', 'status', 'summary'],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.record_tool_run':
      return withPayloadDraft({
        operation: 'recordToolRun',
        cli: 'aitp-v5 tool run record',
        requiredFields: ['recipeId', 'toolFamily', 'toolName', 'topicId', 'claimId'],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.record_reference_location':
      return withPayloadDraft({
        operation: 'recordReferenceLocation',
        cli: 'aitp-v5 reference location record',
        requiredFields: ['topicId', 'connectorId', 'locationType', 'uri', 'label'],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.create_open_obligation':
      return withPayloadDraft({
        operation: 'createProofObligation',
        cli: 'aitp-v5 research-state create-proof-obligation',
        requiredFields: [
          'topicId',
          'claimId',
          'statement',
          'obligationType',
          'status',
          'maturityLevel',
          'nextAction',
        ],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.create_validation_contract':
      return withPayloadDraft({
        operation: 'createValidationContract',
        cli: 'aitp-v5 validation contract create',
        requiredFields: ['topicId', 'claimId', 'requiredChecks', 'failureModes', 'requiredEvidenceOutputs'],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.record_validation_result':
      return withPayloadDraft({
        operation: 'recordValidationResult',
        cli: 'aitp-v5 validation result record',
        requiredFields: ['topicId', 'claimId', 'contractId', 'toolRunId', 'status', 'summary'],
        targetRefs: moment.targetRefs,
      }, obligation);
    case 'aitp.request_human_checkpoint':
      return withPayloadDraft({
        operation: 'requestHumanCheckpoint',
        cli: 'aitp-v5 checkpoint request',
        requiredFields: ['topicId', 'claimId', 'reason', 'requestedBy', 'options'],
        targetRefs: moment.targetRefs,
      }, obligation);
    default:
      return undefined;
  }
}

function finalGateRequiredForDecision(decision: AitpMomentPolicyDecision): boolean {
  return (
    decision.requiredBeforeTrustChange.length > 0 ||
    decision.lifecycleTrigger.trustBoundaryInputs.requiredBeforeTrustChange.length > 0 ||
    decision.lifecycleTrigger.trustBoundaryInputs.finalGateRequired
  );
}

function isRouteActionId(actionId: string): boolean {
  return (
    actionId === 'aitp.record_route_choice' ||
    actionId === 'aitp.record_failed_route_lesson' ||
    actionId === 'aitp.checkpoint_before_route_switch'
  );
}

function withPayloadDraft(
  bridge: Readonly<Record<string, unknown>> & { readonly operation: string },
  obligation: AitpCallObligation | undefined,
): Readonly<Record<string, unknown>> {
  const hint = payloadHintForOperation(bridge.operation, obligation?.payloadHints ?? []);
  if (hint === undefined) return bridge;
  return {
    ...bridge,
    payloadDraft: camelizeDraft(hint.draft),
    payloadHint: {
      entrypoint: hint.entrypoint,
      recordAction: hint.recordAction,
      requiredFields: hint.requiredFields,
      orientationOnly: hint.orientationOnly,
      summaryInputsTrusted: hint.summaryInputsTrusted,
      canUpdateClaimTrust: hint.canUpdateClaimTrust,
      lifecycleTrigger: hint.lifecycleTrigger,
    },
  };
}

function payloadHintForOperation(
  operation: string,
  hints: readonly AitpPayloadHint[],
): AitpPayloadHint | undefined {
  const action = recordActionForOperation(operation);
  if (action === undefined) return undefined;
  return hints.find((hint) => hint.recordAction === action);
}

function recordActionForOperation(operation: string): string | undefined {
  switch (operation) {
    case 'recordExploratoryRecord':
      return 'record_exploratory_record';
    case 'registerSourceAsset':
      return 'register_source_asset';
    case 'recordEvidence':
      return 'record_evidence';
    case 'recordToolRun':
      return 'record_tool_run';
    case 'recordReferenceLocation':
      return 'record_reference_location';
    case 'createProofObligation':
      return 'create_proof_obligation';
    case 'createValidationContract':
      return 'create_validation_contract';
    case 'recordValidationResult':
      return 'record_validation_result';
    case 'requestHumanCheckpoint':
      return 'request_human_checkpoint';
    default:
      return undefined;
  }
}

function buildTheoryReasoning(
  slice: AitpProcessGraphSlice,
  callObligations: readonly AitpCallObligation[],
  maxItems: number,
): AitpTheoryReasoningProjection | undefined {
  const drafts = callObligations.flatMap((obligation) =>
    obligation.payloadHints.map((hint) => camelizeDraft(hint.draft)),
  );
  const draftFields = theoryDraftFields(drafts);
  const moves = new Set<string>([
    ...stringsFromUnknown(draftFields['reasoningMoves']),
    ...slice.exploratoryRecords.flatMap((item) => item.reasoningMoves),
    ...slice.relationNeighborhood.flatMap((item) => item.reasoningMoves),
    ...slice.sourceBacktrace.flatMap((item) => item.reasoningMoves),
  ].map(normalizeReasoningMove));
  const prompts = new Set<string>();

  if (draftFields['whyQuestions'] !== undefined) moves.add('why_question_decomposition');
  if (draftFields['relationPathQuestions'] !== undefined) moves.add('relation_path_brainstorming');
  if (draftFields['backtraceTargets'] !== undefined) moves.add('source_dependency_backtrace');
  if (draftFields['definitionBoundaryQuestions'] !== undefined) moves.add('bidirectional_definition_backtrace');
  if (draftFields['derivationBacktraceQuestions'] !== undefined) {
    moves.add('derivation_backtrace_to_assumption_or_convention_boundary');
  }
  if (draftFields['sourceDependencyQuestions'] !== undefined) moves.add('source_dependency_backtrace');
  if (draftFields['originalQuestionGuard'] !== undefined) moves.add('original_question_continuity_guard');

  if (slice.exploratoryRecords.some((item) => item.explorationType === 'question_decomposition')) {
    moves.add('why_question_decomposition');
    prompts.add('Decompose why this question matters into local subquestions before treating a route as an answer.');
  }
  if (
    slice.exploratoryRecords.some((item) => item.explorationType === 'relation_path_brainstorm') ||
    slice.relationNeighborhood.some((item) =>
      lowerJoin([item.status, item.reason, item.relation]).match(/hypothesis|provisional|candidate/) !== null,
    ) ||
    callObligations.some((item) => lowerJoin([item.momentId, item.decisionType, item.actionKind]).includes('relation'))
  ) {
    moves.add('relation_path_brainstorming');
    prompts.add('Brainstorm relation paths between physics objects before treating a relation as support.');
  }
  if (
    slice.sourceBacktrace.some((item) =>
      lowerJoin([item.status, item.reason, item.gap]).match(/gap|missing|unresolved|open|no source/) !== null,
    ) ||
    callObligations.some((item) => lowerJoin([item.momentId, item.decisionType, item.actionKind, item.reason]).match(/backtrace|source|reference|citation|provenance/) !== null)
  ) {
    moves.add('source_dependency_backtrace');
    prompts.add('Backtrace source dependencies before using support, evidence, or validation writes.');
  }
  if (
    slice.openObligations.some((item) => lowerJoin([item.kind, item.reason]).match(/definition|define|reconstruct/) !== null) ||
    callObligations.some((item) => lowerJoin([item.momentId, item.actionKind, item.reason]).match(/definition|define|reconstruct/) !== null)
  ) {
    moves.add('bidirectional_definition_backtrace');
    prompts.add('Backtrace definitions backward to sources/conventions and forward to derivation uses.');
  }
  if (
    slice.openObligations.some((item) => lowerJoin([item.kind, item.reason]).match(/derivation|derive|equation|assumption|convention/) !== null) ||
    slice.recommendedMoments.some((item) => lowerJoin([item.id, item.reason]).match(/derivation|derive|equation|assumption|convention/) !== null)
  ) {
    moves.add('derivation_backtrace_to_assumption_or_convention_boundary');
    prompts.add('Trace derivation steps back to assumption and convention boundaries before upgrading status.');
  }
  if (slice.exploratoryRecords.some((item) => item.originalQuestion !== undefined && item.localQuestion !== undefined)) {
    moves.add('original_question_continuity_guard');
    prompts.add('Check that the local question still answers the original question before continuing.');
  }

  const projection = {
    moves: bounded([...moves], maxItems),
    prompts: bounded([...prompts], maxItems),
    ...pruneEmpty({
      whyQuestions: bounded(unique([
        ...stringsFromUnknown(draftFields['whyQuestions']),
        ...slice.exploratoryRecords.flatMap((item) => [
          item.originalQuestion,
          item.focalQuestion,
          item.localQuestion,
        ]),
      ].filter(isNonEmptyString)), maxItems),
      relationTargets: bounded(unique([
        ...slice.relationNeighborhood.flatMap((item) => [item.id, item.source, item.target]),
        ...callObligations
          .filter((item) => lowerJoin([item.momentId, item.actionKind]).includes('relation'))
          .flatMap((item) => item.targetRefs),
      ].filter(isNonEmptyString)), maxItems),
      relationPathQuestions: bounded(unique([
        ...stringsFromUnknown(draftFields['relationPathQuestions']),
        ...slice.exploratoryRecords.flatMap((item) => item.relationPathQuestions),
        ...slice.relationNeighborhood.flatMap((item) => item.relationPathQuestions),
      ]), maxItems),
      backtraceTargets: bounded(unique([
        ...stringsFromUnknown(draftFields['backtraceTargets']),
        ...slice.exploratoryRecords.flatMap((item) => item.backtraceTargets),
        ...slice.sourceBacktrace.flatMap((item) => item.backtraceTargets),
        ...slice.sourceBacktrace.flatMap((item) => [item.id, item.targetNodeId, item.sourceRef]),
        ...callObligations
          .filter((item) => lowerJoin([item.momentId, item.decisionType, item.actionKind]).match(/backtrace|source/) !== null)
          .flatMap((item) => item.targetRefs),
      ].filter(isNonEmptyString)), maxItems),
      definitionBoundaryQuestions: bounded(unique([
        ...stringsFromUnknown(draftFields['definitionBoundaryQuestions']),
        ...slice.exploratoryRecords.flatMap((item) => item.definitionBoundaryQuestions),
        ...slice.relationNeighborhood.flatMap((item) => item.definitionBoundaryQuestions),
        ...slice.sourceBacktrace.flatMap((item) => item.definitionBoundaryQuestions),
      ]), maxItems),
      derivationBacktraceQuestions: bounded(unique([
        ...stringsFromUnknown(draftFields['derivationBacktraceQuestions']),
        ...slice.exploratoryRecords.flatMap((item) => item.derivationBacktraceQuestions),
        ...slice.sourceBacktrace.flatMap((item) => item.derivationBacktraceQuestions),
      ]), maxItems),
      sourceDependencyQuestions: bounded(unique([
        ...stringsFromUnknown(draftFields['sourceDependencyQuestions']),
        ...slice.exploratoryRecords.flatMap((item) => item.sourceDependencyQuestions),
        ...slice.sourceBacktrace.flatMap((item) => item.sourceDependencyQuestions),
      ]), maxItems),
      originalQuestionGuard: bounded(unique([
        ...stringsFromUnknown(draftFields['originalQuestionGuard']),
        ...slice.exploratoryRecords.flatMap((item) => item.originalQuestionGuard),
        ...slice.relationNeighborhood.flatMap((item) => item.originalQuestionGuard),
        ...slice.sourceBacktrace.flatMap((item) => item.originalQuestionGuard),
      ]), maxItems),
      reasoningMoves: draftFields['reasoningMoves'],
    }),
  } as AitpTheoryReasoningProjection;

  return projection.moves.length === 0 && projection.prompts.length === 0 ? undefined : projection;
}

function theoryReasoningForMoment(
  _moment: DetectedResearchMoment,
  theoryReasoning: AitpTheoryReasoningProjection | undefined,
): AitpTheoryReasoningProjection | undefined {
  return theoryReasoning;
}

function renderTheoryReasoningLine(
  theoryReasoning: AitpTheoryReasoningProjection,
  maxItems: number,
): string {
  const parts = [
    `moves=${bounded(theoryReasoning.moves, maxItems).join(', ')}`,
    theoryReasoning.prompts.length === 0
      ? undefined
      : `prompts=${bounded(theoryReasoning.prompts, maxItems).join(' | ')}`,
    renderTheoryField('whyQuestions', theoryReasoning.whyQuestions, maxItems),
    renderTheoryField('relationTargets', theoryReasoning.relationTargets, maxItems),
    renderTheoryField('relationPathQuestions', theoryReasoning.relationPathQuestions, maxItems),
    renderTheoryField('backtraceTargets', theoryReasoning.backtraceTargets, maxItems),
    renderTheoryField('definitionBoundaryQuestions', theoryReasoning.definitionBoundaryQuestions, maxItems),
    renderTheoryField('derivationBacktraceQuestions', theoryReasoning.derivationBacktraceQuestions, maxItems),
    renderTheoryField('sourceDependencyQuestions', theoryReasoning.sourceDependencyQuestions, maxItems),
    renderTheoryField('originalQuestionGuard', theoryReasoning.originalQuestionGuard, maxItems),
  ].filter(isNonEmptyString);
  return `Theory reasoning: ${parts.join('; ')}`;
}

function renderTheoryField(key: string, value: unknown, maxItems: number): string | undefined {
  if (!hasTheoryValue(value)) return undefined;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return `${key}=${bounded(value, maxItems).join(' | ')}`;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined || text.length === 0) return undefined;
  return `${key}=${text.length > 240 ? `${text.slice(0, 237)}...` : text}`;
}

function theoryDraftFields(
  drafts: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of THEORY_REASONING_DRAFT_KEYS) {
    const values = drafts.map((draft) => draft[key]).filter(hasTheoryValue);
    if (values.length === 1) result[key] = values[0];
    if (values.length > 1) result[key] = values;
  }
  return result;
}

function stringsFromUnknown(value: unknown): readonly string[] {
  if (typeof value === 'string') return value.trim().length === 0 ? [] : [value.trim()];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  return [];
}

function normalizeReasoningMove(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (normalized === 'relation_path_brainstorm') return 'relation_path_brainstorming';
  if (normalized === 'why_question_decomposition') return normalized;
  if (normalized === 'source_dependency_backtrace') return normalized;
  if (normalized === 'bidirectional_definition_backtrace') return normalized;
  if (normalized === 'derivation_backtrace') return 'derivation_backtrace_to_assumption_or_convention_boundary';
  if (normalized === 'original_question_continuity_check') return 'original_question_continuity_guard';
  return normalized;
}

function pruneEmpty(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (hasTheoryValue(item)) result[key] = item;
  }
  return result;
}

function hasTheoryValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasTheoryValue);
  if (isRecord(value)) return Object.values(value).some(hasTheoryValue);
  return true;
}
function camelizeDraft(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[camelizeKey(key)] = camelizeValue(item);
  }
  return result;
}

function camelizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeValue);
  if (!isRecord(value)) return value;
  return camelizeDraft(value);
}

function camelizeKey(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function buildDiagnostics(slice: AitpProcessGraphSlice): readonly string[] {
  const diagnostics: string[] = [];
  if (slice.truthSource.length === 0) diagnostics.push('missing-truth-source');
  if (slice.orientationOnly) diagnostics.push('orientation-only');
  if (slice.trustBoundaryReasons.length > 0) diagnostics.push('trust-boundary-present');
  return diagnostics;
}

function renderObligation(obligation: AitpOpenObligation): string {
  const target = obligation.targetNodeId === undefined ? '' : ` -> ${obligation.targetNodeId}`;
  return `${obligation.id} [${obligation.kind}]${target}: ${obligation.reason}`;
}

function renderRoute(route: AitpRouteStateItem): string {
  const label = route.title ?? route.summary ?? route.question ?? route.hypothesis ?? route.id;
  const routeType = route.routeType === undefined ? '' : ` type=${route.routeType}`;
  const active = route.active ? ' active=true' : '';
  const pivotRequired = route.pivotRequired ? ' pivot_required=true' : '';
  const reason = route.reason === undefined ? '' : ` reason=${route.reason}`;
  const blockers = route.blockers.length === 0 ? '' : ` blockers=${route.blockers.join('|')}`;
  const lesson = route.lesson === undefined ? '' : ` lesson=${route.lesson}`;
  const next = route.nextAction === undefined ? '' : ` next=${route.nextAction}`;
  const parents = route.parentRouteIds.length === 0 ? '' : ` parents=${route.parentRouteIds.join('|')}`;
  const checkpoints = route.checkpointIds.length === 0 ? '' : ` checkpoints=${route.checkpointIds.join('|')}`;
  const pivot =
    route.pivotFromRouteId === undefined && route.pivotToRouteId === undefined
      ? ''
      : ` pivot=${route.pivotFromRouteId ?? '?'}->${route.pivotToRouteId ?? '?'}`;
  return `${route.id} [${route.status}]: ${label}${routeType}${active}${pivotRequired}${reason}${blockers}${lesson}${next}${parents}${checkpoints}${pivot}`;
}

function renderRouteGate(route: AitpRouteStateItem): string {
  const requirements =
    route.requiredBeforeTrustChange.length === 0
      ? 'final_gate_required=true'
      : route.requiredBeforeTrustChange.join(', ');
  return `${route.id} [${route.status}]: ${requirements}`;
}

function renderExploration(item: { readonly id: string; readonly explorationType: string; readonly focalQuestion?: string | undefined; readonly localQuestion?: string | undefined }): string {
  const question = item.localQuestion ?? item.focalQuestion ?? '';
  return question.length === 0 ? `${item.id} [${item.explorationType}]` : `${item.id} [${item.explorationType}]: ${question}`;
}

function renderSourceAsset(item: { readonly id: string; readonly title?: string | undefined; readonly label?: string | undefined; readonly uri?: string | undefined; readonly assetType?: string | undefined }): string {
  const title = item.title ?? item.label ?? item.id;
  const type = item.assetType === undefined ? '' : ` [${item.assetType}]`;
  const uri = item.uri === undefined ? '' : ` -> ${item.uri}`;
  return `${item.id}${type}: ${title}${uri}`;
}

function renderMomentPolicy(moment: DetectedResearchMoment): string {
  const timing = moment.timing === undefined ? 'when-needed' : moment.timing;
  const boundary = moment.trustBoundary === undefined ? '' : ` boundary=${moment.trustBoundary}`;
  return `${moment.actionId}@${timing} priority=${moment.priority}${boundary}`;
}

function renderCallObligation(obligation: AitpCallObligation): string {
  const target = obligation.targetRefs.length === 0 ? obligation.targetId : obligation.targetRefs.join(',');
  const entrypoints =
    obligation.entrypoints.length === 0 ? '' : ` entrypoints=${obligation.entrypoints.join(',')}`;
  return `${obligation.actionId} -> ${target} [${obligation.decisionType}/${obligation.actionKind}]${entrypoints}`;
}

function renderLifecycleTrigger(obligation: AitpCallObligation): string {
  const trigger = obligation.lifecycleTrigger;
  const phases =
    trigger.lifecyclePhases.length === 0 ? 'phase=unspecified' : `phase=${trigger.lifecyclePhases.join(',')}`;
  const conditions =
    trigger.triggerConditions.length === 0 ? '' : ` when=${trigger.triggerConditions.join('|')}`;
  const threshold =
    trigger.recordingThreshold === undefined ? '' : ` threshold=${trigger.recordingThreshold}`;
  const boundary = renderTrustBoundaryInputs(trigger.trustBoundaryInputs);
  const host =
    trigger.recommendedHostBehavior.length === 0
      ? ''
      : ` host=${trigger.recommendedHostBehavior.join('|')}`;
  return `${obligation.actionId}@${phases}${conditions}${threshold}${boundary}${host}`;
}

function renderTrustBoundaryInputs(
  inputs: DetectedResearchMoment['lifecycleTrigger']['trustBoundaryInputs'],
): string {
  const parts: string[] = [];
  if (inputs.targetRefs.length > 0) parts.push(`targets=${inputs.targetRefs.join(',')}`);
  if (inputs.claimId !== undefined && inputs.claimId.length > 0) parts.push(`claim=${inputs.claimId}`);
  if (inputs.entrypoints.length > 0) parts.push(`entrypoints=${inputs.entrypoints.join(',')}`);
  if (inputs.requiresPreflight) parts.push('requires_preflight=true');
  if (inputs.finalGateRequired) parts.push('final_gate_required=true');
  return parts.length === 0 ? '' : ` trust_inputs=${parts.join('|')}`;
}

function renderTrustPrerequisite(obligation: AitpCallObligation): string {
  return `${obligation.actionId} before trust change: ${obligation.requiredBeforeTrustChange.join(', ')}`;
}

function lifecycleTriggerForMoment(
  moment: DetectedResearchMoment,
  obligation: AitpCallObligation | undefined,
): DetectedResearchMoment['lifecycleTrigger'] {
  if (obligation !== undefined && hasLifecycleTrigger(obligation.lifecycleTrigger)) {
    return obligation.lifecycleTrigger;
  }
  return moment.lifecycleTrigger;
}

function hasLifecycleTrigger(
  trigger: DetectedResearchMoment['lifecycleTrigger'],
): boolean {
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

function hasExplicitTrustFlag(flags: readonly string[]): boolean {
  return flags.some((flag) => {
    const lower = flag.toLowerCase();
    return lower === 'trusted' || lower === 'checked' || lower === 'validated';
  });
}

function isAitpProcessGraphSlice(value: unknown): value is AitpProcessGraphSlice {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'kind' in value &&
    (value as { readonly kind?: unknown }).kind === 'process_graph_slice' &&
    'openObligations' in value
  );
}

function withRouteState(slice: AitpProcessGraphSlice): AitpProcessGraphSlice {
  if ('routeState' in slice && slice.routeState !== undefined) return slice;
  return {
    ...slice,
    routeState: emptyRouteState(),
  };
}

function emptyRouteState(): AitpRouteState {
  return {
    activeRouteId: undefined,
    routes: [],
    liveRoutes: [],
    blockedRoutes: [],
    abandonedRoutes: [],
    pivotRequiredRoutes: [],
  };
}

function bounded<T>(values: readonly T[], maxItems: number): readonly T[] {
  if (values.length <= maxItems) return values;
  return [...values.slice(0, maxItems), `...(+${String(values.length - maxItems)} more)` as T];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function lowerJoin(values: readonly (string | undefined)[]): string {
  return values.filter((value): value is string => value !== undefined).join(' ').toLowerCase();
}

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
