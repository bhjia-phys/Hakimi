export type AitpRecordingDecision = 'ignore' | 'defer' | 'navigate' | 'checkpoint';

export interface AitpRecordingCandidateInput {
  readonly sessionId?: string | undefined;
  readonly eventType: string;
  readonly summary?: string | undefined;
  readonly topicId?: string | undefined;
  readonly claimId?: string | undefined;
  readonly touchedRefs?: readonly string[] | undefined;
  readonly producedArtifacts?: readonly string[] | undefined;
  readonly toolCallId?: string | undefined;
  readonly riskHint?: string | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpRecordingNavigationInput {
  readonly sessionId: string;
  readonly claimId?: string | undefined;
  readonly limit?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpRecordingSlotExpansionInput {
  readonly sessionId: string;
  readonly slot: string;
  readonly claimId?: string | undefined;
  readonly candidate?: Readonly<Record<string, unknown>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpRecordingEffectVerificationInput {
  readonly sessionId: string;
  readonly expectedRefs?: readonly string[] | undefined;
  readonly beforeNodeIds?: readonly string[] | undefined;
  readonly beforeEdgeIds?: readonly string[] | undefined;
  readonly claimId?: string | undefined;
  readonly limit?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpRecordingNavigatorProvider {
  classifyRecordingCandidate(
    input: AitpRecordingCandidateInput,
  ): Promise<AitpRecordingCandidateClassification>;
  readRecordingNavigationState(
    input: AitpRecordingNavigationInput,
  ): Promise<AitpRecordingNavigationState>;
  expandRecordingSlot(
    input: AitpRecordingSlotExpansionInput,
  ): Promise<AitpRecordingSlotExpansion>;
  verifyRecordingEffect(
    input: AitpRecordingEffectVerificationInput,
  ): Promise<AitpRecordingEffectVerification>;
}

export interface AitpRecordingCandidateClassification extends AitpRecordingReadBoundary {
  readonly kind: 'recording_candidate_classification';
  readonly decision: AitpRecordingDecision;
  readonly eventType: string;
  readonly recognizedEventType: boolean;
  readonly triggerReasons: readonly string[];
  readonly suggestedSlots: readonly string[];
  readonly nextReadTool: string;
  readonly sessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly summary: string;
  readonly candidateRefs: readonly string[];
  readonly producedArtifacts: readonly string[];
  readonly toolCallId: string;
  readonly riskHint: string;
  readonly payloadKeys: readonly string[];
  readonly navigationPolicy: AitpRecordingNavigationPolicy;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordingNavigationState extends AitpRecordingReadBoundary {
  readonly kind: 'recording_navigation_state';
  readonly sessionId: string;
  readonly requestedSessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly currentPosition: Readonly<Record<string, unknown>>;
  readonly firstLevelSlots: readonly AitpRecordingSlotSummary[];
  readonly recommendedSlots: readonly string[];
  readonly graphContext: Readonly<Record<string, unknown>>;
  readonly nextStep: Readonly<Record<string, unknown>>;
  readonly trustBoundaryReasons: readonly string[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordingSlotExpansion extends AitpRecordingReadBoundary {
  readonly kind: 'recording_slot_expansion';
  readonly slot: string;
  readonly sessionId: string;
  readonly requestedSessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly recommendedWriteTool: string;
  readonly cliTemplate: string;
  readonly recordKind: string;
  readonly requiredFields: readonly AitpRecordingFieldHint[];
  readonly optionalFields: readonly AitpRecordingFieldHint[];
  readonly recommendedLinks: readonly string[];
  readonly graphEdgesCreated: readonly string[];
  readonly whenToUse: string;
  readonly candidateContext: Readonly<Record<string, unknown>>;
  readonly recordingSequence: readonly string[];
  readonly trustEffect: AitpRecordingTrustEffect;
  readonly warnings: readonly string[];
  readonly verifyWith: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordingEffectVerification extends AitpRecordingReadBoundary {
  readonly kind: 'recording_effect_verification';
  readonly verified: boolean;
  readonly sessionId: string;
  readonly requestedSessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly expectedRefs: readonly string[];
  readonly foundRefs: readonly string[];
  readonly missingRefs: readonly string[];
  readonly graphDelta: Readonly<Record<string, unknown>>;
  readonly currentRecommendedSlots: readonly string[];
  readonly failureReasons: readonly string[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordingReadBoundary {
  readonly truthSource: string;
  readonly summaryInputsTrusted: false;
  readonly orientationOnly: true;
  readonly canUpdateKernelState: false;
  readonly canUpdateClaimTrust: false;
}

export interface AitpRecordingNavigationPolicy {
  readonly writeAtClassification: false;
  readonly writeAtNavigation: false;
  readonly writeOnlyAfterSlotExpansion: true;
  readonly trustChangeRequiresPreflight: true;
  readonly agentShouldNotRecordEveryStep: true;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordingSlotSummary {
  readonly slot: string;
  readonly recordKind: string;
  readonly currentCount: number;
  readonly recommendedWriteTool: string;
  readonly expandWith: string;
  readonly readOnlyAtThisLayer: true;
  readonly canUpdateClaimTrust: false;
  readonly whenToUse: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordingFieldHint {
  readonly name: string;
  readonly knownValue: string;
  readonly source: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordingTrustEffect {
  readonly writesKernelState: boolean;
  readonly canUpdateClaimTrust: false;
  readonly claimTrustMutation: 'none';
  readonly trustPreflightRequiredForTrustChange: boolean;
  readonly raw: Readonly<Record<string, unknown>>;
}

export class AitpRecordingNavigatorParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpRecordingNavigatorParseError';
  }
}

export function parseAitpRecordingCandidateClassification(
  input: unknown,
): AitpRecordingCandidateClassification {
  const payload = unwrapSurface(input, 'recording_candidate_classification');
  requireReadBoundary(payload, 'recording_candidate_classification');
  const policy = requiredRecord(
    payload['navigation_policy'],
    'recording_candidate_classification.navigation_policy',
  );
  if (
    policy['write_at_classification'] !== false ||
    policy['write_at_navigation'] !== false ||
    policy['write_only_after_slot_expansion'] !== true ||
    policy['trust_change_requires_preflight'] !== true ||
    policy['agent_should_not_record_every_step'] !== true
  ) {
    throw new AitpRecordingNavigatorParseError(
      'AITP recording candidate policy must remain navigation-only until slot expansion.',
    );
  }
  const decision = requiredString(payload, 'decision');
  if (!['ignore', 'defer', 'navigate', 'checkpoint'].includes(decision)) {
    throw new AitpRecordingNavigatorParseError('AITP recording candidate decision is unsupported.');
  }
  return {
    kind: 'recording_candidate_classification',
    decision: decision as AitpRecordingDecision,
    eventType: stringValue(payload['event_type']) ?? '',
    recognizedEventType: payload['recognized_event_type'] === true,
    triggerReasons: stringArray(payload['trigger_reasons']),
    suggestedSlots: stringArray(payload['suggested_slots']),
    nextReadTool: stringValue(payload['next_read_tool']) ?? '',
    sessionId: stringValue(payload['session_id']) ?? '',
    topicId: stringValue(payload['topic_id']) ?? '',
    claimId: stringValue(payload['claim_id']) ?? '',
    summary: stringValue(payload['summary']) ?? '',
    candidateRefs: stringArray(payload['candidate_refs']),
    producedArtifacts: stringArray(payload['produced_artifacts']),
    toolCallId: stringValue(payload['tool_call_id']) ?? '',
    riskHint: stringValue(payload['risk_hint']) ?? '',
    payloadKeys: stringArray(payload['payload_keys']),
    navigationPolicy: {
      writeAtClassification: false,
      writeAtNavigation: false,
      writeOnlyAfterSlotExpansion: true,
      trustChangeRequiresPreflight: true,
      agentShouldNotRecordEveryStep: true,
      raw: policy,
    },
    ...readBoundary(payload),
    raw: payload,
  };
}

export function parseAitpRecordingNavigationState(input: unknown): AitpRecordingNavigationState {
  const payload = unwrapSurface(input, 'recording_navigation_state');
  requireReadBoundary(payload, 'recording_navigation_state');
  const nextStep = requiredRecord(payload['next_step'], 'recording_navigation_state.next_step');
  if (
    nextStep['read_tool'] !== 'aitp_v5_expand_recording_slot' ||
    nextStep['verify_tool'] !== 'aitp_v5_verify_recording_effect'
  ) {
    throw new AitpRecordingNavigatorParseError(
      'AITP recording navigation state must point to slot expansion and effect verification.',
    );
  }
  return {
    kind: 'recording_navigation_state',
    sessionId: stringValue(payload['session_id']) ?? '',
    requestedSessionId: stringValue(payload['requested_session_id']) ?? '',
    topicId: stringValue(payload['topic_id']) ?? '',
    claimId: stringValue(payload['claim_id']) ?? '',
    currentPosition: optionalRecord(
      payload['current_position'],
      'recording_navigation_state.current_position',
    ),
    firstLevelSlots: recordArray(payload['first_level_slots']).map(parseSlotSummary),
    recommendedSlots: stringArray(payload['recommended_slots']),
    graphContext: optionalRecord(payload['graph_context'], 'recording_navigation_state.graph_context'),
    nextStep,
    trustBoundaryReasons: stringArray(payload['trust_boundary_reasons']),
    ...readBoundary(payload),
    raw: payload,
  };
}

export function parseAitpRecordingSlotExpansion(input: unknown): AitpRecordingSlotExpansion {
  const payload = unwrapSurface(input, 'recording_slot_expansion');
  requireReadBoundary(payload, 'recording_slot_expansion');
  const trustEffect = requiredRecord(
    payload['trust_effect'],
    'recording_slot_expansion.trust_effect',
  );
  if (
    trustEffect['can_update_claim_trust'] !== false ||
    trustEffect['claim_trust_mutation'] !== 'none'
  ) {
    throw new AitpRecordingNavigatorParseError(
      'AITP recording slot expansion must not update claim trust.',
    );
  }
  if (payload['verify_with'] !== 'aitp_v5_verify_recording_effect') {
    throw new AitpRecordingNavigatorParseError(
      'AITP recording slot expansion must verify with aitp_v5_verify_recording_effect.',
    );
  }
  return {
    kind: 'recording_slot_expansion',
    slot: stringValue(payload['slot']) ?? '',
    sessionId: stringValue(payload['session_id']) ?? '',
    requestedSessionId: stringValue(payload['requested_session_id']) ?? '',
    topicId: stringValue(payload['topic_id']) ?? '',
    claimId: stringValue(payload['claim_id']) ?? '',
    recommendedWriteTool: stringValue(payload['recommended_write_tool']) ?? '',
    cliTemplate: stringValue(payload['cli_template']) ?? '',
    recordKind: stringValue(payload['record_kind']) ?? '',
    requiredFields: recordArray(payload['required_fields']).map(parseFieldHint),
    optionalFields: recordArray(payload['optional_fields']).map(parseFieldHint),
    recommendedLinks: stringArray(payload['recommended_links']),
    graphEdgesCreated: stringArray(payload['graph_edges_created']),
    whenToUse: stringValue(payload['when_to_use']) ?? '',
    candidateContext: optionalRecord(
      payload['candidate_context'],
      'recording_slot_expansion.candidate_context',
    ),
    recordingSequence: stringArray(payload['recording_sequence']),
    trustEffect: {
      writesKernelState: trustEffect['writes_kernel_state'] === true,
      canUpdateClaimTrust: false,
      claimTrustMutation: 'none',
      trustPreflightRequiredForTrustChange:
        trustEffect['trust_preflight_required_for_trust_change'] === true,
      raw: trustEffect,
    },
    warnings: stringArray(payload['warnings']),
    verifyWith: 'aitp_v5_verify_recording_effect',
    ...readBoundary(payload),
    raw: payload,
  };
}

export function parseAitpRecordingEffectVerification(
  input: unknown,
): AitpRecordingEffectVerification {
  const payload = unwrapSurface(input, 'recording_effect_verification');
  requireReadBoundary(payload, 'recording_effect_verification');
  return {
    kind: 'recording_effect_verification',
    verified: payload['verified'] === true,
    sessionId: stringValue(payload['session_id']) ?? '',
    requestedSessionId: stringValue(payload['requested_session_id']) ?? '',
    topicId: stringValue(payload['topic_id']) ?? '',
    claimId: stringValue(payload['claim_id']) ?? '',
    expectedRefs: stringArray(payload['expected_refs']),
    foundRefs: stringArray(payload['found_refs']),
    missingRefs: stringArray(payload['missing_refs']),
    graphDelta: optionalRecord(
      payload['graph_delta'],
      'recording_effect_verification.graph_delta',
    ),
    currentRecommendedSlots: stringArray(payload['current_recommended_slots']),
    failureReasons: stringArray(payload['failure_reasons']),
    ...readBoundary(payload),
    raw: payload,
  };
}

function parseSlotSummary(raw: Readonly<Record<string, unknown>>): AitpRecordingSlotSummary {
  if (raw['read_only_at_this_layer'] !== true || raw['can_update_claim_trust'] !== false) {
    throw new AitpRecordingNavigatorParseError(
      'AITP recording slot summaries must remain read-only and no-trust.',
    );
  }
  return {
    slot: stringValue(raw['slot']) ?? '',
    recordKind: stringValue(raw['record_kind']) ?? '',
    currentCount: nonNegativeNumber(raw['current_count']),
    recommendedWriteTool: stringValue(raw['recommended_write_tool']) ?? '',
    expandWith: stringValue(raw['expand_with']) ?? '',
    readOnlyAtThisLayer: true,
    canUpdateClaimTrust: false,
    whenToUse: stringValue(raw['when_to_use']) ?? '',
    raw,
  };
}

function parseFieldHint(raw: Readonly<Record<string, unknown>>): AitpRecordingFieldHint {
  return {
    name: stringValue(raw['name']) ?? '',
    knownValue: stringValue(raw['known_value']) ?? '',
    source: stringValue(raw['source']) ?? '',
    raw,
  };
}

function unwrapSurface(input: unknown, kind: string): Readonly<Record<string, unknown>> {
  const raw = requiredRecord(input, `AITP ${kind} payload`);
  const nested = raw[kind];
  const payload = isRecord(nested) ? nested : raw;
  if (payload['kind'] !== kind) {
    throw new AitpRecordingNavigatorParseError(`AITP ${kind} payload has the wrong kind.`);
  }
  return payload;
}

function requireReadBoundary(payload: Readonly<Record<string, unknown>>, label: string): void {
  if (
    payload['summary_inputs_trusted'] !== false ||
    payload['orientation_only'] !== true ||
    payload['can_update_kernel_state'] !== false ||
    payload['can_update_claim_trust'] !== false
  ) {
    throw new AitpRecordingNavigatorParseError(`AITP ${label} must remain read-only no-trust.`);
  }
}

function readBoundary(payload: Readonly<Record<string, unknown>>): AitpRecordingReadBoundary {
  return {
    truthSource: stringValue(payload['truth_source']) ?? '',
    summaryInputsTrusted: false,
    orientationOnly: true,
    canUpdateKernelState: false,
    canUpdateClaimTrust: false,
  };
}

function optionalRecord(input: unknown, label: string): Readonly<Record<string, unknown>> {
  if (input === undefined || input === null) return {};
  return requiredRecord(input, label);
}

function requiredRecord(input: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(input)) {
    throw new AitpRecordingNavigatorParseError(`${label} must be an object.`);
  }
  return input;
}

function requiredString(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = stringValue(input[key]);
  if (value !== undefined) return value;
  throw new AitpRecordingNavigatorParseError(`AITP recording payload is missing ${key}.`);
}

function recordArray(input: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isRecord);
}

function stringArray(input: unknown): readonly string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function stringValue(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

function nonNegativeNumber(input: unknown): number {
  return typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : 0;
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
