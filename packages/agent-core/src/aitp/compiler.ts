import { actionIdForPolicyDecision, detectResearchMoments } from './moment-detector';
import { parseAitpProcessGraphSlice } from './parser';
import {
  aitpRuntimeBridgeTargetForOperation,
  type AitpWriteBridgeOperation,
} from './write-bridge';
import type {
  AitpCallObligation,
  AitpMomentPolicyDecision,
  AitpObligationSummary,
  AitpOpenObligation,
  AitpPayloadHint,
  AitpProcessGraphSlice,
  AitpProvenanceGap,
  AitpProvenanceGapSummary,
  AitpRouteState,
  AitpRouteStateItem,
  AitpRouteSummary,
  AitpSourceReconstructionReview,
  AitpSourceReconstructionReviewItem,
  AitpSourceReconstructionReviewSummary,
  AitpSourceStackCoverage,
  AitpSourceStackCoverageItem,
  AitpSourceStackCoverageSummary,
  AitpSourceAssetIndexItem,
  AitpSourceAssetSummary,
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
  const slice = withSliceDefaults(
    isAitpProcessGraphSlice(input) ? input : parseAitpProcessGraphSlice(input),
  );
  const maxItems = options.maxContextItems ?? MAX_CONTEXT_ITEMS;
  const obligations = summarizeObligations(slice.openObligations, maxItems);
  const routes = summarizeRoutes(slice.routeState, maxItems);
  const provenance = summarizeProvenanceGaps(slice.provenanceGaps, maxItems);
  const sourceAssets = summarizeSourceAssets(slice.sourceAssetIndex, maxItems);
  const sourceStackCoverage = summarizeSourceStackCoverage(slice.sourceStackCoverage, maxItems);
  const sourceReconstructionReview = summarizeSourceReconstructionReview(
    slice.sourceReconstructionReview,
    maxItems,
  );
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
    provenance,
    sourceAssets,
    sourceStackCoverage,
    sourceReconstructionReview,
    suggestedNextMoments,
    callObligations,
    theoryReasoning,
    maxItems,
  );

  return {
    reminders: buildReminderLines(
      slice,
      contextLines,
      trust,
      callObligations,
      provenance,
      sourceAssets,
      sourceStackCoverage,
      sourceReconstructionReview,
      maxItems,
    ),
    contextLines,
    actionRecommendations,
    callObligations,
    obligations,
    routes,
    sourceAssets,
    sourceStackCoverage,
    sourceReconstructionReview,
    provenance,
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
  provenance: AitpProvenanceGapSummary,
  sourceAssets: AitpSourceAssetSummary,
  sourceStackCoverage: AitpSourceStackCoverageSummary,
  sourceReconstructionReview: AitpSourceReconstructionReviewSummary,
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
  lines.push(...provenance.lines);
  lines.push(...sourceAssets.lines);
  lines.push(...sourceStackCoverage.lines);
  lines.push(...sourceReconstructionReview.lines);

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
  provenance: AitpProvenanceGapSummary,
  sourceAssets: AitpSourceAssetSummary,
  sourceStackCoverage: AitpSourceStackCoverageSummary,
  sourceReconstructionReview: AitpSourceReconstructionReviewSummary,
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
  if (provenance.all.length > 0) {
    lines.push(
      'Capture source, code, tool-run, and artifact provenance before reusing those refs as evidence, validation inputs, benchmark bases, memory inputs, or checked conclusions.',
    );
  }
  if (sourceAssets.missingHash.length > 0 || sourceAssets.duplicateHash.length > 0) {
    lines.push(
      'Use AITP source asset index hash status before reusing raw papers, lectures, code snapshots, datasets, or generated artifacts.',
    );
  }
  if (
    sourceStackCoverage.evidenceGaps.length > 0 ||
    sourceStackCoverage.reconstructionGaps.length > 0 ||
    sourceStackCoverage.reviewGaps.length > 0
  ) {
    lines.push(
      'Use AITP source stack coverage before treating source reconstruction, evidence outputs, or review status as complete.',
    );
  }
  if (sourceReconstructionReview.openReviewClaimIds.length > 0) {
    lines.push(
      'Use AITP source reconstruction review status and review packets before treating source reconstruction as reviewed.',
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

export function summarizeProvenanceGaps(
  gaps: readonly AitpProvenanceGap[],
  maxItems = MAX_CONTEXT_ITEMS,
): AitpProvenanceGapSummary {
  const source = gaps.filter((item) =>
    gapMatches(item, ['source', 'reference_location', 'source_asset', 'hash']),
  );
  const code = gaps.filter((item) =>
    gapMatches(item, ['code', 'code_state', 'git', 'diff', 'patch', 'repo']),
  );
  const tool = gaps.filter((item) =>
    gapMatches(item, ['tool', 'tool_run', 'benchmark']),
  );
  const validation = gaps.filter((item) =>
    gapMatches(item, ['validation', 'contract', 'result']),
  );
  const artifact = gaps.filter((item) =>
    gapMatches(item, ['artifact', 'benchmark_artifact']),
  );
  const lines: string[] = [];
  if (gaps.length > 0) {
    lines.push(`Provenance gaps: ${bounded(gaps.map(renderProvenanceGap), maxItems).join('; ')}`);
  }
  if (code.length > 0) {
    lines.push(`Code provenance gaps: ${bounded(code.map((item) => item.id), maxItems).join(', ')}`);
  }
  if (artifact.length > 0) {
    lines.push(`Artifact provenance gaps: ${bounded(artifact.map((item) => item.id), maxItems).join(', ')}`);
  }
  return { all: gaps, source, code, tool, validation, artifact, lines };
}

export function summarizeSourceAssets(
  sourceAssets: readonly AitpSourceAssetIndexItem[],
  maxItems = MAX_CONTEXT_ITEMS,
): AitpSourceAssetSummary {
  const missingHash = sourceAssets.filter((item) =>
    item.contentHash === undefined || item.contentHash.length === 0 || item.hashStatus === 'missing',
  );
  const duplicateHash = sourceAssets.filter((item) =>
    item.hashStatus === 'duplicate' || item.duplicateHashDiagnostics['duplicate_hash'] === true,
  );
  const withReferences = sourceAssets.filter((item) =>
    item.referenceLocationIds.length > 0 || item.referenceLocations.length > 0,
  );
  const lines: string[] = [];
  if (sourceAssets.length > 0) {
    lines.push(
      `Source asset index: ${bounded(sourceAssets.map(renderSourceAssetIndexItem), maxItems).join('; ')}`,
    );
  }
  if (missingHash.length > 0) {
    lines.push(
      `Source assets missing hashes: ${bounded(missingHash.map((item) => item.id), maxItems).join(', ')}`,
    );
  }
  if (duplicateHash.length > 0) {
    lines.push(
      `Source assets with duplicate hashes: ${bounded(duplicateHash.map((item) => item.id), maxItems).join(', ')}`,
    );
  }
  return { all: sourceAssets, missingHash, duplicateHash, withReferences, lines };
}

export function summarizeSourceStackCoverage(
  coverage: AitpSourceStackCoverage,
  maxItems = MAX_CONTEXT_ITEMS,
): AitpSourceStackCoverageSummary {
  const all = coverage.items;
  const evidenceGaps = all.filter((item) =>
    item.coverageStatus === 'evidence_gap' || item.missingRequiredOutputs.length > 0,
  );
  const reconstructionGaps = all.filter((item) =>
    item.coverageStatus === 'reconstruction_gap' || item.missingSourceComponents.length > 0,
  );
  const reviewGaps = all.filter((item) => item.coverageStatus === 'review_gap');
  const complete = all.filter((item) => item.coverageStatus === 'complete');
  const missingRequiredOutputClaimIds = unique(evidenceGaps.map((item) => item.claimId));
  const missingSourceComponentClaimIds = unique(reconstructionGaps.map((item) => item.claimId));
  const reviewGapClaimIds = unique(reviewGaps.map((item) => item.claimId));
  const nextActions = unique(coverage.nextActions);
  const lines: string[] = [];
  if (all.length > 0) {
    lines.push(
      `Source stack coverage: ${bounded(all.map(renderSourceStackCoverageItem), maxItems).join('; ')}`,
    );
  }
  if (missingRequiredOutputClaimIds.length > 0) {
    lines.push(
      `Source stack evidence gaps: ${bounded(missingRequiredOutputClaimIds, maxItems).join(', ')}`,
    );
  }
  if (missingSourceComponentClaimIds.length > 0) {
    lines.push(
      `Source stack reconstruction gaps: ${bounded(missingSourceComponentClaimIds, maxItems).join(', ')}`,
    );
  }
  if (reviewGapClaimIds.length > 0) {
    lines.push(`Source stack review gaps: ${bounded(reviewGapClaimIds, maxItems).join(', ')}`);
  }
  if (nextActions.length > 0) {
    lines.push(`Source stack next actions: ${bounded(nextActions, maxItems).join(', ')}`);
  }
  return {
    all,
    evidenceGaps,
    reconstructionGaps,
    reviewGaps,
    complete,
    missingRequiredOutputClaimIds,
    missingSourceComponentClaimIds,
    reviewGapClaimIds,
    nextActions,
    lines,
  };
}

export function summarizeSourceReconstructionReview(
  review: AitpSourceReconstructionReview,
  maxItems = MAX_CONTEXT_ITEMS,
): AitpSourceReconstructionReviewSummary {
  const all = review.items;
  const pending = all.filter((item) => item.reviewStatus === 'pending');
  const needsRevision = all.filter((item) => item.reviewStatus === 'needs_revision');
  const inconclusive = all.filter((item) => item.reviewStatus === 'inconclusive');
  const passed = all.filter((item) => item.reviewStatus === 'passed');
  const open = [...pending, ...needsRevision, ...inconclusive];
  const openReviewClaimIds = unique(open.map((item) => item.claimId));
  const needsRevisionClaimIds = unique(needsRevision.map((item) => item.claimId));
  const inconclusiveClaimIds = unique(inconclusive.map((item) => item.claimId));
  const reviewPacketClaimIds = unique(
    open.filter((item) => item.reviewPacketCli.length > 0).map((item) => item.claimId),
  );
  const nextActions = unique(review.nextActions);
  const lines: string[] = [];
  if (all.length > 0) {
    lines.push(
      `Source reconstruction review: ${bounded(all.map(renderSourceReconstructionReviewItem), maxItems).join('; ')}`,
    );
  }
  if (openReviewClaimIds.length > 0) {
    lines.push(
      `Source reconstruction review open: ${bounded(openReviewClaimIds, maxItems).join(', ')}`,
    );
  }
  if (needsRevisionClaimIds.length > 0) {
    lines.push(
      `Source reconstruction review needs revision: ${bounded(needsRevisionClaimIds, maxItems).join(', ')}`,
    );
  }
  if (inconclusiveClaimIds.length > 0) {
    lines.push(
      `Source reconstruction review inconclusive: ${bounded(inconclusiveClaimIds, maxItems).join(', ')}`,
    );
  }
  if (nextActions.length > 0) {
    lines.push(`Source reconstruction review next actions: ${bounded(nextActions, maxItems).join(', ')}`);
  }
  return {
    all,
    pending,
    needsRevision,
    inconclusive,
    passed,
    openReviewClaimIds,
    needsRevisionClaimIds,
    inconclusiveClaimIds,
    reviewPacketClaimIds,
    nextActions,
    lines,
  };
}

function gapMatches(gap: AitpProvenanceGap, needles: readonly string[]): boolean {
  return hasAny(lowerJoin([
    gap.id,
    gap.gapType,
    gap.provenanceKind,
    gap.reason,
    gap.targetType,
    gap.targetId,
    gap.strictBoundary,
    ...gap.targetRefs,
    ...gap.recommendedActions,
    ...gap.recommendedEntrypoints,
    ...gap.blockingWhenUsedAs,
  ]), needles);
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
  const relevantProvenanceGaps = provenanceGapsForMoment(moment, slice);
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
      provenanceGap: provenanceGapPayload(relevantProvenanceGaps[0]),
      provenanceGaps: relevantProvenanceGaps.map(provenanceGapPayload),
      writeBridge: writeBridgeForMoment(moment, obligation, relevantProvenanceGaps),
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

function provenanceGapsForMoment(
  moment: DetectedResearchMoment,
  slice: AitpProcessGraphSlice,
): readonly AitpProvenanceGap[] {
  return slice.provenanceGaps.filter((gap) => {
    const actionIds = provenanceActionIdsForGap(gap);
    return (
      actionIds.includes(moment.actionId) ||
      gap.targetRefs.some((ref) => moment.targetRefs.includes(ref)) ||
      moment.targetRefs.some((ref) => gap.targetRefs.includes(ref))
    );
  }).toSorted((left, right) =>
    Number(explicitProvenanceActionIdsForGap(right).includes(moment.actionId)) -
    Number(explicitProvenanceActionIdsForGap(left).includes(moment.actionId)),
  );
}

function explicitProvenanceActionIdsForGap(gap: AitpProvenanceGap): readonly string[] {
  const actionIds = [
    ...gap.recommendedActions,
    ...gap.recommendedEntrypoints.map(actionIdForEntrypoint),
  ].filter(isNonEmptyString);
  return unique(actionIds.map(normalizeProvenanceActionId));
}

function provenanceActionIdsForGap(gap: AitpProvenanceGap): readonly string[] {
  const actionIds = [
    ...gap.recommendedActions,
    ...gap.recommendedEntrypoints.map(actionIdForEntrypoint),
  ].filter(isNonEmptyString);
  const text = lowerJoin([
    gap.gapType,
    gap.provenanceKind,
    gap.reason,
    ...gap.blockingWhenUsedAs,
  ]);
  if (hasAny(text, ['reference_location'])) actionIds.push('aitp.record_reference_location');
  if (hasAny(text, ['source_asset', 'source hash'])) {
    actionIds.push('aitp.capture_source_asset_auto', 'aitp.register_source_asset');
  } else if (hasAny(text, ['duplicate_hash'])) {
    actionIds.push('aitp.register_source_asset');
  }
  if (hasAny(text, ['code_state', 'git', 'diff', 'patch', 'repo'])) {
    actionIds.push('aitp.capture_code_state_auto', 'code.capture_git_diff_observation');
  }
  if (hasAny(text, ['tool_run', 'benchmark'])) {
    actionIds.push('aitp.capture_tool_run_auto', 'aitp.record_tool_run');
  }
  if (hasAny(text, ['validation_contract'])) actionIds.push('aitp.create_validation_contract');
  if (hasAny(text, ['validation_result'])) actionIds.push('aitp.record_validation_result');
  if (hasAny(text, ['artifact'])) actionIds.push('aitp.attach_artifact');
  return unique(actionIds.map(normalizeProvenanceActionId));
}

function actionIdForEntrypoint(entrypoint: string): string | undefined {
  switch (entrypoint) {
    case 'aitp_v5_record_reference_location':
      return 'aitp.record_reference_location';
    case 'aitp_v5_capture_source_asset_auto':
      return 'aitp.capture_source_asset_auto';
    case 'aitp_v5_register_source_asset':
      return 'aitp.register_source_asset';
    case 'aitp_v5_capture_code_state_auto':
    case 'aitp_v5_record_code_state':
      return 'aitp.capture_code_state_auto';
    case 'aitp_v5_record_tool_run':
      return 'aitp.record_tool_run';
    case 'aitp_v5_capture_tool_run_auto':
      return 'aitp.capture_tool_run_auto';
    case 'aitp_v5_create_validation_contract':
    case 'aitp_v5_validation_contract_create':
      return 'aitp.create_validation_contract';
    case 'aitp_v5_record_validation_result':
      return 'aitp.record_validation_result';
    case 'aitp_v5_record_source_reconstruction_review_result':
      return 'aitp.record_source_reconstruction_review_result';
    case 'aitp_v5_attach_artifact':
      return 'aitp.attach_artifact';
    case 'aitp_v5_preflight_trust_update':
      return 'aitp.run_trust_preflight';
    default:
      return undefined;
  }
}

function normalizeProvenanceActionId(actionId: string): string {
  if (actionId === 'aitp.record_code_state') return 'aitp.capture_code_state_auto';
  if (actionId === 'aitp.review_source_asset_duplicate') return 'aitp.register_source_asset';
  return actionId;
}

function provenanceGapPayload(
  gap: AitpProvenanceGap | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (gap === undefined) return undefined;
  return {
    id: gap.id,
    gapType: gap.gapType,
    provenanceKind: gap.provenanceKind,
    reason: gap.reason,
    topicId: gap.topicId,
    claimId: gap.claimId,
    targetType: gap.targetType,
    targetId: gap.targetId,
    targetRefs: gap.targetRefs,
    recommendedActions: gap.recommendedActions,
    recommendedEntrypoints: gap.recommendedEntrypoints,
    payloadHints: gap.payloadHints.map((hint) => ({
      entrypoint: hint.entrypoint,
      recordAction: hint.recordAction,
      requiredFields: hint.requiredFields,
      draft: camelizeDraft(hint.draft),
      orientationOnly: hint.orientationOnly,
      summaryInputsTrusted: hint.summaryInputsTrusted,
      canUpdateClaimTrust: hint.canUpdateClaimTrust,
    })),
    severity: gap.severity,
    requiredNow: gap.requiredNow,
    requiredBeforeTrustChange: gap.requiredBeforeTrustChange,
    strictBoundary: gap.strictBoundary,
    blockingWhenUsedAs: gap.blockingWhenUsedAs,
    orientationOnly: gap.orientationOnly,
    canUpdateClaimTrust: gap.canUpdateClaimTrust,
  };
}

function writeBridgeForMoment(
  moment: DetectedResearchMoment,
  obligation: AitpCallObligation | undefined,
  provenanceGaps: readonly AitpProvenanceGap[] = [],
): Readonly<Record<string, unknown>> | undefined {
  const hints = [
    ...(obligation?.payloadHints ?? []),
    ...provenanceGaps.flatMap((gap) => gap.payloadHints),
  ];
  switch (moment.actionId) {
    case 'aitp.record_exploratory_record':
      return withPayloadDraft({
        ...writeBridgeTarget('recordExploratoryRecord'),
        cli: 'aitp-v5 exploration record',
        requiredFields: ['topicId', 'explorationType', 'title', 'focalQuestion', 'summary'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.register_source_asset':
      return withPayloadDraft({
        ...writeBridgeTarget('registerSourceAsset'),
        cli: 'aitp-v5 asset register',
        requiredFields: ['topicId', 'assetType', 'uri', 'title'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.capture_source_asset_auto':
      return withPayloadDraft({
        ...writeBridgeTarget('captureSourceAssetAuto'),
        cli: 'aitp-v5 asset capture-auto',
        requiredFields: ['path', 'topicId'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.record_evidence':
      return withPayloadDraft({
        ...writeBridgeTarget('recordEvidence'),
        cli: 'aitp-v5 evidence record',
        requiredFields: ['topicId', 'claimId', 'evidenceType', 'status', 'summary'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.record_tool_run':
      return withPayloadDraft({
        ...writeBridgeTarget('recordToolRun'),
        cli: 'aitp-v5 tool run record',
        requiredFields: ['recipeId', 'toolFamily', 'toolName', 'topicId', 'claimId'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.capture_tool_run_auto':
      return withPayloadDraft({
        ...writeBridgeTarget('captureToolRunAuto'),
        cli: 'aitp-v5 tool run capture-auto',
        requiredFields: ['path', 'recipeId', 'toolFamily', 'toolName', 'topicId', 'claimId'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.capture_code_state_auto':
      return withPayloadDraft({
        ...writeBridgeTarget('captureCodeStateAuto'),
        cli: 'aitp-v5 code state auto',
        requiredFields: ['worktreePath', 'repoId', 'topicId', 'claimId'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.attach_artifact':
      return withPayloadDraft({
        ...writeBridgeTarget('attachArtifact'),
        cli: 'aitp-v5 research-state attach-artifact',
        requiredFields: ['topicId', 'claimId', 'artifactType', 'uri', 'summary'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.record_reference_location':
      return withPayloadDraft({
        ...writeBridgeTarget('recordReferenceLocation'),
        cli: 'aitp-v5 reference location record',
        requiredFields: ['topicId', 'connectorId', 'locationType', 'uri', 'label'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.create_open_obligation':
      return withPayloadDraft({
        ...writeBridgeTarget('createProofObligation'),
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
      }, hints);
    case 'aitp.create_validation_contract':
      return withPayloadDraft({
        ...writeBridgeTarget('createValidationContract'),
        cli: 'aitp-v5 validation contract create',
        requiredFields: ['topicId', 'claimId', 'requiredChecks', 'failureModes', 'requiredEvidenceOutputs'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.record_validation_result':
      return withPayloadDraft({
        ...writeBridgeTarget('recordValidationResult'),
        cli: 'aitp-v5 validation result record',
        requiredFields: ['topicId', 'claimId', 'contractId', 'toolRunId', 'status', 'summary'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.record_source_reconstruction_review_result':
      return withPayloadDraft({
        ...writeBridgeTarget('recordSourceReconstructionReviewResult'),
        cli: 'aitp-v5 source reconstruction-review-result',
        requiredFields: [
          'claimId',
          'status',
          'reviewedComponents',
          'summary',
          'one of basisRefs/evidenceRefs/validationResultIds/referenceLocationIds/objectIds/relationIds',
        ],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.request_human_checkpoint':
      return withPayloadDraft({
        ...writeBridgeTarget('requestHumanCheckpoint'),
        cli: 'aitp-v5 checkpoint request',
        requiredFields: ['topicId', 'claimId', 'reason', 'requestedBy', 'options'],
        targetRefs: moment.targetRefs,
      }, hints);
    case 'aitp.run_trust_preflight':
      return withPayloadDraft({
        ...writeBridgeTarget('preflightTrustUpdate'),
        cli: 'aitp-v5 trust preflight',
        requiredFields: ['action', 'sessionId', 'topicId', 'claimId'],
        targetRefs: moment.targetRefs,
        canUpdateClaimTrust: false,
        canUpdateKernelState: false,
      }, hints);
    default:
      return undefined;
  }
}

function writeBridgeTarget(
  operation: AitpWriteBridgeOperation,
): Readonly<Record<string, unknown>> & { readonly operation: AitpWriteBridgeOperation } {
  const target = aitpRuntimeBridgeTargetForOperation(operation);
  return {
    operation,
    entrypointKey: target.entrypointKey,
    mcpTool: target.mcpTool,
    cliFallback: target.cliFallback,
    surface: target.surface,
    preferredTransport: target.preferredTransport,
    fallbackTransport: target.fallbackTransport,
    executionRole: target.executionRole,
    stateEffect: target.stateEffect,
    canonicalStore: target.canonicalStore,
    claimTrustMutation: target.claimTrustMutation,
    summaryInputsTrusted: target.summaryInputsTrusted,
    canUpdateClaimTrust: target.canUpdateClaimTrust,
  };
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
  hints: readonly AitpPayloadHint[],
): Readonly<Record<string, unknown>> {
  const hint = payloadHintForOperation(bridge.operation, hints);
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
    case 'captureSourceAssetAuto':
      return 'capture_source_asset_auto';
    case 'captureToolRunAuto':
      return 'capture_tool_run_auto';
    case 'recordEvidence':
      return 'record_evidence';
    case 'recordToolRun':
      return 'record_tool_run';
    case 'captureCodeStateAuto':
      return 'capture_code_state_auto';
    case 'attachArtifact':
      return 'attach_artifact';
    case 'recordReferenceLocation':
      return 'record_reference_location';
    case 'createProofObligation':
      return 'create_proof_obligation';
    case 'createValidationContract':
      return 'create_validation_contract';
    case 'recordValidationResult':
      return 'record_validation_result';
    case 'recordSourceReconstructionReviewResult':
      return 'record_source_reconstruction_review_result';
    case 'requestHumanCheckpoint':
      return 'request_human_checkpoint';
    case 'preflightTrustUpdate':
      return 'preflight_trust_update';
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
    slice.provenanceGaps.length > 0 ||
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
  if (slice.provenanceGaps.length > 0) diagnostics.push('provenance-gaps-present');
  if (slice.sourceAssetIndex.length > 0) diagnostics.push('source-asset-index-present');
  if (slice.sourceStackCoverage.items.length > 0) {
    diagnostics.push('source-stack-coverage-present');
  }
  if (slice.sourceStackCoverage.items.some((item) => item.coverageStatus !== 'complete')) {
    diagnostics.push('source-stack-coverage-gaps-present');
  }
  if (slice.sourceReconstructionReview.items.length > 0) {
    diagnostics.push('source-reconstruction-review-present');
  }
  if (slice.sourceReconstructionReview.items.some((item) => item.reviewStatus !== 'passed')) {
    diagnostics.push('source-reconstruction-review-open');
  }
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

function renderProvenanceGap(gap: AitpProvenanceGap): string {
  const target = gap.targetRefs.length === 0 ? `${gap.targetType}:${gap.targetId}` : gap.targetRefs.join(',');
  const actions = provenanceActionIdsForGap(gap);
  const actionText = actions.length === 0 ? '' : ` actions=${actions.join(',')}`;
  const boundary = gap.strictBoundary === undefined ? '' : ` before=${gap.strictBoundary}`;
  const required =
    gap.requiredNow || gap.requiredBeforeTrustChange
      ? ` required=${gap.requiredNow ? 'now' : 'before_trust_change'}`
      : '';
  return `${gap.id} [${gap.gapType}/${gap.provenanceKind}] -> ${target}${actionText}${boundary}${required}: ${gap.reason}`;
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

function renderSourceAssetIndexItem(item: AitpSourceAssetIndexItem): string {
  const title = item.title.length === 0 ? item.label ?? item.id : item.title;
  const hash = item.contentHash === undefined ? item.hashStatus : `${item.hashStatus}:${item.contentHash}`;
  const refs = item.referenceLocationIds.length === 0
    ? ''
    : ` refs=${item.referenceLocationIds.join('|')}`;
  const gaps = item.provenanceGapIds.length === 0 ? '' : ` gaps=${item.provenanceGapIds.join('|')}`;
  return `source_asset:${item.id} [${item.assetType}/${hash}]: ${title} -> ${item.uri}${refs}${gaps}`;
}

function renderSourceStackCoverageItem(item: AitpSourceStackCoverageItem): string {
  const missingOutputs = item.missingRequiredOutputs.length === 0
    ? 'none'
    : item.missingRequiredOutputs.join('|');
  const missingComponents = item.missingSourceComponents.length === 0
    ? 'none'
    : item.missingSourceComponents.join('|');
  return (
    `${item.claimId} [${item.coverageStatus}/${item.riskLevel}]` +
    ` missing_outputs=${missingOutputs}` +
    ` missing_components=${missingComponents}` +
    ` review=${item.sourceReconstructionReviewStatus}`
  );
}

function renderSourceReconstructionReviewItem(item: AitpSourceReconstructionReviewItem): string {
  const missing = item.missingComponents.length === 0 ? 'none' : item.missingComponents.join('|');
  const remaining = item.remainingActions.length === 0 ? 'none' : item.remainingActions.join('|');
  return (
    `${item.claimId} [${item.reviewStatus}/${item.sourceReconstructionStatus}]` +
    ` missing=${missing}` +
    ` reviewed=${item.reviewedComponents.length === 0 ? 'none' : item.reviewedComponents.join('|')}` +
    ` remaining=${remaining}`
  );
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

function withSliceDefaults(slice: AitpProcessGraphSlice): AitpProcessGraphSlice {
  const routeState =
    'routeState' in slice && slice.routeState !== undefined ? slice.routeState : emptyRouteState();
  const provenanceGaps =
    (slice as { readonly provenanceGaps?: readonly AitpProvenanceGap[] }).provenanceGaps ?? [];
  const sourceAssetIndex =
    (slice as { readonly sourceAssetIndex?: readonly AitpSourceAssetIndexItem[] }).sourceAssetIndex ?? [];
  const sourceStackCoverage =
    (slice as { readonly sourceStackCoverage?: AitpSourceStackCoverage }).sourceStackCoverage ??
    emptySourceStackCoverage();
  const sourceReconstructionReview =
    (slice as { readonly sourceReconstructionReview?: AitpSourceReconstructionReview })
      .sourceReconstructionReview ?? emptySourceReconstructionReview();
  return {
    ...slice,
    routeState,
    provenanceGaps,
    sourceAssetIndex,
    sourceStackCoverage,
    sourceReconstructionReview,
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
