export interface AitpLiteratureSourceReviewHandoffInput {
  readonly sessionId: string;
  readonly uri: string;
  readonly label: string;
  readonly externalId?: string | undefined;
  readonly shortSummary: string;
  readonly detectedRelevance: string;
  readonly optionalClaimId?: string | undefined;
  readonly scopedOutput?: string | undefined;
  readonly reviewedRefs?: readonly string[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpLiteratureSourceReviewHandoffProvider {
  getLiteratureSourceReviewHandoff(
    input: AitpLiteratureSourceReviewHandoffInput,
  ): Promise<AitpLiteratureSourceReviewHandoff>;
}

export interface AitpLiteratureSourceReviewHandoff {
  readonly kind: 'literature_source_review_handoff';
  readonly sessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly truthSource: string;
  readonly readSurfaceEffect: 'handoff_context_only';
  readonly literatureIntakeSuggestion: Readonly<Record<string, unknown>>;
  readonly recordRefLookup: Readonly<Record<string, unknown>>;
  readonly sourceStackCoverageItem: Readonly<Record<string, unknown>>;
  readonly sourceReconstructionReviewPacket: Readonly<Record<string, unknown>>;
  readonly recommendedNextEntrypoints: readonly AitpLiteratureSourceReviewNextEntrypoint[];
  readonly handoffPolicy: AitpLiteratureSourceReviewHandoffPolicy;
  readonly allowedNextToolCall: AitpLiteratureSourceReviewAllowedNextToolCall;
  readonly readOnly: true;
  readonly requiresExplicitNextAction: true;
  readonly bridgeCalled: false;
  readonly executesWriteNow: false;
  readonly mutatesNextPayloadNow: false;
  readonly infersPayloadValues: false;
  readonly summaryInputsTrusted: false;
  readonly orientationOnly: true;
  readonly canUpdateKernelState: false;
  readonly canUpdateClaimTrust: false;
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly evidenceCreated: false;
  readonly validationCreated: false;
  readonly writeExecuted: false;
  readonly trustUpdateForbidden: true;
  readonly claimTrustMutation: 'none';
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureSourceReviewNextEntrypoint {
  readonly entrypoint: string;
  readonly surface: string;
  readonly reason: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureSourceReviewHandoffPolicy {
  readonly source: string;
  readonly hostMayUseFor: readonly string[];
  readonly requiresExplicitNextEntrypoint: true;
  readonly allowedNextEntrypoints: readonly string[];
  readonly forbiddenUses: readonly string[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureSourceReviewAllowedNextToolCall {
  readonly action: 'plan_primitive_tools';
  readonly actionId: 'source.review_context';
  readonly requiresExplicitNextAction: true;
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly claimTrustMutation: 'none';
  readonly raw: Readonly<Record<string, unknown>>;
}

export class AitpLiteratureSourceReviewHandoffParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpLiteratureSourceReviewHandoffParseError';
  }
}

const REQUIRED_FORBIDDEN_USES = [
  'evidence_support',
  'source_support_result',
  'validation_result',
  'write_execution',
  'final_gate_satisfaction',
  'claim_trust_update',
  'trust_apply',
] as const;

export function parseAitpLiteratureSourceReviewHandoff(
  input: unknown,
): AitpLiteratureSourceReviewHandoff {
  const payload = unwrapSurface(input, 'literature_source_review_handoff');
  if (payload['kind'] !== 'literature_source_review_handoff') {
    throw new AitpLiteratureSourceReviewHandoffParseError(
      'AITP literature source review handoff payload has the wrong kind.',
    );
  }
  if (
    payload['ok'] !== true ||
    payload['read_surface_effect'] !== 'handoff_context_only' ||
    payload['read_only'] !== true ||
    payload['requires_explicit_next_action'] !== true ||
    payload['bridge_called'] !== false ||
    payload['executes_write_now'] !== false ||
    payload['mutates_next_payload_now'] !== false ||
    payload['infers_payload_values'] !== false ||
    payload['summary_inputs_trusted'] !== false ||
    payload['orientation_only'] !== true ||
    payload['can_update_kernel_state'] !== false ||
    payload['can_update_claim_trust'] !== false ||
    payload['records_validation_result'] !== false ||
    payload['source_support_result'] !== false ||
    payload['evidence_created'] !== false ||
    payload['validation_created'] !== false ||
    payload['write_executed'] !== false ||
    payload['trust_update_forbidden'] !== true ||
    payload['claim_trust_mutation'] !== 'none'
  ) {
    throw new AitpLiteratureSourceReviewHandoffParseError(
      'AITP literature source review handoff must remain read-only, no-write, and no-trust.',
    );
  }
  const policy = parsePolicy(
    requiredRecord(payload['handoff_policy'], 'literature_source_review_handoff.handoff_policy'),
  );
  const allowedNextToolCall = parseAllowedNextToolCall(
    requiredRecord(
      payload['allowed_next_tool_call'],
      'literature_source_review_handoff.allowed_next_tool_call',
    ),
  );
  return {
    kind: 'literature_source_review_handoff',
    sessionId: requiredString(payload, 'session_id'),
    topicId: requiredString(payload, 'topic_id'),
    claimId: stringValue(payload['claim_id']) ?? '',
    truthSource: requiredString(payload, 'truth_source'),
    readSurfaceEffect: 'handoff_context_only',
    literatureIntakeSuggestion: requiredRecord(
      payload['literature_intake_suggestion'],
      'literature_source_review_handoff.literature_intake_suggestion',
    ),
    recordRefLookup: requiredRecord(
      payload['record_ref_lookup'],
      'literature_source_review_handoff.record_ref_lookup',
    ),
    sourceStackCoverageItem: optionalRecord(
      payload['source_stack_coverage_item'],
      'literature_source_review_handoff.source_stack_coverage_item',
    ),
    sourceReconstructionReviewPacket: optionalRecord(
      payload['source_reconstruction_review_packet'],
      'literature_source_review_handoff.source_reconstruction_review_packet',
    ),
    recommendedNextEntrypoints: requiredRecordArray(
      payload['recommended_next_entrypoints'],
      'literature_source_review_handoff.recommended_next_entrypoints',
    ).map(parseNextEntrypoint),
    handoffPolicy: policy,
    allowedNextToolCall,
    readOnly: true,
    requiresExplicitNextAction: true,
    bridgeCalled: false,
    executesWriteNow: false,
    mutatesNextPayloadNow: false,
    infersPayloadValues: false,
    summaryInputsTrusted: false,
    orientationOnly: true,
    canUpdateKernelState: false,
    canUpdateClaimTrust: false,
    recordsValidationResult: false,
    sourceSupportResult: false,
    evidenceCreated: false,
    validationCreated: false,
    writeExecuted: false,
    trustUpdateForbidden: true,
    claimTrustMutation: 'none',
    raw: payload,
  };
}

function parsePolicy(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureSourceReviewHandoffPolicy {
  const forbiddenUses = requiredStringArray(
    raw['forbidden_uses'],
    'literature_source_review_handoff.handoff_policy.forbidden_uses',
  );
  for (const forbiddenUse of REQUIRED_FORBIDDEN_USES) {
    if (!forbiddenUses.includes(forbiddenUse)) {
      throw new AitpLiteratureSourceReviewHandoffParseError(
        `AITP literature source review handoff policy must forbid ${forbiddenUse}.`,
      );
    }
  }
  if (raw['requires_explicit_next_entrypoint'] !== true) {
    throw new AitpLiteratureSourceReviewHandoffParseError(
      'AITP literature source review handoff policy must require an explicit next entrypoint.',
    );
  }
  return {
    source: requiredString(raw, 'source'),
    hostMayUseFor: requiredStringArray(
      raw['host_may_use_for'],
      'literature_source_review_handoff.handoff_policy.host_may_use_for',
    ),
    requiresExplicitNextEntrypoint: true,
    allowedNextEntrypoints: requiredStringArray(
      raw['allowed_next_entrypoints'],
      'literature_source_review_handoff.handoff_policy.allowed_next_entrypoints',
    ),
    forbiddenUses,
    raw,
  };
}

function parseAllowedNextToolCall(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureSourceReviewAllowedNextToolCall {
  if (
    raw['action'] !== 'plan_primitive_tools' ||
    raw['action_id'] !== 'source.review_context' ||
    raw['requires_explicit_next_action'] !== true ||
    raw['records_validation_result'] !== false ||
    raw['source_support_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none'
  ) {
    throw new AitpLiteratureSourceReviewHandoffParseError(
      'AITP literature source review handoff allowed next call must be bounded source.review_context planning only.',
    );
  }
  return {
    action: 'plan_primitive_tools',
    actionId: 'source.review_context',
    requiresExplicitNextAction: true,
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    raw,
  };
}

function parseNextEntrypoint(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureSourceReviewNextEntrypoint {
  return {
    entrypoint: requiredString(raw, 'entrypoint'),
    surface: stringValue(raw['surface']) ?? '',
    reason: stringValue(raw['reason']) ?? '',
    raw,
  };
}

function unwrapSurface(input: unknown, key: string): Readonly<Record<string, unknown>> {
  const raw = requiredRecord(input, 'AITP literature source review handoff payload');
  const nested = raw[key];
  if (nested !== undefined) return requiredRecord(nested, key);
  return raw;
}

function requiredRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AitpLiteratureSourceReviewHandoffParseError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function optionalRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === undefined) return {};
  return requiredRecord(value, label);
}

function requiredRecordArray(value: unknown, label: string): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) {
    throw new AitpLiteratureSourceReviewHandoffParseError(`${label} must be an array.`);
  }
  return value.map((item, index) => requiredRecord(item, `${label}[${String(index)}]`));
}

function requiredString(raw: Readonly<Record<string, unknown>>, key: string): string {
  const value = stringValue(raw[key]);
  if (value === undefined || value.length === 0) {
    throw new AitpLiteratureSourceReviewHandoffParseError(`${key} must be a non-empty string.`);
  }
  return value;
}

function requiredStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new AitpLiteratureSourceReviewHandoffParseError(`${label} must be a string array.`);
  }
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
