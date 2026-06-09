import {
  parseArtifactWriteResult,
  parseCodeStateWriteResult,
  parseEvidenceWriteResult,
  parseExploratoryRecordWriteResult,
  parseHumanCheckpointWriteResult,
  parseProofObligationWriteResult,
  parseReferenceLocationWriteResult,
  parseSourceAssetWriteResult,
  parseSourceReconstructionReviewResultWriteResult,
  parseToolRunWriteResult,
  parseTrustPreflightWriteResult,
  parseValidationContractWriteResult,
  parseValidationResultWriteResult,
} from './cli-bridge';
import type {
  AitpArtifactWriteResult,
  AitpEvidenceWriteResult,
  AitpExploratoryRecordWriteResult,
  AitpHumanCheckpointWriteResult,
  AitpCodeStateWriteResult,
  AitpProofObligationWriteResult,
  AitpReferenceLocationWriteResult,
  AitpSourceReconstructionReviewResultWriteResult,
  AitpSourceAssetWriteResult,
  AitpToolRunWriteResult,
  AitpTrustPreflightWriteResult,
  AitpValidationContractWriteResult,
  AitpValidationResultWriteResult,
  AttachAitpArtifactInput,
  AttachAitpArtifactAutoInput,
  CaptureAitpCodeStateAutoInput,
  CaptureAitpSourceAssetAutoInput,
  CaptureAitpToolRunAutoInput,
  CreateAitpValidationContractInput,
  CreateAitpProofObligationInput,
  IngestAitpCuratedRagCorpusInput,
  PreflightAitpTrustUpdateInput,
  RecordAitpEvidenceInput,
  RecordAitpValidationResultInput,
  RecordAitpExploratoryRecordInput,
  RecordAitpReferenceLocationInput,
  RecordAitpSourceReconstructionReviewResultInput,
  RecordAitpToolRunInput,
  RegisterAitpSourceAssetInput,
  RequestAitpHumanCheckpointInput,
} from './cli-bridge';
import {
  parseAitpCuratedRagIngestResult,
  type AitpCuratedRagIngestResult,
} from './curated-rag-ingest';
import type { AitpSourceAssetType } from './cli-bridge';
import type { AitpExplorationStatus, AitpExplorationType } from './types';

export const AITP_WRITE_BRIDGE_OPERATIONS = [
  'ingestCuratedRagCorpus',
  'recordExploratoryRecord',
  'registerSourceAsset',
  'captureSourceAssetAuto',
  'recordEvidence',
  'recordToolRun',
  'captureToolRunAuto',
  'captureCodeStateAuto',
  'attachArtifact',
  'attachArtifactAuto',
  'recordReferenceLocation',
  'createProofObligation',
  'createValidationContract',
  'recordValidationResult',
  'recordSourceReconstructionReviewResult',
  'requestHumanCheckpoint',
  'preflightTrustUpdate',
] as const;

export type AitpWriteBridgeOperation = (typeof AITP_WRITE_BRIDGE_OPERATIONS)[number];

export type AitpRuntimeBridgeOperation =
  | 'readProcessGraphSlice'
  | 'readMomentPolicy'
  | 'readRuntimePayloadProfiles'
  | 'lookupRecordRefs'
  | 'readCuratedRagCorpus'
  | 'searchCuratedRagCorpus'
  | 'readCuratedRagChunk'
  | 'draftCuratedRagPromotion'
  | 'readLiteratureSourceReviewHandoff'
  | AitpWriteBridgeOperation;

export interface AitpRuntimeBridgeTarget {
  readonly operation: AitpRuntimeBridgeOperation;
  readonly entrypointKey: string;
  readonly mcpTool: string;
  readonly cliFallback: string;
  readonly surface: string;
  readonly preferredTransport: 'mcp';
  readonly fallbackTransport: 'cli';
  readonly mcpInvocation: AitpMcpInvocationContract;
  readonly mcpArguments?: AitpMcpArgumentContract | undefined;
  readonly executionRole: 'read' | 'write' | 'preflight';
  readonly stateEffect:
    | 'read_only'
    | 'curated_rag_manifest_write'
    | 'typed_record_write'
    | 'preflight_only';
  readonly canonicalStore: '.aitp';
  readonly claimTrustMutation: 'none';
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
}

export interface AitpMcpInvocationContract {
  readonly tool: string;
  readonly argumentStyle: 'json_object';
  readonly baseArgument: 'base';
  readonly payloadKeyCase: 'snake_case';
  readonly resultSurface: string;
  readonly resultContentType: 'json_object';
  readonly fallbackPolicy: 'use_cli_when_mcp_transport_unavailable_or_call_fails';
}

export interface AitpMcpArgumentContract {
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly source: string;
}

const AITP_READ_TARGET_MCP_ARGUMENTS = {
  process_graph_slice: {
    required: ['base', 'session_id'],
    optional: ['claim_id', 'limit'],
    source: 'aitp_v5_get_process_graph_slice',
  },
  host_agnostic_moment_policy: {
    required: ['base', 'session_id'],
    optional: ['claim_id', 'limit'],
    source: 'aitp_v5_get_host_agnostic_moment_policy',
  },
  runtime_payload_profiles: {
    required: [],
    optional: [],
    source: 'aitp_v5_get_runtime_payload_profiles',
  },
  record_ref_lookup: {
    required: ['base', 'refs'],
    optional: [],
    source: 'aitp_v5_lookup_record_refs',
  },
  curated_rag_corpus: {
    required: [],
    optional: ['base'],
    source: 'aitp_v5_get_curated_rag_corpus',
  },
  curated_rag_search: {
    required: ['query'],
    optional: ['base', 'limit'],
    source: 'aitp_v5_search_curated_rag_corpus',
  },
  curated_rag_chunk: {
    required: ['chunk_id'],
    optional: ['base'],
    source: 'aitp_v5_get_curated_rag_chunk',
  },
  curated_rag_promotion_draft: {
    required: ['chunk_id'],
    optional: ['base', 'topic_id', 'claim_id', 'connector_id', 'promotion_intent'],
    source: 'aitp_v5_draft_curated_rag_promotion',
  },
  literature_source_review_handoff: {
    required: ['base', 'session_id', 'uri', 'label', 'short_summary', 'detected_relevance'],
    optional: ['external_id', 'optional_claim_id', 'scoped_output', 'reviewed_refs'],
    source: 'aitp_v5_build_literature_source_review_handoff',
  },
} as const satisfies Record<string, AitpMcpArgumentContract>;

export const AITP_RUNTIME_BRIDGE_TARGETS: readonly AitpRuntimeBridgeTarget[] = [
  bridgeTarget(
    'readProcessGraphSlice',
    'process_graph_slice',
    'aitp_v5_get_process_graph_slice',
    'aitp-v5 graph slice <session-id>',
    'process_graph_slice',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'readMomentPolicy',
    'host_agnostic_moment_policy',
    'aitp_v5_get_host_agnostic_moment_policy',
    'aitp-v5 graph moment-policy <session-id>',
    'host_agnostic_moment_policy',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'readRuntimePayloadProfiles',
    'runtime_payload_profiles',
    'aitp_v5_get_runtime_payload_profiles',
    'aitp-v5 adapter payload-profiles',
    'runtime_payload_profiles',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'lookupRecordRefs',
    'record_ref_lookup',
    'aitp_v5_lookup_record_refs',
    'aitp-v5 adapter record-ref-lookup <args>',
    'record_ref_lookup',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'readCuratedRagCorpus',
    'curated_rag_corpus',
    'aitp_v5_get_curated_rag_corpus',
    'aitp-v5 adapter curated-rag-corpus',
    'curated_rag_corpus',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'searchCuratedRagCorpus',
    'curated_rag_search',
    'aitp_v5_search_curated_rag_corpus',
    'aitp-v5 adapter curated-rag-search <query> <args>',
    'curated_rag_search_result',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'readCuratedRagChunk',
    'curated_rag_chunk',
    'aitp_v5_get_curated_rag_chunk',
    'aitp-v5 adapter curated-rag-chunk <chunk-id>',
    'curated_rag_chunk',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'draftCuratedRagPromotion',
    'curated_rag_promotion_draft',
    'aitp_v5_draft_curated_rag_promotion',
    'aitp-v5 adapter curated-rag-promotion-draft <chunk-id> <args>',
    'curated_rag_promotion_draft',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'readLiteratureSourceReviewHandoff',
    'literature_source_review_handoff',
    'aitp_v5_build_literature_source_review_handoff',
    'aitp-v5 literature source-review-handoff <args>',
    'literature_source_review_handoff',
    'read',
    'read_only',
  ),
  bridgeTarget(
    'ingestCuratedRagCorpus',
    'ingest_curated_rag_corpus',
    'aitp_v5_ingest_curated_rag_corpus',
    'aitp-v5 curated-rag ingest <args>',
    'curated_rag_ingest_result',
    'write',
    'curated_rag_manifest_write',
  ),
  bridgeTarget(
    'recordExploratoryRecord',
    'record_exploratory_record',
    'aitp_v5_record_exploratory_record',
    'aitp-v5 exploration record <args>',
    'exploratory_record',
  ),
  bridgeTarget(
    'registerSourceAsset',
    'register_source_asset',
    'aitp_v5_register_source_asset',
    'aitp-v5 asset register <args>',
    'source_asset_record',
  ),
  bridgeTarget(
    'captureSourceAssetAuto',
    'capture_source_asset_auto',
    'aitp_v5_capture_source_asset_auto',
    'aitp-v5 asset capture-auto <args>',
    'source_asset_record',
  ),
  bridgeTarget(
    'recordEvidence',
    'record_evidence',
    'aitp_v5_record_evidence',
    'aitp-v5 evidence record <args>',
    'evidence_record',
  ),
  bridgeTarget(
    'recordToolRun',
    'record_tool_run',
    'aitp_v5_record_tool_run',
    'aitp-v5 tool run record <args>',
    'tool_run_record',
  ),
  bridgeTarget(
    'captureToolRunAuto',
    'capture_tool_run_auto',
    'aitp_v5_capture_tool_run_auto',
    'aitp-v5 tool run capture-auto <args>',
    'tool_run_record',
  ),
  bridgeTarget(
    'captureCodeStateAuto',
    'capture_code_state_auto',
    'aitp_v5_capture_code_state_auto',
    'aitp-v5 code state auto <args>',
    'code_state_record',
  ),
  bridgeTarget(
    'attachArtifact',
    'attach_artifact',
    'aitp_v5_attach_artifact',
    'aitp-v5 research-state attach-artifact <args>',
    'artifact_record',
  ),
  bridgeTarget(
    'attachArtifactAuto',
    'attach_artifact_auto',
    'aitp_v5_attach_artifact_auto',
    'aitp-v5 research-state attach-artifact-auto <args>',
    'artifact_record',
  ),
  bridgeTarget(
    'recordReferenceLocation',
    'record_reference_location',
    'aitp_v5_record_reference_location',
    'aitp-v5 reference location record <args>',
    'reference_location_record',
  ),
  bridgeTarget(
    'createProofObligation',
    'create_proof_obligation',
    'aitp_v5_create_proof_obligation',
    'aitp-v5 research-state create-proof-obligation <args>',
    'proof_obligation_record',
  ),
  bridgeTarget(
    'createValidationContract',
    'create_validation_contract',
    'aitp_v5_create_validation_contract',
    'aitp-v5 validation contract create <args>',
    'validation_contract_record',
  ),
  bridgeTarget(
    'recordValidationResult',
    'record_validation_result',
    'aitp_v5_record_validation_result',
    'aitp-v5 validation result record <args>',
    'validation_result_record',
  ),
  bridgeTarget(
    'recordSourceReconstructionReviewResult',
    'record_source_reconstruction_review_result',
    'aitp_v5_record_source_reconstruction_review_result',
    'aitp-v5 source reconstruction-review-result <args>',
    'source_reconstruction_review_result_record',
  ),
  bridgeTarget(
    'requestHumanCheckpoint',
    'request_human_checkpoint',
    'aitp_v5_request_human_checkpoint',
    'aitp-v5 checkpoint request <args>',
    'human_checkpoint_record',
  ),
  bridgeTarget(
    'preflightTrustUpdate',
    'trust_preflight',
    'aitp_v5_preflight_trust_update',
    'aitp-v5 trust preflight <args>',
    'trust_update_preflight',
    'preflight',
    'preflight_only',
  ),
];

export function aitpRuntimeBridgeTargetForOperation(
  operation: AitpRuntimeBridgeOperation,
): AitpRuntimeBridgeTarget {
  const target = AITP_RUNTIME_BRIDGE_TARGETS.find((item) => item.operation === operation);
  if (target === undefined) {
    throw new AitpWriteBridgePayloadError(`Unsupported AITP bridge operation: ${operation}`);
  }
  return target;
}

function bridgeTarget(
  operation: AitpRuntimeBridgeOperation,
  entrypointKey: string,
  mcpTool: string,
  cliFallback: string,
  surface: string,
  executionRole: 'read' | 'write' | 'preflight' = 'write',
  stateEffect:
    | 'read_only'
    | 'curated_rag_manifest_write'
    | 'typed_record_write'
    | 'preflight_only' = 'typed_record_write',
): AitpRuntimeBridgeTarget {
  const target: AitpRuntimeBridgeTarget = {
    operation,
    entrypointKey,
    mcpTool,
    cliFallback,
    surface,
    preferredTransport: 'mcp',
    fallbackTransport: 'cli',
    mcpInvocation: {
      tool: mcpTool,
      argumentStyle: 'json_object',
      baseArgument: 'base',
      payloadKeyCase: 'snake_case',
      resultSurface: surface,
      resultContentType: 'json_object',
      fallbackPolicy: 'use_cli_when_mcp_transport_unavailable_or_call_fails',
    },
    executionRole,
    stateEffect,
    canonicalStore: '.aitp',
    claimTrustMutation: 'none',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
  };
  if (executionRole === 'read') {
    const mcpArguments = (
      AITP_READ_TARGET_MCP_ARGUMENTS as Readonly<
        Record<string, AitpMcpArgumentContract | undefined>
      >
    )[entrypointKey];
    if (mcpArguments !== undefined) {
      return { ...target, mcpArguments };
    }
  }
  return target;
}

export type AitpWriteBridgeExecutionInput =
  | {
      readonly operation: 'ingestCuratedRagCorpus';
      readonly payload: IngestAitpCuratedRagCorpusInput;
    }
  | {
      readonly operation: 'recordExploratoryRecord';
      readonly payload: RecordAitpExploratoryRecordInput;
    }
  | {
      readonly operation: 'registerSourceAsset';
      readonly payload: RegisterAitpSourceAssetInput;
    }
  | {
      readonly operation: 'captureSourceAssetAuto';
      readonly payload: CaptureAitpSourceAssetAutoInput;
    }
  | {
      readonly operation: 'recordEvidence';
      readonly payload: RecordAitpEvidenceInput;
    }
  | {
      readonly operation: 'recordToolRun';
      readonly payload: RecordAitpToolRunInput;
    }
  | {
      readonly operation: 'captureToolRunAuto';
      readonly payload: CaptureAitpToolRunAutoInput;
    }
  | {
      readonly operation: 'captureCodeStateAuto';
      readonly payload: CaptureAitpCodeStateAutoInput;
    }
  | {
      readonly operation: 'attachArtifact';
      readonly payload: AttachAitpArtifactInput;
    }
  | {
      readonly operation: 'attachArtifactAuto';
      readonly payload: AttachAitpArtifactAutoInput;
    }
  | {
      readonly operation: 'recordReferenceLocation';
      readonly payload: RecordAitpReferenceLocationInput;
    }
  | {
      readonly operation: 'createProofObligation';
      readonly payload: CreateAitpProofObligationInput;
    }
  | {
      readonly operation: 'createValidationContract';
      readonly payload: CreateAitpValidationContractInput;
    }
  | {
      readonly operation: 'recordValidationResult';
      readonly payload: RecordAitpValidationResultInput;
    }
  | {
      readonly operation: 'recordSourceReconstructionReviewResult';
      readonly payload: RecordAitpSourceReconstructionReviewResultInput;
    }
  | {
      readonly operation: 'requestHumanCheckpoint';
      readonly payload: RequestAitpHumanCheckpointInput;
    }
  | {
      readonly operation: 'preflightTrustUpdate';
      readonly payload: PreflightAitpTrustUpdateInput;
    };

export type AitpWriteBridgeExecutionResult =
  | AitpCuratedRagIngestResult
  | AitpExploratoryRecordWriteResult
  | AitpSourceAssetWriteResult
  | AitpEvidenceWriteResult
  | AitpToolRunWriteResult
  | AitpCodeStateWriteResult
  | AitpArtifactWriteResult
  | AitpReferenceLocationWriteResult
  | AitpProofObligationWriteResult
  | AitpValidationContractWriteResult
  | AitpValidationResultWriteResult
  | AitpSourceReconstructionReviewResultWriteResult
  | AitpHumanCheckpointWriteResult
  | AitpTrustPreflightWriteResult;

export interface AitpWriteBridgeExecutor {
  executeWrite(
    input: AitpWriteBridgeExecutionInput,
  ): Promise<AitpWriteBridgeExecutionResult>;
}

export interface AitpMcpWriteBridgeTransport {
  callTool(input: {
    readonly toolName: string;
    readonly args: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal | undefined;
  }): Promise<unknown>;
}

export interface AitpMcpFirstWriteBridgeExecutorOptions {
  readonly basePath: () => string;
  readonly transport?: AitpMcpWriteBridgeTransport | undefined;
  readonly fallback: AitpWriteBridgeExecutor;
  readonly fallbackOnMcpError?: boolean | undefined;
}

export interface AitpWriteBridgeCliTarget {
  ingestCuratedRagCorpus(
    input: IngestAitpCuratedRagCorpusInput,
  ): Promise<AitpCuratedRagIngestResult>;
  recordExploratoryRecord(
    input: RecordAitpExploratoryRecordInput,
  ): Promise<AitpExploratoryRecordWriteResult>;
  registerSourceAsset(
    input: RegisterAitpSourceAssetInput,
  ): Promise<AitpSourceAssetWriteResult>;
  captureSourceAssetAuto(
    input: CaptureAitpSourceAssetAutoInput,
  ): Promise<AitpSourceAssetWriteResult>;
  recordEvidence(input: RecordAitpEvidenceInput): Promise<AitpEvidenceWriteResult>;
  recordToolRun(input: RecordAitpToolRunInput): Promise<AitpToolRunWriteResult>;
  captureToolRunAuto(input: CaptureAitpToolRunAutoInput): Promise<AitpToolRunWriteResult>;
  captureCodeStateAuto(
    input: CaptureAitpCodeStateAutoInput,
  ): Promise<AitpCodeStateWriteResult>;
  attachArtifact(input: AttachAitpArtifactInput): Promise<AitpArtifactWriteResult>;
  attachArtifactAuto(input: AttachAitpArtifactAutoInput): Promise<AitpArtifactWriteResult>;
  recordReferenceLocation(
    input: RecordAitpReferenceLocationInput,
  ): Promise<AitpReferenceLocationWriteResult>;
  createProofObligation(
    input: CreateAitpProofObligationInput,
  ): Promise<AitpProofObligationWriteResult>;
  createValidationContract(
    input: CreateAitpValidationContractInput,
  ): Promise<AitpValidationContractWriteResult>;
  recordValidationResult(
    input: RecordAitpValidationResultInput,
  ): Promise<AitpValidationResultWriteResult>;
  recordSourceReconstructionReviewResult(
    input: RecordAitpSourceReconstructionReviewResultInput,
  ): Promise<AitpSourceReconstructionReviewResultWriteResult>;
  requestHumanCheckpoint(
    input: RequestAitpHumanCheckpointInput,
  ): Promise<AitpHumanCheckpointWriteResult>;
  preflightTrustUpdate(
    input: PreflightAitpTrustUpdateInput,
  ): Promise<AitpTrustPreflightWriteResult>;
}

export class AitpCliWriteBridgeExecutor implements AitpWriteBridgeExecutor {
  constructor(private readonly bridge: AitpWriteBridgeCliTarget) {}

  async executeWrite(
    input: AitpWriteBridgeExecutionInput,
  ): Promise<AitpWriteBridgeExecutionResult> {
    switch (input.operation) {
      case 'ingestCuratedRagCorpus':
        return this.bridge.ingestCuratedRagCorpus(input.payload);
      case 'recordExploratoryRecord':
        return this.bridge.recordExploratoryRecord(input.payload);
      case 'registerSourceAsset':
        return this.bridge.registerSourceAsset(input.payload);
      case 'captureSourceAssetAuto':
        return this.bridge.captureSourceAssetAuto(input.payload);
      case 'recordEvidence':
        return this.bridge.recordEvidence(input.payload);
      case 'recordToolRun':
        return this.bridge.recordToolRun(input.payload);
      case 'captureToolRunAuto':
        return this.bridge.captureToolRunAuto(input.payload);
      case 'captureCodeStateAuto':
        return this.bridge.captureCodeStateAuto(input.payload);
      case 'attachArtifact':
        return this.bridge.attachArtifact(input.payload);
      case 'attachArtifactAuto':
        return this.bridge.attachArtifactAuto(input.payload);
      case 'recordReferenceLocation':
        return this.bridge.recordReferenceLocation(input.payload);
      case 'createProofObligation':
        return this.bridge.createProofObligation(input.payload);
      case 'createValidationContract':
        return this.bridge.createValidationContract(input.payload);
      case 'recordValidationResult':
        return this.bridge.recordValidationResult(input.payload);
      case 'recordSourceReconstructionReviewResult':
        return this.bridge.recordSourceReconstructionReviewResult(input.payload);
      case 'requestHumanCheckpoint':
        return this.bridge.requestHumanCheckpoint(input.payload);
      case 'preflightTrustUpdate':
        return this.bridge.preflightTrustUpdate(input.payload);
    }
  }
}

export function createAitpCliWriteBridgeExecutor(
  bridge: AitpWriteBridgeCliTarget,
): AitpWriteBridgeExecutor {
  return new AitpCliWriteBridgeExecutor(bridge);
}

export class AitpMcpFirstWriteBridgeExecutor implements AitpWriteBridgeExecutor {
  private readonly fallbackOnMcpError: boolean;

  constructor(private readonly options: AitpMcpFirstWriteBridgeExecutorOptions) {
    this.fallbackOnMcpError = options.fallbackOnMcpError ?? true;
  }

  async executeWrite(
    input: AitpWriteBridgeExecutionInput,
  ): Promise<AitpWriteBridgeExecutionResult> {
    const transport = this.options.transport;
    if (transport === undefined) {
      return this.options.fallback.executeWrite(input);
    }
    const target = aitpRuntimeBridgeTargetForOperation(input.operation);
    try {
      const payload = await transport.callTool({
        toolName: target.mcpInvocation.tool,
        args: mcpArgsForAitpWriteBridgeInput(input, this.options.basePath()),
        signal: input.payload.signal,
      });
      return parseAitpWriteBridgeResultForOperation(input.operation, payload);
    } catch (error) {
      if (!this.fallbackOnMcpError) throw error;
      return this.options.fallback.executeWrite(input);
    }
  }
}

export function createAitpMcpFirstWriteBridgeExecutor(
  options: AitpMcpFirstWriteBridgeExecutorOptions,
): AitpWriteBridgeExecutor {
  return new AitpMcpFirstWriteBridgeExecutor(options);
}

export function mcpArgsForAitpWriteBridgeInput(
  input: AitpWriteBridgeExecutionInput,
  basePath: string,
): Readonly<Record<string, unknown>> {
  return {
    base: basePath,
    ...toSnakeCaseJsonObject(input.payload),
  };
}

export function parseAitpWriteBridgeResultForOperation(
  operation: AitpWriteBridgeOperation,
  payload: unknown,
): AitpWriteBridgeExecutionResult {
  const normalizedPayload = normalizeAitpWriteBridgePayload(payload);
  switch (operation) {
    case 'ingestCuratedRagCorpus':
      return parseAitpCuratedRagIngestResult(normalizedPayload);
    case 'recordExploratoryRecord':
      return parseExploratoryRecordWriteResult(normalizedPayload);
    case 'registerSourceAsset':
    case 'captureSourceAssetAuto':
      return parseSourceAssetWriteResult(normalizedPayload);
    case 'recordEvidence':
      return parseEvidenceWriteResult(normalizedPayload);
    case 'recordToolRun':
    case 'captureToolRunAuto':
      return parseToolRunWriteResult(normalizedPayload);
    case 'captureCodeStateAuto':
      return parseCodeStateWriteResult(normalizedPayload);
    case 'attachArtifact':
    case 'attachArtifactAuto':
      return parseArtifactWriteResult(normalizedPayload);
    case 'recordReferenceLocation':
      return parseReferenceLocationWriteResult(normalizedPayload);
    case 'createProofObligation':
      return parseProofObligationWriteResult(normalizedPayload);
    case 'createValidationContract':
      return parseValidationContractWriteResult(normalizedPayload);
    case 'recordValidationResult':
      return parseValidationResultWriteResult(normalizedPayload);
    case 'recordSourceReconstructionReviewResult':
      return parseSourceReconstructionReviewResultWriteResult(normalizedPayload);
    case 'requestHumanCheckpoint':
      return parseHumanCheckpointWriteResult(normalizedPayload);
    case 'preflightTrustUpdate':
      return parseTrustPreflightWriteResult(normalizedPayload);
  }
}

export function normalizeAitpWriteBridgePayload(payload: unknown): unknown {
  if (!isRecordValue(payload)) return payload;
  if (payload['isError'] === true) {
    throw new AitpWriteBridgePayloadError('AITP MCP tool returned an error result.');
  }
  const structuredContent = payload['structuredContent'];
  if (isRecordValue(structuredContent)) return structuredContent;
  const content = payload['content'];
  if (!Array.isArray(content)) return payload;
  for (const block of content) {
    if (!isRecordValue(block) || block['type'] !== 'text' || typeof block['text'] !== 'string') {
      continue;
    }
    try {
      return parseMcpJsonText(block['text']);
    } catch {}
  }
  throw new AitpWriteBridgePayloadError('AITP MCP tool result did not include JSON text content.');
}

export function coerceAitpWriteBridgeInput(
  operation: AitpWriteBridgeOperation,
  payload: unknown,
  signal?: AbortSignal,
): AitpWriteBridgeExecutionInput {
  const record = requireRecord(payload, 'aitp_payload');
  switch (operation) {
    case 'ingestCuratedRagCorpus':
      return {
        operation,
        payload: {
          paths: requiredStringArray(record, 'paths', 'path'),
          corpusId: optionalString(record, 'corpusId', 'corpus_id'),
          tags: optionalStringArray(record, 'tags', 'tag'),
          domainHints: optionalStringArray(record, 'domainHints', 'domain_hints'),
          topicHints: optionalStringArray(record, 'topicHints', 'topic_hints'),
          language: optionalString(record, 'language'),
          priority: optionalString(record, 'priority'),
          chunkTokenLimit: optionalNumber(record, 'chunkTokenLimit', 'chunk_token_limit'),
          titlePrefix: optionalString(record, 'titlePrefix', 'title_prefix'),
          assetType: optionalString(record, 'assetType', 'asset_type'),
          rebuildIndex: optionalBoolean(record, 'rebuildIndex', 'rebuild_index'),
          signal,
        },
      };
    case 'recordExploratoryRecord':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          explorationType: requiredString(
            record,
            'explorationType',
            'exploration_type',
          ) as AitpExplorationType,
          title: requiredString(record, 'title'),
          focalQuestion: requiredString(record, 'focalQuestion', 'focal_question'),
          summary: requiredString(record, 'summary'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          sessionId: optionalString(record, 'sessionId', 'session_id'),
          originalQuestion: optionalString(record, 'originalQuestion', 'original_question'),
          localQuestion: optionalString(record, 'localQuestion', 'local_question'),
          status: optionalString(record, 'status') as AitpExplorationStatus | undefined,
          objectIds: optionalStringArray(record, 'objectIds', 'object_ids'),
          relationIds: optionalStringArray(record, 'relationIds', 'relation_ids'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          parentRecordIds: optionalStringArray(record, 'parentRecordIds', 'parent_record_ids'),
          derivedRecordIds: optionalStringArray(record, 'derivedRecordIds', 'derived_record_ids'),
          candidatePaths: optionalStringArray(record, 'candidatePaths', 'candidate_paths'),
          unresolvedPoints: optionalStringArray(record, 'unresolvedPoints', 'unresolved_points'),
          nextActions: optionalStringArray(record, 'nextActions', 'next_actions'),
          humanSteering: optionalString(record, 'humanSteering', 'human_steering'),
          metadata: optionalRecord(record, 'metadata'),
          signal,
        },
      };
    case 'registerSourceAsset':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          assetType: requiredString(record, 'assetType', 'asset_type', 'type') as AitpSourceAssetType,
          uri: requiredString(record, 'uri'),
          title: requiredString(record, 'title'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          label: optionalString(record, 'label'),
          contentHash: optionalString(record, 'contentHash', 'content_hash'),
          hashAlgorithm: optionalString(record, 'hashAlgorithm', 'hash_algorithm'),
          versionAnchor: optionalRecord(record, 'versionAnchor', 'version_anchor'),
          acquiredAt: optionalString(record, 'acquiredAt', 'acquired_at'),
          sourceKind: optionalString(record, 'sourceKind', 'source_kind'),
          summary: optionalString(record, 'summary'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          codeStateIds: optionalStringArray(record, 'codeStateIds', 'code_state_ids'),
          referenceLocationIds: optionalStringArray(
            record,
            'referenceLocationIds',
            'reference_location_ids',
          ),
          derivedFrom: optionalStringArray(record, 'derivedFrom', 'derived_from'),
          metadata: optionalRecord(record, 'metadata'),
          linkedRecords: optionalRecord(record, 'linkedRecords', 'linked_records'),
          signal,
        },
      };
    case 'captureSourceAssetAuto':
      return {
        operation,
        payload: {
          path: requiredString(record, 'path'),
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          assetType: optionalString(record, 'assetType', 'asset_type', 'type'),
          title: optionalString(record, 'title'),
          label: optionalString(record, 'label'),
          versionAnchor: optionalRecord(record, 'versionAnchor', 'version_anchor'),
          acquiredAt: optionalString(record, 'acquiredAt', 'acquired_at'),
          sourceKind: optionalString(record, 'sourceKind', 'source_kind'),
          summary: optionalString(record, 'summary'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          codeStateIds: optionalStringArray(record, 'codeStateIds', 'code_state_ids'),
          referenceLocationIds: optionalStringArray(
            record,
            'referenceLocationIds',
            'reference_location_ids',
          ),
          derivedFrom: optionalStringArray(record, 'derivedFrom', 'derived_from'),
          metadata: optionalRecord(record, 'metadata'),
          linkedRecords: optionalRecord(record, 'linkedRecords', 'linked_records'),
          signal,
        },
      };
    case 'recordEvidence':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          evidenceType: requiredString(record, 'evidenceType', 'evidence_type', 'type'),
          status: requiredString(record, 'status'),
          summary: requiredString(record, 'summary'),
          supportsOutputs: optionalStringArray(
            record,
            'supportsOutputs',
            'supports_outputs',
            'supportsOutput',
            'supports_output',
          ),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          toolRunIds: optionalStringArray(record, 'toolRunIds', 'tool_run_ids'),
          validationResultIds: optionalStringArray(
            record,
            'validationResultIds',
            'validation_result_ids',
          ),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          signal,
        },
      };
    case 'recordToolRun':
      return {
        operation,
        payload: {
          recipeId: requiredString(record, 'recipeId', 'recipe_id', 'recipe'),
          toolFamily: requiredString(record, 'toolFamily', 'tool_family', 'family'),
          toolName: requiredString(record, 'toolName', 'tool_name', 'name'),
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          inputs: optionalRecord(record, 'inputs', 'inputs_json'),
          outputs: optionalRecord(record, 'outputs', 'outputs_json'),
          environment: optionalRecord(record, 'environment', 'environment_json'),
          evidenceStatus: optionalString(record, 'evidenceStatus', 'evidence_status'),
          codeStateIds: optionalStringArray(record, 'codeStateIds', 'code_state_ids'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          signal,
        },
      };
    case 'captureToolRunAuto':
      return {
        operation,
        payload: {
          path: requiredString(record, 'path'),
          recipeId: requiredString(record, 'recipeId', 'recipe_id', 'recipe'),
          toolFamily: requiredString(record, 'toolFamily', 'tool_family', 'family'),
          toolName: requiredString(record, 'toolName', 'tool_name', 'name'),
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          inputs: optionalRecord(record, 'inputs', 'inputs_json'),
          outputs: optionalRecord(record, 'outputs', 'outputs_json'),
          environment: optionalRecord(record, 'environment', 'environment_json'),
          evidenceStatus: optionalString(record, 'evidenceStatus', 'evidence_status'),
          codeStateIds: optionalStringArray(record, 'codeStateIds', 'code_state_ids'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          summary: optionalString(record, 'summary'),
          maxPreviewChars: optionalNumber(record, 'maxPreviewChars', 'max_preview_chars'),
          signal,
        },
      };
    case 'captureCodeStateAuto':
      return {
        operation,
        payload: {
          worktreePath: requiredString(record, 'worktreePath', 'worktree_path'),
          repoId: optionalString(record, 'repoId', 'repo_id'),
          topicId: optionalString(record, 'topicId', 'topic_id'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          sessionId: optionalString(record, 'sessionId', 'session_id'),
          buildConfig: optionalRecord(record, 'buildConfig', 'build_config', 'build_config_json'),
          runtimeEnvironment: optionalRecord(
            record,
            'runtimeEnvironment',
            'runtime_environment',
            'runtime_environment_json',
          ),
          linkedRecords: optionalRecord(record, 'linkedRecords', 'linked_records', 'linked_records_json'),
          knownDivergence: optionalString(record, 'knownDivergence', 'known_divergence'),
          writePatchArtifact: optionalBoolean(record, 'writePatchArtifact', 'write_patch_artifact'),
          signal,
        },
      };
    case 'attachArtifact':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          artifactType: requiredString(record, 'artifactType', 'artifact_type', 'type'),
          uri: requiredString(record, 'uri', 'artifactUri', 'artifact_uri'),
          summary: requiredString(record, 'summary', 'artifactSummary', 'artifact_summary'),
          sizeBytes: optionalString(record, 'sizeBytes', 'size_bytes'),
          metadata: optionalRecord(record, 'metadata', 'metadata_json'),
          signal,
        },
      };
    case 'attachArtifactAuto':
      return {
        operation,
        payload: {
          path: requiredString(record, 'path'),
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          artifactType: requiredString(record, 'artifactType', 'artifact_type', 'type'),
          summary: requiredString(record, 'summary', 'artifactSummary', 'artifact_summary'),
          metadata: optionalRecord(record, 'metadata', 'metadata_json'),
          signal,
        },
      };
    case 'recordReferenceLocation':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          connectorId: requiredString(record, 'connectorId', 'connector_id', 'connector'),
          locationType: requiredString(record, 'locationType', 'location_type', 'type'),
          uri: requiredString(record, 'uri'),
          label: requiredString(record, 'label'),
          claimId: optionalString(record, 'claimId', 'claim_id'),
          sourceRef: optionalString(record, 'sourceRef', 'source_ref'),
          externalId: optionalString(record, 'externalId', 'external_id'),
          status: optionalString(record, 'status'),
          summary: optionalString(record, 'summary'),
          metadata: optionalRecord(record, 'metadata', 'metadata_json'),
          linkedRecords: optionalRecord(record, 'linkedRecords', 'linked_records', 'linked_records_json'),
          signal,
        },
      };
    case 'createProofObligation':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          statement: requiredString(record, 'statement'),
          obligationType: requiredString(record, 'obligationType', 'obligation_type', 'type'),
          status: requiredString(record, 'status'),
          maturityLevel: requiredString(record, 'maturityLevel', 'maturity_level'),
          nextAction: requiredString(record, 'nextAction', 'next_action'),
          requiredEvidence: optionalStringArray(record, 'requiredEvidence', 'required_evidence'),
          proofStrategy: optionalStringArray(record, 'proofStrategy', 'proof_strategy'),
          failureModes: optionalStringArray(record, 'failureModes', 'failure_modes'),
          sourceRefs: optionalStringArray(record, 'sourceRefs', 'source_refs'),
          evidenceRefs: optionalStringArray(record, 'evidenceRefs', 'evidence_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          signal,
        },
      };
    case 'createValidationContract':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          requiredChecks: requiredStringArray(record, 'requiredChecks', 'required_checks'),
          failureModes: requiredStringArray(record, 'failureModes', 'failure_modes'),
          requiredEvidenceOutputs: requiredStringArray(
            record,
            'requiredEvidenceOutputs',
            'required_evidence_outputs',
            'required_outputs',
          ),
          toolRecipeIds: optionalStringArray(record, 'toolRecipeIds', 'tool_recipe_ids'),
          executorIds: optionalStringArray(record, 'executorIds', 'executor_ids'),
          validatorRole: optionalString(record, 'validatorRole', 'validator_role'),
          signal,
        },
      };
    case 'recordValidationResult':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          contractId: requiredString(record, 'contractId', 'contract_id', 'contract'),
          toolRunId: requiredString(record, 'toolRunId', 'tool_run_id', 'tool_run'),
          status: requiredString(record, 'status'),
          summary: requiredString(record, 'summary'),
          checkedOutputs: optionalStringArray(record, 'checkedOutputs', 'checked_outputs'),
          coveredFailureModes: optionalStringArray(
            record,
            'coveredFailureModes',
            'covered_failure_modes',
          ),
          failureModesObserved: optionalStringArray(
            record,
            'failureModesObserved',
            'failure_modes_observed',
            'failure_modes',
          ),
          evidenceRefs: optionalStringArray(record, 'evidenceRefs', 'evidence_refs'),
          artifactIds: optionalStringArray(record, 'artifactIds', 'artifact_ids'),
          signal,
        },
      };
    case 'recordSourceReconstructionReviewResult': {
      const basisRefs = optionalStringArray(record, 'basisRefs', 'basis_refs');
      const evidenceRefs = optionalStringArray(record, 'evidenceRefs', 'evidence_refs');
      const validationResultIds = optionalStringArray(
        record,
        'validationResultIds',
        'validation_result_ids',
      );
      const referenceLocationIds = optionalStringArray(
        record,
        'referenceLocationIds',
        'reference_location_ids',
      );
      const objectIds = optionalStringArray(record, 'objectIds', 'object_ids');
      const relationIds = optionalStringArray(record, 'relationIds', 'relation_ids');
      if (
        !hasAnyStringArray([
          basisRefs,
          evidenceRefs,
          validationResultIds,
          referenceLocationIds,
          objectIds,
          relationIds,
        ])
      ) {
        throw new AitpWriteBridgePayloadError(
          'aitp_payload must include at least one source reconstruction review basis.',
        );
      }
      return {
        operation,
        payload: {
          claimId: requiredString(record, 'claimId', 'claim_id'),
          status: requiredString(record, 'status'),
          reviewedComponents: requiredStringArray(
            record,
            'reviewedComponents',
            'reviewed_components',
          ),
          summary: requiredString(record, 'summary'),
          basisRefs,
          evidenceRefs,
          validationResultIds,
          referenceLocationIds,
          objectIds,
          relationIds,
          remainingActions: optionalStringArray(record, 'remainingActions', 'remaining_actions'),
          reviewerRole: optionalString(record, 'reviewerRole', 'reviewer_role'),
          signal,
        },
      };
    }
    case 'requestHumanCheckpoint':
      return {
        operation,
        payload: {
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          reason: requiredString(record, 'reason'),
          requestedBy: requiredString(record, 'requestedBy', 'requested_by'),
          options: requiredStringArray(record, 'options'),
          signal,
        },
      };
    case 'preflightTrustUpdate':
      return {
        operation,
        payload: {
          action: requiredString(record, 'action'),
          sessionId: requiredString(record, 'sessionId', 'session_id'),
          topicId: requiredString(record, 'topicId', 'topic_id'),
          claimId: requiredString(record, 'claimId', 'claim_id'),
          requestedState: optionalString(record, 'requestedState', 'requested_state'),
          sourceKind: optionalString(record, 'sourceKind', 'source_kind'),
          sourceRef: optionalString(record, 'sourceRef', 'source_ref'),
          evidenceRefs: optionalStringArray(record, 'evidenceRefs', 'evidence_refs'),
          codeStateIds: optionalStringArray(record, 'codeStateIds', 'code_state_ids'),
          rationale: optionalString(record, 'rationale'),
          requestId: optionalString(record, 'requestId', 'request_id'),
          signal,
        },
      };
  }
}

export function actionIdForAitpWriteBridgeOperation(
  operation: AitpWriteBridgeOperation,
): string {
  switch (operation) {
    case 'ingestCuratedRagCorpus':
      return 'aitp.ingest_curated_rag_corpus';
    case 'recordExploratoryRecord':
      return 'aitp.record_exploratory_record';
    case 'registerSourceAsset':
      return 'aitp.register_source_asset';
    case 'captureSourceAssetAuto':
      return 'aitp.capture_source_asset_auto';
    case 'recordEvidence':
      return 'aitp.record_evidence';
    case 'recordToolRun':
      return 'aitp.record_tool_run';
    case 'captureToolRunAuto':
      return 'aitp.capture_tool_run_auto';
    case 'captureCodeStateAuto':
      return 'aitp.capture_code_state_auto';
    case 'attachArtifact':
      return 'aitp.attach_artifact';
    case 'attachArtifactAuto':
      return 'aitp.attach_artifact_auto';
    case 'recordReferenceLocation':
      return 'aitp.record_reference_location';
    case 'createProofObligation':
      return 'aitp.create_open_obligation';
    case 'createValidationContract':
      return 'aitp.create_validation_contract';
    case 'recordValidationResult':
      return 'aitp.record_validation_result';
    case 'recordSourceReconstructionReviewResult':
      return 'aitp.record_source_reconstruction_review_result';
    case 'requestHumanCheckpoint':
      return 'aitp.request_human_checkpoint';
    case 'preflightTrustUpdate':
      return 'aitp.run_trust_preflight';
  }
}

export function evidenceRefsForAitpWriteBridgeResult(
  result: AitpWriteBridgeExecutionResult,
): readonly string[] {
  switch (result.kind) {
    case 'curated_rag_ingest_result':
      return [
        `aitp:curated_rag_corpus:${result.corpusId}`,
        ...result.documentIds.map((id) => `aitp:curated_rag_document:${id}`),
      ];
    case 'exploratory_record':
      return [`aitp:exploratory_record:${result.recordId}`];
    case 'source_asset':
      return [`aitp:source_asset:${result.assetId}`];
    case 'evidence':
      return [`aitp:evidence:${result.evidenceId}`];
    case 'tool_run':
      return [`aitp:tool_run:${result.runId}`];
    case 'code_state':
      return [`aitp:code_state:${result.codeStateId}`];
    case 'artifact':
      return [`aitp:artifact:${result.artifactId}`];
    case 'reference_location':
      return [`aitp:reference_location:${result.locationId}`];
    case 'proof_obligation':
      return [`aitp:proof_obligation:${result.obligationId}`];
    case 'validation_contract':
      return [`aitp:validation_contract:${result.contractId}`];
    case 'validation_result':
      return [`aitp:validation_result:${result.resultId}`];
    case 'source_reconstruction_review_result':
      return [`aitp:source_reconstruction_review_result:${result.resultId}`];
    case 'human_checkpoint':
      return [`aitp:human_checkpoint:${result.checkpointId}`];
    case 'trust_update_preflight':
      return [`aitp:trust_preflight:${result.preflightToken}`];
  }
}

export function generatedObligationIdsForAitpWriteBridgeResult(
  result: AitpWriteBridgeExecutionResult,
): readonly string[] {
  return result.kind === 'proof_obligation' ? [result.obligationId] : [];
}

export class AitpWriteBridgePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AitpWriteBridgePayloadError';
  }
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  throw new AitpWriteBridgePayloadError(`${label} must be an object.`);
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string {
  const value = optionalString(record, ...keys);
  if (value !== undefined) return value;
  throw new AitpWriteBridgePayloadError(`aitp_payload.${keys[0]} is required.`);
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function optionalBoolean(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function optionalNumber(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function requiredStringArray(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): readonly string[] {
  const value = optionalStringArray(record, ...keys);
  if (value !== undefined && value.length > 0) return value;
  throw new AitpWriteBridgePayloadError(`aitp_payload.${keys[0]} must contain at least one value.`);
}

function optionalStringArray(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): readonly string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const item = value.trim();
      if (item.length > 0) return [item];
      continue;
    }
    if (!Array.isArray(value)) continue;
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (items.length > 0) return items;
  }
  return undefined;
}

function optionalRecord(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): Readonly<Record<string, unknown>> | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Readonly<Record<string, unknown>>;
    }
  }
  return undefined;
}

function hasAnyStringArray(values: readonly (readonly string[] | undefined)[]): boolean {
  return values.some((items) => items !== undefined && items.length > 0);
}

function toSnakeCaseJsonObject(value: object): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'signal' || item === undefined) continue;
    out[camelToSnake(key)] = item;
  }
  return out;
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function parseMcpJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new AitpWriteBridgePayloadError('AITP MCP tool returned empty text content.');
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {}
  for (const line of trimmed.split(/\r?\n/g).toReversed()) {
    const candidate = line.trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {}
  }
  throw new AitpWriteBridgePayloadError('AITP MCP tool text content was not valid JSON.');
}

function isRecordValue(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
