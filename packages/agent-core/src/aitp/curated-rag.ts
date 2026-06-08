export const AITP_CURATED_RAG_CATALOG_VERSION = 'aitp.v5.curated_rag_corpus.v1';

const ALLOWED_HEURISTIC_USES = [
  'conceptual_scaffolding',
  'literature_orientation',
  'derivation_scaffolding',
  'method_selection',
  'source_backtrace_suggestions',
] as const;
const FORBIDDEN_HEURISTIC_USES = [
  'evidence_support',
  'validation_result',
  'claim_trust_update',
  'trust_apply',
  'final_gate_satisfaction',
] as const;

export interface AitpCuratedRagCorpus {
  readonly kind: 'curated_rag_corpus';
  readonly catalogVersion: string;
  readonly truthSource: 'curated_rag_corpus_catalog';
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
  readonly retrievalPolicy: AitpCuratedRagRetrievalPolicy;
  readonly indexPolicy: AitpCuratedRagIndexPolicy;
  readonly corpusId: string;
  readonly documentCount: number;
  readonly chunkCount: number;
  readonly documentIndex: readonly string[];
  readonly chunkIndex: readonly string[];
  readonly documents: readonly AitpCuratedRagDocument[];
  readonly chunks: readonly AitpCuratedRagChunk[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpCuratedRagRetrievalPolicy {
  readonly resultRole: 'heuristic_context';
  readonly readSurfaceEffect: 'orientation_only';
  readonly allowedUses: readonly string[];
  readonly forbiddenUses: readonly string[];
  readonly recordsValidationResult: false;
  readonly claimTrustMutation: 'none';
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
  readonly requiresPromotionForClaimSupport: true;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpCuratedRagIndexPolicy {
  readonly activeIndexMode: 'lexical_fixture';
  readonly supportedIndexModes: readonly string[];
  readonly embeddingIndexRequired: false;
  readonly indexIsDerived: true;
  readonly derivedFrom: string;
  readonly staleIndexBehavior: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpCuratedRagDocument {
  readonly documentId: string;
  readonly title: string;
  readonly assetType: string;
  readonly sourceUri: string;
  readonly versionAnchor: Readonly<Record<string, unknown>>;
  readonly contentHash: string;
  readonly tags: readonly string[];
  readonly domainHints: readonly string[];
  readonly topicHints: readonly string[];
  readonly language: string;
  readonly priority: string;
  readonly intendedUse: string;
  readonly trustStatus: 'heuristic_context';
  readonly orientationOnly: true;
  readonly canUpdateClaimTrust: false;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpCuratedRagChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly anchor: Readonly<Record<string, unknown>>;
  readonly text: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly tokenEstimate: number;
  readonly contentHash: string;
  readonly retrievalRole: 'heuristic_context';
  readonly orientationOnly: true;
  readonly canUpdateClaimTrust: false;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpCuratedRagSearchResult {
  readonly kind: 'curated_rag_search_result';
  readonly catalogVersion: string;
  readonly query: string;
  readonly indexMode: 'lexical_fixture';
  readonly resultRole: 'heuristic_context';
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
  readonly recordsValidationResult: false;
  readonly claimTrustMutation: 'none';
  readonly requiresPromotionForClaimSupport: true;
  readonly resultCount: number;
  readonly results: readonly AitpCuratedRagSearchResultItem[];
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface AitpCuratedRagSearchResultItem {
  readonly chunkId: string;
  readonly documentId: string;
  readonly score: number;
  readonly retrievalRole: 'heuristic_context';
  readonly orientationOnly: true;
  readonly canUpdateClaimTrust: false;
  readonly summary: string;
  readonly text: string;
  readonly anchor: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
  readonly contentHash: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export class AitpCuratedRagParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpCuratedRagParseError';
  }
}

export function parseAitpCuratedRagCorpus(input: unknown): AitpCuratedRagCorpus {
  const payload = unwrapSurface(input, 'curated_rag_corpus');
  if (payload['kind'] !== 'curated_rag_corpus') {
    throw new AitpCuratedRagParseError('AITP curated RAG corpus payload has the wrong kind.');
  }
  assertCommonNoTrust(payload, 'AITP curated RAG corpus');
  if (payload['truth_source'] !== 'curated_rag_corpus_catalog') {
    throw new AitpCuratedRagParseError(
      'AITP curated RAG corpus truth source must be curated_rag_corpus_catalog.',
    );
  }
  const documents = requiredRecordArray(payload['documents'], 'curated_rag_corpus.documents')
    .map(parseDocument);
  const chunks = requiredRecordArray(payload['chunks'], 'curated_rag_corpus.chunks').map(parseChunk);
  const documentIndex = requiredStringArray(
    payload['document_index'],
    'curated_rag_corpus.document_index',
  );
  const chunkIndex = requiredStringArray(payload['chunk_index'], 'curated_rag_corpus.chunk_index');
  if (numberValue(payload['document_count']) !== documents.length) {
    throw new AitpCuratedRagParseError('AITP curated RAG document_count does not match.');
  }
  if (numberValue(payload['chunk_count']) !== chunks.length) {
    throw new AitpCuratedRagParseError('AITP curated RAG chunk_count does not match.');
  }
  if (!sameStrings(documentIndex, documents.map((document) => document.documentId))) {
    throw new AitpCuratedRagParseError('AITP curated RAG document_index does not match.');
  }
  if (!sameStrings(chunkIndex, chunks.map((chunk) => chunk.chunkId))) {
    throw new AitpCuratedRagParseError('AITP curated RAG chunk_index does not match.');
  }
  return {
    kind: 'curated_rag_corpus',
    catalogVersion: AITP_CURATED_RAG_CATALOG_VERSION,
    truthSource: 'curated_rag_corpus_catalog',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    retrievalPolicy: parseRetrievalPolicy(
      requiredRecord(payload['retrieval_policy'], 'curated_rag_corpus.retrieval_policy'),
    ),
    indexPolicy: parseIndexPolicy(
      requiredRecord(payload['index_policy'], 'curated_rag_corpus.index_policy'),
    ),
    corpusId: requiredString(payload, 'corpus_id'),
    documentCount: documents.length,
    chunkCount: chunks.length,
    documentIndex,
    chunkIndex,
    documents,
    chunks,
    raw: payload,
  };
}

export function parseAitpCuratedRagSearchResult(input: unknown): AitpCuratedRagSearchResult {
  const payload = unwrapSurface(input, 'curated_rag_search_result');
  if (payload['kind'] !== 'curated_rag_search_result') {
    throw new AitpCuratedRagParseError('AITP curated RAG search payload has the wrong kind.');
  }
  assertCommonNoTrust(payload, 'AITP curated RAG search result');
  assertSearchNoTrust(payload);
  const results = requiredRecordArray(payload['results'], 'curated_rag_search_result.results')
    .map(parseSearchResultItem);
  if (numberValue(payload['result_count']) !== results.length) {
    throw new AitpCuratedRagParseError('AITP curated RAG result_count does not match.');
  }
  return {
    kind: 'curated_rag_search_result',
    catalogVersion: AITP_CURATED_RAG_CATALOG_VERSION,
    query: requiredString(payload, 'query'),
    indexMode: 'lexical_fixture',
    resultRole: 'heuristic_context',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    requiresPromotionForClaimSupport: true,
    resultCount: results.length,
    results,
    raw: payload,
  };
}

function parseRetrievalPolicy(raw: Readonly<Record<string, unknown>>): AitpCuratedRagRetrievalPolicy {
  if (
    raw['result_role'] !== 'heuristic_context' ||
    raw['read_surface_effect'] !== 'orientation_only' ||
    raw['records_validation_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none' ||
    raw['summary_inputs_trusted'] !== false ||
    raw['can_update_claim_trust'] !== false ||
    raw['requires_promotion_for_claim_support'] !== true
  ) {
    throw new AitpCuratedRagParseError(
      'AITP curated RAG retrieval policy must remain heuristic and no-trust.',
    );
  }
  const allowedUses = requiredStringArray(raw['allowed_uses'], 'retrieval_policy.allowed_uses');
  const forbiddenUses = requiredStringArray(
    raw['forbidden_uses'],
    'retrieval_policy.forbidden_uses',
  );
  if (!sameStrings(allowedUses, ALLOWED_HEURISTIC_USES)) {
    throw new AitpCuratedRagParseError(
      'AITP curated RAG retrieval policy must allow only heuristic uses.',
    );
  }
  for (const forbidden of FORBIDDEN_HEURISTIC_USES) {
    if (!forbiddenUses.includes(forbidden)) {
      throw new AitpCuratedRagParseError(
        `AITP curated RAG retrieval policy must forbid ${forbidden}.`,
      );
    }
  }
  return {
    resultRole: 'heuristic_context',
    readSurfaceEffect: 'orientation_only',
    allowedUses,
    forbiddenUses,
    recordsValidationResult: false,
    claimTrustMutation: 'none',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
    requiresPromotionForClaimSupport: true,
    raw,
  };
}

function parseIndexPolicy(raw: Readonly<Record<string, unknown>>): AitpCuratedRagIndexPolicy {
  if (
    raw['active_index_mode'] !== 'lexical_fixture' ||
    raw['embedding_index_required'] !== false ||
    raw['index_is_derived'] !== true ||
    raw['derived_from'] !== 'curated_rag_chunk_manifest' ||
    raw['stale_index_behavior'] !== 'return_diagnostic_not_trust'
  ) {
    throw new AitpCuratedRagParseError(
      'AITP curated RAG index policy must remain derived lexical fixture metadata.',
    );
  }
  return {
    activeIndexMode: 'lexical_fixture',
    supportedIndexModes: requiredStringArray(
      raw['supported_index_modes'],
      'index_policy.supported_index_modes',
    ),
    embeddingIndexRequired: false,
    indexIsDerived: true,
    derivedFrom: 'curated_rag_chunk_manifest',
    staleIndexBehavior: 'return_diagnostic_not_trust',
    raw,
  };
}

function parseDocument(raw: Readonly<Record<string, unknown>>): AitpCuratedRagDocument {
  if (
    raw['trust_status'] !== 'heuristic_context' ||
    raw['orientation_only'] !== true ||
    raw['can_update_claim_trust'] !== false
  ) {
    throw new AitpCuratedRagParseError('AITP curated RAG documents must remain heuristic.');
  }
  return {
    documentId: requiredString(raw, 'document_id'),
    title: requiredString(raw, 'title'),
    assetType: requiredString(raw, 'asset_type'),
    sourceUri: requiredString(raw, 'source_uri'),
    versionAnchor: requiredRecord(raw['version_anchor'], 'document.version_anchor'),
    contentHash: requiredString(raw, 'content_hash'),
    tags: requiredStringArray(raw['tags'], 'document.tags'),
    domainHints: requiredStringArray(raw['domain_hints'], 'document.domain_hints'),
    topicHints: requiredStringArray(raw['topic_hints'], 'document.topic_hints'),
    language: requiredString(raw, 'language'),
    priority: requiredString(raw, 'priority'),
    intendedUse: requiredString(raw, 'intended_use'),
    trustStatus: 'heuristic_context',
    orientationOnly: true,
    canUpdateClaimTrust: false,
    raw,
  };
}

function parseChunk(raw: Readonly<Record<string, unknown>>): AitpCuratedRagChunk {
  if (
    raw['retrieval_role'] !== 'heuristic_context' ||
    raw['orientation_only'] !== true ||
    raw['can_update_claim_trust'] !== false
  ) {
    throw new AitpCuratedRagParseError('AITP curated RAG chunks must remain heuristic.');
  }
  const tokenEstimate = numberValue(raw['token_estimate']);
  if (tokenEstimate === undefined || tokenEstimate <= 0) {
    throw new AitpCuratedRagParseError('AITP curated RAG chunk token_estimate must be positive.');
  }
  return {
    chunkId: requiredString(raw, 'chunk_id'),
    documentId: requiredString(raw, 'document_id'),
    anchor: requiredRecord(raw['anchor'], 'chunk.anchor'),
    text: requiredString(raw, 'text'),
    summary: requiredString(raw, 'summary'),
    tags: requiredStringArray(raw['tags'], 'chunk.tags'),
    tokenEstimate,
    contentHash: requiredString(raw, 'content_hash'),
    retrievalRole: 'heuristic_context',
    orientationOnly: true,
    canUpdateClaimTrust: false,
    raw,
  };
}

function parseSearchResultItem(
  raw: Readonly<Record<string, unknown>>,
): AitpCuratedRagSearchResultItem {
  if (
    raw['retrieval_role'] !== 'heuristic_context' ||
    raw['orientation_only'] !== true ||
    raw['can_update_claim_trust'] !== false
  ) {
    throw new AitpCuratedRagParseError('AITP curated RAG search items must remain heuristic.');
  }
  const score = numberValue(raw['score']);
  if (score === undefined || score <= 0) {
    throw new AitpCuratedRagParseError('AITP curated RAG search item score must be positive.');
  }
  return {
    chunkId: requiredString(raw, 'chunk_id'),
    documentId: requiredString(raw, 'document_id'),
    score,
    retrievalRole: 'heuristic_context',
    orientationOnly: true,
    canUpdateClaimTrust: false,
    summary: requiredString(raw, 'summary'),
    text: requiredString(raw, 'text'),
    anchor: requiredRecord(raw['anchor'], 'search_result.anchor'),
    tags: requiredStringArray(raw['tags'], 'search_result.tags'),
    contentHash: requiredString(raw, 'content_hash'),
    raw,
  };
}

function unwrapSurface(input: unknown, key: string): Readonly<Record<string, unknown>> {
  if (!isRecord(input)) {
    throw new AitpCuratedRagParseError('AITP curated RAG payload must be an object.');
  }
  if (isRecord(input[key])) return input[key];
  return input;
}

function assertCommonNoTrust(raw: Readonly<Record<string, unknown>>, label: string): void {
  if (raw['catalog_version'] !== AITP_CURATED_RAG_CATALOG_VERSION) {
    throw new AitpCuratedRagParseError(`${label} catalog version is unsupported.`);
  }
  if (raw['summary_inputs_trusted'] !== false || raw['can_update_claim_trust'] !== false) {
    throw new AitpCuratedRagParseError(`${label} must remain no-trust metadata.`);
  }
}

function assertSearchNoTrust(raw: Readonly<Record<string, unknown>>): void {
  if (
    raw['index_mode'] !== 'lexical_fixture' ||
    raw['result_role'] !== 'heuristic_context' ||
    raw['records_validation_result'] !== false ||
    raw['claim_trust_mutation'] !== 'none' ||
    raw['requires_promotion_for_claim_support'] !== true
  ) {
    throw new AitpCuratedRagParseError(
      'AITP curated RAG search result must remain heuristic and no-trust.',
    );
  }
}

function requiredRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (isRecord(value)) return value;
  throw new AitpCuratedRagParseError(`${label} must be an object.`);
}

function requiredRecordArray(value: unknown, label: string): readonly Readonly<Record<string, unknown>>[] {
  if (Array.isArray(value) && value.every(isRecord)) return value;
  throw new AitpCuratedRagParseError(`${label} must be an object array.`);
}

function requiredString(raw: Readonly<Record<string, unknown>>, key: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new AitpCuratedRagParseError(`${key} must be a non-empty string.`);
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

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
