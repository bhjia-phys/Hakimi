import type { WorkFrame } from '../research-action';

export interface AitpClaimRelationMapEntry {
  readonly recordKind: string;
  readonly recordId: string;
  readonly relationToClaim: string;
  readonly status: string;
  readonly summary: string;
  readonly reason: string;
  readonly sourceRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly toolRunIds: readonly string[];
  readonly artifactIds: readonly string[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpClaimRelationMap {
  readonly kind: 'claim_relation_map';
  readonly topicId: string;
  readonly sessionId: string;
  readonly claimId: string;
  readonly claimStatement: string;
  readonly confidenceState: string;
  readonly evidenceProfile: string;
  readonly latestClaimStatus: Readonly<Record<string, unknown>>;
  readonly supportedBy: readonly AitpClaimRelationMapEntry[];
  readonly limitedBy: readonly AitpClaimRelationMapEntry[];
  readonly contradictedBy: readonly AitpClaimRelationMapEntry[];
  readonly notTestedBy: readonly AitpClaimRelationMapEntry[];
  readonly objectRelations: readonly Readonly<Record<string, unknown>>[];
  readonly canSay: readonly string[];
  readonly cannotSay: readonly string[];
  readonly currentBlockers: readonly string[];
  readonly nextValidActions: readonly string[];
  readonly sourceRecords: Readonly<Record<string, readonly string[]>>;
  readonly derivedFrom: readonly string[];
  readonly truthSource: false;
  readonly orientationOnly: true;
  readonly summaryInputsTrusted: false;
  readonly canUpdateKernelState: false;
  readonly canUpdateClaimTrust: false;
  readonly trustUpdateAllowed: false;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpClaimRelationMapProviderInput {
  readonly workFrame: WorkFrame;
  readonly signal?: AbortSignal | undefined;
}

export interface AitpClaimRelationMapProvider {
  getClaimRelationMap(
    input: AitpClaimRelationMapProviderInput,
  ): Promise<AitpClaimRelationMap | null | undefined>;
}

export class AitpClaimRelationMapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpClaimRelationMapParseError';
  }
}

export function parseAitpClaimRelationMap(input: unknown): AitpClaimRelationMap {
  if (!isRecord(input)) {
    throw new AitpClaimRelationMapParseError('AITP claim relation map must be an object.');
  }
  if (stringValue(input['kind']) !== 'claim_relation_map') {
    throw new AitpClaimRelationMapParseError('AITP payload kind must be "claim_relation_map".');
  }
  if (input['orientation_only'] !== true) {
    throw new AitpClaimRelationMapParseError('AITP claim relation map must be orientation-only.');
  }
  for (const key of [
    'truth_source',
    'summary_inputs_trusted',
    'can_update_kernel_state',
    'can_update_claim_trust',
    'trust_update_allowed',
  ]) {
    if (input[key] !== false) {
      throw new AitpClaimRelationMapParseError(
        `AITP claim relation map no-trust flag "${key}" must be false.`,
      );
    }
  }

  const conclusion = recordValue(valueFor(input, 'current_conclusion', 'currentConclusion'));
  const sourceRecords = recordOfStringArrays(valueFor(input, 'source_records', 'sourceRecords'));
  return {
    kind: 'claim_relation_map',
    topicId: stringValue(valueFor(input, 'topic_id', 'topicId')) ?? '',
    sessionId: stringValue(valueFor(input, 'session_id', 'sessionId')) ?? '',
    claimId: stringValue(valueFor(input, 'claim_id', 'claimId')) ?? '',
    claimStatement: stringValue(valueFor(input, 'claim_statement', 'claimStatement')) ?? '',
    confidenceState: stringValue(valueFor(input, 'confidence_state', 'confidenceState')) ?? '',
    evidenceProfile: stringValue(valueFor(input, 'evidence_profile', 'evidenceProfile')) ?? '',
    latestClaimStatus: recordValue(
      valueFor(input, 'latest_claim_status', 'latestClaimStatus'),
    ),
    supportedBy: objectArray(valueFor(input, 'supported_by', 'supportedBy')).map(parseEntry),
    limitedBy: objectArray(valueFor(input, 'limited_by', 'limitedBy')).map(parseEntry),
    contradictedBy: objectArray(valueFor(input, 'contradicted_by', 'contradictedBy')).map(parseEntry),
    notTestedBy: objectArray(valueFor(input, 'not_tested_by', 'notTestedBy')).map(parseEntry),
    objectRelations: objectArray(valueFor(input, 'object_relations', 'objectRelations')),
    canSay: stringArray(valueFor(conclusion, 'can_say', 'canSay')),
    cannotSay: stringArray(valueFor(conclusion, 'cannot_say', 'cannotSay')),
    currentBlockers: stringArray(valueFor(input, 'current_blockers', 'currentBlockers')),
    nextValidActions: stringArray(valueFor(input, 'next_valid_actions', 'nextValidActions')),
    sourceRecords,
    derivedFrom: stringArray(valueFor(input, 'derived_from', 'derivedFrom')),
    truthSource: false,
    orientationOnly: true,
    summaryInputsTrusted: false,
    canUpdateKernelState: false,
    canUpdateClaimTrust: false,
    trustUpdateAllowed: false,
    raw: input,
  };
}

function parseEntry(raw: Readonly<Record<string, unknown>>): AitpClaimRelationMapEntry {
  return {
    recordKind: stringValue(valueFor(raw, 'record_kind', 'recordKind')) ?? '',
    recordId: stringValue(valueFor(raw, 'record_id', 'recordId')) ?? '',
    relationToClaim: stringValue(valueFor(raw, 'relation_to_claim', 'relationToClaim')) ?? '',
    status: stringValue(raw['status']) ?? '',
    summary: stringValue(raw['summary']) ?? '',
    reason: stringValue(raw['reason']) ?? '',
    sourceRefs: stringArray(valueFor(raw, 'source_refs', 'sourceRefs')),
    evidenceRefs: stringArray(valueFor(raw, 'evidence_refs', 'evidenceRefs')),
    toolRunIds: stringArray(valueFor(raw, 'tool_run_ids', 'toolRunIds')),
    artifactIds: stringArray(valueFor(raw, 'artifact_ids', 'artifactIds')),
    raw,
  };
}

function recordOfStringArrays(value: unknown): Readonly<Record<string, readonly string[]>> {
  const record = recordValue(value);
  const result: Record<string, readonly string[]> = {};
  for (const [key, raw] of Object.entries(record)) {
    result[key] = stringArray(raw);
  }
  return result;
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function objectArray(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function valueFor(
  record: Readonly<Record<string, unknown>>,
  snakeKey: string,
  camelKey: string,
): unknown {
  return record[snakeKey] ?? record[camelKey];
}
