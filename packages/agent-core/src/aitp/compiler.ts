import { actionIdForPolicyDecision, detectResearchMoments } from './moment-detector';
import { parseAitpProcessGraphSlice } from './parser';
import type {
  AitpCallObligation,
  AitpMomentPolicyDecision,
  AitpObligationSummary,
  AitpOpenObligation,
  AitpPayloadHint,
  AitpProcessGraphSlice,
  AitpTrustSummary,
  CompiledAitpProcessGraphSlice,
  DetectedResearchMoment,
  ResearchMomentDetectorInput,
} from './types';
import type { ResearchActionBinding } from '../research-action';

const MAX_CONTEXT_ITEMS = 6;
const AITP_ADAPTER_ID = 'aitp.native.process-graph-slice';

export interface CompileAitpProcessGraphSliceOptions extends ResearchMomentDetectorInput {
  readonly maxContextItems?: number | undefined;
}

export function compileAitpProcessGraphSlice(
  input: AitpProcessGraphSlice | unknown,
  options: CompileAitpProcessGraphSliceOptions = {},
): CompiledAitpProcessGraphSlice {
  const slice = isAitpProcessGraphSlice(input) ? input : parseAitpProcessGraphSlice(input);
  const maxItems = options.maxContextItems ?? MAX_CONTEXT_ITEMS;
  const obligations = summarizeObligations(slice.openObligations, maxItems);
  const trust = summarizeTrust(slice);
  const suggestedNextMoments = detectResearchMoments(slice, options);
  const callObligations = buildCallObligations(slice);
  const actionRecommendations = suggestedNextMoments.map((moment) =>
    actionBindingForMoment(moment, slice, callObligations),
  );
  const contextLines = buildContextLines(
    slice,
    obligations,
    suggestedNextMoments,
    callObligations,
    maxItems,
  );

  return {
    reminders: buildReminderLines(slice, contextLines, trust, callObligations, maxItems),
    contextLines,
    actionRecommendations,
    callObligations,
    obligations,
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
  moments: readonly DetectedResearchMoment[],
  callObligations: readonly AitpCallObligation[],
  maxItems: number,
): readonly string[] {
  const lines: string[] = [
    `AITP slice: ${String(slice.nodes.length)} nodes, ${String(slice.edges.length)} edges, truth_source=${slice.truthSource}.`,
  ];
  if (slice.orientationOnly) {
    lines.push('Orientation only: use the slice for local guidance, not as promoted research truth.');
  }
  lines.push(...obligations.lines);

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
): ResearchActionBinding {
  const obligation = callObligationForMoment(moment, callObligations);
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
      writeBridge: writeBridgeForMoment(moment, obligation),
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
  return {
    id: `aitp.policy.${String(index + 1)}.${slug(actionId)}.${slug(decision.targetType)}.${slug(decision.targetId)}`,
    actionId,
    momentId: decision.moment,
    requiredNow: decision.requiredNow,
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
    trustBoundary: decision.trustBoundary,
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

function camelizeDraft(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[camelizeKey(key)] = item;
  }
  return result;
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

function bounded(values: readonly string[], maxItems: number): readonly string[] {
  if (values.length <= maxItems) return values;
  return [...values.slice(0, maxItems), `...(+${String(values.length - maxItems)} more)`];
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
