import { AITP_CURATED_RAG_CATALOG_VERSION, AitpCuratedRagParseError } from './curated-rag';

const FORBIDDEN_HEURISTIC_USES = [
  'evidence_support',
  'validation_result',
  'claim_trust_update',
  'trust_apply',
  'final_gate_satisfaction',
] as const;

const PROMOTION_PATH = [
  'source_asset',
  'reference_location',
  'evidence',
  'validation',
  'trust_preflight',
] as const;

export interface AitpCuratedRagIngestResult {
  readonly ok: true;
  readonly kind: 'curated_rag_ingest_result';
  readonly catalogVersion: string;
  readonly stateEffect: 'curated_rag_manifest_write';
  readonly truthSource: 'curated_rag_ingestion';
  readonly corpusId: string;
  readonly manifestPath: string;
  readonly indexPath: string;
  readonly manifestHash: string;
  readonly indexStatus: string;
  readonly documentCount: number;
  readonly chunkCount: number;
  readonly documentIds: readonly string[];
  readonly chunkIds: readonly string[];
  readonly sourcePaths: readonly string[];
  readonly rebuildIndex: boolean;
  readonly retrievalRole: 'heuristic_context';
  readonly orientationOnly: true;
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
  readonly recordsValidationResult: false;
  readonly claimTrustMutation: 'none';
  readonly requiresPromotionForClaimSupport: true;
  readonly forbiddenUses: readonly string[];
  readonly promotionRequiredBeforeClaimSupport: true;
  readonly promotionPath: readonly string[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export function parseAitpCuratedRagIngestResult(
  input: unknown,
): AitpCuratedRagIngestResult {
  const payload = unwrapSurface(input, 'curated_rag_ingest_result');
  if (payload['kind'] !== 'curated_rag_ingest_result') {
    throw new AitpCuratedRagParseError('AITP curated RAG ingest payload has the wrong kind.');
  }
  if (payload['catalog_version'] !== AITP_CURATED_RAG_CATALOG_VERSION) {
    throw new AitpCuratedRagParseError('AITP curated RAG ingest catalog version is unsupported.');
  }
  if (
    payload['ok'] !== true ||
    payload['state_effect'] !== 'curated_rag_manifest_write' ||
    payload['truth_source'] !== 'curated_rag_ingestion'
  ) {
    throw new AitpCuratedRagParseError(
      'AITP curated RAG ingest must be a manifest-write result.',
    );
  }
  assertNoTrust(payload);
  const documentIds = requiredStringArray(payload['document_ids'], 'document_ids');
  const chunkIds = requiredStringArray(payload['chunk_ids'], 'chunk_ids');
  const documentCount = requiredNumber(payload['document_count'], 'document_count');
  const chunkCount = requiredNumber(payload['chunk_count'], 'chunk_count');
  if (documentCount !== documentIds.length || chunkCount !== chunkIds.length) {
    throw new AitpCuratedRagParseError('AITP curated RAG ingest counts do not match ids.');
  }
  const forbiddenUses = requiredStringArray(payload['forbidden_uses'], 'forbidden_uses');
  for (const forbidden of FORBIDDEN_HEURISTIC_USES) {
    if (!forbiddenUses.includes(forbidden)) {
      throw new AitpCuratedRagParseError(`AITP curated RAG ingest must forbid ${forbidden}.`);
    }
  }
  const promotionPath = requiredStringArray(payload['promotion_path'], 'promotion_path');
  if (!sameStrings(promotionPath, PROMOTION_PATH)) {
    throw new AitpCuratedRagParseError('AITP curated RAG ingest promotion path is unsupported.');
  }
  return {
    ok: true,
    kind: 'curated_rag_ingest_result',
    catalogVersion: AITP_CURATED_RAG_CATALOG_VERSION,
    stateEffect: 'curated_rag_manifest_write',
    truthSource: 'curated_rag_ingestion',
    corpusId: requiredString(payload, 'corpus_id'),
    manifestPath: requiredString(payload, 'manifest_path'),
    indexPath: requiredString(payload, 'index_path'),
    manifestHash: requiredString(payload, 'manifest_hash'),
    indexStatus: requiredString(payload, 'index_status'),
    documentCount,
    chunkCount,
    documentIds,
    chunkIds,
    sourcePaths: requiredStringArray(payload['source_paths'], 'source_paths'),
    rebuildIndex: payload['rebuild_index'] === true,
    retrievalRole: 'heuristic_context',
    orientationOnly: true,
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    requiresPromotionForClaimSupport: true,
    forbiddenUses,
    promotionRequiredBeforeClaimSupport: true,
    promotionPath,
    raw: payload,
  };
}

function assertNoTrust(payload: Readonly<Record<string, unknown>>): void {
  if (
    payload['retrieval_role'] !== 'heuristic_context' ||
    payload['orientation_only'] !== true ||
    payload['summary_inputs_trusted'] !== false ||
    payload['can_update_claim_trust'] !== false ||
    payload['records_validation_result'] !== false ||
    payload['claim_trust_mutation'] !== 'none' ||
    payload['requires_promotion_for_claim_support'] !== true ||
    payload['promotion_required_before_claim_support'] !== true
  ) {
    throw new AitpCuratedRagParseError(
      'AITP curated RAG ingest must remain heuristic and no-trust.',
    );
  }
}

function unwrapSurface(input: unknown, key: string): Readonly<Record<string, unknown>> {
  if (!isRecord(input)) {
    throw new AitpCuratedRagParseError('AITP curated RAG ingest payload must be an object.');
  }
  if (isRecord(input[key])) return input[key];
  return input;
}

function requiredString(raw: Readonly<Record<string, unknown>>, key: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new AitpCuratedRagParseError(`${key} must be a non-empty string.`);
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throw new AitpCuratedRagParseError(`${label} must be a non-negative integer.`);
}

function requiredStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new AitpCuratedRagParseError(`${label} must be a string array.`);
  }
  const strings = value
    .map((item) => (typeof item === 'string' ? item.trim() : undefined))
    .filter((item): item is string => item !== undefined && item.length > 0);
  if (strings.length !== value.length) {
    throw new AitpCuratedRagParseError(`${label} must contain only strings.`);
  }
  return strings;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
