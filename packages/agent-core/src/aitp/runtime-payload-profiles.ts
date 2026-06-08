import type { PrimitiveToolLifecycleEnvelope } from '../agent/tool-lifecycle';
import type { WorkFrame } from '../research-action';

export const AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION =
  'aitp.v5.runtime_payload_profiles.v1';

export type AitpRuntimePayloadCaptureMode = 'controlled_auto' | 'explicit_request';
export type AitpRuntimePayloadTargetOperation = 'recordToolRun';
export type AitpRuntimePayloadClaimTrustMutation = 'none';

export interface AitpRuntimePayloadProfilesCatalog {
  readonly kind: 'runtime_payload_profiles';
  readonly catalogVersion: string;
  readonly truthSource: 'runtime_payload_profile_catalog';
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
  readonly profileCount: number;
  readonly profileIndex: readonly string[];
  readonly profiles: readonly AitpRuntimePayloadProfile[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRuntimePayloadProfile {
  readonly profileId: string;
  readonly hostEvent: string;
  readonly targetOperation: AitpRuntimePayloadTargetOperation;
  readonly targetEntrypoint: string;
  readonly targetRecordAction: string;
  readonly targetSurface: string;
  readonly requiredHostFields: readonly string[];
  readonly optionalHostFields: readonly string[];
  readonly payloadKeyCase: string;
  readonly capturePolicy: AitpRuntimePayloadCapturePolicy;
  readonly payloadTemplate: Readonly<Record<string, unknown>>;
  readonly resultSemantics: AitpRuntimePayloadResultSemantics;
  readonly strictBoundary: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRuntimePayloadCapturePolicy {
  readonly captureMode: AitpRuntimePayloadCaptureMode;
  readonly hostTrigger: string;
  readonly requiresConfiguredBridge: true;
  readonly requiresScopedTopicAndClaim: true;
  readonly requiresToolCallId: boolean;
  readonly captureGranularity: string;
  readonly missingScopeBehavior: 'skip_with_reason';
  readonly bulkAutoCapture: false;
  readonly recordsValidationResult: false;
  readonly claimTrustMutation: AitpRuntimePayloadClaimTrustMutation;
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRuntimePayloadResultSemantics {
  readonly recordKind: string;
  readonly evidenceRefPrefix: string;
  readonly recordsValidationResult: false;
  readonly claimTrustMutation: AitpRuntimePayloadClaimTrustMutation;
  readonly canUpdateClaimTrust: false;
  readonly summaryInputsTrusted: false;
  readonly raw: Readonly<Record<string, unknown>>;
}

export class AitpRuntimePayloadProfilesParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpRuntimePayloadProfilesParseError';
  }
}

export const PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE =
  'primitive_tool_lifecycle_to_tool_run';

export function parseAitpRuntimePayloadProfilesCatalog(
  input: unknown,
): AitpRuntimePayloadProfilesCatalog {
  const payload = unwrapRuntimePayloadProfiles(input);
  if (payload['kind'] !== 'runtime_payload_profiles') {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload profiles payload has the wrong kind.',
    );
  }
  if (payload['catalog_version'] !== AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION) {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload profiles catalog version is unsupported.',
    );
  }
  if (payload['truth_source'] !== 'runtime_payload_profile_catalog') {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload profiles truth source must be runtime_payload_profile_catalog.',
    );
  }
  if (payload['summary_inputs_trusted'] !== false || payload['can_update_claim_trust'] !== false) {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload profiles must remain no-trust read metadata.',
    );
  }

  const profiles = requiredRecordArray(payload['profiles'], 'runtime_payload_profiles.profiles')
    .map(parseRuntimePayloadProfile);
  const profileIndex = requiredStringArray(
    payload['profile_index'],
    'runtime_payload_profiles.profile_index',
  );
  if (numberValue(payload['profile_count']) !== profiles.length) {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload profiles profile_count does not match profiles length.',
    );
  }
  if (!sameStrings(profileIndex, profiles.map((profile) => profile.profileId))) {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload profiles profile_index does not match profiles order.',
    );
  }

  return {
    kind: 'runtime_payload_profiles',
    catalogVersion: AITP_RUNTIME_PAYLOAD_PROFILE_CATALOG_VERSION,
    truthSource: 'runtime_payload_profile_catalog',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    profileCount: profiles.length,
    profileIndex,
    profiles,
    raw: payload,
  };
}

export function aitpRuntimePayloadProfileById(
  catalog: AitpRuntimePayloadProfilesCatalog,
  profileId: string,
): AitpRuntimePayloadProfile | undefined {
  return catalog.profiles.find((profile) => profile.profileId === profileId);
}

export interface PrimitiveToolLifecycleAitpToolRunPayloadOptions {
  readonly topicId?: string | undefined;
  readonly claimId?: string | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
}

export function buildPrimitiveToolLifecycleAitpToolRunPayload(
  envelope: PrimitiveToolLifecycleEnvelope,
  workFrame?: WorkFrame | undefined,
  options: PrimitiveToolLifecycleAitpToolRunPayloadOptions = {},
): Readonly<Record<string, unknown>> | undefined {
  const topicId = firstText(options.topicId, workFrame?.topic);
  const claimId = firstText(
    options.claimId,
    firstClaimRef(options.sourceRefs),
    firstClaimRef(workFrame?.sourceRefs),
    firstClaimRef(workFrame?.activeObjectIds),
  );
  if (!hasText(topicId) || !hasText(claimId)) return undefined;

  const completed = envelope.completed;
  const started = envelope.started;
  const sourceRefs = uniqueStrings([
    ...(options.sourceRefs ?? []),
    ...(workFrame?.sourceRefs ?? []),
    ...(workFrame?.activeObjectIds ?? []),
    `tool:${completed.toolName}`,
    `tool_call:${completed.toolCallId}`,
  ]);
  return {
    recipeId: `primitive_tool:${safeSegment(completed.toolName)}:${safeSegment(completed.toolCallId)}`,
    toolFamily: 'primitive_tool',
    toolName: completed.toolName,
    topicId,
    claimId,
    inputs: {
      argsSummary: started?.argsSummary ?? '',
      cwd: completed.cwd ?? started?.cwd ?? '',
      sourceRefs,
    },
    outputs: {
      toolCallId: completed.toolCallId,
      toolName: completed.toolName,
      status: completed.status,
      isError: completed.isError,
      outputKind: completed.outputKind,
      outputSummary: completed.outputSummary,
      turnId: completed.turnId,
      ...(completed.step === undefined ? {} : { step: completed.step }),
      ...(completed.stepUuid === undefined ? {} : { stepUuid: completed.stepUuid }),
      ...(completed.durationMs === undefined ? {} : { durationMs: completed.durationMs }),
      artifactRefs: completed.artifactRefs,
      ...(completed.workFrameId === undefined ? {} : { workFrameId: completed.workFrameId }),
      ...(completed.actionCallId === undefined ? {} : { actionCallId: completed.actionCallId }),
    },
    environment: {
      captureTool: 'hakimi.primitive_tool_lifecycle',
      payloadProfile: PRIMITIVE_TOOL_LIFECYCLE_TO_TOOL_RUN_PROFILE,
      summaryInputsTrusted: false,
      canUpdateClaimTrust: false,
    },
    evidenceStatus: evidenceStatusForPrimitiveTool(completed.status),
    artifactIds: normalizeArtifactIds(completed.artifactRefs),
    sourceRefs,
  };
}

function evidenceStatusForPrimitiveTool(status: string): string {
  return status === 'failed' ? 'contradicts' : 'unreviewed';
}

function normalizeArtifactIds(refs: readonly string[]): readonly string[] {
  return refs
    .map((ref) => ref.trim())
    .filter((ref) => ref.startsWith('aitp:artifact:') || ref.startsWith('artifact:'))
    .map((ref) => ref.replace(/^aitp:artifact:/, '').replace(/^artifact:/, ''));
}

function firstClaimRef(values?: readonly string[]): string | undefined {
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.startsWith('aitp:claim:')) return normalized.slice('aitp:claim:'.length);
    if (normalized.startsWith('claim:')) return normalized.slice('claim:'.length);
  }
  return undefined;
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return values.find(hasText);
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || result.includes(normalized)) continue;
    result.push(normalized);
  }
  return result;
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._:-]+/g, '_') || 'unknown';
}

function unwrapRuntimePayloadProfiles(input: unknown): Readonly<Record<string, unknown>> {
  const record = requiredRecord(input, 'runtime_payload_profiles_payload');
  if (isRecord(record['runtime_payload_profiles'])) {
    return record['runtime_payload_profiles'];
  }
  return record;
}

function parseRuntimePayloadProfile(
  raw: Readonly<Record<string, unknown>>,
): AitpRuntimePayloadProfile {
  const targetOperation = requiredString(raw, 'target_operation');
  if (targetOperation !== 'recordToolRun') {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload profile target_operation must be recordToolRun.',
    );
  }
  return {
    profileId: requiredString(raw, 'profile_id'),
    hostEvent: requiredString(raw, 'host_event'),
    targetOperation,
    targetEntrypoint: requiredString(raw, 'target_entrypoint'),
    targetRecordAction: requiredString(raw, 'target_record_action'),
    targetSurface: requiredString(raw, 'target_surface'),
    requiredHostFields: requiredStringArray(raw['required_host_fields'], 'required_host_fields'),
    optionalHostFields: requiredStringArray(raw['optional_host_fields'], 'optional_host_fields'),
    payloadKeyCase: requiredString(raw, 'payload_key_case'),
    capturePolicy: parseCapturePolicy(
      requiredRecord(raw['capture_policy'], 'capture_policy'),
    ),
    payloadTemplate: requiredRecord(raw['payload_template'], 'payload_template'),
    resultSemantics: parseResultSemantics(
      requiredRecord(raw['result_semantics'], 'result_semantics'),
    ),
    strictBoundary: requiredString(raw, 'strict_boundary'),
    raw,
  };
}

function parseCapturePolicy(
  raw: Readonly<Record<string, unknown>>,
): AitpRuntimePayloadCapturePolicy {
  const captureMode = requiredString(raw, 'capture_mode');
  if (captureMode !== 'controlled_auto' && captureMode !== 'explicit_request') {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload capture mode must be controlled_auto or explicit_request.',
    );
  }
  if (
    raw['requires_configured_bridge'] !== true ||
    raw['requires_scoped_topic_and_claim'] !== true ||
    raw['bulk_auto_capture'] !== false ||
    raw['records_validation_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none' ||
    raw['summary_inputs_trusted'] !== false ||
    raw['can_update_claim_trust'] !== false
  ) {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload capture policy must preserve no-trust capture boundaries.',
    );
  }
  if (raw['missing_scope_behavior'] !== 'skip_with_reason') {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload capture policy must skip missing scope with a reason.',
    );
  }
  return {
    captureMode,
    hostTrigger: requiredString(raw, 'host_trigger'),
    requiresConfiguredBridge: true,
    requiresScopedTopicAndClaim: true,
    requiresToolCallId: raw['requires_tool_call_id'] === true,
    captureGranularity: requiredString(raw, 'capture_granularity'),
    missingScopeBehavior: 'skip_with_reason',
    bulkAutoCapture: false,
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    raw,
  };
}

function parseResultSemantics(
  raw: Readonly<Record<string, unknown>>,
): AitpRuntimePayloadResultSemantics {
  if (
    raw['records_validation_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none' ||
    raw['can_update_claim_trust'] !== false ||
    raw['summary_inputs_trusted'] !== false
  ) {
    throw new AitpRuntimePayloadProfilesParseError(
      'AITP runtime payload result semantics must remain provenance-only.',
    );
  }
  return {
    recordKind: requiredString(raw, 'record_kind'),
    evidenceRefPrefix: requiredString(raw, 'evidence_ref_prefix'),
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
    summaryInputsTrusted: false,
    raw,
  };
}

function requiredRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (isRecord(value)) return value;
  throw new AitpRuntimePayloadProfilesParseError(`${label} must be an object.`);
}

function requiredRecordArray(
  value: unknown,
  label: string,
): readonly Readonly<Record<string, unknown>>[] {
  if (Array.isArray(value) && value.every(isRecord)) return value;
  throw new AitpRuntimePayloadProfilesParseError(`${label} must be an object array.`);
}

function requiredString(raw: Readonly<Record<string, unknown>>, key: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new AitpRuntimePayloadProfilesParseError(`${key} must be a non-empty string.`);
}

function requiredStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new AitpRuntimePayloadProfilesParseError(`${label} must be a string array.`);
  }
  const strings = value
    .map((item) => (typeof item === 'string' ? item.trim() : undefined))
    .filter((item): item is string => item !== undefined && item.length > 0);
  if (strings.length !== value.length) {
    throw new AitpRuntimePayloadProfilesParseError(`${label} must contain only strings.`);
  }
  return strings;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
