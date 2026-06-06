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
  CaptureAitpCodeStateAutoInput,
  CreateAitpValidationContractInput,
  CreateAitpProofObligationInput,
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
import type { AitpSourceAssetType } from './cli-bridge';
import type { AitpExplorationStatus, AitpExplorationType } from './types';

export const AITP_WRITE_BRIDGE_OPERATIONS = [
  'recordExploratoryRecord',
  'registerSourceAsset',
  'recordEvidence',
  'recordToolRun',
  'captureCodeStateAuto',
  'attachArtifact',
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
  | AitpWriteBridgeOperation;

export interface AitpRuntimeBridgeTarget {
  readonly operation: AitpRuntimeBridgeOperation;
  readonly entrypointKey: string;
  readonly mcpTool: string;
  readonly cliFallback: string;
  readonly surface: string;
  readonly preferredTransport: 'mcp';
  readonly fallbackTransport: 'cli';
  readonly executionRole: 'read' | 'write' | 'preflight';
  readonly stateEffect: 'read_only' | 'typed_record_write' | 'preflight_only';
  readonly canonicalStore: '.aitp';
  readonly claimTrustMutation: 'none';
  readonly summaryInputsTrusted: false;
  readonly canUpdateClaimTrust: false;
}

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
  stateEffect: 'read_only' | 'typed_record_write' | 'preflight_only' = 'typed_record_write',
): AitpRuntimeBridgeTarget {
  return {
    operation,
    entrypointKey,
    mcpTool,
    cliFallback,
    surface,
    preferredTransport: 'mcp',
    fallbackTransport: 'cli',
    executionRole,
    stateEffect,
    canonicalStore: '.aitp',
    claimTrustMutation: 'none',
    summaryInputsTrusted: false,
    canUpdateClaimTrust: false,
  };
}

export type AitpWriteBridgeExecutionInput =
  | {
      readonly operation: 'recordExploratoryRecord';
      readonly payload: RecordAitpExploratoryRecordInput;
    }
  | {
      readonly operation: 'registerSourceAsset';
      readonly payload: RegisterAitpSourceAssetInput;
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
      readonly operation: 'captureCodeStateAuto';
      readonly payload: CaptureAitpCodeStateAutoInput;
    }
  | {
      readonly operation: 'attachArtifact';
      readonly payload: AttachAitpArtifactInput;
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

export interface AitpWriteBridgeCliTarget {
  recordExploratoryRecord(
    input: RecordAitpExploratoryRecordInput,
  ): Promise<AitpExploratoryRecordWriteResult>;
  registerSourceAsset(
    input: RegisterAitpSourceAssetInput,
  ): Promise<AitpSourceAssetWriteResult>;
  recordEvidence(input: RecordAitpEvidenceInput): Promise<AitpEvidenceWriteResult>;
  recordToolRun(input: RecordAitpToolRunInput): Promise<AitpToolRunWriteResult>;
  captureCodeStateAuto(
    input: CaptureAitpCodeStateAutoInput,
  ): Promise<AitpCodeStateWriteResult>;
  attachArtifact(input: AttachAitpArtifactInput): Promise<AitpArtifactWriteResult>;
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
      case 'recordExploratoryRecord':
        return this.bridge.recordExploratoryRecord(input.payload);
      case 'registerSourceAsset':
        return this.bridge.registerSourceAsset(input.payload);
      case 'recordEvidence':
        return this.bridge.recordEvidence(input.payload);
      case 'recordToolRun':
        return this.bridge.recordToolRun(input.payload);
      case 'captureCodeStateAuto':
        return this.bridge.captureCodeStateAuto(input.payload);
      case 'attachArtifact':
        return this.bridge.attachArtifact(input.payload);
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

export function coerceAitpWriteBridgeInput(
  operation: AitpWriteBridgeOperation,
  payload: unknown,
  signal?: AbortSignal,
): AitpWriteBridgeExecutionInput {
  const record = requireRecord(payload, 'aitp_payload');
  switch (operation) {
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
    case 'recordExploratoryRecord':
      return 'aitp.record_exploratory_record';
    case 'registerSourceAsset':
      return 'aitp.register_source_asset';
    case 'recordEvidence':
      return 'aitp.record_evidence';
    case 'recordToolRun':
      return 'aitp.record_tool_run';
    case 'captureCodeStateAuto':
      return 'aitp.capture_code_state_auto';
    case 'attachArtifact':
      return 'aitp.attach_artifact';
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
