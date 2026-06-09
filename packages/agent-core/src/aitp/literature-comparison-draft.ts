export interface AitpLiteratureComparisonDraftInput {
  readonly sessionId: string;
  readonly comparisonQuestion: string;
  readonly sourceRefs: readonly string[];
  readonly dimensions?: readonly string[] | undefined;
  readonly optionalClaimId?: string | undefined;
  readonly rationale?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpLiteratureComparisonDraftProvider {
  getLiteratureComparisonDraft(
    input: AitpLiteratureComparisonDraftInput,
  ): Promise<AitpLiteratureComparisonDraft>;
}

export interface AitpLiteratureComparisonDraft {
  readonly kind: 'literature_comparison_draft';
  readonly sessionId: string;
  readonly topicId: string;
  readonly claimId: string;
  readonly comparisonQuestion: string;
  readonly rationale: string;
  readonly sourceRefs: readonly string[];
  readonly sourceRefCount: number;
  readonly comparisonDimensions: readonly AitpLiteratureComparisonDimension[];
  readonly comparisonDimensionCount: number;
  readonly recordRefLookup: Readonly<Record<string, unknown>>;
  readonly draftRecordIntent: AitpLiteratureComparisonDraftRecordIntent;
  readonly suggestedSections: readonly Readonly<Record<string, unknown>>[];
  readonly recommendedNextEntrypoints: readonly AitpLiteratureComparisonNextEntrypoint[];
  readonly draftPolicy: AitpLiteratureComparisonDraftPolicy;
  readonly allowedNextToolCall: AitpLiteratureComparisonAllowedNextToolCall;
  readonly readSurfaceEffect: 'comparison_draft_only';
  readonly readOnly: true;
  readonly draftCreatesRecords: false;
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
  readonly truthSource: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureComparisonDimension {
  readonly dimension: string;
  readonly status: 'draft_placeholder';
  readonly requiresSourceReview: true;
  readonly summaryInputsTrusted: false;
  readonly createsRecordNow: false;
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly claimTrustMutation: 'none';
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureComparisonDraftRecordIntent {
  readonly kind: 'literature_comparison_record_candidate';
  readonly targetSurface: string;
  readonly targetEntrypoint: string;
  readonly status: 'draft_only';
  readonly requiresExplicitWriteSurface: true;
  readonly requiresSourceReview: true;
  readonly requiresEvidenceOrReferenceRecords: true;
  readonly requiresTrustPreflightBeforeClaimTrust: true;
  readonly createsRecordNow: false;
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly claimTrustMutation: 'none';
  readonly canUpdateClaimTrust: false;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureComparisonNextEntrypoint {
  readonly entrypoint: string;
  readonly surface: string;
  readonly reason: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureComparisonDraftPolicy {
  readonly source: string;
  readonly hostMayUseFor: readonly string[];
  readonly requiresExplicitNextEntrypoint: true;
  readonly allowedNextEntrypoints: readonly string[];
  readonly forbiddenUses: readonly string[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpLiteratureComparisonAllowedNextToolCall {
  readonly action: 'plan_primitive_tools';
  readonly actionId: 'source.compare_literature';
  readonly requiresExplicitNextAction: true;
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly claimTrustMutation: 'none';
  readonly raw: Readonly<Record<string, unknown>>;
}

export class AitpLiteratureComparisonDraftParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpLiteratureComparisonDraftParseError';
  }
}

const REQUIRED_FORBIDDEN_USES = [
  'literature_comparison_record',
  'evidence_support',
  'source_support_result',
  'validation_result',
  'write_execution',
  'final_gate_satisfaction',
  'claim_trust_update',
  'trust_apply',
] as const;

export function parseAitpLiteratureComparisonDraft(
  input: unknown,
): AitpLiteratureComparisonDraft {
  const payload = unwrapSurface(input, 'literature_comparison_draft');
  if (
    payload['kind'] !== 'literature_comparison_draft' ||
    payload['ok'] !== true ||
    payload['read_surface_effect'] !== 'comparison_draft_only' ||
    payload['read_only'] !== true ||
    payload['draft_creates_records'] !== false ||
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
    throw new AitpLiteratureComparisonDraftParseError(
      'AITP literature comparison draft must remain read-only, draft-only, no-write, and no-trust.',
    );
  }
  const sourceRefs = requiredStringArray(
    payload['source_refs'],
    'literature_comparison_draft.source_refs',
  );
  const comparisonDimensions = requiredRecordArray(
    payload['comparison_dimensions'],
    'literature_comparison_draft.comparison_dimensions',
  ).map(parseDimension);
  return {
    kind: 'literature_comparison_draft',
    sessionId: requiredString(payload, 'session_id'),
    topicId: requiredString(payload, 'topic_id'),
    claimId: stringValue(payload['claim_id']) ?? '',
    comparisonQuestion: requiredString(payload, 'comparison_question'),
    rationale: stringValue(payload['rationale']) ?? '',
    sourceRefs,
    sourceRefCount: requiredNumber(payload, 'source_ref_count'),
    comparisonDimensions,
    comparisonDimensionCount: requiredNumber(payload, 'comparison_dimension_count'),
    recordRefLookup: requiredRecord(
      payload['record_ref_lookup'],
      'literature_comparison_draft.record_ref_lookup',
    ),
    draftRecordIntent: parseDraftRecordIntent(
      requiredRecord(
        payload['draft_record_intent'],
        'literature_comparison_draft.draft_record_intent',
      ),
    ),
    suggestedSections: requiredRecordArray(
      payload['suggested_sections'],
      'literature_comparison_draft.suggested_sections',
    ),
    recommendedNextEntrypoints: requiredRecordArray(
      payload['recommended_next_entrypoints'],
      'literature_comparison_draft.recommended_next_entrypoints',
    ).map(parseNextEntrypoint),
    draftPolicy: parsePolicy(
      requiredRecord(payload['draft_policy'], 'literature_comparison_draft.draft_policy'),
    ),
    allowedNextToolCall: parseAllowedNextToolCall(
      requiredRecord(
        payload['allowed_next_tool_call'],
        'literature_comparison_draft.allowed_next_tool_call',
      ),
    ),
    readSurfaceEffect: 'comparison_draft_only',
    readOnly: true,
    draftCreatesRecords: false,
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
    truthSource: requiredString(payload, 'truth_source'),
    raw: payload,
  };
}

function parseDimension(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureComparisonDimension {
  if (
    raw['status'] !== 'draft_placeholder' ||
    raw['requires_source_review'] !== true ||
    raw['summary_inputs_trusted'] !== false ||
    raw['creates_record_now'] !== false ||
    raw['records_validation_result'] !== false ||
    raw['source_support_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none'
  ) {
    throw new AitpLiteratureComparisonDraftParseError(
      'AITP literature comparison dimensions must remain source-review placeholders.',
    );
  }
  return {
    dimension: requiredString(raw, 'dimension'),
    status: 'draft_placeholder',
    requiresSourceReview: true,
    summaryInputsTrusted: false,
    createsRecordNow: false,
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    raw,
  };
}

function parseDraftRecordIntent(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureComparisonDraftRecordIntent {
  if (
    raw['kind'] !== 'literature_comparison_record_candidate' ||
    raw['status'] !== 'draft_only' ||
    raw['requires_explicit_write_surface'] !== true ||
    raw['requires_source_review'] !== true ||
    raw['requires_evidence_or_reference_records'] !== true ||
    raw['requires_trust_preflight_before_claim_trust'] !== true ||
    raw['creates_record_now'] !== false ||
    raw['records_validation_result'] !== false ||
    raw['source_support_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none' ||
    raw['can_update_claim_trust'] !== false
  ) {
    throw new AitpLiteratureComparisonDraftParseError(
      'AITP literature comparison draft intent must remain draft-only.',
    );
  }
  return {
    kind: 'literature_comparison_record_candidate',
    targetSurface: stringValue(raw['target_surface']) ?? '',
    targetEntrypoint: stringValue(raw['target_entrypoint']) ?? '',
    status: 'draft_only',
    requiresExplicitWriteSurface: true,
    requiresSourceReview: true,
    requiresEvidenceOrReferenceRecords: true,
    requiresTrustPreflightBeforeClaimTrust: true,
    createsRecordNow: false,
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
    raw,
  };
}

function parsePolicy(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureComparisonDraftPolicy {
  const forbiddenUses = requiredStringArray(
    raw['forbidden_uses'],
    'literature_comparison_draft.draft_policy.forbidden_uses',
  );
  for (const forbiddenUse of REQUIRED_FORBIDDEN_USES) {
    if (!forbiddenUses.includes(forbiddenUse)) {
      throw new AitpLiteratureComparisonDraftParseError(
        `AITP literature comparison draft policy must forbid ${forbiddenUse}.`,
      );
    }
  }
  if (raw['requires_explicit_next_entrypoint'] !== true) {
    throw new AitpLiteratureComparisonDraftParseError(
      'AITP literature comparison draft policy must require an explicit next entrypoint.',
    );
  }
  return {
    source: requiredString(raw, 'source'),
    hostMayUseFor: requiredStringArray(
      raw['host_may_use_for'],
      'literature_comparison_draft.draft_policy.host_may_use_for',
    ),
    requiresExplicitNextEntrypoint: true,
    allowedNextEntrypoints: requiredStringArray(
      raw['allowed_next_entrypoints'],
      'literature_comparison_draft.draft_policy.allowed_next_entrypoints',
    ),
    forbiddenUses,
    raw,
  };
}

function parseAllowedNextToolCall(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureComparisonAllowedNextToolCall {
  if (
    raw['action'] !== 'plan_primitive_tools' ||
    raw['action_id'] !== 'source.compare_literature' ||
    raw['requires_explicit_next_action'] !== true ||
    raw['records_validation_result'] !== false ||
    raw['source_support_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none'
  ) {
    throw new AitpLiteratureComparisonDraftParseError(
      'AITP literature comparison draft allowed next call must be bounded source.compare_literature planning only.',
    );
  }
  return {
    action: 'plan_primitive_tools',
    actionId: 'source.compare_literature',
    requiresExplicitNextAction: true,
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    raw,
  };
}

function parseNextEntrypoint(
  raw: Readonly<Record<string, unknown>>,
): AitpLiteratureComparisonNextEntrypoint {
  return {
    entrypoint: requiredString(raw, 'entrypoint'),
    surface: stringValue(raw['surface']) ?? '',
    reason: stringValue(raw['reason']) ?? '',
    raw,
  };
}

function unwrapSurface(input: unknown, key: string): Readonly<Record<string, unknown>> {
  const raw = requiredRecord(input, 'AITP literature comparison draft payload');
  const nested = raw[key];
  if (nested !== undefined) return requiredRecord(nested, key);
  return raw;
}

function requiredRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AitpLiteratureComparisonDraftParseError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredRecordArray(value: unknown, label: string): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) {
    throw new AitpLiteratureComparisonDraftParseError(`${label} must be an array.`);
  }
  return value.map((item, index) => requiredRecord(item, `${label}[${String(index)}]`));
}

function requiredString(raw: Readonly<Record<string, unknown>>, key: string): string {
  const value = stringValue(raw[key]);
  if (value === undefined || value.length === 0) {
    throw new AitpLiteratureComparisonDraftParseError(`${key} must be a non-empty string.`);
  }
  return value;
}

function requiredNumber(raw: Readonly<Record<string, unknown>>, key: string): number {
  const value = raw[key];
  if (typeof value !== 'number') {
    throw new AitpLiteratureComparisonDraftParseError(`${key} must be a number.`);
  }
  return value;
}

function requiredStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new AitpLiteratureComparisonDraftParseError(`${label} must be a string array.`);
  }
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
