export type AitpRecordRefLookupStatus =
  | 'found'
  | 'not_found'
  | 'unsupported_kind'
  | 'malformed_ref';

export interface AitpRecordRefLookup {
  readonly kind: 'record_ref_lookup';
  readonly lookupScope: 'typed_record_existence_only';
  readonly lookupCount: number;
  readonly foundCount: number;
  readonly missingCount: number;
  readonly unsupportedCount: number;
  readonly malformedCount: number;
  readonly refs: readonly AitpRecordRefLookupItem[];
  readonly supportedRefKinds: readonly string[];
  readonly readSurfaceEffect: 'record_existence_check_only';
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly evidenceCreated: false;
  readonly validationCreated: false;
  readonly claimTrustMutation: 'none';
  readonly canUpdateClaimTrust: false;
  readonly summaryInputsTrusted: false;
  readonly orientationOnly: true;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpRecordRefLookupItem {
  readonly ref: string;
  readonly refKind: string;
  readonly recordId: string;
  readonly idField: string;
  readonly surface: string;
  readonly recordRole: string;
  readonly storeScope: string;
  readonly status: AitpRecordRefLookupStatus;
  readonly recordConfirmed: boolean;
  readonly topicId: string;
  readonly claimId: string;
  readonly recordKind: string;
  readonly orientationOnlyRecord: boolean;
  readonly canUpdateRecordClaimTrust: false;
  readonly readSurfaceEffect: 'record_existence_check_only';
  readonly recordsValidationResult: false;
  readonly sourceSupportResult: false;
  readonly claimTrustMutation: 'none';
  readonly canUpdateClaimTrust: false;
  readonly diagnostic: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export class AitpRecordRefLookupParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpRecordRefLookupParseError';
  }
}

export function parseAitpRecordRefLookup(input: unknown): AitpRecordRefLookup {
  const payload = unwrapSurface(input, 'record_ref_lookup');
  if (payload['kind'] !== 'record_ref_lookup') {
    throw new AitpRecordRefLookupParseError('AITP record-ref lookup payload has the wrong kind.');
  }
  if (
    payload['lookup_scope'] !== 'typed_record_existence_only' ||
    payload['read_surface_effect'] !== 'record_existence_check_only' ||
    payload['records_validation_result'] !== false ||
    payload['source_support_result'] !== false ||
    payload['evidence_created'] !== false ||
    payload['validation_created'] !== false ||
    payload['claim_trust_mutation'] !== 'none' ||
    payload['can_update_claim_trust'] !== false ||
    payload['summary_inputs_trusted'] !== false ||
    payload['orientation_only'] !== true
  ) {
    throw new AitpRecordRefLookupParseError(
      'AITP record-ref lookup must remain read-only, existence-only, and no-trust.',
    );
  }
  const refs = requiredRecordArray(payload['refs'], 'record_ref_lookup.refs').map(parseLookupItem);
  const lookupCount = numberValue(payload['lookup_count'], 'record_ref_lookup.lookup_count');
  const foundCount = numberValue(payload['found_count'], 'record_ref_lookup.found_count');
  const missingCount = numberValue(payload['missing_count'], 'record_ref_lookup.missing_count');
  const unsupportedCount = numberValue(
    payload['unsupported_count'],
    'record_ref_lookup.unsupported_count',
  );
  const malformedCount = numberValue(
    payload['malformed_count'],
    'record_ref_lookup.malformed_count',
  );
  if (
    lookupCount !== refs.length ||
    foundCount !== refs.filter((item) => item.status === 'found').length ||
    missingCount !== refs.filter((item) => item.status === 'not_found').length ||
    unsupportedCount !== refs.filter((item) => item.status === 'unsupported_kind').length ||
    malformedCount !== refs.filter((item) => item.status === 'malformed_ref').length
  ) {
    throw new AitpRecordRefLookupParseError('AITP record-ref lookup counts do not match refs.');
  }
  return {
    kind: 'record_ref_lookup',
    lookupScope: 'typed_record_existence_only',
    lookupCount,
    foundCount,
    missingCount,
    unsupportedCount,
    malformedCount,
    refs,
    supportedRefKinds: requiredStringArray(
      payload['supported_ref_kinds'],
      'record_ref_lookup.supported_ref_kinds',
    ),
    readSurfaceEffect: 'record_existence_check_only',
    recordsValidationResult: false,
    sourceSupportResult: false,
    evidenceCreated: false,
    validationCreated: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
    summaryInputsTrusted: false,
    orientationOnly: true,
    raw: payload,
  };
}

function parseLookupItem(raw: Readonly<Record<string, unknown>>): AitpRecordRefLookupItem {
  if (
    raw['read_surface_effect'] !== 'record_existence_check_only' ||
    raw['records_validation_result'] !== false ||
    raw['source_support_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none' ||
    raw['can_update_claim_trust'] !== false
  ) {
    throw new AitpRecordRefLookupParseError(
      'AITP record-ref lookup item must remain read-only and no-trust.',
    );
  }
  const status = parseStatus(raw['status']);
  const recordConfirmed = booleanValue(raw['record_confirmed'], 'record_ref_lookup.refs.record_confirmed');
  if (status === 'found' && recordConfirmed !== true) {
    throw new AitpRecordRefLookupParseError('Found AITP record-ref lookup items must be confirmed.');
  }
  if (status !== 'found' && recordConfirmed !== false) {
    throw new AitpRecordRefLookupParseError('Non-found AITP record-ref lookup items must not be confirmed.');
  }
  const canUpdateRecordClaimTrust = booleanValue(
    raw['can_update_record_claim_trust'],
    'record_ref_lookup.refs.can_update_record_claim_trust',
  );
  if (canUpdateRecordClaimTrust !== false) {
    throw new AitpRecordRefLookupParseError(
      'AITP record-ref lookup items must not expose record trust-update capability.',
    );
  }
  return {
    ref: requiredString(raw, 'ref'),
    refKind: stringValue(raw['ref_kind']) ?? '',
    recordId: stringValue(raw['record_id']) ?? '',
    idField: stringValue(raw['id_field']) ?? '',
    surface: stringValue(raw['surface']) ?? '',
    recordRole: stringValue(raw['record_role']) ?? '',
    storeScope: stringValue(raw['store_scope']) ?? '',
    status,
    recordConfirmed,
    topicId: stringValue(raw['topic_id']) ?? '',
    claimId: stringValue(raw['claim_id']) ?? '',
    recordKind: stringValue(raw['record_kind']) ?? '',
    orientationOnlyRecord: booleanValue(raw['orientation_only_record'], 'record_ref_lookup.refs.orientation_only_record'),
    canUpdateRecordClaimTrust: false,
    readSurfaceEffect: 'record_existence_check_only',
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
    diagnostic: stringValue(raw['diagnostic']) ?? '',
    raw,
  };
}

function parseStatus(value: unknown): AitpRecordRefLookupStatus {
  if (
    value === 'found' ||
    value === 'not_found' ||
    value === 'unsupported_kind' ||
    value === 'malformed_ref'
  ) {
    return value;
  }
  throw new AitpRecordRefLookupParseError('AITP record-ref lookup item has unsupported status.');
}

function unwrapSurface(input: unknown, key: string): Readonly<Record<string, unknown>> {
  const raw = requiredRecord(input, 'AITP record-ref lookup payload');
  const nested = raw[key];
  if (nested !== undefined) return requiredRecord(nested, key);
  return raw;
}

function requiredRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AitpRecordRefLookupParseError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredRecordArray(value: unknown, label: string): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) {
    throw new AitpRecordRefLookupParseError(`${label} must be an array.`);
  }
  return value.map((item, index) => requiredRecord(item, `${label}[${String(index)}]`));
}

function requiredString(raw: Readonly<Record<string, unknown>>, key: string): string {
  const value = stringValue(raw[key]);
  if (value === undefined || value.length === 0) {
    throw new AitpRecordRefLookupParseError(`${key} must be a non-empty string.`);
  }
  return value;
}

function requiredStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new AitpRecordRefLookupParseError(`${label} must be a string array.`);
  }
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AitpRecordRefLookupParseError(`${label} must be a boolean.`);
  }
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new AitpRecordRefLookupParseError(`${label} must be an integer.`);
  }
  return value as number;
}
